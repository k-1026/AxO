import { describe, it, expect } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { runPlanPipeline, verifyContent, MAX_REVISIONS } from "../server/orchestrator.js";
import { RESEARCH_SCHEMA, pickCandidate } from "../server/agents/research.js";
import { PLAN_SCHEMA, assemblePlan } from "../server/agents/writer.js";
import { SCENARIO_SCHEMA } from "../server/agents/designer.js";
import { REVIEW_SCHEMA } from "../server/agents/verifier.js";
import { LlmError } from "../server/llm/gemini.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const args = { season: "여름", herb: "어성초", purpose: "모공·피지", now: NOW };

const rawPlan = (concept = "번들거림을 가볍게 정돈해요.") => ({
  concept_name: "어성초 산뜻 토너", concept, target: "20대",
  key_claims: ["산지가 확인돼요", "가볍게 마무리돼요", "수시로 쓰기 좋아요"],
  product_roles: [{ name: "토너", role: "결 정돈" }], cautions: []
});
const rawScn = () => ({
  scenarios: Array.from({ length: 3 }, (_, i) => ({
    title: `시나리오${i}`, concept: "c", target: "t", channel: "인스타",
    cuts: [{ scene: "a", copy: "산뜻해요" }, { scene: "b", copy: "보송해요" }, { scene: "c", copy: "좋아요" }], image_prompt: "x"
  }))
});

/* schema별로 큐에서 응답을 꺼내는 가짜 generate. 큐가 비면 마지막 값을 되풀이해요 */
function fake(queues) {
  const calls = [];
  const names = new Map([[RESEARCH_SCHEMA, "RESEARCH"], [PLAN_SCHEMA, "PLAN"], [REVIEW_SCHEMA, "REVIEW"], [SCENARIO_SCHEMA, "SCENARIO"]]);
  const generate = async (prompt, schema) => {
    const name = names.get(schema);
    calls.push(name);
    const q = queues[name];
    const v = q.length > 1 ? q.shift() : q[0];
    if (v instanceof Error) throw v;
    return v;
  };
  return { generate, calls };
}
const ok = () => ({ approved: true, issues: [] });
const base = (over = {}) => ({
  RESEARCH: [{ notes: ["메모 하나"] }], PLAN: [rawPlan()], REVIEW: [ok()], SCENARIO: [rawScn()], ...over
});

describe("runPlanPipeline", () => {
  it("MAX_REVISIONS는 1이에요", () => expect(MAX_REVISIONS).toBe(1));

  it("정상: 호출 순서와 rounds", async () => {
    const f = fake(base());
    const { content, log } = await runPlanPipeline({ data: fallback, ...args, generate: f.generate });
    expect(f.calls).toEqual(["RESEARCH", "PLAN", "REVIEW", "SCENARIO"]);
    expect(content.review.rounds).toBe(1);
    expect(content.review.approved).toBe(true);
    expect(content.scenarios).toHaveLength(3);
    expect(content.candidate.name).toBeTruthy();
    expect(content.candidate.lineup.length).toBeGreaterThan(0);
    expect(content.plan.products.length).toBeGreaterThan(0);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]).toEqual(expect.objectContaining({ step: expect.anything(), agent: expect.any(String), ok: expect.any(Boolean), note: expect.any(String) }));
  });

  it("첫 검토 거절 → 다시 쓰고 통과, rounds 2", async () => {
    const f = fake(base({ REVIEW: [{ approved: false, issues: ["문구가 길어요."] }, ok()] }));
    const { content } = await runPlanPipeline({ data: fallback, ...args, generate: f.generate });
    expect(f.calls).toEqual(["RESEARCH", "PLAN", "REVIEW", "PLAN", "REVIEW", "SCENARIO"]);
    expect(content.review.rounds).toBe(2);
    expect(content.review.approved).toBe(true);
  });

  it("두 번 다 거절: PLAN 2번만, review_notes 남기고 계속", async () => {
    const f = fake(base({ REVIEW: [{ approved: false, issues: ["아쉬워요."] }] }));
    const { content } = await runPlanPipeline({ data: fallback, ...args, generate: f.generate });
    expect(f.calls.filter(c => c === "PLAN")).toHaveLength(2);
    expect(f.calls).toContain("SCENARIO");
    expect(content.plan.review_notes.length).toBeGreaterThan(0);
    expect(content.review.approved).toBe(false);
    expect(content.review.rounds).toBe(2);
  });

  it("금지어는 AI 검토가 통과해도 다시 쓰게 해요", async () => {
    const f = fake(base({ PLAN: [rawPlan("염증 완화에 좋아요."), rawPlan()] }));
    const { content } = await runPlanPipeline({ data: fallback, ...args, generate: f.generate });
    expect(f.calls.filter(c => c === "PLAN")).toHaveLength(2);
    expect(content.review.rounds).toBe(2);
    expect(content.plan.concept).not.toContain("염증");
  });

  it("LlmError는 그대로 던져요", async () => {
    const err = new LlmError("실패", 429);
    const f = fake(base({ PLAN: [err] }));
    await expect(runPlanPipeline({ data: fallback, ...args, generate: f.generate })).rejects.toBe(err);
  });

  it("팔레트가 없으면 review_notes에 남겨요", async () => {
    const f = fake(base());
    const { content } = await runPlanPipeline({ data: { ...fallback, COLOR_TRENDS: [] }, ...args, generate: f.generate });
    expect(content.palette).toBeNull();
    expect(content.plan.review_notes).toContain("트렌드 팔레트 자료 없음");
  });
});

describe("verifyContent", () => {
  const cand = () => pickCandidate(fallback, args, NOW);
  const plan = async () => {
    const c = cand();
    return { c, content: { plan: assemblePlan(rawPlan(), c, []) } };
  };

  it("AI 응답이 객체가 아니면 통과시키지 않아요", async () => {
    const { c, content } = await plan();
    const r = await verifyContent(content, c, fallback, async () => null);
    expect(r.approved).toBe(false);
    expect(r.issues).toContain("AI 검토 응답을 해석하지 못했어요.");
  });

  it("코드 규칙과 AI 검토가 모두 통과해야 승인돼요", async () => {
    const { c, content } = await plan();
    expect((await verifyContent(content, c, fallback, async () => ({ approved: true, issues: [] }))).approved).toBe(true);
    const r = await verifyContent(content, c, fallback, async () => ({ approved: false, issues: ["고쳐요"] }));
    expect(r.approved).toBe(false);
    expect(r.issues).toContain("고쳐요");
  });
});
