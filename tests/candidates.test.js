import { describe, it, expect } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { buildCandidates, findLine, rankLines, lineKey } from "../src/core/candidates.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");

describe("후보 계산", () => {
  it("계절 후보 수는 원료별 목적 수의 합이에요", () => {
    const total = fallback.HERBS.reduce((a, h) => a + h.purposes.length, 0);
    expect(buildCandidates(fallback, "봄").length).toBe(total);
  });
  it("어성초 모공·피지 라인은 토너 하나예요", () => {
    const r = findLine(fallback, "여름", "어성초", "모공·피지", NOW);
    expect(r.l.lineup.map(x => x[1])).toEqual(["토너"]);
  });
  it("원료가 갖지 않은 목적이면 null이에요", () => {
    expect(findLine(fallback, "봄", "쑥", "탄력", NOW)).toBeNull();
  });
  it("순위는 같은 입력이면 항상 같아요", () => {
    const a = rankLines(fallback, "가을", NOW).map(r => lineKey(r.l));
    const b = rankLines(fallback, "가을", NOW).map(r => lineKey(r.l));
    expect(a).toEqual(b);
  });
});
