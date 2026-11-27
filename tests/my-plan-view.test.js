/* 마이 기획실 기획안 보기 (HSJ 결정 2026-11-27): 제품 구성 예시, 근거 메모·검토 의견 숨김, 주의사항은 원료 / 금지 표현 두 묶음, 기획안 말투는 명사로 끝내는 개조식 */
import { describe, it, expect } from "vitest";
import { splitCautions } from "../src/plan/cautions.js";
import { buildPlanPrompt, PLAN_STYLE, CAUTION_RULE } from "../server/agents/writer.js";
import { buildEditPrompt } from "../server/agents/editor.js";
import * as fallback from "../src/data/fallback.js";
import { pickCandidate, applySelection } from "../server/agents/research.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const cand = applySelection(pickCandidate(fallback, { season: "여름", herb: "어성초", purpose: "모공·피지" }, NOW));

describe("주의사항 나누기", () => {
  it("[원료]·[표현] 머리말로 나누고 머리말은 떼요", () => {
    expect(splitCautions(["[원료] 향 부담 확인 필요", "[표현] 기능성 심사 전 미백 표현 자제", "  "])).toEqual({ herb: ["향 부담 확인 필요"], claim: ["기능성 심사 전 미백 표현 자제"] });
  });
  it("예전 기획안은 낱말로 나누고, 원료·표현이 아닌 항목은 빼요", () => {
    const r = splitCautions(["광고 문구는 효능 단정 금지", "원료 산지 표기 확인", "출시 일정 확인"]);
    expect(r.claim).toEqual(["광고 문구는 효능 단정 금지"]);
    expect(r.herb).toEqual(["원료 산지 표기 확인"]);
  });
});

describe("기획안 말투·주의사항 규칙이 프롬프트에 들어가요", () => {
  it("작성 에이전트", () => {
    const p = buildPlanPrompt(cand, "여름", fallback, [], null);
    expect(p).toContain(PLAN_STYLE);
    expect(p).toContain(CAUTION_RULE);
    expect(p).not.toContain("존댓말로 써 주세요");
  });
  it("수정 챗봇도 같은 규칙 (답은 존댓말 그대로)", () => {
    const content = { season: "여름", herb: "어성초", purpose: "모공·피지", plan: { concept_name: "x", concept: "y", target: "z", key_claims: ["a", "b", "c"], cautions: [], products: [] }, scenarios: [] };
    const p = buildEditPrompt(content, [{ role: "user", content: "말투 바꿔줘" }], cand, fallback);
    expect(p).toContain(PLAN_STYLE);
    expect(p).toContain(CAUTION_RULE);
    expect(p).toContain("존댓말로 답해 주세요");
  });
});
