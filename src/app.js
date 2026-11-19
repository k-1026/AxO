import {
  FINISH, PURPOSE_LABEL, PRICE_RANGE, ITEM, LINE_RULE, lineupFor, ROLE, COMBO_WHY, TALK, PERSONAS, LIGHT,
  COMBO_KW, PAIN_KW, PRESETS, SEASON_TREND_NOTES, PRODUCT_BOX, SAMPLE_BASE, SAMPLE
} from "./config/rules.js";
import { eulReul, josa, dots, chips, stars, won, esc, scoreText } from "./utils/text.js";
import { fetchLatestBeautyTrends } from "./data/repository.js";

/* Supabase(또는 기본 데이터)에서 받아 startApp()에서 채워요. */
let SEASONS, HERBS, DESIGN, TREND, BEAUTY_TRENDS, TREND_SOURCES, TREND_TIERS;
let beautyFetchNote = "";


/* ════════ 후보 풀 만들기: 원료의 목적 ∩ 계절 목적 ════════ */

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

/* ════════ 고객 페르소나별 어필 ════════
   고객 페르소나 유형별 카드(presentation/13_고객페르소나_유형별_카드.html)의 4가지 거부 유형에 맞춰
   라인마다 맞춤도(1~5)·기획 포인트·셀러 한마디를 만들어요. 문구는 쓸 수 있는 말 안에서만 써요. */
function personaAppeal(l) {
  const items = l.lineup.map(([, k]) => k);
  const light = items.includes("미스트") ? "미스트" : items.includes("젤 크림") ? "젤 크림" : "토너";
  const s = l.scent ? l.scent[0] : null, gb = l.gb ? l.gb[0] : null;
  const color = String(l.design.from || "").split("(")[0].trim();
  const out = {};
  // 향 거부형
  const fs_ = s == null ? 2 : s;
  out.scent = { fit: fs_,
    point: s === 5 ? "향 약 원료 → 향 거부감이 낮아요" : s === 3 ? "향 중 원료 → 향 세기 고르기 옵션이 있으면 좋아요" : "향이 세거나 확인 전 → 얼굴용은 무향에 가깝게 조절 필요",
    talk: s === 5 ? `향에 민감하시면 ${l.herb} 라인이 잘 맞아요. 한약 냄새가 강하지 않은 원료라, 토너부터 가볍게 시작해 보세요.`
      : s === 3 ? `${l.herb}${josa(l.herb, "은", "는")} 은은한 약재 향이 있어요. 향이 신경 쓰이시면 손등에 먼저 발라 보시고 토너부터 시작해 보세요.`
      : `${l.herb}${josa(l.herb, "은", "는")} 약재 향이 있는 편이라, 향에 민감하시면 테스터로 먼저 확인해 보세요.` };
  // 무게감 거부형
  const fw = LIGHT[l.purpose] || 3;
  out.weight = { fit: fw,
    point: fw === 5 ? `${light} 중심의 가벼운 구성 → 지성 고객 진입용` : fw >= 3 ? "크림이 들어가 아침·저녁 나눠 쓰기를 안내" : "리치 크림 중심 → 지성 고객에겐 토너만 먼저 권하기",
    talk: fw === 5 ? `가벼운 사용감을 좋아하시면 ${items.join("과 ")}면 충분해요. ${light}${josa(light, "으로", "로")} 산뜻하게 마무리돼요.`
      : fw >= 3 ? `크림이 무겁게 느껴지시면 아침엔 ${items.filter(k => !k.includes("크림")).join("·") || "토너"}만, 저녁에만 크림을 더해 보세요.`
      : `리치 크림이라 지성 피부엔 무거울 수 있어요. 토너만 먼저 써 보시고 건조한 날 크림을 더해 보세요.` };
  // 이미지 거부형
  let fi = 3 + (l.purpose === "미백(톤)" ? 1 : 0) + (gb != null && gb >= 4 ? 1 : 0);
  fi = Math.min(5, fi);
  out.image = { fit: fi,
    point: `${color || "원료 색"} 패키지${gb != null && gb >= 4 ? " + 경북 산지·약전골목 이야기" : ""}${l.purpose === "미백(톤)" ? " + 맑아 보이는 톤 고민과 연결" : ""}`,
    talk: `한방 화장품이 엄마 화장품 같다고 느끼셨다면 이 라인을 보세요. ${color ? color + " 패키지라 " : ""}화장대에 두기만 해도 예뻐요.${gb != null && gb >= 4 ? ` 대구 약전골목이 있는 경북에서 많이 나는 ${l.herb} 이야기도 담겼어요.` : ""}${l.purpose === "미백(톤)" ? " 맑아 보이는 피부톤을 원하실 때 잘 어울려요." : ""}` };
  // 불신형
  let ft = gb == null ? 2 : gb >= 5 ? 5 : gb >= 3 ? 4 : 3;
  if (["보습", "영양"].includes(l.purpose) && ft < 5) ft += 1;
  out.trust = { fit: ft,
    point: gb == null ? "산지 통계 확인 전 → 원산지 자료부터 확보" : `2024년 생산 통계로 산지 확인 (${l.gb[1].replace(" (", ", ").replace(")", "")}) → 원산지·함량 공개로 신뢰 높이기`,
    talk: gb == null ? `${l.herb}${josa(l.herb, "은", "는")} 산지 자료를 아직 확인하고 있어요. 원산지 정보를 받아 보신 뒤 골라 주셔도 좋아요.`
      : `어디서 온 원료인지 궁금하시죠? ${l.herb}${josa(l.herb, "은", "는")} 국내 생산 통계로 산지가 확인되는 원료예요 (${l.gb[1].replace(" (", ", ").replace(")", "")}).` };
  return out;
}

