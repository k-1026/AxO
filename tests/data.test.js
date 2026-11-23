import { describe, it, expect } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { loadServerData, latestPalette } from "../server/data.js";

describe("loadServerData", () => {
  it("client가 null이면 기본 데이터를 돌려줘요", async () => {
    const d = await loadServerData(null);
    expect(d.HERBS.length).toBe(fallback.HERBS.length);
    expect(d.source).toBe("fallback");
    expect(d.COLOR_TRENDS).toEqual([]);
  });

  it("조회가 에러를 던지면 기본 데이터를 돌려줘요", async () => {
    const client = { from() { throw new Error("조회 실패"); } };
    const d = await loadServerData(client);
    expect(d.source).toBe("fallback");
    expect(d.HERBS.length).toBe(fallback.HERBS.length);
  });
});

describe("latestPalette", () => {
  const data = { COLOR_TRENDS: [
    { season: "봄", name: "a", colors: ["#111"], source: "s1", as_of: "2026-10-01" },
    { season: "봄", name: "b", colors: ["#222"], source: "s2", as_of: "2026-11-01" },
  ] };
  it("계절별 가장 최근 팔레트를 골라요", () => {
    expect(latestPalette(data, "봄").as_of).toBe("2026-11-01");
  });
  it("없는 계절이면 null이에요", () => {
    expect(latestPalette(data, "겨울")).toBeNull();
  });
});
