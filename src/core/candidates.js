/* 후보 만들기·점수 계산 (화면과 서버가 함께 써요).
   화면 전용 코드(DOM·import.meta.env)와 현재 시각 호출 없이, 필요한 값은 모두 인자로 받아요. */
import {
  FINISH, PURPOSE_LABEL, LINE_RULE, lineupFor, ROLE, COMBO_WHY, TALK, LIGHT, PRESETS
} from "../config/rules.js";
import { eulReul, josa } from "../utils/text.js";

/* ════════ 후보 풀 만들기: 원료 48종 × 원료마다 가진 모든 목적 ════════
   계절·제철로 거르지 않아요. 계절의 기후 이슈는 설명(날씨·고민)에만 써요. */
export const lineKey = l => `${l.herb}|${l.purpose}`;

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

export function personaKw(k, l, a) {
  const items = l.lineup.map(([, n]) => n), light = items.includes("미스트") ? "미스트" : items.includes("젤 크림") ? "젤 크림" : "토너";
  const s = l.scent ? l.scent[0] : null, gb = l.gb ? l.gb[0] : null, color = String(l.design.from || "").split("(")[0].trim();
  if (k === "scent") return s === 5 ? ["향 약한 원료", "토너부터 가볍게"] : s === 3 ? ["은은한 약재 향", "손등 테스트 후 토너부터"] : ["향 조절 필요", "테스터 먼저"];
  if (k === "weight") return a.fit === 5 ? [light + " 중심 구성", "산뜻한 마무리"] : a.fit >= 3 ? ["아침엔 토너만", "저녁에 크림 더하기"] : ["리치 크림이라 무거울 수 있음", "토너만 먼저"];
  if (k === "image") return [color ? color + " 패키지" : "원료 색 패키지", ...(gb != null && gb >= 4 ? ["경북·약전골목 이야기"] : []), ...(l.purpose === "미백(톤)" ? ["맑아 보이는 톤"] : [])];
  return gb == null ? ["산지 자료 확인 중", "원산지 정보 먼저 안내"] : ["국내 산지 확인 원료", l.gb[1].replace(" (", ", ").replace(")", ""), "원산지 공개"];
}


/* data: { SEASONS, HERBS, DESIGN, HERB_TREND } */
export function buildCandidates(data, season) {
  const { SEASONS, HERBS, DESIGN } = data;
  const iss = SEASONS[season].issues;
  return HERBS.flatMap(h => h.purposes.map(p => {
    const issues = iss.filter(i => i[3].includes(p));
    return { ...h, color: DESIGN[h.herb].main, design: DESIGN[h.herb], finish: FINISH[p], purpose: p, issues, name: `${h.herb} ${PURPOSE_LABEL[p]} 라인`, functional: p === "미백(톤)",
      concern: issues.map(i => i[2]).join(" / "), lineup: lineupFor(p), next: (LINE_RULE[p] || {}).next || [], extra: (LINE_RULE[p] || {}).extra || "" };
  })).map(l => ({ ...l, why: comboWhy(l, season), talk: sellerTalk(l, season), persona: personaAppeal(l) }));
}

/* ════════ 후보 순서 기준 (사용자에게 보이지 않는 고정 기준: 추천 조합 '체크리스트 기본') ════════ */
function trendScore(l, trend, now) {
  if (!trend) return [null, "검색 흐름 자료 확인 필요"];
  if ((now - new Date(trend.collectedAt)) / 864e5 > 30) return [null, `오래된 자료 (${trend.collectedAt})`];
  const h = trend.herbs && trend.herbs[l.herb];
  return h && h.score != null ? [h.score, `${h.signal} · 최근÷이전 ${h.change ?? "–"} (${trend.collectedAt}, 네이버 데이터랩)`] : [null, `${l.herb} 검색 흐름 자료 없음`];
}
const makeCrit = ({ season, trend, now }) => [
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
  { k: "trend", nm: "📈 뜨는 원료", area: "트렌드 에이전트 · 주간 검색 흐름", subs: [ { nm: "최근 4주 검색 흐름", get: l => trendScore(l, trend, now) } ] },
  { k: "profit", nm: "💰 수익성", area: "원가 자료 없음", off: true },
  { k: "effect", nm: "✨ 핵심 효능", area: "완제품 시험 전", off: true },
  { k: "channel", nm: "📣 채널·고객 확보", area: "채널 자료 없음", off: true }
];

/* 라인·원료 순서는 계절·기후와 상관없이 정해요: '계절 고민 크기'(demand)는 빼요. */
export const W = Object.fromEntries(Object.entries(PRESETS[0].w).filter(([k]) => k !== "demand"));

/* ctx: { season, trend, now } · now는 밀리초 숫자예요. */
export function evaluate(l, { season, trend, now }) {
  const CRIT = makeCrit({ season, trend, now });
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

export function rankLines(data, season, now) {
  const ctx = { season, trend: data.HERB_TREND, now };
  return buildCandidates(data, season).map(l => evaluate(l, ctx)).sort((a, b) => b.mid - a.mid || b.evid - a.evid);
}

/* 원료가 그 목적을 갖지 않으면 null이에요. */
export function findLine(data, season, herb, purpose, now) {
  return rankLines(data, season, now).find(r => r.l.herb === herb && r.l.purpose === purpose) || null;
}
