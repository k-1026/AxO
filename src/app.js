import {
  COMBO_KW, SEASON_TREND_NOTES, PRODUCT_BOX, SAMPLE, qty, unitOf, productOptions
} from "./config/rules.js";
import { SAMPLE_BASE } from "./config/assets.js";
import { recolorPixels } from "./core/recolor.js";
import { lineKey, buildCandidates, rankLines } from "./core/candidates.js";
import { eulReul, josa, dots, chips, won, esc } from "./utils/text.js";
import { fetchLatestBeautyTrends } from "./data/repository.js";
import { loadSeen, addSeen } from "./data/seen.js";

/* Supabase(또는 기본 데이터)에서 받아 startApp()에서 채워요. */
let SEASONS, HERBS, DESIGN, TREND, BEAUTY_TRENDS, TREND_SOURCES, TREND_TIERS;
let beautyFetchNote = "";


let season = null;
const designMode = "tint";

/* 후보 계산은 core 모듈을 써요. 화면이 가진 데이터를 묶어서 넘겨요. */
const coreData = () => ({ SEASONS, HERBS, DESIGN, HERB_TREND: TREND });

function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (!d) return [0, 0, l];
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / (1 - Math.abs(2 * l - 1)), l];
}
/* 용기 색 입히기: 누끼 사진을 캔버스에 그려 명암은 그대로 두고 색만 원료 색으로 바꿔요 (core/recolor.js).
   같은 사진·같은 색은 한 번만 계산해서 다시 써요. 이미지가 로드되면(아래 load 리스너) 바꾼 그림으로 갈아 끼워요. */
const tinted = new Map();
function tintedUrl(src, hex) {
  const key = src + "|" + hex;
  if (!tinted.has(key)) tinted.set(key, new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height); recolorPixels(d.data, hex); x.putImageData(d, 0, 0);
      c.toBlob(b => b ? done(URL.createObjectURL(b)) : fail(new Error("색 입히기 실패")), "image/png");
    };
    img.onerror = fail; img.src = src;
  }));
  return tinted.get(key);
}
if (typeof document !== "undefined") document.addEventListener("load", e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.tint || img.dataset.tinted) return;
  img.dataset.tinted = "1";
  tintedUrl(img.src, img.dataset.tint).then(u => { img.src = u; }).catch(() => {});
}, true);
/* 원본 1536×1024 사진에서 본품만 둘러싼 영역 [x0, y0, x1, y1] (기본 라인·후보 카드·상세 화면 공통) */
const boxStyle = t => { const b = PRODUCT_BOX[t] || PRODUCT_BOX.toner, w = b[2] - b[0], h = b[3] - b[1], p = v => (+v.toFixed(3)) + "%";
  return { tile: `aspect-ratio:${w} / ${h};max-width:none;--w:${(w / 16).toFixed(3)}%;`, img: `position:absolute;max-width:none;object-fit:fill;width:${p(1536 / w * 100)};height:${p(1024 / h * 100)};left:${p(-b[0] / w * 100)};top:${p(-b[1] / h * 100)};` }; };
const tileHtml = (l, t, k, mode) => {
  const bx = boxStyle(t);
  if (!SAMPLE[t]) return `<span class="tile sample-pending" style="${bx.tile}"><span>${esc(k)}<small>청향 샘플 준비 중</small></span></span>`;
  /* 화면에는 바탕을 지운 누끼(-cutout.png, scripts/make-cutouts.py)를 써요 */
  const original = `${SAMPLE_BASE}${SAMPLE[t].replace(/.png$/, "-cutout.png")}`, recolor = mode === "tint";
  return `<span class="tile" style="${bx.tile}"><span class="product-cutout"><img src="${original}" alt="${esc(k)} · 청향 로고 2 적용 샘플 형태와 재질" loading="lazy" style="${bx.img}"${recolor ? ` data-tint="${l.design.cap}"` : ""}></span><span class="tl">${esc(k)}</span></span>`;
};
const tiles = (l, mode = designMode) => l.lineup.map(([t, k]) => tileHtml(l, t, k, mode)).join("");
/* 배경은 용기 색에 맞춰 고른 색이에요 (core/palette.js) */
const tileBg = l => `background:${l.design.bg || "#FAF8F3"}`;

