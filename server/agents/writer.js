/* 작성 에이전트: AI는 글(콘셉트·문구·역할)만 쓰고, 제품 이름·용량·정가는 코드가 후보에서 채워요. */
import { STRING, STRINGS, isStringArray, describeLine, FACT_IDEA_RULE } from "./prompt.js";
import { BANNED_PHRASES, ROLE, extrasOf } from "../../src/config/rules.js";

/* 제품 상태: 용량·정가가 정해진 제품 / 기준값이 아직 없는 제품 */
export const STATUS = { ready: "출시", pending: "가격 준비 중" };

export class PlanFormatError extends Error {
  constructor(msg) { super(msg); this.name = "PlanFormatError"; }
}

/* 기획안 글 말투 (HSJ 결정 2026-11-27): '~다', '~요'로 끝내지 않고 명사로 끝내는 개조식 */
export const PLAN_STYLE = "- 말투: 기획안 글(concept, target, key_claims, product_roles의 role, cautions)은 '~다', '~요'로 끝내지 말고 '~반영', '~도움', '~강조', '~제안'처럼 명사로 끝내는 개조식으로 쓰세요. 예) '건조한 환절기 피부 보습에 도움', '경북 산지 원료 강조'.";
/* 주의사항 (HSJ 결정 2026-11-27): 원료·금지 표현에 대한 것만, 화면에서 두 묶음으로 나눠 보여 줘요 (src/plan/my.js) */
export const CAUTION_RULE = "- cautions에는 원료와 표현에 대한 주의사항만 적으세요. 항목마다 '[원료] ' 또는 '[표현] '으로 시작해요. [원료]: 이 원료를 쓸 때 조심할 점(향·자극·함량·산지 표기 등, 후보 정보 근거). [표현]: 광고·문구에서 피할 표현의 종류와 대신 쓸 말 (금지어 자체는 적지 마세요. 금지어 목록은 화면에 코드가 따로 보여 줘요. 예: '[표현] 피부 고민이 낫는다는 단정 대신 진정·정돈 같은 화장품 표현 사용'). 기능성 심사가 필요한 후보라면 기능성 심사 안내를 [표현] 항목으로 꼭 넣으세요. 가격·일정·유통 같은 다른 주의사항은 넣지 마세요.";

export const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    concept_name: STRING, concept: STRING, target: STRING, key_claims: STRINGS,
    product_roles: { type: "ARRAY", items: { type: "OBJECT", properties: { name: STRING, role: STRING }, required: ["name", "role"] } },
    cautions: STRINGS
  },
  required: ["concept_name", "concept", "target", "key_claims", "product_roles", "cautions"]
};

export function buildPlanPrompt(cand, season, data, notes, revise) {
  const out = [
    "당신은 한방 뷰티 화장품 출시 기획안을 쓰는 작성자예요. 아래 후보 정보를 바탕으로 기획안을 써 주세요.",
    "- concept_name(콘셉트 이름), concept(콘셉트 설명), target(주 고객), key_claims(핵심 문구 정확히 3개)를 써 주세요.",
    PLAN_STYLE,
    "- product_roles에는 제품 목록의 제품마다 이름을 그대로 쓰고, 그 제품이 하는 일을 짧게 적어 주세요.",
    "- 가격·용량 같은 숫자는 쓰지 마세요. 제품 이름·용량·가격은 코드가 채워요.",
    FACT_IDEA_RULE,
    `- 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    CAUTION_RULE,
    "",
    "[후보 정보]",
    describeLine(cand, season, data)
  ];
  if (notes?.length) out.push("", "[근거 메모]", ...notes.map(n => `- ${n}`));
  if (revise) {
    out.push("", "[이전 기획안]", JSON.stringify(revise.previous, null, 1), "", "[고칠 점]", ...(revise.issues || []).map(i => `- ${i}`), "위 고칠 점을 반영해 다시 써 주세요.");
  }
  return out.join("\n");
}

const lineOf = c => (c && c.l) || c;
const text = v => (typeof v === "string" && v.trim() ? v.trim() : null);

/* AI 결과 + 후보 → 기획안. 제품 이름·용량·정가·상태는 코드 값이에요 */
export function assemblePlan(raw, cand, notes) {
  const l = lineOf(cand);
  const [concept_name, concept, target] = ["concept_name", "concept", "target"].map(k => text(raw?.[k]));
  if (!concept_name || !concept || !target) throw new PlanFormatError("콘셉트 이름·설명·고객이 비어 있어요.");
  if (!isStringArray(raw.key_claims)) throw new PlanFormatError("핵심 문구 형식이 맞지 않아요.");
  const key_claims = raw.key_claims.map(s => s.trim()).filter(Boolean);
  if (key_claims.length < 3) throw new PlanFormatError("핵심 문구가 3개보다 적어요.");
  if (raw.cautions != null && !isStringArray(raw.cautions)) throw new PlanFormatError("주의사항 형식이 맞지 않아요.");

  const roles = Array.isArray(raw.product_roles) ? raw.product_roles : [];
  const roleOf = name => {
    const hit = roles.find(r => r && r.name === name && text(r.role));
    return hit ? hit.role.trim() : (ROLE[name] || "");
  };
  const products = (l.lineup || []).map(([type, name, ml, price]) => ({ type, name, ml, price, role: roleOf(name), status: STATUS.ready }));
  for (const x of extrasOf(l)) products.push({ type: x.type, name: x.name, ml: null, price: null, role: roleOf(x.name), status: STATUS.pending });

  return {
    concept_name, concept, target, key_claims: key_claims.slice(0, 3), products,
    notes: notes || [], cautions: (raw.cautions || []).map(s => s.trim()).filter(Boolean), review_notes: []
  };
}
