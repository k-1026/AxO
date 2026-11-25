/* 디자인 에이전트: 광고 시나리오 1개와 이미지 프롬프트 3개(대표·원료·사용 장면)를 만들어요. 용기에는 로고·글자를 넣지 않아요. */
import { STRING, describeLine } from "./prompt.js";
import { stripBanned } from "./verifier.js";
import { PlanFormatError } from "./writer.js";
import { BANNED_PHRASES, SAMPLE } from "../../src/config/rules.js";
import { lineDesign, PALETTE_RANGE } from "../../src/core/palette.js";

const CUT = { type: "OBJECT", properties: { scene: STRING, copy: STRING }, required: ["scene", "copy"] };
export const SCENARIO_SCHEMA = {
  type: "OBJECT",
  properties: {
    scenarios: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: STRING, concept: STRING, target: STRING, channel: STRING, cuts: { type: "ARRAY", items: CUT }, image_prompts: { type: "ARRAY", items: STRING } },
        required: ["title", "concept", "target", "channel", "cuts", "image_prompts"]
      }
    }
  },
  required: ["scenarios"]
};

const lineOf = c => (c && c.l) || c;

/* 이미지 3장이 맡는 장면 (순서 = 이미지 번호 0·1·2) */
export const IMAGE_KINDS = ["제품 대표 컷", "원료·질감 컷", "사용 장면 컷"];
export const IMAGE_COUNT = IMAGE_KINDS.length;

/* 저장된 시나리오 → 이미지 idx 의 설명. 지금 형식(시나리오 1개 + image_prompts 3개)과
   예전 형식(시나리오 3개, 각자 image_prompt)을 모두 읽어요. */
export function imagePromptAt(scenarios, idx) {
  const list = Array.isArray(scenarios) ? scenarios : [];
  if (Array.isArray(list[0]?.image_prompts)) return list[0].image_prompts[idx] || "";
  return list[idx]?.image_prompt || "";
}

export function buildScenarioPrompt(plan, cand, season, data, palette) {
  const out = [
    "당신은 한방 뷰티 화장품의 광고 시나리오를 쓰는 기획자예요. 아래 기획안으로 광고 시나리오를 정확히 1개 써 주세요 (scenarios 목록에 1개).",
    "- title, concept, target, channel(올릴 채널), cuts(장면 3~4개, 장면마다 scene과 copy)를 채워 주세요.",
    `- image_prompts에는 이 시나리오에 쓸 서로 다른 광고 이미지 설명을 정확히 3개 써 주세요: ${IMAGE_KINDS.map((k, i) => `${i + 1}) ${k}`).join(", ")}.`,
    "- 존댓말로, 짧고 산뜻하게 써 주세요.",
    "- 가격·용량 같은 숫자는 쓰지 마세요.",
    "- 후보 정보에 있는 사실만 쓰고, 후보 원료 말고 다른 원료는 언급하지 마세요.",
    `- 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    "- 용기에 로고·글자·브랜드 이름이 보이는 장면은 쓰지 마세요.",
    "",
    "[후보 정보]",
    describeLine(cand, season, data),
    "",
    "[기획안]",
    JSON.stringify({ concept_name: plan?.concept_name, concept: plan?.concept, target: plan?.target, key_claims: plan?.key_claims }, null, 1)
  ];
  if (palette?.colors?.length) out.push("", `[트렌드 색] ${palette.colors.join(", ")}`);
  return out.join("\n");
}

const str = v => (typeof v === "string" ? v.trim() : "");

/* AI 결과 → 시나리오 1개(이미지 설명 3개). 금지 표현이 든 문장은 빼고 notes에 남겨요 */
export function assembleScenarios(raw) {
  const list = Array.isArray(raw?.scenarios) ? raw.scenarios : [];
  if (list.length < 1) throw new PlanFormatError("시나리오가 없어요.");
  const notes = [];
  const clean = (text, where) => {
    const kept = stripBanned(text);
    if (str(text) && kept !== str(text)) notes.push(`${where}에서 금지 표현이 든 문장을 뺐어요.`);
    return kept;
  };
  const s = list[0], where = "시나리오";
  if (!s || !Array.isArray(s.cuts) || s.cuts.length < 3 || s.cuts.length > 4) throw new PlanFormatError(`${where}의 장면은 3~4개여야 해요.`);
  if (!s.cuts.every(c => c && typeof c.scene === "string" && typeof c.copy === "string")) throw new PlanFormatError(`${where}의 장면 형식이 맞지 않아요.`);
  const [title, concept, target, channel] = ["title", "concept", "target", "channel"].map(k => clean(s[k], `${where} ${k}`));
  const prompts = Array.isArray(s.image_prompts) ? s.image_prompts : [];
  if (prompts.length < IMAGE_COUNT) throw new PlanFormatError(`이미지 설명이 ${IMAGE_COUNT}개보다 적어요 (${prompts.length}개).`);
  const image_prompts = prompts.slice(0, IMAGE_COUNT).map((p, i) => clean(p, `이미지 ${i + 1} 설명`));
  if (!str(s.title) || image_prompts.some(p => !p)) throw new PlanFormatError(`${where}의 제목·이미지 설명이 비어 있어요.`);
  const scenario = {
    title, concept, target, channel, image_prompts,
    cuts: s.cuts.map((c, j) => ({ scene: clean(c.scene, `장면 ${j + 1}`), copy: clean(c.copy, `장면 ${j + 1}`) }))
  };
  return { scenarios: [scenario], notes };
}

/* 이미지 만들기용 프롬프트. 원료 색과 트렌드 색을 #코드로 넣어요 */
export function buildImagePrompt(scenario, cand, data, palette) {
  const l = lineOf(cand), d = data?.DESIGN?.[l.herb] ? lineDesign(data.DESIGN, l.herb, l.purpose) : (l.design || {});
  const out = [
    `Scene: ${stripBanned(scenario.image_prompt)}`,
    "Premium Korean herbal skincare product photo, clean and natural lighting.",
    "The containers must have no logo, no text, no letters and no brand name on them (용기에 로고·글자·브랜드명 없음).",
    `Container colors from the herb: body ${d.main}, cap ${d.cap}, liquid ${d.liquid}.`,
    ...(d.bg ? [`Background color matched to the container: ${d.bg}.`] : []),
    `Palette: any color in the full hex range ${PALETTE_RANGE.from}-${PALETTE_RANGE.to} (${PALETTE_RANGE.count.toLocaleString("en-US")} colors).`
  ];
  if (palette?.colors?.length) out.push(`트렌드 색 (trend palette accents): ${palette.colors.join(", ")}.`);
  return out.join("\n");
}

/* 용기 샘플 파일 이름: 제품 종류별 하나씩 (extra는 샘플이 없어요) */
export function sampleFilesFor(cand) {
  const types = [...new Set((lineOf(cand).lineup || []).map(x => x[0]))];
  return types.map(t => SAMPLE[t]).filter(Boolean);
}