/* 마이 기획실에서 기획안의 제품 이미지(용기 샘플)를 그릴 때 써요. 후보 카드에는 이미지를 띄우지 않아요.
   계절·원료·목적으로 후보 라인을 다시 찾아요. 자료가 아직 없거나 라인을 못 찾으면 빈 문자열이에요. */
export function productVisual(s, herb, purpose) {
  if (!SEASONS || !SEASONS[s]) return "";
  const l = buildCandidates(coreData(), s).find(x => x.herb === herb && x.purpose === purpose);
  return l ? `<div class="visual" style="${tileBg(l)}">${tiles(l)}</div>` : "";
}

/* ════════ 화면 ════════ */
function renderSeasons() {
  const el = document.getElementById("seasons");
  el.innerHTML = Object.keys(SEASONS).map(s => `<button class="season" role="tab" type="button" aria-selected="${s === season}" data-s="${s}">${SEASONS[s].icon} ${s}</button>`).join("");
  el.querySelectorAll(".season").forEach(b => b.onclick = () => selectSeason(b.dataset.s));
}
function renderSeasonInfo() {
  document.getElementById("title").textContent = `${season}, 어떤 라인을 먼저 낼까요?`;
  document.getElementById("issues").innerHTML = SEASONS[season].issues.map(([t, n, c, p]) =>
    `<div class="issue"><div class="t">${esc(t)}</div><div class="n">${esc(n)}</div><div class="c">${esc(c)} → ${p.map(esc).join(", ")}</div></div>`).join("");
}
async function selectSeason(s) {
  season = s;
  document.body.dataset.season = s;
  renderSeasons(); renderSeasonInfo(); renderTrendComment();
  const info = document.getElementById("season-info");
  info.hidden = false;
  if (!SHOWN[season]) await nextRecommendation();
  else renderResults();
  info.scrollIntoView({ behavior: "smooth", block: "start" });
}

