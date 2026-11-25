import { describe, it, expect } from "vitest";
import { recolorPixels, toHsl, SOURCE_CAP } from "../src/core/recolor.js";

const px = (...c) => new Uint8ClampedArray(c);
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("용기 사진 색 바꾸기 (명암 유지)", () => {
  it("샘플 뚜껑 본색은 목표 색 그대로가 돼요", () => {
    const p = recolorPixels(px(...SOURCE_CAP, 255), "#6B8E23");
    expect(hueGap(toHsl(p[0], p[1], p[2])[0], toHsl(0x6B, 0x8E, 0x23)[0])).toBeLessThan(3);
    expect(Math.abs(toHsl(p[0], p[1], p[2])[2] - toHsl(0x6B, 0x8E, 0x23)[2])).toBeLessThan(0.02);
  });
  it("밝은 하이라이트는 밝게, 어두운 그림자는 어둡게 남아요 (명암 순서 유지)", () => {
    const p = recolorPixels(px(250, 230, 240, 255, 201, 25, 59, 255, 60, 5, 15, 255), "#8FA36B");
    const L = i => toHsl(p[i], p[i + 1], p[i + 2])[2];
    expect(L(0)).toBeGreaterThan(L(4));
    expect(L(4)).toBeGreaterThan(L(8));
    expect(L(0)).toBeGreaterThan(0.9);
  });
  it("투명 픽셀은 건드리지 않아요", () => {
    expect([...recolorPixels(px(10, 20, 30, 0), "#123456")]).toEqual([10, 20, 30, 0]);
  });
});