function personaKw(k, l, a) {
  const items = l.lineup.map(([, n]) => n), light = items.includes("미스트") ? "미스트" : items.includes("젤 크림") ? "젤 크림" : "토너";
  const s = l.scent ? l.scent[0] : null, gb = l.gb ? l.gb[0] : null, color = String(l.design.from || "").split("(")[0].trim();
  if (k === "scent") return s === 5 ? ["향 약한 원료", "토너부터 가볍게"] : s === 3 ? ["은은한 약재 향", "손등 테스트 후 토너부터"] : ["향 조절 필요", "테스터 먼저"];
  if (k === "weight") return a.fit === 5 ? [light + " 중심 구성", "산뜻한 마무리"] : a.fit >= 3 ? ["아침엔 토너만", "저녁에 크림 더하기"] : ["리치 크림이라 무거울 수 있음", "토너만 먼저"];
  if (k === "image") return [color ? color + " 패키지" : "원료 색 패키지", ...(gb != null && gb >= 4 ? ["경북·약전골목 이야기"] : []), ...(l.purpose === "미백(톤)" ? ["맑아 보이는 톤"] : [])];
  return gb == null ? ["산지 자료 확인 중", "원산지 정보 먼저 안내"] : ["국내 산지 확인 원료", l.gb[1].replace(" (", ", ").replace(")", ""), "원산지 공개"];
}

function candidates(season) {
  const iss = SEASONS[season].issues;
  return HERBS.map(h => {
    const hits = h.purposes.map(p => ({ p, issues: iss.filter(i => i[3].includes(p)) })).filter(x => x.issues.length);
    if (!hits.length) return null;
    const firstAt = p => { for (let i = 0; i < iss.length; i++) { const j = iss[i][3].indexOf(p); if (j >= 0) return i * 10 + j; } return 99; };
    hits.sort((a, b) => b.issues.length - a.issues.length || firstAt(a.p) - firstAt(b.p));
    const { p, issues } = hits[0];
    return { ...h, color: DESIGN[h.herb].main, design: DESIGN[h.herb], finish: FINISH[p], purpose: p, issues, name: `${h.herb} ${PURPOSE_LABEL[p]} 라인`, functional: p === "미백(톤)",
      concern: issues.map(i => i[2]).join(" / "), lineup: lineupFor(p), next: (LINE_RULE[p] || {}).next || [], extra: (LINE_RULE[p] || {}).extra || "" };
  }).filter(Boolean).map(l => ({ ...l, why: comboWhy(l, season), talk: sellerTalk(l, season), persona: personaAppeal(l) }));
}

