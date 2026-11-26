/* 수정 에이전트: 사용자의 수정 요청을 듣고 답과 "바꿀 내용" 제안을 만들어요. 저장은 하지 않아요.
   AI가 글만 바꾸고, 제품 이름·용량·정가는 작성 에이전트의 assemble 이 코드 값으로 다시 채워요. */
import { STRING, describeLine } from "./prompt.js";
import { PLAN_SCHEMA, assemblePlan, PlanFormatError } from "./writer.js";
import { SCENARIO_SCHEMA, assembleScenarios } from "./designer.js";
import { BANNED_PHRASES } from "../../src/config/rules.js";

const CHANGE = { type: "OBJECT", properties: { part: STRING, before: STRING, after: STRING }, required: ["part", "before", "after"] };

export const EDIT_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: STRING,
    proposal: {
      type: "OBJECT", nullable: true,
      properties: {
        summary: STRING,
        changes: { type: "ARRAY", items: CHANGE },
        plan: PLAN_SCHEMA,
        scenarios: SCENARIO_SCHEMA.properties.scenarios,
        regenerate_images: { type: "ARRAY", items: { type: "INTEGER" } }
      },
      required: ["summary", "changes", "regenerate_images"]
    }
  },
  required: ["reply", "proposal"]
};

const str = v => (typeof v === "string" ? v.trim() : "");

/* 저장된 기획안 → 작성 에이전트가 받는 글 형식 (제품 역할은 product_roles 로) */
export function rawPlanOf(plan) {
  return {
    concept_name: plan?.concept_name, concept: plan?.concept, target: plan?.target,
    key_claims: plan?.key_claims, cautions: plan?.cautions,
    product_roles: (plan?.products || []).map(p => ({ name: p?.name, role: p?.role }))
  };
}

