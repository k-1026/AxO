/* 용기 색 → 배경 색 순서로 자동으로 정해요. 색은 hex 전체 범위(#000000 ~ #FFFFFF)에서 골라요.
   1) 용기 색(뚜껑·로고 포인트): 원료의 실제 색이에요 (config/herb-colors.js). 산약은 크림 아이보리, 오미자는 빨강처럼요.
   2) 몸통·내용물: 용기 색을 흰색과 섞어 연하게 만들어요. 같은 약재라도 라인(목적)마다 진하기를 조금씩 바꿔요.
   3) 배경 색: 제품이 잘 보이도록 밝고 깨끗한 웜 베이지에 원료 색을 살짝 섞어요. 보색일 필요는 없어요.
      - 배경은 어둡게 만들지 않아요. 원료가 아이보리처럼 너무 밝아 뚜껑이 배경에 묻히면,
        뚜껑 색을 따뜻한 갈색 쪽으로 조금 진하게 해서 구분해요.
   herb-colors.js 에 없는 약재는 예전 데이터(fallback.js·Supabase)의 cap 색을 써요. */
import { HERB_COLORS } from "../config/herb-colors.js";

export const PALETTE_RANGE = { from: "#000000", to: "#FFFFFF", count: 256 ** 3 };

/* 목적 순서 (config/rules.js FINISH 순서와 같아요) · 라인마다 진하기를 옮기는 정도 */
const PURPOSES = ["진정", "쿨링", "모공·피지", "보습", "민감·장벽", "미백(톤)", "영양", "탄력"];
const LINE_SHIFT = [0, -0.05, 0.05, -0.1, 0.08, -0.03, 0.03, -0.07];
/* 배경 바탕색(밝은 웜 베이지) · 원료 색을 섞는 비율 · 뚜껑과 배경의 최소 밝기 차 · 밝은 뚜껑을 진하게 할 때 섞는 색 */
export const BG_BASE = { ground: "#F4EEE6", tint: 0.1, gap: 0.1, deepen: "#8C7660" };

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
export const lightness = c => (Math.max(...c) + Math.min(...c)) / 510;

/** 원료의 실제 색 [hex, 이름] · 없으면 예전 데이터의 cap 색 */
export function herbColor(design, herb) {
  const known = HERB_COLORS[herb];
  if (known) return known;
  const cap = design?.[herb]?.cap;
  return [/^#[0-9A-F]{6}$/i.test(cap || "") ? cap.toUpperCase() : "#C9B9A6", design?.[herb]?.from || "원료 색"];
}

/* 배경: 밝은 웜 베이지에 원료 색을 살짝 섞어요. 제품이 잘 보이도록 어둡게 만들지 않아요. */
const background = base => mix(rgb(BG_BASE.ground), base, BG_BASE.tint);
/* 뚜껑 색: 원료 색 그대로 쓰되, 아이보리처럼 너무 밝아 배경에 묻히면 따뜻한 갈색 쪽으로 조금씩 진하게 해요 */
function capColor(base, bg) {
  let c = base;
  for (let i = 0; i < 30 && lightness(bg) - lightness(c) < BG_BASE.gap; i++) c = mix(c, rgb(BG_BASE.deepen), 0.06);
  return c;
}

/** 약재·목적으로 용기·배경 색 { main, cap, liquid, bg, motif, from, key } 을 만들어요. */
export function lineDesign(design, herb, purpose) {
  if (!design?.[herb] && !HERB_COLORS[herb]) return {};
  const [hex, label] = herbColor(design, herb), base = rgb(hex);
  const pi = Math.max(0, PURPOSES.indexOf(purpose)), d = purpose ? LINE_SHIFT[pi] : 0;
  const bg = background(base), point = capColor(base, bg);
  const body = mix(point, WHITE, 0.8 - d);
  return {
    main: toHex(body),
    cap: toHex(d < 0 ? mix(point, BLACK, -d) : mix(point, WHITE, d / 2)),
    liquid: toHex(mix(point, WHITE, 0.92)),
    bg: toHex(bg),
    motif: design?.[herb]?.motif,
    from: label,
    key: `${Object.keys(design || {}).indexOf(herb)}-${purpose ? pi : "x"}`
  };
}
