/* 주의사항: 원료 / 금지 표현 두 묶음으로 보여 줘요 (HSJ 결정 2026-11-27).
   새 기획안은 항목이 '[원료] ', '[표현] '으로 시작해요. 예전 기획안은 낱말로 나누고, 둘 다 아닌 항목(가격·일정 등)은 보여 주지 않아요. */
const TAG = /^\s*\[(원료|표현)\]\s*/;
const CLAIM_WORDS = /표현|문구|광고|기능성|심사|금지|단정|치료|효능|효과/;
const HERB_WORDS = /원료|향|자극|알레르기|함량|산지|추출|민감|패치/;
export function splitCautions(arr) {
  const out = { herb: [], claim: [] };
  for (const t of (arr || []).filter(x => typeof x === "string" && x.trim())) {
    const m = TAG.exec(t);
    if (m) out[m[1] === "원료" ? "herb" : "claim"].push(t.replace(TAG, "").trim());
    else if (CLAIM_WORDS.test(t)) out.claim.push(t.trim());
    else if (HERB_WORDS.test(t)) out.herb.push(t.trim());
  }
  return out;
}
