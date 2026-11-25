/* 용기 샘플 사진의 색만 바꿔요. 빛·그림자(명암)와 유리 투명감은 그대로 두고, 색상만 원료 색으로 옮겨요.
   샘플 사진은 빨간 뚜껑(평균 #C9193B)으로 찍혀 있어서, 그 색을 기준으로 채도·밝기를 비율대로 옮겨요.
   화면(app.js)이 캔버스 픽셀에 써요. DOM 없이 픽셀 배열만 다뤄서 테스트할 수 있어요. */

export const SOURCE_CAP = [201, 25, 59];

export function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (!d) return [0, 0, l];
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / (1 - Math.abs(2 * l - 1)), l];
}
export function toRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** RGBA 픽셀 배열(Uint8ClampedArray 등)을 그 자리에서 목표 색(#RRGGBB)으로 바꿔요. 투명 픽셀은 건드리지 않아요. */
export function recolorPixels(p, hex) {
  const src = toHsl(...SOURCE_CAP);
  const [th, ts, tl] = toHsl(...[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
  const satRatio = ts / src[1], lightShift = tl - src[2];
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const [, s, l] = toHsl(p[i], p[i + 1], p[i + 2]);
    /* 밝은 하이라이트·어두운 그림자는 덜 움직이고, 중간 밝기(뚜껑 본색)만 목표 밝기로 옮겨요 */
    const l2 = Math.max(0, Math.min(1, l + lightShift * (1 - Math.abs(2 * l - 1))));
    const [r, g, b] = toRgb(th, Math.min(1, s * satRatio), l2);
    p[i] = r; p[i + 1] = g; p[i + 2] = b;
  }
  return p;
}
