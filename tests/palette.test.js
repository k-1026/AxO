import { describe, it, expect } from "vitest";
import { lineDesign, lightness } from "../src/core/palette.js";
import { HERB_COLORS } from "../src/config/herb-colors.js";
import * as fallback from "../src/data/fallback.js";
import { buildCandidates } from "../src/core/candidates.js";
import { buildImagePrompt } from "../server/agents/designer.js";

const D = fallback.DESIGN, herbs = Object.keys(D);
const HEX = /^#[0-9A-F]{6}$/;
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const L = h => lightness(rgbOf(h));

describe("용기 색(원료 실제 색) → 어울리는 배경 색", () => {
  it("약재 48개 모두 원료 색이 있어요", () => {
    for (const h of herbs) expect(HERB_COLORS[h], h).toBeTruthy();
    for (const [hex, name] of Object.values(HERB_COLORS)) { expect(hex).toMatch(HEX); expect(name).toBeTruthy(); }
  });
  it("용기 뚜껑 색은 원료의 실제 색이에요", () => {
    expect(lineDesign(D, "구기자").cap).toBe(HERB_COLORS["구기자"][0]);
    expect(lineDesign(D, "오미자").cap).toBe(HERB_COLORS["오미자"][0]);
    expect(lineDesign(D, "산약").from).toBe("산약 크림 아이보리");
  });
  it("배경은 밝은 웜 베이지라 제품이 잘 보여요 (어둡게 만들지 않아요)", () => {
    for (const h of herbs) {
      const d = lineDesign(D, h);
      expect(d.bg).toMatch(HEX);
      expect(L(d.bg), h).toBeGreaterThan(0.84);
    }
  });
  it("뚜껑은 어느 라인에서도 배경보다 확실히 진해요 (아이보리 원료는 뚜껑을 조금 진하게)", () => {
    for (const h of herbs) for (const p of [undefined, "진정", "보습", "민감·장벽", "탄력"]) {
      const d = lineDesign(D, h, p);
      expect(L(d.bg) - L(d.cap), h + p).toBeGreaterThan(0.07);
    }
    expect(lineDesign(D, "산약").cap).not.toBe(HERB_COLORS["산약"][0]);
  });
  it("같은 약재라도 라인마다 몸통 색이 달라요", () => {
    const a = lineDesign(D, "산약", "보습"), b = lineDesign(D, "산약", "탄력");
    expect(a.main).not.toBe(b.main);
    expect(a.key).not.toBe(b.key);
  });
  it("같은 약재·라인은 언제나 같은 색이에요", () => {
    expect(lineDesign(D, herbs[3], "진정")).toEqual(lineDesign(D, herbs[3], "진정"));
  });
  it("원료 색 표에 없는 약재는 예전 데이터 색을 써요", () => {
    const d = lineDesign({ 새약재: { main: "#FFFFFF", cap: "#123456", motif: "root", from: "새 색" } }, "새약재");
    expect(d.cap).toBe("#123456");
    expect(d.from).toBe("새 색");
  });
  it("후보 라인과 이미지 프롬프트가 이 색을 써요", () => {
    const l = buildCandidates(fallback, Object.keys(fallback.SEASONS)[0])[0];
    expect(l.design).toEqual(lineDesign(D, l.herb, l.purpose));
    const t = buildImagePrompt({ image_prompt: "bottle" }, { l }, fallback, null);
    expect(t).toContain(l.design.cap);
    expect(t).toContain(`Background color matched to the container: ${l.design.bg}`);
  });
});
