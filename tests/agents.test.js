import { describe, it, expect } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { findLine } from "../src/core/candidates.js";
import { checkRules } from "../server/agents/verifier.js";
import { pickCandidate, InvalidCandidateError, RESEARCH_SCHEMA, buildResearchPrompt, cleanNotes } from "../server/agents/research.js";
import { PLAN_SCHEMA, buildPlanPrompt, assemblePlan, PlanFormatError } from "../server/agents/writer.js";
import { DESIGN_SCHEMA, DESIGN_KINDS, buildDesignPrompt, assembleDesigns, buildImagePrompt, sampleFilesFor, imagePromptAt, imageSlotsOf } from "../server/agents/designer.js";

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
const rawDsn = () => ({
  designs: [
    { title: "패키징", description: "갈색 단상자와 크림색 용기 세트 구성", image_prompt: "d0" },
    { title: "팝업", description: "한지 소재 부스와 원목 진열대 연출", image_prompt: "d1" },
    { title: "남는 것", description: "x", image_prompt: "x" }
  ]
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
    expect(toner).toMatchObject({ type: "toner", ml: 200, price: 15000, status: "출시", role: "결 정돈" });
    expect(p.key_claims.length).toBe(3);
    expect(p.notes).toEqual(["메모"]);
    expect(p.review_notes).toEqual([]);
  });
  it("assemblePlan 결과는 제품 규칙을 통과해요", () => {
    const fix = checkRules({ plan: assemblePlan(rawPlan(), cand, []) }, cand, fallback).fix;
    expect(fix.filter(f => f.includes("제품"))).toEqual([]);
  });
  it("extra는 마지막에 가격 준비 중·null로 들어가요", () => {
    expect(extraCand).toBeTruthy();
    const raw = rawPlan(); raw.product_roles.push({ name: extraCand.l.extra, role: "세안" });
    const p = assemblePlan(raw, extraCand, []);
    const last = p.products[p.products.length - 1];
    expect(last).toMatchObject({ name: extraCand.l.extra, status: "가격 준비 중", price: null, ml: null });
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
  it("디자인은 2개(패키징·팝업) 순서로 남기고, 모자라면 throw", () => {
    const r = assembleDesigns(rawDsn());
    expect(r.designs.map(d => d.kind)).toEqual(DESIGN_KINDS);
    expect(r.designs.map(d => d.image_prompt)).toEqual(["d0", "d1"]);
    expect(() => assembleDesigns({ designs: rawDsn().designs.slice(0, 1) })).toThrow(PlanFormatError);
    expect(() => assembleDesigns({})).toThrow(PlanFormatError);
  });
  it("설명·이미지 설명이 비면 throw, 이름이 비면 종류 이름으로", () => {
    const raw = rawDsn(); raw.designs[1].description = " ";
    expect(() => assembleDesigns(raw)).toThrow(PlanFormatError);
    const r2 = rawDsn(); r2.designs[0].title = "";
    expect(assembleDesigns(r2).designs[0].title).toBe("제품 패키징");
  });
  it("금지 표현이 든 문장은 빼고 notes에 남겨요", () => {
    const raw = rawDsn();
    raw.designs[0].description = "갈색 단상자 구성. 염증 완화 콘셉트 강조.";
    raw.designs[1].image_prompt = "Wooden booth. Anti-inflammatory serum.";
    const r = assembleDesigns(raw);
    expect(r.designs[0].description).toBe("갈색 단상자 구성.");
    expect(r.designs[1].image_prompt).toBe("Wooden booth.");
    expect(r.notes.length).toBe(2);
  });
  it("imagePromptAt·imageSlotsOf: 지금 형식(디자인 2개)과 예전 형식을 모두 읽어요", () => {
    const now = { designs: assembleDesigns(rawDsn()).designs };
    expect(imagePromptAt(now, 1)).toBe("d1");
    expect(imagePromptAt(now, 2)).toBe("");
    expect(imageSlotsOf(now)).toEqual([0, 1]);
    const one = { scenarios: [{ image_prompts: ["a", "b", "c"] }] };
    expect(imagePromptAt(one, 2)).toBe("c");
    expect(imageSlotsOf(one)).toEqual([0, 1, 2]);
    const three = { scenarios: [{ image_prompt: "p0" }, { image_prompt: "p1" }, { image_prompt: "p2" }] };
    expect(imagePromptAt(three, 1)).toBe("p1");
    expect(imagePromptAt({}, 0)).toBe("");
    expect(imagePromptAt(undefined, 0)).toBe("");
    expect(imageSlotsOf({})).toEqual([]);
  });
  it("buildImagePrompt는 금지 표현을 다시 걸러요", () => {
    const t = buildImagePrompt({ image_prompt: "Mint bottle. Anti-inflammatory serum. 염증 완화" }, cand, fallback, null);
    expect(t).not.toMatch(/inflammatory|염증/i);
    expect(t).toContain("Mint bottle");
  });
  it("이미지 프롬프트: 종류별 앞머리 + 색", () => {
    const [pack, pop] = assembleDesigns(rawDsn()).designs;
    const pal = { name: "p", colors: ["#112233", "#445566"] };
    const t = buildImagePrompt(pack, cand, fallback, pal);
    expect(t).toMatch(/#[0-9A-Fa-f]{6}/);
    expect(t).toContain("로고");
    expect(t).toContain("outer carton");
    expect(t).toContain("#112233");
    expect(buildImagePrompt(pack, cand, fallback, null)).not.toContain("트렌드");
    const u = buildImagePrompt(pop, cand, fallback, null);
    expect(u).toContain("pop-up store");
    expect(u).toContain("No signage text");
  });
  it("프롬프트·스키마", () => {
    expect(DESIGN_SCHEMA.properties.designs).toBeTruthy();
    const plan = assemblePlan(rawPlan(), cand, []);
    const prompt = buildDesignPrompt(plan, cand, "여름", fallback, null);
    expect(prompt).toContain("어성초");
    expect(prompt).toContain("단상자");
    expect(prompt).toContain("팝업스토어");
    expect(prompt).not.toContain("시나리오");
  });
  it("sampleFilesFor는 type별 중복 없이, 로고 지운 사진으로", () => {
    const gel = { l: { lineup: [["toner", "토너", 1, 1], ["cream", "젤 크림", 1, 1], ["mist", "미스트", 1, 1]], extra: "클렌저" } };
    expect(sampleFilesFor(gel)).toEqual(["toner-nologo.png", "cream-nologo.png", "mist-nologo.png"]);
  });
});