function trendComment(s, data, now = Date.now()) {
  const note = SEASON_TREND_NOTES[s];
  const age = data && (now - Date.parse(data.collectedAt)) / 864e5;
  const fresh = data && Number.isFinite(age) && age >= 0 && age <= 30;
  const available = new Set(buildCandidates(coreData(), s).map(l => l.herb));
  const rows = fresh && data.herbs ? Object.entries(data.herbs).filter(([herb, r]) =>
    available.has(herb) && r && Number.isFinite(r.change) && r.change >= 0).map(([herb,r]) => ({herb,...r})) : [];
  const up = rows.filter(r => r.signal === "상승" && r.change >= 1.2).sort((a,b) => b.change-a.change).slice(0,2);
  if (up.length) return {
    status: "수집 데이터 기반 · 검색 관심",
    line: `이번 ${s} 후보 중 ${up.map(r => r.herb + ' 화장품').join('·')}의 검색 관심이 이전 기간보다 높아졌어요. 관련 라인의 기획 우선순위를 검토해 보세요.`,
    tip: note.tip,
    source: `네이버 데이터랩 · ${data.collectedAt} 수집 · 최근 4주 / 이전 12주 비교: ${up.map(r => r.herb + ' ' + r.change.toFixed(2) + '배').join(', ')} · 판매량·구매 선호와는 달라요.`
  };
  if (rows.length) return {
    status: "수집 데이터 기반 · 상승 신호 없음",
    line: `수집된 ${s} 후보에서는 뚜렷한 검색 관심 상승이 아직 확인되지 않았어요. 계절 고민과 제형 적합성을 함께 살펴보세요.`,
    tip: note.tip,
    source: `네이버 데이터랩 · ${data.collectedAt} 수집 · 최근 4주 / 이전 12주 · 비교 기준 1.2배 이상 상승`
  };
  return { status: "예시 인사이트 · 수집 전", line: note.line, tip: note.tip,
    source: "기후 정보를 바탕으로 한 기획 가설이에요. 최신 검색·판매 트렌드가 확인된 내용은 아니에요." };
}
document.addEventListener("click", e => { if (e.target && e.target.id === "beauty-refresh") refreshBeautyTrends(); });
async function refreshBeautyTrends() {
  const button = document.getElementById("beauty-refresh");
  button.disabled = true; button.textContent = "↻ 새로고침 중…";
  try {
    const next = await fetchLatestBeautyTrends();
    if (!next || next.version !== 1 || !Array.isArray(next.items) || !next.insights || !Number.isFinite(Date.parse(next.updatedAt))) throw new Error("invalid snapshot");
    BEAUTY_TRENDS = next; beautyFetchNote = "방금 새로고침 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch (_) { beautyFetchNote = "최신 수집본 조회 실패 · 저장된 근거 표시"; }
  button.disabled = false; button.textContent = "↻ 새로고침";
  renderTrendComment();
}

function beautyComment(s, data, now = Date.now()) {
  const insight = data && data.insights && data.insights[s];
  const checked = data && Date.parse(data.updatedAt);
  if (!insight || typeof insight.line !== "string" || typeof insight.tip !== "string" || !Number.isFinite(checked) || checked > now + 300000 || !Array.isArray(insight.evidenceIds) || !insight.evidenceIds.length) return null;
  const hosts = ["corp.oliveyoung.com","www.oliveyoung.co.kr","m.oliveyoung.co.kr","www.jangup.com","m.jangup.com","jangup.com","trends.google.com","support.google.com","www.spate.nyc","spate.nyc","www.mintel.com","mintel.com","store.mintel.com","www.gnpd.com","gnpd.com","nielseniq.com","www.nielseniq.com","investors.nielseniq.com","shop.nielseniq.com","www.mckinsey.com","mckinsey.com","www.cosmeticsbusiness.com","cosmeticsbusiness.com","lp.cosmoprof.com","www.cosmoprof.com","cosmoprof.com","cosmoprofnorthamerica.com","www.cosmoprofnorthamerica.com","www.beautystreams.com","beautystreams.com","business.pinterest.com","newsroom.pinterest.com","trends.pinterest.com","s.cosme.net","www.cosme.net","cosme.net"];
  const valid = (data.items || []).filter(item => {
    const age = (now - Date.parse(item.publishedAt)) / 864e5;
    try { const url = new URL(item.url); return url.protocol === "https:" && hosts.includes(url.hostname) && age >= 0 && age <= (item.evidenceRole === "background" ? 400 : 90) && typeof item.title === "string" && typeof item.source === "string"; } catch (_) { return false; }
  });
  const evidence = insight.evidenceIds.map(id => valid.find(item => item.id === id));
  if (evidence.some(item => !item)) return null;
  const stale = now - checked > 150 * 60000;
  const checkedAt = new Date(checked).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return { status: stale ? "갱신 확인 필요 · 저장된 근거" : "공식 콘텐츠·기사 기반", line: insight.line, tip: insight.tip,
    source: "매시간 확인 · 마지막 확인 " + checkedAt + " (한국시간) · " + (evidence.some(item => item.evidenceRole === "background") ? "시장 전망·기획 배경 포함" : "최근 90일 자료의 기획 해석") + (beautyFetchNote ? " · " + beautyFetchNote : ""), evidence };
}
function renderTrendComment() {
  const comment = beautyComment(season, BEAUTY_TRENDS) || trendComment(season, TREND);
  document.getElementById("trend-status").textContent = comment.status;
  document.getElementById("trend-line").textContent = comment.line.replace(/올리브영의\s*|장업신문의\s*/g, "").replace(/올리브영은\s*/g, "관련 콘텐츠에서는 ").replace(/장업신문은\s*/g, "관련 기사에서는 ");
  document.getElementById("trend-plan").innerHTML = "<b>기획 포인트</b> · " + esc(comment.tip);
  document.getElementById("trend-source").textContent = comment.source;
  const evHtml = (comment.evidence || []).map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" title="${esc(item.title)}">${esc(item.source)} · ${esc(item.publishedAt)} · ${esc(item.kind || "자료")} ↗</a>`).join("");
  const checksNow = (BEAUTY_TRENDS && BEAUTY_TRENDS.sourceChecks) || [];
  const srcItem = s => {
    const c = checksNow.find(x => x.id === s.id || x.url === s.url);
    const st = !c ? ["wait", "확인 전"] : c.status === "checked" ? ["ok", "확인됨"] : ["no", c.http === 403 || c.http === 429 ? "자동 접근 차단 · 직접 확인" : "확인 못 함"];
    return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><span class="src-type">${esc(s.type)}</span><span class="src-st ${st[0]}">${st[1]}</span></li>`;
  };
  const tierHtml = Object.keys(TREND_TIERS).map(k => {
    const t = TREND_TIERS[k], rows = TREND_SOURCES.filter(s => s.tier === k);
    return `<div class="tier"><div class="tier-h"><b>${esc(t.name)}</b> · ${esc(t.cadence)} · ${rows.length}곳<span>${esc(t.rule)}</span></div><ul class="src-list">${rows.map(srcItem).join("")}</ul></div>`;
  }).join("");
  document.getElementById("trend-evidence").innerHTML = (evHtml ? `<div class="ev-h">이번 한마디의 근거</div><div class="ev-links">${evHtml}</div>` : "")
    + `<div class="ev-h">트렌드 에이전트가 확인하는 출처 ${TREND_SOURCES.length}곳</div>${tierHtml}`;
}

/* ════════ 추천 후보 3개 · 재추천 ════════
   고정 기준 점수순으로 줄 세운 뒤 3개씩 골라요.
   - 이 계절에서 이미 보여 준 라인은 다시 보여 주지 않아요.
   - 다른 계절에서 이미 본 라인은 빼지 않고 뒤로 미뤄요 (안 본 라인 먼저). */
const PICK = 3;
const SHOWN = {};      // 계절별로 지금 화면에 보여 주는 후보
let RES = [];
function ranked(s) {
  return rankLines(coreData(), s, Date.now());
}
async function nextRecommendation() {
  const s = season, seen = await loadSeen();
  const here = seen[s] || new Set();
  const elsewhere = new Set(Object.entries(seen).filter(([k]) => k !== s).flatMap(([, v]) => [...v]));
  const left = ranked(s).filter(r => !here.has(lineKey(r.l)));
  const pick = [...left.filter(r => !elsewhere.has(lineKey(r.l))), ...left.filter(r => elsewhere.has(lineKey(r.l)))].slice(0, PICK);
  SHOWN[s] = pick;
  if (s === season) renderResults();
  await addSeen(s, pick.map(r => lineKey(r.l)));
}
function renderResults() {
  RES = SHOWN[season] || [];
  const el = document.getElementById("results");
  if (!RES.length) { el.innerHTML = `<div class="empty">더 추천할 후보가 없어요.</div>`; return; }
  el.innerHTML = `<div class="top3">${RES.map(r => `
    <button class="card" type="button" data-k="${esc(lineKey(r.l))}">
      <div class="body">
        <div class="herb">${esc(r.l.herb)}${r.l.hanja ? `(${r.l.hanja})` : ""} · ${esc(r.l.purpose)} · ${r.l.functional ? "기능성 보고 필요" : "일반 화장품"}</div>
        <h3>${esc(r.l.name)}</h3>
        <div class="price">${r.l.lineup.map(([t, k, ml, p]) => `${esc(k)} ${qty(t, ml)} ${won(p)}`).join(" · ")}</div>
      </div>
    </button>`).join("")}</div>`;
  el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => openDetail(RES.find(r => lineKey(r.l) === b.dataset.k)));
}
async function reroll() {
  if (!season) return;
  const d = document.getElementById("detail");
  if (d.open) d.close();
  await nextRecommendation();
  document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest('[data-action="reroll"]')) reroll(); });

/* 상세 창에 열려 있는 후보: [기획안 만들기]가 읽어 가요. products = 체크한 제품 이름 */
let currentLine = null;
const pickBoxes = () => [...document.querySelectorAll("#d-lineup input[data-pick]")];
export const getCurrentLine = () => (currentLine
  ? { season, herb: currentLine.herb, purpose: currentLine.purpose, products: pickBoxes().filter(b => b.checked).map(b => b.dataset.pick) }
  : null);

/* 체크한 제품이 기획안을 만들 수 있는 조합인지 봐요. 안 되면 이유 문구, 되면 "" */
export function pickError() {
  const on = pickBoxes().filter(b => b.checked);
  if (!on.length) return "제품을 1개 이상 골라 주세요.";
  if (!on.some(b => b.dataset.priced === "1")) return "용량·정가가 있는 제품을 1개 이상 골라 주세요.";
  return "";
}

/* 체크가 바뀔 때마다 줄 흐리게·전체 선택·개수·버튼 문구를 맞춰요 */
function syncPicks() {
  const boxes = pickBoxes(), n = boxes.filter(b => b.checked).length;
  boxes.forEach(b => b.closest("tr").classList.toggle("off", !b.checked));
  const all = document.getElementById("d-pick-all");
  all.checked = n === boxes.length; all.indeterminate = n > 0 && n < boxes.length;
  document.getElementById("d-pick-count").textContent = `${n}개 선택`;
  document.getElementById("d-create").textContent = n ? `선택한 ${n}개로 기획안 만들기` : "기획안 만들기";
  if (!pickError()) document.getElementById("d-pick-err").textContent = "";
}
document.getElementById("d-lineup").addEventListener("change", syncPicks);
document.getElementById("d-pick-all").addEventListener("change", e => { pickBoxes().forEach(b => { b.checked = e.target.checked; }); syncPicks(); });

function openDetail(r) {
  const l = r.l;
  currentLine = l;
  document.getElementById("d-rank").textContent = season;
  document.getElementById("d-name").textContent = l.name;
  document.getElementById("d-facts").innerHTML = `
    <dt>구분</dt><dd>${l.functional ? "기능성 보고 필요" : "일반 화장품"}</dd>
    <dt>대표 약재</dt><dd>${esc(l.herb)}${l.hanja ? `(${l.hanja})` : ""}</dd>
    <dt>쓸 수 있는 말</dt><dd>${esc(l.words)}</dd>`;
  document.getElementById("d-why-combo").innerHTML = `<dt>목적</dt><dd>${chips([l.purpose])}</dd><dt>구성</dt><dd>${chips([l.lineup.map(([, k]) => k).join(" → ")])}</dd><dt>포인트</dt><dd>${chips(String(COMBO_KW[l.purpose] || "").split(" · "))}</dd>`;
  /* 추천 구성과 함께 낼 수 있는 제품을 한 표에. 추천 구성은 처음부터 골라 둬요 */
  document.getElementById("d-lineup").innerHTML = productOptions(l).map((o, i) => `<tr>
    <td class="pick-col"><input type="checkbox" id="d-pick-${i}" data-pick="${esc(o.name)}" data-priced="${o.price != null ? 1 : 0}"${o.base ? " checked" : ""}></td>
    <td><label for="d-pick-${i}">${esc(o.name)}</label>${o.base ? ` <span class="pick-rec">추천</span>` : ""}</td>
    ${o.price != null ? `<td>${qty(o.type, o.ml)}</td><td>${won(o.price)}</td><td>${unitOf(o.type)}당 ${won(Math.round(o.price / o.ml))}</td>` : `<td colspan="3" class="note">가격 기준 준비 중</td>`}
  </tr>`).join("");
  document.getElementById("d-pick-err").textContent = "";
  syncPicks();
  const d = document.getElementById("detail"); d.showModal ? d.showModal() : d.setAttribute("open", "");
}
document.getElementById("d-close").onclick = () => document.getElementById("detail").close();
document.getElementById("detail").addEventListener("click", e => { if (e.target.id === "detail") e.target.close(); });

/* ════════ 화면 전환: 첫 화면 · 출시 기획실 · 요금제 · 마이 기획실 ════════ */
export function showView(v) {
  document.body.dataset.view = v; // 인트로에서는 상단바를 숨겨요
  document.querySelectorAll("[data-view-panel]").forEach(p => { p.hidden = p.dataset.viewPanel !== v; });
  document.querySelectorAll(".menu [data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  // 계절 색은 출시 기획실에서 계절을 고른 뒤에만 써요. 다른 화면은 사이트 기본 색 하나로 보여요.
  if (v === "launch" && season) document.body.dataset.season = season; else delete document.body.dataset.season;
  window.scrollTo(0, 0);
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-view]"); if (b) showView(b.dataset.view); });


export function startApp(data) {
  ({ SEASONS, HERBS, DESIGN, TREND_SOURCES, TREND_TIERS } = data);
  TREND = data.HERB_TREND;
  BEAUTY_TRENDS = data.BEAUTY_TRENDS;
  beautyFetchNote = data.note || "";
  renderSeasons();
}
