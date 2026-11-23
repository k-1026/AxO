/* 작성 에이전트: AI는 글(콘셉트·문구·역할)만 쓰고, 제품 이름·용량·정가는 코드가 후보에서 채워요. */
import { STRING, STRINGS, isStringArray, describeLine } from "./prompt.js";
import { BANNED_PHRASES, ROLE } from "../../src/config/rules.js";

export class PlanFormatError extends Error {
  constructor(msg) { super(msg); this.name = "PlanFormatError"; }
}

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
    "- concept_name(콘셉트 이름), concept(콘셉트 설명), target(주 고객), key_claims(핵심 문구 정확히 3개)를 존댓말로 써 주세요.",
    "- product_roles에는 제품 목록의 제품마다 이름을 그대로 쓰고, 그 제품이 하는 일을 짧게 적어 주세요.",
    "- 가격·용량 같은 숫자는 쓰지 마세요. 제품 이름·용량·가격은 코드가 채워요.",
    "- 후보 정보에 있는 사실만 쓰세요. 없는 수치나 근거를 지어내지 마세요.",
    "- 후보 원료 말고 다른 원료는 언급하지 마세요.",
    `- 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    "- cautions에는 출시 전에 조심할 점을 적어 주세요. 기능성 심사가 필요한 후보라면 기능성 심사 안내를 꼭 넣어 주세요.",
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
  const products = (l.lineup || []).map(([type, name, ml, price]) => ({ type, name, ml, price, role: roleOf(name), status: "1차" }));
  if (l.extra) products.push({ type: "cleanser", name: l.extra, ml: null, price: null, role: roleOf(l.extra), status: "준비 중" });

  return {
    concept_name, concept, target, key_claims: key_claims.slice(0, 3), products,
    notes: notes || [], cautions: (raw.cautions || []).map(s => s.trim()).filter(Boolean), review_notes: []
  };
}
