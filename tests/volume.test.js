/* 챗봇 용량 수정 (HSJ 결정 2026-11-26): 용량은 사용자 말대로, 정가는 단위당 기준 정가 × 용량 (100원 반올림), 최소 용량 = 지금 기준 용량 */
import { describe, it, expect, vi } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { priceForVolume, minVolume } from "../src/config/rules.js";
import { pickCandidate, applySelection, withVolumes } from "../server/agents/research.js";
import { assemblePlan } from "../server/agents/writer.js";
import { assembleScenarios } from "../server/agents/designer.js";
import { REVIEW_SCHEMA, checkRules } from "../server/agents/verifier.js";
import { cleanProposal, buildEditPrompt } from "../server/agents/editor.js";
import planEdit from "../server/routes/plan-edit.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const cand = applySelection(pickCandidate(fallback, { season: "여름", herb: "어성초", purpose: "모공·피지" }, NOW));
const raw = { concept_name: "어성초 산뜻 토너", concept: "번들거림을 가볍게 정돈해요.", target: "20대", key_claims: ["산지가 확인돼요", "가볍게 마무리돼요", "수시로 쓰기 좋아요"], product_roles: [], cautions: [] };
const scn = assembleScenarios({ scenarios: [{ title: "t", concept: "c", target: "t", channel: "인스타", cuts: [{ scene: "a", copy: "산뜻해요" }, { scene: "b", copy: "보송해요" }, { scene: "c", copy: "좋아요" }], image_prompts: ["x0", "x1", "x2"] }] }).scenarios;
const content = () => ({ season: "여름", herb: "어성초", purpose: "모공·피지", candidate: { selected: cand.l.selected }, plan: { ...assemblePlan(raw, cand, []), review_notes: [] }, scenarios: scn });
const product = (plan, name) => plan.products.find(p => p.name === name);

describe("용량 → 정가 계산", () => {
  it("단위당 기준 정가 × 용량, 100원 단위 반올림", () => {
    expect(priceForVolume("토너", 150)).toBe(11300);   // 75원 × 150 = 11,250
    expect(priceForVolume("미스트", 150)).toBe(22500); // 150원 × 150
    expect(priceForVolume("크림", 50)).toBe(19000);
    expect(priceForVolume("마스크", 10)).toBe(30000);  // 매당 3,000원
    expect(priceForVolume("없는제품", 10)).toBe(null);
  });
  it("최소 용량은 지금 기준 용량이에요", () => {
    expect(minVolume("토너")).toBe(200);
    expect(minVolume("세럼")).toBe(50);
    expect(minVolume("크림")).toBe(50);
    expect(minVolume("패드")).toBe(70);
  });
});

describe("withVolumes", () => {
  it("말한 용량으로 바꾸고 정가는 코드가 계산해요", () => {
    const v = withVolumes(cand, [{ name: "토너", ml: 300 }]);
    expect(v.cand.l.lineup.find(x => x[1] === "토너")).toEqual(["toner", "토너", 300, 22500]);
    expect(v.changes[0]).toEqual({ part: "토너 용량·정가", before: "200ml · 15,000원", after: "300ml · 22,500원" });
    expect(cand.l.lineup.find(x => x[1] === "토너")[2]).toBe(200); // 원본은 그대로
  });
  it("최소 용량보다 작거나, 정수가 아니거나, 기획안에 없는 제품이면 바꾸지 않고 이유를 알려요", () => {
    const v = withVolumes(cand, [{ name: "토너", ml: 150 }, { name: "클렌저", ml: 2.5 }, { name: "아이크림", ml: 40 }]);
    expect(v.volumes).toEqual([]);
    expect(v.rejected.join(" ")).toMatch(/토너: 최소 용량은 200ml/);
    expect(v.rejected.join(" ")).toMatch(/클렌저: 용량은 1 이상의 정수/);
    expect(v.rejected.join(" ")).toMatch(/아이크림: 기획안에 없는 제품/);
  });
});

