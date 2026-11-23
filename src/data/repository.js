/* 화면이 쓰는 데이터를 Supabase 테이블에서 읽어 기존 모양(SEASONS, HERBS, DESIGN …)으로 바꿔 줘요.
   테이블 구조는 supabase/schema.sql 을 보세요. */
import { supabase, hasSupabase } from "../lib/supabase.js";
import * as fallback from "./fallback.js";
import { toSeasons, toHerb, toDesign } from "./shape.js";

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function latestBeautyTrends() {
  const r = await rows(supabase.from("beauty_trend_snapshots").select("payload").order("updated_at", { ascending: false }).limit(1));
  return r[0]?.payload ?? null;
}

async function latestHerbTrend() {
  const r = await rows(supabase.from("herb_trend_snapshots").select("collected_at, herbs").order("collected_at", { ascending: false }).limit(1));
  return r[0] ? { collectedAt: r[0].collected_at, herbs: r[0].herbs } : null;
}

function fallbackData(note) {
  return {
    SEASONS: fallback.SEASONS, HERBS: fallback.HERBS, DESIGN: fallback.DESIGN,
    HERB_TREND: fallback.HERB_TREND, BEAUTY_TRENDS: fallback.BEAUTY_TRENDS,
    TREND_SOURCES: fallback.TREND_SOURCES, TREND_TIERS: fallback.TREND_TIERS,
    source: "fallback", note,
  };
}

/** 첫 화면에 필요한 데이터를 한 번에 불러와요. Supabase가 없거나 실패하면 기본 데이터를 써요. */
export async function loadAppData() {
  if (!hasSupabase) return fallbackData("Supabase 미연결 · 기본 데이터 표시");
  try {
    const [seasons, issues, herbs, sources, tiers, herbTrend, beauty] = await Promise.all([
      rows(supabase.from("seasons").select("name, eng, icon").order("sort_order")),
      rows(supabase.from("season_issues").select("season, title, stat, concern, purposes").order("sort_order")),
      rows(supabase.from("herbs").select("*, herb_designs(main, cap, liquid, motif, from_label)").order("sort_order")),
      rows(supabase.from("trend_sources").select("id, name, url, type, tier").order("sort_order")),
      rows(supabase.from("trend_tiers").select("id, name, cadence, rule").order("sort_order")),
      latestHerbTrend(),
      latestBeautyTrends(),
    ]);
    if (!seasons.length || !herbs.length) throw new Error("seasons/herbs 테이블이 비어 있어요. supabase/seed.sql 을 실행해 주세요.");

    return {
      SEASONS: toSeasons(seasons, issues),
      HERBS: herbs.map(toHerb),
      DESIGN: toDesign(herbs),
      HERB_TREND: herbTrend,
      BEAUTY_TRENDS: beauty,
      TREND_SOURCES: sources,
      TREND_TIERS: Object.fromEntries(tiers.map(({ id, ...t }) => [id, t])),
      source: "supabase", note: "",
    };
  } catch (e) {
    console.error("[supabase] 데이터를 불러오지 못해 기본 데이터를 써요:", e);
    return fallbackData("DB 조회 실패 · 기본 데이터 표시");
  }
}

/** '새로고침' 버튼: 가장 최근 뷰티 트렌드 수집본을 다시 읽어요. */
export async function fetchLatestBeautyTrends() {
  if (!hasSupabase) throw new Error("Supabase 미연결");
  return latestBeautyTrends();
}
