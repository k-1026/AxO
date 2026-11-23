import {
  FINISH, PURPOSE_LABEL, ITEM, LINE_RULE, lineupFor, ROLE, COMBO_WHY, TALK,
  COMBO_KW, PRESETS, SEASON_TREND_NOTES, PRODUCT_BOX, SAMPLE_BASE, SAMPLE
} from "./config/rules.js";
import { eulReul, josa, dots, chips, won, esc } from "./utils/text.js";
import { fetchLatestBeautyTrends } from "./data/repository.js";
import { loadSeen, addSeen } from "./data/seen.js";

/* Supabase(또는 기본 데이터)에서 받아 startApp()에서 채워요. */
let SEASONS, HERBS, DESIGN, TREND, BEAUTY_TRENDS, TREND_SOURCES, TREND_TIERS;
let beautyFetchNote = "";


/* ════════ 후보 풀 만들기: 원료 12종 × 원료마다 가진 모든 목적 ════════
   계절·제철로 거르지 않아요. 계절의 기후 이슈는 설명(날씨·고민)에만 써요. */
const lineKey = l => `${l.herb}|${l.purpose}`;

/* ════════ 조합 추천 이유 · 셀러 한마디 ════════
   라인 구성 규칙의 목적별 구성 틀(●)과 계절 고민으로 이유를 만들고,
   셀러 문구는 원료 후보표의 '쓸 수 있는 말'과 광고 표현 규칙 안에서만 써요 (치료·염증 완화·재생 같은 의약품식 표현 없음). */
function sellerTalk(l, season) {
  let t = (TALK[l.purpose] || TALK["보습"])(l.herb, season);
  const extra = [];
  if (l.gb && l.gb[0] === 5) extra.push(`경북에서 가장 많이 나는 ${l.herb}${eulReul(l.herb)} 담았어요`);
  else if (l.gb && l.gb[0] === 4) extra.push(`경북에서 많이 나는 ${l.herb}${eulReul(l.herb)} 담았어요`);
  if (l.scent && l.scent[0] === 5) extra.push("한약 냄새가 강하지 않아 처음 쓰시는 분도 편해요");
  if (extra.length) t += " " + extra.join(". ") + ".";
  return t;
}
function comboWhy(l, season) {
  const roles = l.lineup.map(([, k]) => `${k}(${ROLE[k] || "기초 단계"})`).join(" + ");
  return `${season} ${l.issues.map(i => i[0]).join("·")} 때문에 '${l.concern}' 고민이 커지는 시기라 '${l.purpose}' 라인으로 잡았어요. ${COMBO_WHY[l.purpose] || ""} 구성: ${roles}.`;
}

function candidates(season) {
  const iss = SEASONS[season].issues;
  return HERBS.flatMap(h => h.purposes.map(p => {
    const issues = iss.filter(i => i[3].includes(p));
    return { ...h, color: DESIGN[h.herb].main, design: DESIGN[h.herb], finish: FINISH[p], purpose: p, issues, name: `${h.herb} ${PURPOSE_LABEL[p]} 라인`, functional: p === "미백(톤)",
      concern: issues.map(i => i[2]).join(" / "), lineup: lineupFor(p), next: (LINE_RULE[p] || {}).next || [], extra: (LINE_RULE[p] || {}).extra || "" };
  })).map(l => ({ ...l, why: comboWhy(l, season), talk: sellerTalk(l, season) }));
}