/* ════════ 필수 통과 조건 (PASS / FAIL / UNKNOWN / NA) ════════ */
const perMl = l => l.lineup.map(([t, k, ml, p]) => ({ t, k, per: Math.round(p / ml), r: PRICE_RANGE[t] }));
const GATES = [
  { nm: "기초라인 적합", get: l => l.typeGate || ["PASS", "토너·세럼·크림 구성 가능"] },
  { nm: "한방 원료 근거", get: l => l.hanbangGate || ["PASS", "공정서 약재"] },
  { nm: "쓸 수 있는 원료", get: () => ["PASS", "안전기준 별표1·2와 이름 일치 없음 (콘셉트 단계 기준, 성분 단위는 샘플 단계에 성적서로 확인)"] },
  { nm: "광고 표현", get: l => ["PASS", `원료 후보표의 '쓸 수 있는 말'만 사용: ${l.words}`] },
  { nm: "기능성 절차", get: l => l.functional ? ["PASS", l.func || "고시 성분을 배합해 보고"] : ["NA", "일반 화장품이라 해당 없음"] },
  { nm: "중저가 가격", get: l => {
      const bad = perMl(l).filter(x => x.per < x.r[0] || x.per > x.r[1]);
      return bad.length ? ["FAIL", bad.map(x => `${x.k} ${x.per}원/ml 범위 밖`).join(", ")] : ["PASS", perMl(l).map(x => `${x.k} ${x.per}원/ml`).join(" · ")];
    } },
  { nm: "계절 고민 연결", get: l => ["PASS", l.issues.map(i => i[0]).join(" · ")] }
];

/* ════════ 후보 순위 근거 버튼 (세부 기준은 버튼 비중을 나눠 씀) ════════ */
const trendLabel = () => TREND ? `기준일 ${TREND.collectedAt}` : "트렌드 파일 수집 전";
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
let season = "봄", W = { ...PRESETS[0].w }, presetOn = 0, designMode = "tint";
const prevRank = {};

