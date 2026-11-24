import { describe, it, expect } from "vitest";
import { productOptions, selectLine, extrasOf, lineupFor, LINE_RULE, PRICE_RANGE, qty, unitOf } from "../src/config/rules.js";
import { assemblePlan, STATUS } from "../server/agents/writer.js";
import { checkRules } from "../server/agents/verifier.js";
import { keepSavedProducts } from "../server/agents/research.js";

const lineOf = p => ({ herb: "오미자", purpose: p, name: "테스트 라인", lineup: lineupFor(p), next: LINE_RULE[p].next, extra: LINE_RULE[p].extra || "" });
/* 가격 기준이 아직 없는 제품을 시험하려고, 기준표에 없는 '선케어'를 함께 낼 수 있는 제품에 넣은 라인 */
const withPending = p => ({ ...lineOf(p), next: [...LINE_RULE[p].next, "선케어"] });
const raw = { concept_name: "c", concept: "c", target: "t", key_claims: ["a", "b", "c"], product_roles: [], cautions: [] };

describe("제품 고르기", () => {
  it("추천 구성과 함께 낼 수 있는 제품을 한 목록으로 보여 줘요 (1차·2차 구분 없음)", () => {
    const opts = productOptions(lineOf("탄력"));
    expect(opts.map(o => o.name)).toEqual(["세럼", "크림", "토너", "아이크림"]);
    expect(opts.filter(o => o.base).map(o => o.name)).toEqual(["세럼", "크림"]);
  });
  it("같은 제품 유형은 다른 라인의 기준 용량·정가를 써요", () => {
    const toner = productOptions(lineOf("탄력")).find(o => o.name === "토너");
    expect(toner).toMatchObject({ type: "toner", ml: 200, price: 15000 });
    const gel = productOptions(lineOf("모공·피지")).find(o => o.name === "젤 크림");
    expect(gel).toMatchObject({ type: "cream", ml: 50, price: 19000 });
  });
  it("클렌저·마스크·패드·아이크림도 기준 용량·정가가 있어요 (MEJ_가격기준_추가제품)", () => {
    expect(productOptions(lineOf("탄력")).find(o => o.name === "아이크림")).toMatchObject({ type: "eye", ml: 30, price: 22000 });
    expect(productOptions(lineOf("민감·장벽")).find(o => o.name === "클렌저")).toMatchObject({ type: "cleanser", base: true, ml: 150, price: 15000 });
    expect(productOptions(lineOf("보습")).find(o => o.name === "마스크")).toMatchObject({ type: "mask", ml: 5, price: 15000 });
    expect(productOptions(lineOf("진정")).find(o => o.name === "패드")).toMatchObject({ type: "pad", ml: 70, price: 18000 });
    expect(productOptions(lineOf("모공·피지")).find(o => o.name === "패드·팩")).toMatchObject({ type: "pad", ml: 70, price: 18000 });
  });
  it("기준값은 모두 중저가 단위당 범위 안이에요", () => {
    const all = Object.keys(LINE_RULE).flatMap(p => productOptions(lineOf(p))).filter(o => o.price != null);
    for (const o of all) {
      const [lo, hi] = PRICE_RANGE[o.type];
      expect(o.price / o.ml, o.name).toBeGreaterThanOrEqual(lo);
      expect(o.price / o.ml, o.name).toBeLessThanOrEqual(hi);
    }
  });
  it("마스크·패드는 매, 나머지는 ml 로 보여요", () => {
    expect(qty("mask", 5)).toBe("5매");
    expect(qty("pad", 70)).toBe("70매");
    expect(qty("eye", 30)).toBe("30ml");
    expect(unitOf("cleanser")).toBe("ml");
  });
  it("기준값이 없는 제품은 용량·정가가 비어 있어요", () => {
    const sun = productOptions(withPending("탄력")).find(o => o.name === "선케어");
    expect(sun).toMatchObject({ ml: null, price: null, base: false });
  });
  it("고른 제품만 라인에 들어가요", () => {
    const { line } = selectLine(withPending("탄력"), ["세럼", "토너", "선케어"]);
    expect(line.lineup.map(x => x[1])).toEqual(["세럼", "토너"]);
    expect(extrasOf(line).map(x => x.name)).toEqual(["선케어"]);
    expect(line.selected).toEqual(["세럼", "토너", "선케어"]);
  });
  it("고르지 않으면 추천 구성이에요 (클렌저도 이제 가격이 있어 구성에 들어가요)", () => {
    const { line } = selectLine(lineOf("민감·장벽"));
    expect(line.lineup.map(x => x[1])).toEqual(["토너", "크림", "클렌저"]);
    expect(extrasOf(line)).toEqual([]);
  });
  it("빈 선택·없는 제품·가격 있는 제품이 없는 선택은 막아요", () => {
    expect(selectLine(lineOf("탄력"), []).error).toBeTruthy();
    expect(selectLine(lineOf("탄력"), ["로션"]).error).toBeTruthy();
    expect(selectLine(withPending("탄력"), ["선케어"]).error).toMatch(/용량·정가/);
  });
  it("작성·검증도 고른 제품을 기준으로 해요", () => {
    const { line } = selectLine(withPending("탄력"), ["크림", "토너", "선케어"]);
    const plan = assemblePlan(raw, { l: line }, []);
    expect(plan.products.map(p => [p.name, p.status])).toEqual([["크림", STATUS.ready], ["토너", STATUS.ready], ["선케어", STATUS.pending]]);
    expect(checkRules({ plan, scenarios: [] }, { l: line }, { HERBS: [] }).fix).toEqual([]);
    const missing = { ...plan, products: plan.products.slice(0, 2) };
    expect(checkRules({ plan: missing, scenarios: [] }, { l: line }, { HERBS: [] }).fix.join()).toMatch(/제품 목록/);
  });
  it("매 단위 제품도 검증을 통과하고, 가격 범위 밖이면 매당으로 알려요", () => {
    const { line } = selectLine(lineOf("진정"), ["토너", "패드"]);
    const plan = assemblePlan(raw, { l: line }, []);
    expect(checkRules({ plan, scenarios: [] }, { l: line }, { HERBS: [] }).fix).toEqual([]);
    const pricey = { ...line, lineup: [["pad", "패드", 70, 70000]] };
    const notes = checkRules({ plan: assemblePlan(raw, { l: pricey }, []), scenarios: [] }, { l: pricey }, { HERBS: [] }).notes.join();
    expect(notes).toMatch(/패드 매당 1000원/);
  });
  it("예전 기획안을 고칠 때는 저장할 때의 제품·가격을 그대로 써요 (가격 준비 중이던 클렌저 포함)", () => {
    const cand = { l: selectLine(lineOf("민감·장벽")).line };
    const saved = [
      { type: "toner", name: "토너", ml: 200, price: 15000, status: STATUS.ready },
      { type: "cream", name: "크림", ml: 50, price: 19000, status: STATUS.ready },
      { type: "cleanser", name: "클렌저", ml: null, price: null, status: STATUS.pending },
    ];
    const kept = keepSavedProducts(cand, saved);
    expect(kept.l.lineup.map(x => x[1])).toEqual(["토너", "크림"]);
    expect(extrasOf(kept.l).map(x => x.name)).toEqual(["클렌저"]);
    const plan = assemblePlan(raw, kept, []);
    expect(checkRules({ plan, scenarios: [] }, kept, { HERBS: [] }).fix).toEqual([]);
    expect(keepSavedProducts(cand, undefined)).toBe(cand);
  });
});
