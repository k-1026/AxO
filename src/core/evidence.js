/* 근거 메모 시각화: 원료마다 있는 [점수(1~5), 메모] 짝을 막대그래프로 그려요.
   점수가 높을수록 우리 기획에 유리해요 (예: 한방 브랜드 제품 없음 = 빈자리 5점). DOM 없이 HTML 글만 만들어서 테스트할 수 있어요. */
import { esc } from "../utils/text.js";

export const EVIDENCE_AXES = [
  ["gb", "경북 산지 비중"],
  ["origin", "산지 차별화"],
  ["hanbang", "한방 브랜드 빈자리"],
  ["preempt", "시장 선점 여유"],
  ["rival", "가격 경쟁력"],
  ["scent", "향 부담 적음"]
];

/** 원료 → 그래프에 쓸 줄 목록 [{ key, label, score, note }]. 점수가 없는 항목은 빼요 */
export function evidenceRows(h) {
  return EVIDENCE_AXES.map(([key, label]) => {
    const v = h && h[key];
    const score = Array.isArray(v) ? Number(v[0]) : NaN;
    return Number.isFinite(score) ? { key, label, score: Math.max(0, Math.min(5, score)), note: (v[1] ?? "").toString() } : null;
  }).filter(Boolean);
}

/** 막대그래프 HTML. 자료가 없으면 빈 글 */
export function evidenceChartHtml(h, { title = "근거 메모 한눈에 보기" } = {}) {
  const rows = evidenceRows(h);
  if (!rows.length) return "";
  const avg = rows.reduce((a, r) => a + r.score, 0) / rows.length;
  const bars = rows.map((r, i) => `
    <div class="ev-row" style="--d:${i * 70}ms">
      <div class="ev-label">${esc(r.label)}</div>
      <div class="ev-bar"><span class="ev-fill lv${Math.round(r.score)}" style="--w:${(r.score / 5) * 100}%"></span></div>
      <div class="ev-score">${r.score}<small>/5</small></div>
      ${r.note ? `<div class="ev-note">${esc(r.note)}</div>` : ""}
    </div>`).join("");
  return `<div class="ev-chart" role="figure" aria-label="${esc(title)}">
    <div class="ev-chart-h"><b>${esc(title)}</b><span class="ev-avg">평균 ${avg.toFixed(1)} / 5</span></div>
    ${bars}
    <div class="ev-legend">점수가 높을수록 우리 기획에 유리해요 · 수집한 근거 메모 기준</div>
  </div>`;
}