describe("수정 챗봇 미리보기 (cleanProposal)", () => {
  it("용량만 바꿔도 제품 표가 새 용량·정가로 다시 조립되고 검증을 통과해요", () => {
    const out = cleanProposal({ summary: "토너 용량 변경", changes: [], regenerate_images: [], volumes: [{ name: "토너", ml: 300 }] }, content(), cand);
    expect(product(out.plan, "토너")).toMatchObject({ ml: 300, price: 22500 });
    expect(out.volumes).toEqual([{ name: "토너", ml: 300 }]);
    expect(out.changes[0].after).toBe("300ml · 22,500원");
    const v = withVolumes(cand, out.volumes);
    expect(checkRules({ plan: out.plan, scenarios: scn }, v.cand, fallback).fix).toEqual([]);
  });
  it("최소 용량 미달이면 수정안 없이 안내만 남겨요", () => {
    expect(cleanProposal({ summary: "토너 150ml", changes: [], regenerate_images: [], volumes: [{ name: "토너", ml: 150 }] }, content(), cand)).toBe(null);
  });
  it("프롬프트에 최소 용량과 '정가는 코드가 계산' 규칙이 들어가요", () => {
    const p = buildEditPrompt(content(), [{ role: "user", content: "토너 300ml로" }], cand, fallback);
    expect(p).toContain("proposal.volumes");
    expect(p).toContain("토너 200ml");
    expect(p).not.toContain("가격·용량 같은 숫자는 쓰지 마세요. 제품 이름·용량·가격은 코드가 채워요.");
  });
});

describe("/api/plan-edit/apply 용량", () => {
  const base = { id: "v1", version_no: 1, content: content(), images: [] };
  const store = (over = {}) => ({
    userClient: vi.fn(() => ({})), getUser: vi.fn(async () => ({ id: "u1" })), getPlan: vi.fn(async () => ({ id: "p1" })),
    getVersion: vi.fn(async () => base), editCount: vi.fn(async () => 0), entitlements: vi.fn(async () => []),
    insertVersion: vi.fn(async () => ({ id: "v2", version_no: 2 })), ...over
  });
  const deps = s => ({ store: s, now: () => NOW, loadData: async () => fallback, generate: vi.fn(async (_p, schema) => (schema === REVIEW_SCHEMA ? { approved: true, issues: [] } : {})) });
  const ctx = d => ({ token: "tok", env: {}, deps: d });
  it("서버가 정가를 다시 계산해 저장하고, 다음 수정에서도 바뀐 값이 유지돼요", async () => {
    const s = store();
    await planEdit.apply({ plan_id: "p1", base_version_no: 1, proposal: { summary: "토너 300ml", regenerate_images: [], volumes: [{ name: "토너", ml: 300 }], plan: { ...raw, products: [{ name: "토너", ml: 999, price: 1 }] } } }, ctx(deps(s)));
    const saved = s.insertVersion.mock.calls[0][3].content;
    expect(product(saved.plan, "토너")).toMatchObject({ ml: 300, price: 22500 }); // 화면이 보낸 숫자는 믿지 않아요
    // 저장된 버전으로 다시 고칠 때 (keepSavedProducts) 300ml 가 그대로예요
    const s2 = store({ getVersion: vi.fn(async () => ({ id: "v2", version_no: 2, content: saved, images: [] })) });
    await planEdit.apply({ plan_id: "p1", base_version_no: 2, proposal: { summary: "콘셉트", regenerate_images: [], plan: { ...raw, concept: "새 콘셉트예요." } } }, ctx(deps(s2)));
    expect(product(s2.insertVersion.mock.calls[0][3].content.plan, "토너")).toMatchObject({ ml: 300, price: 22500 });
  });
  it("최소 용량보다 작으면 400, 저장하지 않아요", async () => {
    const s = store();
    let st = null;
    try { await planEdit.apply({ plan_id: "p1", base_version_no: 1, proposal: { summary: "토너 100ml", regenerate_images: [], volumes: [{ name: "토너", ml: 100 }] } }, ctx(deps(s))); } catch (e) { st = e.status; }
    expect(st).toBe(400);
    expect(s.insertVersion).not.toHaveBeenCalled();
  });
});
