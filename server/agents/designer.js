/* 디자인 에이전트: 제품 패키징(용기 + 단상자 세트)과 오프라인 팝업스토어 디자인, 2가지의 짧은 설명과 이미지 프롬프트를 만들어요.
   용기·상자·공간에는 로고·글자를 넣지 않아요. (HSJ 결정 2026-11-27: 광고 시나리오 + 이미지 3장 → 패키징·팝업 디자인 이미지 2장)
   예전 기획안(광고 시나리오 + 이미지 3장, 시나리오 3개 + 이미지 각 1장)은 새로 만들지 않고, 이미지 설명을 읽는 함수만 남겨 둬요. */
import { STRING, describeLine, FACT_IDEA_RULE } from "./prompt.js";
import { stripBanned } from "./verifier.js";
import { PlanFormatError } from "./writer.js";
import { BANNED_PHRASES, SAMPLE, sampleType } from "../../src/config/rules.js";
import { lineDesign, PALETTE_RANGE } from "../../src/core/palette.js";

const lineOf = c => (c && c.l) || c;
const str = v => (typeof v === "string" ? v.trim() : "");

/* 지금 형식: 디자인 2가지 (순서 = 이미지 번호 0·1) */
export const DESIGN_KINDS = ["제품 패키징", "오프라인 팝업 디자인"];
export const DESIGN_COUNT = DESIGN_KINDS.length;
const DESIGN_ITEM = { type: "OBJECT", properties: { title: STRING, description: STRING, image_prompt: STRING }, required: ["title", "description", "image_prompt"] };
export const DESIGN_SCHEMA = {
  type: "OBJECT",
  properties: { designs: { type: "ARRAY", items: DESIGN_ITEM } },
  required: ["designs"]
};

/* 저장된 내용 → 이미지 idx 의 설명. 지금 형식(designs 2개)과 예전 형식(시나리오 1개 + image_prompts 3개,
   시나리오 3개 각자 image_prompt)을 모두 읽어요. */
export function imagePromptAt(content, idx) {
  const designs = Array.isArray(content?.designs) ? content.designs : null;
  if (designs?.length) return str(designs[idx]?.image_prompt);
  const list = Array.isArray(content?.scenarios) ? content.scenarios : [];
  if (Array.isArray(list[0]?.image_prompts)) return list[0].image_prompts[idx] || "";
  return list[idx]?.image_prompt || "";
}

/* 이 내용에 있어야 할 이미지 번호들: 지금 형식 [0,1], 예전 형식 [0,1,2] (시나리오가 1~2개뿐이면 그만큼) */
export function imageSlotsOf(content) {
  if (Array.isArray(content?.designs) && content.designs.length) return content.designs.slice(0, DESIGN_COUNT).map((_, i) => i);
  const list = Array.isArray(content?.scenarios) ? content.scenarios : [];
  return list.length > 1 ? list.slice(0, 3).map((_, i) => i) : list.length ? [0, 1, 2] : [];
}

