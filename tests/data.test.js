import { describe, it, expect, vi } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { loadServerData, latestPalette } from "../server/data.js";

// 체인(select/order/limit)을 지나 await 하면 result가 나오는 가짜 조회예요.
function fakeQuery(result) {
  const q = { select: () => q, order: () => q, limit: () => q, then: (res, rej) => Promise.resolve(result).then(res, rej) };
  return q;
}

const TABLES = {
  seasons: { data: [{ name: "봄", eng: "Spring", icon: "🌸" }], error: null },
  season_issues: { data: [{ season: "봄", title: "건조", stat: "수치", concern: "당김", purposes: ["보습"] }], error: null },
  herbs: { data: [{
    name: "당귀", hanja: "當歸", purposes: ["보습"], words: ["w"], seasons: ["봄"], color: "#fff",
    scent_score: 3, scent_note: "향", herb_designs: { main: "m", cap: "c", liquid: "l", motif: "mo", from_label: "f" },
  }], error: null },
  herb_trend_snapshots: { data: [], error: null },
  color_trends: { data: [], error: null },
};
const makeClient = (override = {}) => ({ from: (t) => fakeQuery({ ...TABLES, ...override }[t]) });

describe("loadServerData", () => {
  it("client가 null이면 기본 데이터를 돌려줘요", async () => {
    const d = await loadServerData(null);
    expect(d.HERBS.length).toBe(fallback.HERBS.length);
    expect(d.source).toBe("fallback");
    expect(d.COLOR_TRENDS).toEqual([]);
  });

  it("조회가 에러를 던지면 기본 데이터를 돌려줘요", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { from() { throw new Error("조회 실패"); } };
    const d = await loadServerData(client);
    expect(d.source).toBe("fallback");
    expect(d.HERBS.length).toBe(fallback.HERBS.length);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("조회 결과에 error가 담겨 와도 기본 데이터를 돌려줘요", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { from: () => fakeQuery({ data: null, error: { message: "권한 없음" } }) };
    const d = await loadServerData(client);
    expect(d.source).toBe("fallback");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("조회에 성공하면 행을 화면 모양으로 바꿔 돌려줘요", async () => {
    const d = await loadServerData(makeClient());
    expect(d.source).toBe("supabase");
    expect(d.SEASONS["봄"].issues).toEqual([["건조", "수치", "당김", ["보습"]]]);
    expect(d.HERBS).toHaveLength(1);
    expect(d.HERBS[0].herb).toBe("당귀");
    expect(d.HERBS[0].scent).toEqual([3, "향"]);
    expect(d.DESIGN["당귀"]).toEqual({ main: "m", cap: "c", liquid: "l", motif: "mo", from: "f" });
    expect(d.HERB_TREND).toBeNull();
    expect(d.COLOR_TRENDS).toEqual([]);
  });

  it("color_trends만 실패하면 빈 배열로 두고 나머지는 그대로 써요", async () => {
    const d = await loadServerData(makeClient({ color_trends: { data: null, error: { message: "표 없음" } } }));
    expect(d.source).toBe("supabase");
    expect(d.COLOR_TRENDS).toEqual([]);
    expect(d.HERBS).toHaveLength(1);
  });

  it("color_trends 행은 그대로 실어 줘요", async () => {
    const rows = [{ season: "봄", name: "a", colors: ["#111"], source: "s", url: "u", as_of: "2026-11-01" }];
    const d = await loadServerData(makeClient({ color_trends: { data: rows, error: null } }));
    expect(d.COLOR_TRENDS).toEqual(rows);
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
