/* 디자인 에이전트: 광고 시나리오 3개와 이미지 프롬프트를 만들어요. 용기에는 로고·글자를 넣지 않아요. */
import { STRING, describeLine } from "./prompt.js";
import { stripBanned } from "./verifier.js";
import { PlanFormatError } from "./writer.js";
import { BANNED_PHRASES, SAMPLE } from "../../src/config/rules.js";

const CUT = { type: "OBJECT", properties: { scene: STRING, copy: STRING }, required: ["scene", "copy"] };
export const SCENARIO_SCHEMA = {
  type: "OBJECT",
  properties: {
    scenarios: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: STRING, concept: STRING, target: STRING, channel: STRING, cuts: { type: "ARRAY", items: CUT }, image_prompt: STRING },
        required: ["title", "concept", "target", "channel", "cuts", "image_prompt"]
      }
    }
  },
  required: ["scenarios"]
};

const lineOf = c => (c && c.l) || c;

export function buildScenarioPrompt(plan, cand, season, data, palette) {
  const out = [
    "당신은 한방 뷰티 화장품의 광고 시나리오를 쓰는 기획자예요. 아래 기획안으로 서로 다른 시나리오를 정확히 3개 써 주세요.",
    "- 시나리오마다 title, concept, target, channel(올릴 채널), cuts(장면 3~4개, 장면마다 scene과 copy), image_prompt를 채워 주세요.",
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

/* AI 결과 → 시나리오 3개. 금지 표현이 든 문장은 빼고 notes에 남겨요 */
export function assembleScenarios(raw) {
  const list = Array.isArray(raw?.scenarios) ? raw.scenarios : [];
  if (list.length < 3) throw new PlanFormatError(`시나리오가 3개보다 적어요 (${list.length}개).`);
  const notes = [];
  const clean = (text, where) => {
    const kept = stripBanned(text);
    if (str(text) && kept !== str(text)) notes.push(`${where}에서 금지 표현이 든 문장을 뺐어요.`);
    return kept;
  };
  const scenarios = list.slice(0, 3).map((s, i) => {
    const where = `시나리오 ${i + 1}`;
    if (!s || !Array.isArray(s.cuts) || s.cuts.length < 3 || s.cuts.length > 4) throw new PlanFormatError(`${where}의 장면은 3~4개여야 해요.`);
    if (!s.cuts.every(c => c && typeof c.scene === "string" && typeof c.copy === "string")) throw new PlanFormatError(`${where}의 장면 형식이 맞지 않아요.`);
    const [title, concept, target, channel, image_prompt] = ["title", "concept", "target", "channel", "image_prompt"].map(k => clean(s[k], `${where} ${k}`));
    if (!str(s.title) || !image_prompt) throw new PlanFormatError(`${where}의 제목·이미지 설명이 비어 있어요.`);
    return {
      title, concept, target, channel, image_prompt,
      cuts: s.cuts.map((c, j) => ({ scene: clean(c.scene, `${where} 장면 ${j + 1}`), copy: clean(c.copy, `${where} 장면 ${j + 1}`) }))
    };
  });
  return { scenarios, notes };
}

/* 이미지 만들기용 프롬프트. 원료 색과 트렌드 색을 #코드로 넣어요 */
export function buildImagePrompt(scenario, cand, data, palette) {
  const l = lineOf(cand), d = (data?.DESIGN || {})[l.herb] || l.design || {};
  const out = [
    `Scene: ${stripBanned(scenario.image_prompt)}`,
    "Premium Korean herbal skincare product photo, clean and natural lighting.",
    "The containers must have no logo, no text, no letters and no brand name on them (용기에 로고·글자·브랜드명 없음).",
    `Container colors from the herb: body ${d.main}, cap ${d.cap}, liquid ${d.liquid}.`
  ];
  if (palette?.colors?.length) out.push(`트렌드 색 (trend palette accents): ${palette.colors.join(", ")}.`);
  return out.join("\n");
}

/* 용기 샘플 파일 이름: 제품 종류별 하나씩 (extra는 샘플이 없어요) */
export function sampleFilesFor(cand) {
  const types = [...new Set((lineOf(cand).lineup || []).map(x => x[0]))];
  return types.map(t => SAMPLE[t]).filter(Boolean);
}