/* ════════ 후보 순서 기준 (사용자에게 보이지 않는 고정 기준: 추천 조합 '체크리스트 기본') ════════ */
function trendScore(l) {
  if (!TREND) return [null, "검색 흐름 자료 확인 필요"];
  if ((Date.now() - new Date(TREND.collectedAt)) / 864e5 > 30) return [null, `오래된 자료 (${TREND.collectedAt})`];
  const h = TREND.herbs && TREND.herbs[l.herb];
  return h && h.score != null ? [h.score, `${h.signal} · 최근÷이전 ${h.change ?? "–"} (${TREND.collectedAt}, 네이버 데이터랩)`] : [null, `${l.herb} 검색 흐름 자료 없음`];
}
const CRIT = [
  { k: "demand", nm: "🛒 계절 고민 크기", area: "고객 문제와 수요 · 계절 기후 표", subs: [
      { nm: "이 목적과 이어지는 기후 이슈 수", get: l => { const n = l.issues.length; return [n >= 3 ? 5 : n === 2 ? 4 : 3, `${n}개 · ${l.issues.map(i => i[0]).join(", ")}`]; } } ] },
  { k: "edge", nm: "🎯 빈자리 공략", area: "경쟁 차별성 · 경쟁제품", subs: [
      { nm: "약재 선점", get: l => l.preempt }, { nm: "한방 브랜드 선점", get: l => l.hanbang } ] },
  { k: "feel", nm: "🌿 순한 향", area: "사용감 · 원료 향 세기", subs: [ { nm: "향 세기", get: l => l.scent } ] },
  { k: "price", nm: "🏷️ 가격 경쟁력", area: "지불 가격 · 가격 기준표 · 경쟁제품", subs: [
      { nm: "같은 약재 제품보다 낮은 ml당 가격", get: l => l.rival } ] },
  { k: "ready", nm: "⚡ 빠른 출시", area: "출시 준비도 · 기능성 고시 대조", subs: [
      { nm: "기능성 보고 필요 여부", get: l => l.functional ? [2, "미백 기능성 보고가 필요해 준비가 길어요"] : [5, "일반 화장품이라 바로 출시 가능"] } ] },
  { k: "fresh", nm: "🌸 제철 원료", area: "처방·원료 적합성 · 원료 예상 계절", subs: [
      { nm: "출시 계절과 원료 계절", get: l => l.seasons.includes(season) ? [5, `원료 예상 계절에 ${season} 포함`] : [2, `원료 예상 계절: ${l.seasons.join("·")}`] } ] },
  { k: "brand", nm: "🏮 우리 지역 이야기", area: "브랜드 적합성 · 원료 산지", subs: [
      { nm: "경북 생산 비중", get: l => l.gb }, { nm: "산지 이야기 차별성", get: l => l.origin } ] },
  { k: "trend", nm: "📈 뜨는 원료", area: "트렌드 에이전트 · 주간 검색 흐름", subs: [ { nm: "최근 4주 검색 흐름", get: l => trendScore(l) } ] },
  { k: "profit", nm: "💰 수익성", area: "원가 자료 없음", off: true },
  { k: "effect", nm: "✨ 핵심 효능", area: "완제품 시험 전", off: true },
  { k: "channel", nm: "📣 채널·고객 확보", area: "채널 자료 없음", off: true }
];
let season = null;
/* 라인·원료 순서는 계절·기후와 상관없이 정해요: '계절 고민 크기'(demand)는 빼요. */
const W = Object.fromEntries(Object.entries(PRESETS[0].w).filter(([k]) => k !== "demand")), designMode = "tint";

function evaluate(l) {
  const chosen = CRIT.filter(c => !c.off && W[c.k]);
  const sumW = chosen.reduce((a, c) => a + W[c.k], 0);
  let known = 0, unk = 0, got = 0;
  const parts = chosen.map(c => {
    const subs = c.subs.map(s => ({ s, r: s.get(l) }));
    const sw = W[c.k] / subs.length;
    subs.forEach(x => { if (x.r[0] == null) unk += sw; else { known += sw * x.r[0] / 5; got += sw; } });
    const ks = subs.filter(x => x.r[0] != null);
    return { c, subs, avg: ks.length ? ks.reduce((a, x) => a + x.r[0], 0) / ks.length : null };
  });
  const lo = sumW ? Math.round(known / sumW * 100) : 0, hi = sumW ? Math.round((known + unk) / sumW * 100) : 0;
  return { l, parts, lo, hi, mid: (lo + hi) / 2, evid: sumW ? Math.round(got / sumW * 100) : 0 };
}
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (!d) return [0, 0, l];
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / (1 - Math.abs(2 * l - 1)), l];
}
/* 원본 사진의 픽셀 배치·알파는 유지하고 RGB 색상만 변환해요.
   뚜껑·로고 영역은 동일한 원본 이미지를 겹쳐 별도 포인트색을 적용해요. */
