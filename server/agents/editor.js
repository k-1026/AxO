/* 수정 에이전트: 사용자의 수정 요청을 듣고 답과 "바꿀 내용" 제안을 만들어요. 저장은 하지 않아요.
   AI가 글만 바꾸고, 제품 이름·용량·정가는 작성 에이전트의 assemble 이 코드 값으로 다시 채워요. */
import { STRING, describeLine } from "./prompt.js";
import { PLAN_SCHEMA, assemblePlan, PlanFormatError } from "./writer.js";
import { SCENARIO_SCHEMA, assembleScenarios } from "./designer.js";
import { BANNED_PHRASES, CATALOG_NAMES, catalogItem, qty } from "../../src/config/rules.js";
import { withProducts, withVolumes } from "./research.js";

const CHANGE = { type: "OBJECT", properties: { part: STRING, before: STRING, after: STRING }, required: ["part", "before", "after"] };

/* 수정 범위: 문구(그 부분만) / 방향(기획안·시나리오 전체 다시 쓰기) / 질문(고칠 것 없음) */
export const SCOPE = { wording: "문구", direction: "방향", question: "질문" };

export const EDIT_SCHEMA = {
  type: "OBJECT",
  /* 답을 쓰기 전에 사용자의 속뜻부터 정하게 하려고 understanding 을 맨 앞에 둬요 */
  propertyOrdering: ["understanding", "reply", "proposal"],
  properties: {
    understanding: {
      type: "OBJECT",
      properties: { intent: STRING, scope: { type: "STRING", enum: Object.values(SCOPE) } },
      required: ["intent", "scope"]
    },
    reply: STRING,
    proposal: {
      type: "OBJECT", nullable: true,
      properties: {
        summary: STRING,
        changes: { type: "ARRAY", items: CHANGE },
        plan: PLAN_SCHEMA,
        scenarios: SCENARIO_SCHEMA.properties.scenarios,
        regenerate_images: { type: "ARRAY", items: { type: "INTEGER" } },
        products: { type: "ARRAY", items: STRING },
        volumes: { type: "ARRAY", items: { type: "OBJECT", properties: { name: STRING, ml: { type: "INTEGER" } }, required: ["name", "ml"] } }
      },
      required: ["summary", "changes", "regenerate_images"]
    }
  },
  required: ["understanding", "reply", "proposal"]
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
    "- 존댓말로 답해 주세요. 답(reply)은 짧고 친절하게 쓰고, 첫 문장에서 요청을 어떻게 이해했는지 말해 주세요.",
    "",
    "[요청을 이해하는 법: 말 그대로 받아들이지 말고 속뜻을 판단하세요]",
    "사용자는 AI에 맞춘 말투로 부탁하지 않아요. 평소 말투 그대로 짧게 말해요. 글자에 쓰인 부분만 보지 말고, 기획자라면 그 말이 기획안에 무엇을 바라는지 생각해서 understanding에 적으세요.",
    "- understanding.intent: 사용자가 실제로 바라는 것을 한 문장으로 (예: '20대 직장인에 맞게 출시 방향 전체를 다시 잡아 달라').",
    "- understanding.scope: 아래 기준으로 하나를 고르세요.",
    "  · 문구: 특정 문장·단어·말투·오타만 고쳐 달라는 요청. 예) '핵심 문구 2번 어색해', '말투 좀 부드럽게', '콘셉트 이름 더 짧게', '오타 있어'.",
    "  · 방향: 누구에게·무엇을·어떻게 팔지가 바뀌는 요청. 글자로는 한 칸만 말해도 방향이에요.",
    "    예) '20대 직장인을 타깃으로 바꿔줘', '남자도 쓰게', '좀 더 고급스럽게', '가성비로 가자', 'MZ 느낌', '틱톡에 올릴 거야', '진정 말고 보습 위주로', '이거 별로야', '너무 평범해', '트렌드 반영해줘'.",
    "    타깃이 바뀌면 그 사람들의 생활·피부 고민·제품 쓰는 때·좋아하는 채널과 말투가 바뀌니까, 콘셉트·핵심 문구·제품 역할·시나리오가 모두 따라 바뀌어야 해요.",
    "  · 질문: 고칠 것 없이 묻거나 인사하는 말. proposal은 null.",
    "  · 헷갈리면 '방향'을 고르세요. 사용자가 결과가 부족하다고 지적하면(예: '타깃만 바뀌었네', '달라진 게 없어') 언제나 '방향'이에요.",
    "",
    "[범위별로 고치는 법]",
    "- 문구: 그 부분만 바꾸고 나머지는 그대로 두세요.",
    "- 방향: 한 줄만 바꾸지 마세요. 새 방향에 맞춰 기획안 전체(콘셉트 이름·설명, 핵심 문구 3개 모두, 제품마다 맡는 역할과 쓰는 순서·상황, 주의사항)와 시나리오 전체(제목·콘셉트·타깃·채널·장면·카피·이미지 설명)를 새로 쓰세요.",
    "  [후보 정보]의 계절 피부 이슈와 뷰티 트렌드 자료를 근거로 삼고, 왜 그렇게 바꿨는지 reply에 한두 문장으로 알려 주세요. changes에는 바뀐 칸을 빠짐없이 적으세요.",
    "  사용자가 말하지 않은 것을 새로 정해야 하면(예: 타깃만 말했을 때 채널·분위기) 그 타깃에 가장 알맞게 직접 판단해서 정하세요.",
    "",
    "[제품 구성 바꾸기]",
    `- 사용자가 제품을 더하거나 빼 달라고 하면(예: '마스크팩도 같이 내고 싶어', '클렌저는 빼줘') proposal.products에 바뀐 뒤의 제품 이름 전체를 쓰세요. 넣을 수 있는 제품: ${CATALOG_NAMES.join(", ")}. ('마스크팩'은 '마스크'예요.)`,
    "- 제품 구성을 바꾸면 그 자체로 '방향' 변경이에요. 새 제품이 라인 안에서 맡는 역할·쓰는 때(예: 주 2~3회 집중 케어)를 product_roles에 넣고, 콘셉트·핵심 문구·시나리오 장면·이미지 설명(특히 0 제품 대표 컷)에 새 제품이 나오게 다시 쓰세요. 뺀 제품은 어디에도 남기지 마세요.",
    "- 제품을 바꾸지 않는다면 proposal.products는 비워 두세요(빈 목록).",
    "- 고칠 내용이 있으면 proposal을 채우고, 단순한 질문이나 인사라면 proposal을 null로 두세요.",
    "- proposal.summary는 한 줄 요약, changes에는 바뀌는 부분마다 part(어디), before(전), after(후)를 한 줄씩 적어 주세요.",
    "- 기획안 글을 바꾸면 proposal.plan에 바뀐 뒤의 기획안 전체(concept_name, concept, target, key_claims 정확히 3개, product_roles, cautions)를 빠짐없이 쓰세요.",
    "- 시나리오를 바꾸면 proposal.scenarios에 바뀐 뒤의 시나리오 1개 전체를 빠짐없이 쓰세요 (title, concept, target, channel, 장면 cuts 3~4개(scene, copy), image_prompts는 이미지 설명 정확히 3개: 0 제품 대표 컷, 1 원료·질감 컷, 2 사용 장면 컷).",
    "",
    "[제품 용량 바꾸기]",
    "- 사용자가 제품 용량을 바꿔 달라고 하면(예: '토너 300ml, 미스트 150ml로') proposal.volumes에 [{name, ml}]로 사용자가 말한 용량만 적으세요. 마스크·패드는 ml 대신 매수예요.",
    `- 정가는 쓰지 마세요. 코드가 단위당 기준 정가 × 용량으로 계산해요. 최소 용량(이보다 작게는 못 바꿔요): ${CATALOG_NAMES.map(n => { const it = catalogItem(n); return `${n} ${qty(it[0], it[2])}`; }).join(", ")}.`,
    "- 사용자가 최소 용량보다 작게 말하면 volumes에 넣지 말고, reply에서 최소 용량을 알려 주세요.",
    "- 용량만 바꾸는 요청이면 기획안 글·시나리오는 그대로 두세요(proposal.plan·scenarios 비움).",
    "- 기획안 글(콘셉트·핵심 문구·시나리오)에는 가격·용량 숫자를 쓰지 마세요. 제품 이름·용량·가격은 코드가 제품 표에 채워요.",
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

/* '방향' 요청인데 수정안이 일부만 바꿨는지 봐요. 콘셉트·핵심 문구·시나리오가 함께 바뀌어야 해요.
   모자란 점을 글로 돌려주고, 충분하면 null 이에요. */
export function narrowForDirection(proposal, content) {
  const why = [];
  const old = content?.plan || {};
  if (!proposal?.plan) why.push("기획안 전체(proposal.plan)를 새로 쓰지 않았어요.");
  else {
    if (str(proposal.plan.concept) === str(old.concept)) why.push("콘셉트 설명이 그대로예요.");
    const same = (proposal.plan.key_claims || []).filter(k => (old.key_claims || []).includes(k)).length;
    if (same >= 2) why.push("핵심 문구가 거의 그대로예요.");
  }
  if (!proposal?.scenarios) why.push("시나리오 전체(proposal.scenarios)를 새로 쓰지 않았어요.");
  return why.length ? why.join(" ") : null;
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
  /* 제품 구성 바꾸기: 이름만 AI 것이고, 용량·정가는 저장된 값·기준표 값으로 코드가 채워요 */
  const swap = withProducts(cand, Array.isArray(raw.products) && raw.products.length ? raw.products : null);
  if (swap) {
    cand = swap.cand;
    out.products = swap.names;
    if (!out.regenerate_images.includes(0)) out.regenerate_images = [0, ...out.regenerate_images]; // 대표 컷에 새 구성이 나오게
  }
  /* 용량 바꾸기: 용량만 AI(사용자 말) 것이고, 정가는 코드가 계산해요. 최소 용량보다 작으면 바꾸지 않고 안내해요 */
  const vol = withVolumes(cand, Array.isArray(raw.volumes) ? raw.volumes : null);
  if (vol.volumes.length) {
    cand = vol.cand;
    out.volumes = vol.volumes;
    out.changes = [...vol.changes, ...out.changes.filter(c => !/용량|정가/.test(c.part))];
  }
  if (vol.rejected.length) out.notices = vol.rejected;
  /* AI 답은 모양이 매번 조금씩 달라요. 칸마다 쓸 수 있는 것만 쓰고, 빠지거나 어긋난 칸은 지금 기획안 글로 채워요.
     그래도 조립이 안 되는 부분은 버리고(지금 것 유지), 쓸 게 하나도 없을 때만 PlanFormatError 를 던져요. */
  let dropped = null;
  if ((raw.plan != null && typeof raw.plan === "object") || swap || vol.volumes.length) {
    const old = rawPlanOf(content?.plan);
    const ai = raw.plan && typeof raw.plan === "object" ? raw.plan : {};
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
  if (!out.plan && !out.scenarios && !out.regenerate_images.length) {
    if (dropped) throw dropped;
    return null; // 최소 용량 미달 같은 안내(notices)는 답(reply)으로 전해요
  }
  if (!out.summary) out.summary = out.changes[0]?.part ? `${out.changes[0].part} 수정` : "기획안 수정";
  return out;
}
