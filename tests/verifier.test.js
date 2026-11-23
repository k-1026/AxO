import { describe, it, expect } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { findLine } from "../src/core/candidates.js";
import { checkRules, textOf, stripBanned } from "../server/agents/verifier.js";
import { cleanReview, buildReviewPrompt, describeLine, REVIEW_SCHEMA } from "../server/agents/prompt.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const cand = findLine(fallback, "여름", "어성초", "모공·피지", NOW);

const good = () => ({
  plan: {
    concept_name: "어성초 산뜻 토너", concept: "장마철 번들거림을 가볍게 정돈하는 토너예요.",
    target: "번들거림이 고민인 20대", key_claims: ["경북 48.1%로 산지가 확인돼요"],
    products: [{ type: "toner", name: "토너", ml: 200, price: 15000, role: "결 정돈", status: "1차" }],
    notes: ["재생 용기 사용을 검토해요"], cautions: [], review_notes: []
  },
  scenarios: [{ title: "여름 토너", concept: "산뜻하게", target: "20대", channel: "인스타", cuts: [{ scene: "세안 후", copy: "보송하게" }], image_prompt: "mint toner bottle" }]
});
const withConcept = t => { const c = good(); c.plan.concept = t; return c; };

describe("checkRules", () => {
  it("정상 content는 fix가 없어요", () => {
    expect(checkRules(good(), cand.l, fallback).fix).toEqual([]);
  });
  it("금지 표현이 있으면 고칠 점이에요", () => {
    const { fix } = checkRules(withConcept("염증 완화에 좋아요"), cand.l, fallback);
    expect(fix.some(f => f.includes('금지 표현 "염증"'))).toBe(true);
  });
  it("재생 용기는 예외라 통과해요", () => {
    expect(checkRules(withConcept("재생 용기 사용"), cand.l, fallback).fix).toEqual([]);
  });
  it("재생 효과는 금지예요", () => {
    expect(checkRules(withConcept("피부 재생 효과"), cand.l, fallback).fix.length).toBe(1);
  });
  it("후보에 없는 가격·용량을 잡아요", () => {
    const { fix } = checkRules(withConcept("토너 150ml 9,900원"), cand.l, fallback);
    expect(fix.filter(f => f.startsWith("후보에 없는 가격·용량")).length).toBe(2);
  });
  it("후보의 용량·가격은 통과해요", () => {
    expect(checkRules(withConcept("토너 200ml 15,000원"), cand.l, fallback).fix).toEqual([]);
  });
  it("메모에 있는 % 숫자는 통과, 없으면 고칠 점이에요", () => {
    expect(checkRules(withConcept("경북 48.1%"), cand.l, fallback).fix).toEqual([]);
    expect(checkRules(withConcept("흡수율 87%"), cand.l, fallback).fix.length).toBe(1);
  });
  it("다른 원료 이름을 잡아요", () => {
    const { fix } = checkRules(withConcept("인삼 추출물도 담아요"), cand.l, fallback);
    expect(fix.some(f => f.includes('후보에 없는 원료 "인삼"'))).toBe(true);
  });
  it("후보 원료 이름은 허용해요", () => {
    expect(checkRules(withConcept("어성초 토너"), cand.l, fallback).fix).toEqual([]);
  });
  it("제품 목록에서 토너를 빼면 고칠 점이에요", () => {
    const c = good(); c.plan.products = [];
    expect(checkRules(c, cand.l, fallback).fix.length).toBe(1);
  });
  it("라인 구성에 없는 제품이 있으면 고칠 점이에요", () => {
    const c = good(); c.plan.products.push({ type: "serum", name: "세럼" });
    expect(checkRules(c, cand.l, fallback).fix.length).toBe(1);
  });
  it("미백(톤) 후보는 cautions에 기능성이 있어야 해요", () => {
    const tone = { ...cand.l, functional: true };
    expect(checkRules(good(), tone, fallback).fix.length).toBe(1);
    const c = good(); c.plan.cautions = ["기능성 심사 전이라 표현에 주의해요"];
    expect(checkRules(c, tone, fallback).fix).toEqual([]);
  });
  it("정가 ml당 가격이 범위 밖이면 notes에만 남겨요", () => {
    const odd = { ...cand.l, lineup: [["toner", "토너", 200, 30000]] };
    const r = checkRules(good(), odd, fallback);
    expect(r.notes).toEqual(["가격 범위 밖: 토너 ml당 150원"]);
  });
  it("시나리오와 이미지 글도 검사해요", () => {
    const c = good(); c.scenarios[0].image_prompt = "아토피 케어";
    expect(textOf(c)).toContain("mint toner bottle".replace("mint toner bottle", "아토피 케어"));
    expect(checkRules(c, cand.l, fallback).fix.length).toBe(1);
  });
});

describe("stripBanned", () => {
  it("금지 표현이 든 문장을 빼요", () => {
    expect(stripBanned("산뜻해요. 염증을 가라앉혀요. 보송해요.")).toBe("산뜻해요. 보송해요.");
    expect(stripBanned("재생 용기를 써요.")).toBe("재생 용기를 써요.");
  });
});

describe("AI 검토", () => {
  it("cleanReview는 빈 이슈를 빼고 approved를 정리해요", () => {
    expect(cleanReview({ approved: false, issues: ["a", "", "b"] })).toEqual({ approved: false, issues: ["a", "b"] });
    expect(cleanReview({ issues: Array(8).fill("x") }).issues.length).toBe(5);
    expect(cleanReview({ issues: Array(8).fill("x") }).approved).toBe(true);
    expect(cleanReview(null)).toEqual({ approved: true, issues: [] });
  });
  it("프롬프트와 스키마가 있어요", () => {
    expect(REVIEW_SCHEMA.properties.approved.type).toBe("BOOLEAN");
    const p = buildReviewPrompt(good(), cand.l, "여름", fallback);
    expect(p).toContain("어성초");
    expect(describeLine(cand.l, "여름", fallback)).toContain("魚腥草");
  });
});
