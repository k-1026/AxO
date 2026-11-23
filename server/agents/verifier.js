/* 검증 에이전트의 코드 규칙. AI 없이 글이 규칙을 지켰는지 확인해요. */
import { BANNED_PHRASES, BANNED_EXCEPTIONS, PRICE_RANGE } from "../../src/config/rules.js";

export { REVIEW_SCHEMA, buildReviewPrompt, cleanReview } from "./prompt.js";

const lineOf = c => (c && c.l) || c;
const strs = v => (Array.isArray(v) ? v : [v]).filter(x => typeof x === "string");

/* 기획안·시나리오의 모든 글을 이어 붙여요 (이미지 문구 포함) */
export function textOf(content) {
  const p = content?.plan || {};
  const out = [
    ...strs(p.concept_name), ...strs(p.concept), ...strs(p.target), ...strs(p.key_claims),
    ...strs(p.notes), ...strs(p.cautions), ...strs(p.review_notes)
  ];
  for (const pr of p.products || []) out.push(...strs([pr?.type, pr?.name, pr?.role, pr?.status]));
  for (const s of content?.scenarios || []) {
    out.push(...strs([s?.title, s?.concept, s?.target, s?.channel, s?.image_prompt]));
    for (const c of s?.cuts || []) out.push(...strs([c?.scene, c?.copy]));
  }
  return out.join("\n");
}

/* 예외 표현은 같은 길이의 공백으로 가려요 */
const maskExceptions = text => BANNED_EXCEPTIONS.reduce((t, e) => t.split(e).join(" ".repeat(e.length)), text);
const bannedIn = text => {
  const t = maskExceptions(text);
  const hits = BANNED_PHRASES.filter(b => t.includes(b));
  /* "여드름 치료"가 잡히면 "치료"는 따로 알리지 않아요 */
  return hits.filter(h => !hits.some(o => o !== h && o.includes(h)));
};

const cleanNum = s => Number(s.replace(/,/g, ""));
const uniq = a => [...new Set(a)];

export function checkRules(content, cand, data) {
  const l = lineOf(cand), text = textOf(content), fix = [], notes = [];
  const lineup = l.lineup || [];

  // 1. 금지 표현
  for (const b of bannedIn(text)) fix.push(`금지 표현 "${b}"을 빼 주세요.`);

  // 2. 가격·용량 (ml당 정가도 후보 값에서 나온 거라 허용)
  const mls = new Set(lineup.map(x => x[2]));
  const prices = new Set([...lineup.map(x => x[3]), ...lineup.map(x => Math.round(x[3] / x[2]))]);
  for (const m of text.matchAll(/\d[\d,]*\s*(원|ml)/gi)) {
    const n = cleanNum(m[0].match(/^[0-9,]+/)[0]), unit = m[1].toLowerCase();
    if (!(unit === "원" ? prices : mls).has(n)) fix.push(`후보에 없는 가격·용량 "${m[0].replace(/\s+/g, "")}"이 있어요.`);
  }

  // 3. % 숫자는 후보 메모에 같은 숫자가 있어야 해요
  const memo = [l.words, ...["gb", "rival", "preempt", "hanbang", "origin", "scent"].map(k => l[k] && l[k][1])].filter(Boolean).join("\n");
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    if (!new RegExp(`(^|[^\d.])${m[1].replace(".", "\.")}\s*%`).test(memo)) fix.push(`후보 메모에 없는 수치 "${m[1]}%"이 있어요.`);
  }

  // 4. 다른 원료 이름 (후보 원료 이름은 먼저 가려서 홍삼·인삼 같은 겹침을 피해요)
  const rest = text.split(l.herb).join(" ");
  for (const h of data?.HERBS || []) {
    if (h.herb !== l.herb && !l.herb.includes(h.herb) && rest.includes(h.herb)) fix.push(`후보에 없는 원료 "${h.herb}"을 언급했어요.`);
  }

  // 5. 제품 목록 = 후보 라인 구성(+extra는 있어도 되고 없어도 돼요)
  const names = (content?.plan?.products || []).map(p => p?.name);
  const want = lineup.map(x => x[1]);
  const missing = want.filter(n => !names.includes(n)), extraNames = names.filter(n => !want.includes(n) && n !== l.extra);
  if (missing.length || extraNames.length) fix.push(`제품 목록이 후보 구성(${want.join("·")}${l.extra ? `, ${l.extra}` : ""})과 달라요.`);

  // 6. 기능성 심사 안내
  if (l.functional && !(content?.plan?.cautions || []).some(c => typeof c === "string" && c.includes("기능성"))) {
    fix.push("미백(톤) 후보는 cautions에 기능성 심사 안내를 넣어 주세요.");
  }

  // 7. 가격 범위는 의견으로만 남겨요
  for (const [type, name, ml, price] of lineup) {
    const r = PRICE_RANGE[type], per = price / ml;
    if (r && (per < r[0] || per > r[1])) notes.push(`가격 범위 밖: ${name} ml당 ${Math.round(per)}원`);
  }
  return { fix: uniq(fix), notes: uniq(notes) };
}

/* 시나리오 문구용: 금지 표현이 든 문장을 빼요 */
export function stripBanned(text) {
  const parts = String(text ?? "").match(/[^.!?。\n]+[.!?。]*\s*/g) || [];
  return parts.filter(s => bannedIn(s).length === 0).join("").trim();
}
