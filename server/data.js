/* 서버(에이전트)가 쓰는 데이터를 읽어요. 받은 Supabase 클라이언트(사용자 토큰)로 조회하니 RLS가 그대로 적용돼요.
   브라우저 전용 코드(import.meta, lib/supabase.js)는 가져오지 않아요. */
import * as fallback from "../src/data/fallback.js";
import { toSeasons, toHerb, toDesign } from "../src/data/shape.js";

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function fallbackData() {
  return {
    SEASONS: fallback.SEASONS, HERBS: fallback.HERBS, DESIGN: fallback.DESIGN,
    HERB_TREND: fallback.HERB_TREND, COLOR_TRENDS: [], source: "fallback",
  };
}

/* color_trends 표는 나중에 생겨요. 표가 없거나 조회가 실패해도 전체를 막지 않고 빈 배열로 둬요. */
async function colorTrends(client) {
  try {
    return (await rows(client.from("color_trends").select("season, name, colors, source, url, as_of").order("as_of", { ascending: false }))) ?? [];
  } catch {
    return [];
  }
}

/** 서버가 쓸 데이터를 불러와요. client가 없거나 조회가 실패하면 기본 데이터를 써요. */
export async function loadServerData(client) {
  if (!client) return fallbackData();
  try {
    const [seasons, issues, herbs, trend, colors] = await Promise.all([
      rows(client.from("seasons").select("name, eng, icon").order("sort_order")),
      rows(client.from("season_issues").select("season, title, stat, concern, purposes").order("sort_order")),
      rows(client.from("herbs").select("*, herb_designs(main, cap, liquid, motif, from_label)").order("sort_order")),
      rows(client.from("herb_trend_snapshots").select("collected_at, herbs").order("collected_at", { ascending: false }).limit(1)),
      colorTrends(client),
    ]);
    if (!seasons.length || !herbs.length) throw new Error("seasons/herbs 테이블이 비어 있어요.");
    return {
      SEASONS: toSeasons(seasons, issues),
      HERBS: herbs.map(toHerb),
      DESIGN: toDesign(herbs),
      HERB_TREND: trend[0] ? { collectedAt: trend[0].collected_at, herbs: trend[0].herbs } : null,
      COLOR_TRENDS: colors,
      source: "supabase",
    };
  } catch (e) {
    console.error("[server/data] 조회 실패, 기본 데이터를 써요:", e);
    return fallbackData();
  }
}

/** 계절별 가장 최근(as_of) 색 팔레트를 돌려줘요. 없으면 null. */
export function latestPalette(data, season) {
  const list = (data.COLOR_TRENDS ?? []).filter((c) => c.season === season);
  if (!list.length) return null;
  const top = list.reduce((a, b) => (String(b.as_of) > String(a.as_of) ? b : a));
  return { name: top.name, colors: top.colors, source: top.source, as_of: top.as_of };
}