export function buildDesignPrompt(plan, cand, season, data, palette) {
  const out = [
    "당신은 한방 뷰티 화장품의 패키징·공간 디자인을 기획하는 디자이너예요. 아래 기획안에 맞춰 디자인 2가지를 이 순서대로 정확히 2개 써 주세요 (designs 목록).",
    "1) 제품 패키징: 이 라인의 용기 전체와 각 용기를 담는 단상자(겉상자)를 함께 놓은 세트 디자인.",
    "2) 오프라인 팝업 디자인: 이 라인을 소개하는 오프라인 팝업스토어 공간·부스 디자인 (진열대, 체험 공간, 소재, 조명, 동선).",
    "- title: 디자인 이름 한 줄 (짧게).",
    "- description: 화면에 보여 줄 간단한 설명 1~2문장. 색·소재·분위기와 기획안 콘셉트를 어떻게 담았는지. '~다', '~요'로 끝내지 말고 '~강조', '~구성', '~연출'처럼 명사로 끝내는 개조식으로 써요. 예) '당귀 뿌리 색을 닮은 갈색 단상자와 크림색 용기로 한방 원료 느낌 강조'.",
    "- image_prompt: 이미지 AI에게 줄 장면 설명 (한국어 또는 영어). 무엇이 어디에 어떻게 놓이는지 구체적으로.",
    "- 용기·단상자·간판·벽 어디에도 로고·글자·브랜드 이름이 보이지 않게 써요.",
    "- 가격·용량 같은 숫자는 쓰지 마세요.",
    FACT_IDEA_RULE,
    `- 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    "",
    "[후보 정보]",
    describeLine(cand, season, data),
    "",
    "[기획안]",
    JSON.stringify({ concept_name: plan?.concept_name, concept: plan?.concept, target: plan?.target, key_claims: plan?.key_claims, products: (plan?.products || []).map(p => p?.name) }, null, 1)
  ];
  if (palette?.colors?.length) out.push("", `[트렌드 색] ${palette.colors.join(", ")}`);
  return out.join("\n");
}

/* AI 결과 → 디자인 2개. 금지 표현이 든 문장은 빼고 notes에 남겨요. 모자라거나 비면 PlanFormatError */
export function assembleDesigns(raw) {
  const list = Array.isArray(raw?.designs) ? raw.designs : [];
  if (list.length < DESIGN_COUNT) throw new PlanFormatError(`디자인 설명이 ${DESIGN_COUNT}개보다 적어요 (${list.length}개).`);
  const notes = [];
  const clean = (text, where) => {
    const kept = stripBanned(text);
    if (str(text) && kept !== str(text)) notes.push(`${where}에서 금지 표현이 든 문장을 뺐어요.`);
    return kept;
  };
  const designs = list.slice(0, DESIGN_COUNT).map((d, i) => {
    const where = DESIGN_KINDS[i];
    const out = { kind: where, title: clean(d?.title, `${where} 이름`), description: clean(d?.description, `${where} 설명`), image_prompt: clean(d?.image_prompt, `${where} 이미지 설명`) };
    if (!out.description || !out.image_prompt) throw new PlanFormatError(`${where}의 설명·이미지 설명이 비어 있어요.`);
    if (!out.title) out.title = where;
    return out;
  });
  return { designs, notes };
}

/* 이미지에 나와야 할 제품 목록. 참고 사진(용기 샘플)과 짝지어 알려 줘요 */
const PRODUCT_EN = { toner: "toner bottle", serum: "serum dropper bottle", cream: "cream jar", lotion: "lotion pump bottle", mist: "mist spray bottle",
  cleanser: "cleanser tube", eye: "eye cream tube", pad: "pad jar", mask: "sheet mask pouch" };
function productLine(l) {
  const items = [...new Set((l.lineup || []).map(x => x[0]))].map(t => PRODUCT_EN[t] || t);
  return items.length ? [`Products in this set (show every one, shaped like the matching reference photo): ${items.join(", ")}.`] : [];
}

/* 이미지 종류별 앞머리. kind 가 없으면(예전 형식) 제품 사진으로 그려요 */
const KIND_LEAD = {
  "제품 패키징": [
    "Premium Korean herbal skincare packaging design shot: every container in this line shown together with its own matching outer carton box (단상자), arranged as one product set, clean studio lighting.",
    "The outer cartons follow the same colors and materials as the containers."
  ],
  "오프라인 팝업 디자인": [
    "Interior design render of an offline pop-up store booth for a premium Korean herbal skincare line: display shelves with the products, a small try-on counter, natural materials, warm lighting, visitors' walking path.",
    "No signage text, no letters, no logos anywhere in the space (walls, banners, shelves)."
  ]
};

/* 이미지 만들기용 프롬프트. 원료 색과 트렌드 색을 #코드로 넣어요 */
export function buildImagePrompt(scenario, cand, data, palette) {
  const l = lineOf(cand), d = data?.DESIGN?.[l.herb] ? lineDesign(data.DESIGN, l.herb, l.purpose) : (l.design || {});
  const lead = KIND_LEAD[scenario?.kind] || ["Premium Korean herbal skincare product photo, clean and natural lighting."];
  const out = [
    `Scene: ${stripBanned(scenario.image_prompt)}`,
    ...lead,
    ...productLine(l),
    "The containers and boxes must have no logo, no text, no letters and no brand name on them (용기·상자에 로고·글자·브랜드명 없음).",
    `Container colors from the herb: body ${d.main}, cap ${d.cap}, liquid ${d.liquid}.`,
    ...(d.bg ? [`Background color matched to the container: ${d.bg}.`] : []),
    `Palette: any color in the full hex range ${PALETTE_RANGE.from}-${PALETTE_RANGE.to} (${PALETTE_RANGE.count.toLocaleString("en-US")} colors).`
  ];
  if (palette?.colors?.length) out.push(`트렌드 색 (trend palette accents): ${palette.colors.join(", ")}.`);
  return out.join("\n");
}

/* 용기 샘플 파일 이름: 제품 종류별 하나씩. 전용 사진이 없는 클렌저·아이크림·패드는 비슷한 용기 사진(SAMPLE_AS)을 써요 */
export function sampleFilesFor(cand) {
  const types = [...new Set((lineOf(cand).lineup || []).map(x => x[0]))];
  // 로고를 지운 사진(scripts/remove-logos.py)을 넘겨서 AI가 샘플 로고를 따라 그리지 않게 해요
  return [...new Set(types.map(t => SAMPLE[sampleType(t)]).filter(Boolean))].map(f => f.replace(/\.png$/, "-nologo.png"));
}