const packageIndex = herb => Object.keys(DESIGN).indexOf(herb);
const channelValues = (hex, point) => [1, 3, 5].map(i => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return [0, c * (point ? .65 : .68), c * (point ? .96 : .94), c, 1].map(v => v.toFixed(4)).join(" ");
});
function renderPackageFilters() {
  document.getElementById("package-filters").innerHTML = Object.values(DESIGN).map((d, i) => ["body", "point"].map(part => {
    const point = part === "point", vals = channelValues(point ? d.cap : d.main, point);
    const input = point ? '<feColorMatrix type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0"/>' : '<feColorMatrix type="saturate" values="0"/>';
    return `<filter id="pkg-${part}-${i}" color-interpolation-filters="sRGB">${input}<feComponentTransfer><feFuncR type="table" tableValues="${vals[0]}"/><feFuncG type="table" tableValues="${vals[1]}"/><feFuncB type="table" tableValues="${vals[2]}"/><feFuncA type="identity"/></feComponentTransfer></filter>`;
  }).join("") + ["dark", "light"].map(kind => {
    const mask = kind === "dark" ? "0 -3 0 0 1.15" : "0 4 0 0 -2.8";
    return `<filter id="pkg-ink-${kind}-${i}" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${mask}" result="ink"/><feFlood flood-color="${d.cap}" result="tone"/><feComposite in="tone" in2="ink" operator="in"/></filter>`;
  }).join("")).join("");
}
const tintCss = l => `filter:url(#pkg-body-${packageIndex(l.herb)});`;
/* 원본 1536×1024 사진에서 본품만 둘러싼 영역 [x0, y0, x1, y1] (기본 라인·후보 카드·상세 화면 공통) */
const boxStyle = t => { const b = PRODUCT_BOX[t] || PRODUCT_BOX.toner, w = b[2] - b[0], h = b[3] - b[1], p = v => (+v.toFixed(3)) + "%";
  return { tile: `aspect-ratio:${w} / ${h};max-width:none;--w:${(w / 16).toFixed(3)}%;`, img: `position:absolute;max-width:none;object-fit:fill;width:${p(1536 / w * 100)};height:${p(1024 / h * 100)};left:${p(-b[0] / w * 100)};top:${p(-b[1] / h * 100)};` }; };
const tileHtml = (l, t, k, mode) => {
  const bx = boxStyle(t);
  if (!SAMPLE[t]) return `<span class="tile sample-pending" style="${bx.tile}"><span>${esc(k)}<small>청향 샘플 준비 중</small></span></span>`;
  const original = `${SAMPLE_BASE}${SAMPLE[t]}`, recolor = mode === "tint";
  return `<span class="tile" ${recolor ? `data-palette="color-only"` : ""} style="${bx.tile}${recolor ? `--package-accent:${l.design.cap};` : ""}"><span class="product-cutout" ><img src="${original}" alt="${esc(k)} · 청향 로고 2 적용 샘플 형태와 재질" loading="lazy" style="${bx.img}${recolor ? tintCss(l) : ""}">${recolor ? `<img class="palette-point" src="${original}" alt="" aria-hidden="true" loading="lazy" style="${bx.img}filter:url(#pkg-point-${packageIndex(l.herb)});clip-path:url(#pkg-clip-${t});"><img class="palette-logo" src="${original}" alt="" aria-hidden="true" loading="lazy" style="${bx.img}filter:url(#pkg-ink-${t === "cream" ? "light" : "dark"}-${packageIndex(l.herb)});clip-path:url(#pkg-logo-${t});">` : ""}</span><span class="tl">${esc(k)}</span></span>`;
};
const tiles = (l, mode = designMode) => l.lineup.map(([t, k]) => tileHtml(l, t, k, mode)).join("");
const tileBg = l => `background:#FAF8F3`;

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
  const available = new Set(candidates(s).map(l => l.herb));
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
  return candidates(s).map(evaluate).sort((a, b) => b.mid - a.mid || b.evid - a.evid);
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
      <div class="visual" style="${tileBg(r.l)}">${tiles(r.l)}</div>
      <div class="body">
        <div class="herb">${esc(r.l.herb)}${r.l.hanja ? `(${r.l.hanja})` : ""} · ${esc(r.l.purpose)} · ${r.l.functional ? "기능성 보고 필요" : "일반 화장품"}</div>
        <h3>${esc(r.l.name)}</h3>
        <div class="price">${r.l.lineup.map(([, k, ml, p]) => `${esc(k)} ${ml}ml ${won(p)}`).join(" · ")}</div>
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

