/* 후보 생성 에이전트: 후보를 고르고, 근거 메모를 AI가 정리해요. 숫자는 코드 값만 써요. */
import { findLine } from "../../src/core/candidates.js";
import { STRINGS, isStringArray, describeLine } from "./prompt.js";
import { BANNED_PHRASES, selectLine, catalogItem, extrasOf, minVolume, priceForVolume, qty } from "../../src/config/rules.js";

export class InvalidCandidateError extends Error {
  constructor(msg) { super(msg); this.name = "InvalidCandidateError"; }
}

/* 계절·원료·피부 목적에 맞는 후보를 찾아요. 없으면 throw */
export function pickCandidate(data, { season, herb, purpose }, now) {
  const cand = findLine(data, season, herb, purpose, now);
  if (!cand) throw new InvalidCandidateError(`후보를 찾지 못했어요: ${season} · ${herb} · ${purpose}`);
  return cand;
}

/* 사용자가 고른 제품으로 후보 라인을 바꿔요. products 가 없으면(예전 기획안·선택 없음) 추천 구성이에요. */
export class InvalidSelectionError extends Error {
  constructor(msg) { super(msg); this.name = "InvalidSelectionError"; }
}
export function applySelection(cand, products) {
  const { line, error } = selectLine(cand.l, products ?? undefined);
  if (error) throw new InvalidSelectionError(error);
  return { ...cand, l: line };
}

/* 저장된 기획안의 제품 목록(이름·용량·정가·상태)을 그대로 후보 라인에 다시 씌워요.
   가격 기준표가 나중에 바뀌어도(예: 가격 준비 중이던 클렌저에 정가가 생김) 예전 기획안의 숫자는 그대로 두고, 수정할 때 검증이 어긋나지 않게 해요.
   저장된 제품 목록이 없거나 형식이 맞지 않으면 지금 기준으로 다시 짠 후보를 그대로 돌려줘요. */
export function keepSavedProducts(cand, products) {
  if (!Array.isArray(products) || !products.length) return cand;
  const ok = x => x && typeof x.name === "string" && typeof x.type === "string";
  if (!products.every(ok)) return cand;
  const ready = products.filter(x => Number.isFinite(x.ml) && Number.isFinite(x.price));
  if (!ready.length) return cand;
  const lineup = ready.map(x => [x.type, x.name, x.ml, x.price]);
  const extras = products.filter(x => !ready.includes(x)).map(x => ({ type: x.type, name: x.name }));
  return { ...cand, l: { ...cand.l, lineup, extra: undefined, extras } };
}

/* 기획안 수정에서 제품 구성을 바꿀 때: names(바뀐 뒤 제품 이름 전체)대로 후보 라인을 다시 짜요.
   이미 있던 제품은 저장된 용량·정가 그대로, 새 제품은 기준표(ITEM) 값으로 넣어요. 모르는 이름은 빼요.
   돌려주는 값: { cand, names } 또는 바뀐 게 없거나 쓸 수 없으면 null */
export function withProducts(cand, names) {
  if (!Array.isArray(names)) return null;
  const l = cand.l;
  const now = [...(l.lineup || []).map(([type, name, ml, price]) => ({ type, name, ml, price })), ...extrasOf(l).map(x => ({ ...x, ml: null, price: null }))];
  const picked = [];
  for (const raw of names) {
    const item = catalogItem(raw);
    const name = item ? item[1] : (typeof raw === "string" ? raw.trim() : "");
    if (!name || picked.some(x => x.name === name)) continue;
    const had = now.find(x => x.name === name);
    if (had) picked.push(had);
    else if (item) picked.push({ type: item[0], name: item[1], ml: item[2], price: item[3] });
  }
  const ready = picked.filter(x => x.price != null);
  if (!ready.length) return null;
  if (picked.length === now.length && picked.every(x => now.some(y => y.name === x.name))) return null;
  const lineup = ready.map(x => [x.type, x.name, x.ml, x.price]);
  const extras = picked.filter(x => x.price == null).map(x => ({ type: x.type, name: x.name }));
  return { cand: { ...cand, l: { ...l, lineup, extra: undefined, extras } }, names: picked.map(x => x.name) };
}

export const RESEARCH_SCHEMA = {
  type: "OBJECT",
  properties: { notes: STRINGS },
  required: ["notes"]
};

export function buildResearchPrompt(cand, season, data) {
  return [
    "당신은 한방 뷰티 화장품 출시 기획을 돕는 자료 정리 담당이에요.",
    "아래 후보 정보만 근거로, 기획안을 쓸 때 참고할 근거 메모를 3~5개 적어 주세요.",
    "- 메모는 한 줄씩, 존댓말로 써 주세요.",
    "- 후보 정보에 없는 사실·수치는 쓰지 마세요. 가격·용량 같은 숫자도 쓰지 마세요.",
    "- 후보 원료 말고 다른 원료는 언급하지 마세요.",
    `- 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    "",
    "[후보 정보]",
    describeLine(cand, season, data)
  ].join("\n");
}

/* 메모는 글만, 빈 줄은 빼고 최대 5개 */
export function cleanNotes(raw) {
  return isStringArray(raw?.notes) ? raw.notes.map(s => s.trim()).filter(Boolean).slice(0, 5) : [];
}

/**
 * 사용자가 말한 용량으로 제품 용량·정가를 바꿔요. 정가는 AI 가 아니라 priceForVolume 으로 코드가 계산해요.
 * @param volumes [{ name, ml }] (마스크·패드는 매수)
 * @returns { cand, volumes, changes, rejected } — 바뀐 게 없으면 cand 는 그대로예요.
 *   rejected: 최소 용량보다 작거나, 숫자가 아니거나, 기획안에 없는 제품 (이유 글)
 */
export function withVolumes(cand, volumes) {
  const out = { cand, volumes: [], changes: [], rejected: [] };
  if (!Array.isArray(volumes) || !volumes.length) return out;
  const lineup = (cand.l.lineup || []).map(x => [...x]);
  for (const v of volumes) {
    const item = catalogItem(v?.name);
    const name = item ? item[1] : String(v?.name ?? "").trim();
    const ml = Number(v?.ml);
    const row = lineup.find(x => x[1] === name);
    if (!row) { if (name) out.rejected.push(`${name}: 기획안에 없는 제품이라 용량을 바꾸지 않았어요.`); continue; }
    if (!Number.isInteger(ml) || ml <= 0) { out.rejected.push(`${name}: 용량은 1 이상의 정수로 적어 주세요.`); continue; }
    const min = minVolume(name);
    if (min != null && ml < min) { out.rejected.push(`${name}: 최소 용량은 ${qty(row[0], min)}이에요. ${qty(row[0], ml)}로는 바꿀 수 없어요.`); continue; }
    if (ml === row[2]) continue;
    const price = priceForVolume(name, ml);
    if (price == null) { out.rejected.push(`${name}: 정가를 계산할 기준이 없어요.`); continue; }
    out.changes.push({ part: `${name} 용량·정가`, before: `${qty(row[0], row[2])} · ${row[3].toLocaleString("ko-KR")}원`, after: `${qty(row[0], ml)} · ${price.toLocaleString("ko-KR")}원` });
    out.volumes.push({ name, ml });
    row[2] = ml; row[3] = price;
  }
  if (out.volumes.length) out.cand = { ...cand, l: { ...cand.l, lineup } };
  return out;
}
