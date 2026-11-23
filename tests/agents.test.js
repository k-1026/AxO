import { describe, it, expect } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { findLine } from "../src/core/candidates.js";
import { checkRules } from "../server/agents/verifier.js";
import { pickCandidate, InvalidCandidateError, RESEARCH_SCHEMA, buildResearchPrompt, cleanNotes } from "../server/agents/research.js";
import { PLAN_SCHEMA, buildPlanPrompt, assemblePlan, PlanFormatError } from "../server/agents/writer.js";
import { SCENARIO_SCHEMA, buildScenarioPrompt, assembleScenarios, buildImagePrompt, sampleFilesFor } from "../server/agents/designer.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const cand = findLine(fallback, "여름", "어성초", "모공·피지", NOW);
const findExtra = () => {
  for (const s of Object.keys(fallback.SEASONS)) for (const h of fallback.HERBS) {
    const r = findLine(fallback, s, h.herb, "민감·장벽", NOW); if (r && r.l.extra) return r;
  }
  return null;
};
const extraCand = findExtra();
const rawPlan = () => ({
  concept_name: "어성초 산뜻 토너", concept: "번들거림을 가볍게 정돈해요.", target: "20대",
  key_claims: ["산지가 확인돼요", "가볍게 마무리돼요", "수시로 쓰기 좋아요", "넷째"],
  product_roles: [{ name: "토너", role: "결 정돈" }, { name: "세럼", role: "AI가 쓴 역할" }, { name: "클렌저", role: "순한 세안" }],
  cautions: []
});
const rawScn = n => ({
  scenarios: Array.from({ length: n }, (_, i) => ({
    title: `시나리오${i}`, concept: "c", target: "t", channel: "인스타",
    cuts: [{ scene: "a", copy: "산뜻해요" }, { scene: "b", copy: "보송해요" }, { scene: "c", copy: "좋아요" }], image_prompt: "x"
  }))
});

describe("research", () => {
  it("없는 조합은 InvalidCandidateError", () => {
    expect(() => pickCandidate(fallback, { season: "여름", herb: "없는약재", purpose: "보습" }, NOW)).toThrow(InvalidCandidateError);
  });
  it("있는 조합은 후보를 돌려줘요", () => {
    expect(pickCandidate(fallback, { season: "여름", herb: "어성초", purpose: "모공·피지" }, NOW).l.herb).toBe("어성초");
  });
  it("프롬프트·스키마·정리", () => {
    expect(RESEARCH_SCHEMA.properties.notes).toBeTruthy();
    expect(buildResearchPrompt(cand, "여름", fallback)).toContain("어성초");
    expect(cleanNotes({ notes: [" a ", "", "b", "c", "d", "e", "f"] })).toEqual(["a", "b", "c", "d", "e"]);
    expect(cleanNotes(null)).toEqual([]);
  });
});

describe("writer", () => {
  it("AI 가격을 무시하고 lineup 값을 써요", () => {
    const raw = rawPlan(); raw.product_roles[0].price = 1;
    const p = assemblePlan(raw, cand, ["메모"]);
    const toner = p.products.find(x => x.name === "토너");
    expect(toner).toMatchObject({ type: "toner", ml: 200, price: 15000, status: "1차", role: "결 정돈" });
    expect(p.key_claims.length).toBe(3);
    expect(p.notes).toEqual(["메모"]);
    expect(p.review_notes).toEqual([]);
  });
  it("assemblePlan 결과는 제품 규칙을 통과해요", () => {
    const fix = checkRules({ plan: assemblePlan(rawPlan(), cand, []) }, cand, fallback).fix;
    expect(fix.filter(f => f.includes("제품"))).toEqual([]);
  });
  it("extra는 마지막에 준비 중·null로 들어가요", () => {
    expect(extraCand).toBeTruthy();
    const raw = rawPlan(); raw.product_roles.push({ name: extraCand.l.extra, role: "세안" });
    const p = assemblePlan(raw, extraCand, []);
    const last = p.products[p.products.length - 1];
    expect(last).toMatchObject({ name: extraCand.l.extra, status: "준비 중", price: null, ml: null });
    expect(checkRules({ plan: p }, extraCand, fallback).fix.filter(f => f.includes("제품"))).toEqual([]);
  });
  it("역할이 없으면 ROLE로, 그것도 없으면 빈 글", () => {
    const raw = rawPlan(); raw.product_roles = [];
    const p = assemblePlan(raw, cand, []);
    expect(p.products[0].role).toBe("결 정돈");
  });
  it("형식이 틀리면 PlanFormatError", () => {
    expect(() => assemblePlan({}, cand, [])).toThrow(PlanFormatError);
    const raw = rawPlan(); raw.key_claims = ["하나"];
    expect(() => assemblePlan(raw, cand, [])).toThrow(PlanFormatError);
  });
  it("프롬프트에 수정 요청이 들어가요", () => {
    expect(PLAN_SCHEMA.required).toContain("concept_name");
    const t = buildPlanPrompt(cand, "여름", fallback, ["메모"], { previous: { a: 1 }, issues: ["문제하나"] });
    expect(t).toContain("문제하나");
    expect(t).toContain("치료");
    expect(buildPlanPrompt(cand, "여름", fallback, [])).not.toContain("문제하나");
  });
});

describe("designer", () => {
  it("4개는 3개로 자르고, 2개는 throw", () => {
    expect(assembleScenarios(rawScn(4)).scenarios.length).toBe(3);
    expect(() => assembleScenarios(rawScn(2))).toThrow(PlanFormatError);
  });
  it("금지 문장을 빼고 notes에 남겨요", () => {
    const raw = rawScn(3); raw.scenarios[0].cuts[0].copy = "염증 완화 미스트";
    const r = assembleScenarios(raw);
    expect(r.scenarios[0].cuts[0].copy).toBe("");
    expect(r.notes.length).toBe(1);
  });
  it("컷이 3~4개가 아니면 throw", () => {
    const raw = rawScn(3); raw.scenarios[1].cuts = raw.scenarios[1].cuts.slice(0, 2);
    expect(() => assembleScenarios(raw)).toThrow(PlanFormatError);
  });
  it("이미지 프롬프트", () => {
    const sc = assembleScenarios(rawScn(3)).scenarios[0];
    const pal = { name: "p", colors: ["#112233", "#445566"] };
    const t = buildImagePrompt(sc, cand, fallback, pal);
    expect(t).toMatch(/#[0-9A-Fa-f]{6}/);
    expect(t).toContain("로고");
    expect(t).toContain("#112233");
    expect(buildImagePrompt(sc, cand, fallback, null)).not.toContain("트렌드");
    expect(t).toContain("트렌드");
  });
  it("프롬프트·스키마", () => {
    expect(SCENARIO_SCHEMA.properties.scenarios).toBeTruthy();
    const plan = assemblePlan(rawPlan(), cand, []);
    expect(buildScenarioPrompt(plan, cand, "여름", fallback, null)).toContain("어성초");
  });
  it("sampleFilesFor는 type별 중복 없이", () => {
    const gel = { l: { lineup: [["toner", "토너", 1, 1], ["cream", "젤 크림", 1, 1], ["mist", "미스트", 1, 1]], extra: "클렌저" } };
    expect(sampleFilesFor(gel)).toEqual(["toner.png", "cream.png", "mist.png"]);
  });
});