export function buildEditPrompt(content, messages, cand, data) {
  const plan = content?.plan || {};
  const current = {
    plan: { concept_name: plan.concept_name, concept: plan.concept, target: plan.target, key_claims: plan.key_claims, cautions: plan.cautions, products: plan.products },
    scenarios: content?.scenarios
  };
  const talk = (messages || []).map(m => `${m.role === "user" ? "사용자" : "챗봇"}: ${m.content}`);
  return [
    "당신은 한방 뷰티 화장품 출시 기획안을 고쳐 주는 수정 도우미예요. 사용자와 대화하며 아래 [지금 기획안]을 고쳐요.",
    "- 존댓말로 답해 주세요. 답(reply)은 짧고 친절하게 써 주세요.",
    "- 먼저 요청의 크기를 판단하세요.",
    "  · 문장 다듬기·오타·말투처럼 작은 요청이면 그 부분만 바꾸고 나머지는 그대로 두세요.",
    "  · 타깃 고객, 콘셉트, 출시 방향, 분위기, 판매 채널, 강조할 효과처럼 방향이 바뀌는 요청이면 그 한 줄만 바꾸지 마세요.",
    "    새 방향에 맞춰 기획안 전체(콘셉트 이름·설명, 핵심 문구 3개, 제품마다 맡는 역할과 쓰는 순서·상황, 주의사항)와 시나리오 전체(제목·콘셉트·타깃·채널·장면·이미지 설명)를 다시 쓰세요.",
    "    이때 [후보 정보]의 계절 피부 이슈와 뷰티 트렌드 자료를 근거로, 사용자가 말한 새 방향(타깃이라면 그 사람들의 하루 생활·피부 고민·제품을 쓰는 때)에 맞게 바꾸세요.",
    "  · 사용자가 결과가 부족하다고 지적하면(예: '타깃만 바뀌었다') 그 지적을 받아들여 위처럼 전체를 다시 쓰세요.",
    "- 제품 종류(라인 구성)는 후보 정보의 제품 목록으로 정해져 있어요. 제품을 더하거나 빼 달라고 하면 reply에서 그렇게 할 수 없다고 짧게 알리고, 대신 제품의 역할·쓰는 순서·주력 제품을 바꿔 제안하세요. 이때도 사용자가 말하지 않은 타깃·콘셉트는 바꾸지 마세요.",
    "- 고칠 내용이 있으면 proposal을 채우고, 단순한 질문이나 인사라면 proposal을 null로 두세요.",
    "- proposal.summary는 한 줄 요약, changes에는 바뀌는 부분마다 part(어디), before(전), after(후)를 한 줄씩 적어 주세요.",
    "- 기획안 글을 바꾸면 proposal.plan에 바뀐 뒤의 기획안 전체(concept_name, concept, target, key_claims 정확히 3개, product_roles, cautions)를 빠짐없이 쓰세요.",
    "- 시나리오를 바꾸면 proposal.scenarios에 바뀐 뒤의 시나리오 1개 전체를 빠짐없이 쓰세요 (title, concept, target, channel, 장면 cuts 3~4개(scene, copy), image_prompts는 이미지 설명 정확히 3개: 0 제품 대표 컷, 1 원료·질감 컷, 2 사용 장면 컷).",
    "- 가격·용량 같은 숫자는 쓰지 마세요. 제품 이름·용량·가격은 코드가 채워요.",
    "- 후보 정보에 있는 사실만 쓰고, 후보 원료 말고 다른 원료는 언급하지 마세요.",
    `- 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    "- regenerate_images는 사용자가 이미지를 바꿔 달라고 분명히 말했을 때만 이미지 번호(0 대표 컷, 1 원료·질감 컷, 2 사용 장면 컷)를 넣고, 아니면 빈 목록으로 두세요. 이미지 설명(image_prompts)을 바꿨다면 그 번호도 넣으세요.",
    "",
    "[후보 정보]",
    describeLine(cand, content?.season, data),
    "",
    "[지금 기획안]",
    JSON.stringify(current, null, 1),
    "",
    "[대화]",
    ...talk
  ].join("\n");
}

const isStrings = a => Array.isArray(a) && a.every(x => typeof x === "string");
const goodCut = c => c && typeof c.scene === "string" && typeof c.copy === "string";

/* AI가 보낸 시나리오에서 형식이 맞는 칸만 쓰고, 빠지거나 어긋난 칸은 지금 시나리오로 채워요.
   (예: 타깃만 바꿨는데 장면·이미지 설명을 빼고 보냄) */
function mergeScenario(ai, cur) {
  if (!ai || typeof ai !== "object") return cur;
  const base = cur || {};
  const out = { ...base };
  for (const k of ["title", "concept", "target", "channel"]) if (str(ai[k])) out[k] = ai[k];
  if (Array.isArray(ai.cuts) && ai.cuts.length >= 3 && ai.cuts.length <= 4 && ai.cuts.every(goodCut)) out.cuts = ai.cuts;
  if (isStrings(ai.image_prompts) && ai.image_prompts.length >= 3 && ai.image_prompts.every(p => p.trim())) out.image_prompts = ai.image_prompts;
  return out;
}

const picks = (arr, n) => (Array.isArray(arr) ? arr : []).slice(0, n);

/* AI 제안 → 믿고 쓸 수 있는 제안. 글만 AI 것이고 숫자(제품 이름·용량·정가)는 코드 값으로 다시 채워요.
   보여 줄 게 없으면 null 이에요. 형식이 틀리면 PlanFormatError 를 던져요. */
export function cleanProposal(raw, content, cand) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const summary = str(raw.summary).slice(0, 200);
  const changes = picks(raw.changes, 10)
    .filter(c => c && typeof c === "object")
    .map(c => ({ part: str(c.part), before: str(c.before), after: str(c.after) }))
    .filter(c => c.part);
  const regenerate_images = [...new Set(picks(raw.regenerate_images, 10).filter(i => Number.isInteger(i) && i >= 0 && i <= 2))].sort((a, b) => a - b);

  const out = { summary, changes, regenerate_images };
  /* AI 답은 모양이 매번 조금씩 달라요. 칸마다 쓸 수 있는 것만 쓰고, 빠지거나 어긋난 칸은 지금 기획안 글로 채워요.
     그래도 조립이 안 되는 부분은 버리고(지금 것 유지), 쓸 게 하나도 없을 때만 PlanFormatError 를 던져요. */
  let dropped = null;
  if (raw.plan != null && typeof raw.plan === "object") {
    const old = rawPlanOf(content?.plan);
    const ai = raw.plan;
    const merged = { ...old };
    for (const k of ["concept_name", "concept", "target"]) if (str(ai[k])) merged[k] = ai[k];
    if (isStrings(ai.key_claims) && ai.key_claims.filter(x => x.trim()).length >= 3) merged.key_claims = ai.key_claims;
    if (isStrings(ai.cautions)) merged.cautions = ai.cautions;
    if (Array.isArray(ai.product_roles) && ai.product_roles.length) merged.product_roles = ai.product_roles;
    else if (Array.isArray(ai.products) && ai.products.length) merged.product_roles = ai.products.map(x => ({ name: x?.name, role: x?.role }));
    try {
      const plan = assemblePlan(merged, cand, content?.plan?.notes);
      out.plan = { ...plan, product_roles: plan.products.map(p => ({ name: p.name, role: p.role })) };
    } catch (e) {
      if (!(e instanceof PlanFormatError)) throw e;
      dropped = e;
    }
  }
  if (raw.scenarios != null) {
    const list = Array.isArray(raw.scenarios) ? raw.scenarios : (raw.scenarios?.scenarios ?? [raw.scenarios]);
    try {
      out.scenarios = assembleScenarios({ scenarios: [mergeScenario(list[0], content?.scenarios?.[0])] }).scenarios;
    } catch (e) {
      if (!(e instanceof PlanFormatError)) throw e;
      dropped = e;
    }
  }
  if (!out.plan && !out.scenarios && !regenerate_images.length) {
    if (dropped) throw dropped;
    return null;
  }
  if (!out.summary) out.summary = out.changes[0]?.part ? `${out.changes[0].part} 수정` : "기획안 수정";
  return out;
}