function evaluate(l) {
  const gates = GATES.map(g => ({ g, r: g.get(l) }));
  const blocked = gates.filter(x => x.r[0] === "FAIL" || x.r[0] === "UNKNOWN");
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
  return { l, gates, blocked, parts, lo, hi, mid: (lo + hi) / 2, evid: sumW ? Math.round(got / sumW * 100) : 0 };
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
  el.querySelectorAll(".season").forEach(b => b.onclick = () => { season = b.dataset.s; render(); });
  document.body.dataset.season = season;
  document.getElementById("eng").textContent = `${SEASONS[season].eng} Collection Planning`;
  document.getElementById("title").textContent = `${season}, 어떤 라인을 먼저 낼까요?`;
  document.getElementById("issues").innerHTML = SEASONS[season].issues.map(([t, n, c, p]) =>
    `<div class="issue"><div class="t">${esc(t)}</div><div class="n">${esc(n)}</div><div class="c">${esc(c)} → ${p.map(esc).join(", ")}</div></div>`).join("");
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

function renderStudio() {
  const pr = document.getElementById("presets");
  pr.innerHTML = PRESETS.map((p, i) => `<button class="preset${i === presetOn ? " on" : ""}" type="button" data-i="${i}">${esc(p.nm)}</button>`).join("")
    + `<button class="preset${presetOn === -1 ? " on" : ""}" type="button" data-i="-1">직접 고르기</button>`;
  pr.querySelectorAll(".preset").forEach(b => b.onclick = () => { presetOn = +b.dataset.i; W = presetOn >= 0 ? { ...PRESETS[presetOn].w } : {}; render(); });
  const on = CRIT.filter(c => !c.off), off = CRIT.filter(c => c.off);
  document.getElementById("cbtns").innerHTML = on.map(c =>
    `<button class="cbtn" type="button" data-k="${c.k}" data-w="${W[c.k] || 0}" aria-pressed="${!!W[c.k]}"><span class="nm">${esc(c.nm)}</span><span class="st">${stars(W[c.k] || 0)}</span><span class="ar">${esc(c.area)}${c.k === "trend" ? " · " + esc(trendLabel()) : ""}</span></button>`).join("")
    + `<div class="prep">자료 준비 중</div>` + off.map(c => `<button class="cbtn" type="button" disabled><span class="nm">${esc(c.nm)}</span><span class="st">준비 중</span><span class="ar">${esc(c.area)}</span></button>`).join("");
  document.querySelectorAll(".cbtn[data-k]").forEach(b => b.onclick = () => { const k = b.dataset.k; W[k] = ((W[k] || 0) + 1) % 3; if (!W[k]) delete W[k]; presetOn = -2; render(); });
  document.getElementById("gates").innerHTML = GATES.map(g => `<span class="gate"><i>✓</i>${esc(g.nm)}</span>`).join("");
  if (document.getElementById("design")) document.getElementById("design").innerHTML = [["tint", "색상 변경"]].map(([k, t]) =>
    `<button class="preset${designMode === k ? " on" : ""}" type="button" data-m="${k}">${t}</button>`).join("");
  document.querySelectorAll("#design .preset").forEach(b => b.onclick = () => { designMode = b.dataset.m; render(); });
}
let RES = [];
function renderResults() {
  const pool = candidates(season);
  const all = pool.map(evaluate);
  const ok = all.filter(r => !r.blocked.length).sort((a, b) => b.mid - a.mid || b.evid - a.evid);
  const out = all.filter(r => r.blocked.length);
  ok.forEach((r, i) => { r.rank = i + 1; r.unsure = (ok[i + 1] && r.lo <= ok[i + 1].hi) || (ok[i - 1] && ok[i - 1].lo <= r.hi); });
  const key = season + "|";
  ok.forEach(r => { const p = prevRank[key + r.l.herb]; r.move = p == null ? null : p - r.rank; });
  RES = [...ok, ...out];
  document.getElementById("col-title").textContent = `${season} 컬렉션 후보`;
  document.getElementById("col-sub").textContent = `원료 12종 중 ${pool.length}개 라인이 ${season} 피부 목적과 맞아요 · 순위 ${ok.length}개 · 추가 검증 ${out.length}개`;
  const el = document.getElementById("results");
  if (!Object.keys(W).length) { el.innerHTML = `<div class="empty">왼쪽에서 후보 순위 근거를 하나 이상 골라 주세요.</div>`; return; }
  const mv = r => r.move == null ? "" : r.move > 0 ? `<span class="move up">▲ ${r.move}</span>` : r.move < 0 ? `<span class="move down">▼ ${-r.move}</span>` : "";
  const whyChips = r => {
    const subs = r.parts.flatMap(p => p.subs.map(x => ({ p, x })));
    const strong = subs.filter(o => o.x.r[0] >= 4).sort((a, b) => W[b.p.c.k] - W[a.p.c.k]).filter((o, i, arr) => arr.findIndex(z => z.p.c.k === o.p.c.k) === i).slice(0, 3);
    const weak = subs.filter(o => o.x.r[0] != null && o.x.r[0] <= 2).slice(0, 2);
    const unk = subs.filter(o => o.x.r[0] == null).length;
    return strong.map(o => `<span>${esc(o.p.c.nm)} ${stars(W[o.p.c.k])}</span>`).join("")
      + weak.map(o => `<span class="weak">약함 · ${esc(o.x.s.nm)}</span>`).join("") + (unk ? `<span class="unk">확인 필요 ${unk}</span>` : "");
  };
  const top = ok.slice(0, 3), rest = [...ok.slice(3), ...out];
  el.innerHTML = `<div class="top3">${top.map(r => `
    <button class="card" type="button" data-h="${esc(r.l.herb)}">
      <div class="card-rank"><span class="ribbon">No.${r.rank}</span>${mv(r)}</div>
      <div class="visual" style="${tileBg(r.l)}">${tiles(r.l)}</div>
      <div class="body">
        <div class="herb">${esc(r.l.herb)}${r.l.hanja ? `(${r.l.hanja})` : ""} · ${esc(r.l.purpose)} · ${r.l.functional ? "기능성 보고 필요" : "일반 화장품"}</div>
        <h3>${esc(r.l.name)}</h3>
        <div class="price">${r.l.lineup.map(([, k, ml, p]) => `${esc(k)} ${ml}ml ${won(p)}`).join(" · ")}</div>
        <div class="meter"><span class="bar"><i style="left:${r.lo}%;width:${r.hi - r.lo}%"></i><b style="width:${r.lo}%"></b></span><strong>${r.lo === r.hi ? r.lo : r.lo + "~" + r.hi}</strong>점</div>
        <div class="why">${whyChips(r)}</div>
        ${r.unsure ? `<div class="flag">점수 범위가 겹쳐 확인 필요 칸에 따라 순위가 바뀔 수 있어요</div>` : ""}
      </div>
    </button>`).join("")}</div>
    <div class="others"><h3>다른 후보</h3>${rest.map(r => `
      <button class="row${r.rank ? "" : " blocked"}" type="button" data-h="${esc(r.l.herb)}">
        <span class="rk">${r.rank ? "No." + r.rank : "—"}</span><span class="dot" style="background:${r.l.color}"></span>
        <span class="nm"><b>${esc(r.l.name)}</b><small>${r.rank ? esc(r.l.purpose) : "추가 검증 · " + r.blocked.map(x => esc(x.g.nm)).join(", ")}</small></span>
        <span class="sc">${r.rank ? scoreText(r) : "순위 제외"}</span>
        <span class="mv">${r.move > 0 ? `<span style="color:var(--ok)">▲ ${r.move}</span>` : r.move < 0 ? `<span style="color:var(--warn)">▼ ${-r.move}</span>` : ""}</span>
      </button>`).join("")}</div>`;
  el.querySelectorAll("[data-h]").forEach(b => b.onclick = () => openDetail(RES.find(r => r.l.herb === b.dataset.h)));
  ok.forEach(r => { prevRank[key + r.l.herb] = r.rank; });
}
function openDetail(r) {
  hideSampleZoom();
  const l = r.l;
  const v = document.getElementById("d-visual"); v.innerHTML = tiles(l); v.style.cssText = tileBg(l) + ";border-radius:14px;padding:14px";
  document.getElementById("d-steps").innerHTML = [["sample", "샘플 그대로"], ["tint", "색상 변경"]].map(([m, t]) =>
    `<div>${tileHtml(l, "serum", "세럼", m)}<p>${t}</p></div>`).join("");
  const dz = l.design;
  document.getElementById("d-palette").innerHTML = `
    <div><i style="background:${dz.main}"></i>베이스 <code>${dz.main}</code> · ${esc(dz.from)}</div><div><i style="background:${dz.cap}"></i>라벨 포인트 <code>${dz.cap}</code></div>`;
  document.getElementById("d-vnote").textContent = "";
  document.getElementById("d-rank").textContent = r.rank ? `${season} No.${r.rank} · ${scoreText(r)}` : `${season} · 추가 검증 (필수 조건 미통과)`;
  document.getElementById("d-name").textContent = l.name;
  document.getElementById("d-facts").innerHTML = `
    <dt>구분</dt><dd>${l.functional ? "기능성 보고 필요" : "일반 화장품"}</dd>
    <dt>대표 약재</dt><dd>${esc(l.herb)}${l.hanja ? `(${l.hanja})` : ""}</dd>
    <dt>쓸 수 있는 말</dt><dd>${esc(l.words)}</dd>`;
  document.getElementById("d-why-combo").innerHTML = `<dt>날씨</dt><dd>${chips(l.issues.map(i => i[0]))}</dd><dt>고민</dt><dd>${chips([...new Set(l.issues.flatMap(i => i[2].split(" · ")))].slice(0, 4))}</dd><dt>목적</dt><dd>${chips([l.purpose])}</dd><dt>구성</dt><dd>${chips([l.lineup.map(([, k]) => k).join(" → ")])}</dd><dt>포인트</dt><dd>${chips(String(COMBO_KW[l.purpose] || "").split(" · "))}</dd>`;
  { const ranked = PERSONAS.map(pp => ({ pp, a: l.persona[pp.k] })).sort((x, y) => y.a.fit - x.a.fit);
    const pick = ranked.filter(x => x.a.fit >= 4).slice(0, 2);
    const show = pick.length ? pick : ranked.slice(0, 1);
    document.getElementById("d-persona").innerHTML = show.map(({ pp, a }) => `<div class="pcard good"><div class="ph"><b>${pp.icon} ${esc(pp.type)} 고객</b></div><dl class="kw"><dt>고민</dt><dd>${chips([PAIN_KW[pp.k]])}</dd><dt>어필</dt><dd>${chips(personaKw(pp.k, l, a))}</dd></dl></div>`).join(""); }
  document.getElementById("d-lineup").innerHTML = l.lineup.map(([, k, ml, p]) => `<tr><td>${esc(k)} <span class="note">1차</span></td><td>${ml}ml</td><td>${won(p)}</td><td>${won(Math.round(p / ml))}</td></tr>`).join("")
    + (l.extra ? `<tr><td>${esc(l.extra)} <span class="note">1차</span></td><td colspan="3" class="note">용기 샘플·가격 기준 준비 중</td></tr>` : "")
    + (l.next.length ? `<tr><td colspan="4" class="note">2차 확장 후보: ${l.next.map(esc).join(" · ")}</td></tr>` : "");
  const lab = { PASS: "PASS", FAIL: "FAIL", UNKNOWN: "UNKNOWN", NA: "해당 없음" };
  document.getElementById("d-gates").innerHTML = `<div class="gchips">${r.gates.map(x => `<span class="gchip ${x.r[0]}">${x.r[0] === "PASS" ? "✓" : x.r[0] === "NA" ? "–" : "!"} ${esc(x.g.nm)}</span>`).join("")}</div>` + r.gates.filter(x => x.r[0] === "FAIL" || x.r[0] === "UNKNOWN").map(x => `<div class="note">${esc(x.g.nm)}: ${esc(x.r[1])}</div>`).join("");
  document.getElementById("d-crit").innerHTML = r.parts.map(p => `<div class="h" title="${esc(p.subs.map(x => x.s.nm + ': ' + x.r[1]).join(' / '))}"><span>${esc(p.c.nm)} ${stars(W[p.c.k])}</span><span>${p.avg == null ? "확인 필요" : (Math.round(p.avg * 10) / 10) + " / 5"}</span></div>`).join("")
    + (r.lo !== r.hi ? `<p class="note">확인 안 된 칸이 있어 ${scoreText(r)} 범위로 보여 줘요.</p>` : "");
  const d = document.getElementById("detail"); d.showModal ? d.showModal() : d.setAttribute("open", "");
}
document.getElementById("d-close").onclick = () => { hideSampleZoom(); document.getElementById("detail").close(); };
document.getElementById("detail").addEventListener("click", e => { if (e.target.id === "detail") e.target.close(); });

const SAMPLE_ZOOM = 2.6, SAMPLE_LENS_SIZE = 230;
let sampleZoom = { tile: null, lens: null, content: null };
function sampleLensPosition(rect, x, y, viewportWidth, viewportHeight) {
  const half = SAMPLE_LENS_SIZE / 2;
  return { left: Math.max(8, Math.min(viewportWidth - SAMPLE_LENS_SIZE - 12, x - half)),
    top: Math.max(8, Math.min(viewportHeight - SAMPLE_LENS_SIZE - 12, y - half)),
    tx: half - (x - rect.left) * SAMPLE_ZOOM, ty: half - (y - rect.top) * SAMPLE_ZOOM };
}
function hideSampleZoom() {
  if (sampleZoom.lens) sampleZoom.lens.hidden = true;
  sampleZoom.tile = null;
}
function moveSampleZoom(event) {
  if (event.pointerType === "touch") { hideSampleZoom(); return; }
  const tile = event.target && event.target.closest ? event.target.closest(".tile") : null;
  const photo = tile && tile.closest("#detail") && tile.querySelector(".product-cutout");
  if (!photo) { hideSampleZoom(); return; }
  if (!sampleZoom.lens) {
    const lens = document.createElement("div"), content = document.createElement("div");
    lens.className = "sample-lens"; lens.setAttribute("aria-hidden", "true");
    content.className = "sample-lens-content"; lens.appendChild(content);
    sampleZoom.lens = lens; sampleZoom.content = content;
  }
  const parent = tile.closest("dialog") || document.body;
  if (sampleZoom.lens.parentNode !== parent) parent.appendChild(sampleZoom.lens);
  const rect = tile.getBoundingClientRect();
  if (!rect.width || !rect.height) { hideSampleZoom(); return; }
  if (sampleZoom.tile !== tile) {
    sampleZoom.content.replaceChildren(photo.cloneNode(true));
    sampleZoom.tile = tile;
  }
  sampleZoom.content.style.width = rect.width + "px";
  sampleZoom.content.style.height = rect.height + "px";
  sampleZoom.lens.style.background = getComputedStyle(tile).backgroundColor;
  const position = sampleLensPosition(rect, event.clientX, event.clientY, window.innerWidth, window.innerHeight);
  sampleZoom.lens.style.left = position.left + "px";
  sampleZoom.lens.style.top = position.top + "px";
  sampleZoom.content.style.transform = `translate(${position.tx}px,${position.ty}px) scale(${SAMPLE_ZOOM})`;
  sampleZoom.lens.hidden = false;
}
if (typeof document.addEventListener === "function" && typeof window !== "undefined") {
  document.addEventListener("pointermove", moveSampleZoom, { passive: true });
  document.addEventListener("pointerleave", hideSampleZoom);
  window.addEventListener("scroll", hideSampleZoom, true);
  window.addEventListener("resize", hideSampleZoom);
  window.addEventListener("blur", hideSampleZoom);
  document.getElementById("detail").addEventListener("close", hideSampleZoom);
}

function render() { hideSampleZoom(); renderPackageFilters(); renderSeasons(); renderTrendComment(); renderStudio(); renderResults(); }

export function startApp(data) {
  ({ SEASONS, HERBS, DESIGN, TREND_SOURCES, TREND_TIERS } = data);
  TREND = data.HERB_TREND;
  BEAUTY_TRENDS = data.BEAUTY_TRENDS;
  beautyFetchNote = data.note || "";
  render();
}