function openDetail(r) {
  const l = r.l;
  document.getElementById("d-rank").textContent = season;
  document.getElementById("d-name").textContent = l.name;
  document.getElementById("d-facts").innerHTML = `
    <dt>구분</dt><dd>${l.functional ? "기능성 보고 필요" : "일반 화장품"}</dd>
    <dt>대표 약재</dt><dd>${esc(l.herb)}${l.hanja ? `(${l.hanja})` : ""}</dd>
    <dt>쓸 수 있는 말</dt><dd>${esc(l.words)}</dd>`;
  document.getElementById("d-why-combo").innerHTML = `<dt>목적</dt><dd>${chips([l.purpose])}</dd><dt>구성</dt><dd>${chips([l.lineup.map(([, k]) => k).join(" → ")])}</dd><dt>포인트</dt><dd>${chips(String(COMBO_KW[l.purpose] || "").split(" · "))}</dd>`;
  document.getElementById("d-lineup").innerHTML = l.lineup.map(([, k, ml, p]) => `<tr><td>${esc(k)} <span class="note">1차</span></td><td>${ml}ml</td><td>${won(p)}</td><td>${won(Math.round(p / ml))}</td></tr>`).join("")
    + (l.extra ? `<tr><td>${esc(l.extra)} <span class="note">1차</span></td><td colspan="3" class="note">용기 샘플·가격 기준 준비 중</td></tr>` : "")
    + (l.next.length ? `<tr><td colspan="4" class="note">2차 확장 후보: ${l.next.map(esc).join(" · ")}</td></tr>` : "");
  const d = document.getElementById("detail"); d.showModal ? d.showModal() : d.setAttribute("open", "");
}
document.getElementById("d-close").onclick = () => document.getElementById("detail").close();
document.getElementById("detail").addEventListener("click", e => { if (e.target.id === "detail") e.target.close(); });

/* ════════ 화면 전환: 첫 화면 · 출시 기획실 · 요금제 · 마이 기획실 ════════ */
function showView(v) {
  document.querySelectorAll("[data-view-panel]").forEach(p => { p.hidden = p.dataset.viewPanel !== v; });
  document.querySelectorAll(".menu [data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  // 계절 색은 출시 기획실에서 계절을 고른 뒤에만 써요. 다른 화면은 사이트 기본 색 하나로 보여요.
  if (v === "launch" && season) document.body.dataset.season = season; else delete document.body.dataset.season;
  window.scrollTo(0, 0);
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-view]"); if (b) showView(b.dataset.view); });

/** AI 채팅에 함께 보낼 '지금 화면 정보' (계절, 추천 후보). */
export function getPlanningContext() {
  if (!SEASONS || !season || !SEASONS[season]) return "";
  const lines = [
    `현재 계절: ${season}`,
    `기후 이슈: ${SEASONS[season].issues.map(i => `${i[0]}(${i[2]})`).join(", ")}`,
    "추천 후보:",
    ...RES.map(r => `- ${r.l.name} · 구성 ${r.l.lineup.map(x => x[1]).join("+")}${r.l.concern ? ` · 고민 ${r.l.concern}` : ""}`),
  ];
  return lines.join("\n");
}

export function startApp(data) {
  ({ SEASONS, HERBS, DESIGN, TREND_SOURCES, TREND_TIERS } = data);
  TREND = data.HERB_TREND;
  BEAUTY_TRENDS = data.BEAUTY_TRENDS;
  beautyFetchNote = data.note || "";
  renderPackageFilters(); renderSeasons();
}
