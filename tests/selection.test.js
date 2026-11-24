import { describe, it, expect } from "vitest";
import { productOptions, selectLine, extrasOf, lineupFor, LINE_RULE } from "../src/config/rules.js";
import { assemblePlan, STATUS } from "../server/agents/writer.js";
import { checkRules } from "../server/agents/verifier.js";

const lineOf = p => ({ herb: "오미자", purpose: p, name: "테스트 라인", lineup: lineupFor(p), next: LINE_RULE[p].next, extra: LINE_RULE[p].extra || "" });
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
  it("기준값이 없는 제품은 용량·정가가 비어 있어요", () => {
    const eye = productOptions(lineOf("탄력")).find(o => o.name === "아이크림");
    expect(eye).toMatchObject({ ml: null, price: null });
    const cleanser = productOptions(lineOf("민감·장벽")).find(o => o.name === "클렌저");
    expect(cleanser).toMatchObject({ type: "cleanser", base: true, price: null });
  });
  it("고른 제품만 라인에 들어가요", () => {
    const { line } = selectLine(lineOf("탄력"), ["세럼", "토너", "아이크림"]);
    expect(line.lineup.map(x => x[1])).toEqual(["세럼", "토너"]);
    expect(extrasOf(line).map(x => x.name)).toEqual(["아이크림"]);
    expect(line.selected).toEqual(["세럼", "토너", "아이크림"]);
  });
  it("고르지 않으면 추천 구성이에요 (예전 기획안과 같아요)", () => {
    const { line } = selectLine(lineOf("민감·장벽"));
    expect(line.lineup.map(x => x[1])).toEqual(["토너", "크림"]);
    expect(extrasOf(line).map(x => x.name)).toEqual(["클렌저"]);
  });
  it("빈 선택·없는 제품·가격 있는 제품이 없는 선택은 막아요", () => {
    expect(selectLine(lineOf("탄력"), []).error).toBeTruthy();
    expect(selectLine(lineOf("탄력"), ["로션"]).error).toBeTruthy();
    expect(selectLine(lineOf("탄력"), ["아이크림"]).error).toMatch(/용량·정가/);
  });
  it("작성·검증도 고른 제품을 기준으로 해요", () => {
    const { line } = selectLine(lineOf("탄력"), ["크림", "토너", "아이크림"]);
    const plan = assemblePlan(raw, { l: line }, []);
    expect(plan.products.map(p => [p.name, p.status])).toEqual([["크림", STATUS.ready], ["토너", STATUS.ready], ["아이크림", STATUS.pending]]);
    expect(checkRules({ plan, scenarios: [] }, { l: line }, { HERBS: [] }).fix).toEqual([]);
    const missing = { ...plan, products: plan.products.slice(0, 2) };
    expect(checkRules({ plan: missing, scenarios: [] }, { l: line }, { HERBS: [] }).fix.join()).toMatch(/제품 목록/);
  });
});
