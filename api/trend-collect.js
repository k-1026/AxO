/* Vercel 서버 함수: GET /api/trend-collect  →  트렌드 자동 수집 (vercel.json 의 crons 가 매일 한 번 불러요)
   - Vercel Cron 은 Authorization: Bearer {CRON_SECRET} 을 붙여 보내요. 값이 맞을 때만 실행해서, 남이 불러 AI 한도를 쓰지 못하게 해요.
   - 저장은 beauty_trend_snapshots 에 쓰기 권한이 있는 SUPABASE_SERVICE_ROLE_KEY 로만 해요. 이 키는 Vercel 환경변수에만 있고 브라우저로 가지 않아요. */
import { createClient } from "@supabase/supabase-js";
import { generateJson } from "../server/llm/gemini.js";
import { collectTrends } from "../server/trends/collect.js";

const UA = "HerbHub-trend-agent/1.0 (student project)";

export function authorized(req, secret) {
  const h = req?.headers?.authorization ?? req?.headers?.Authorization;
  return typeof secret === "string" && secret.length >= 16 && h === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  const env = process.env;
  if (!authorized(req, env.CRON_SECRET)) return res.status(401).json({ error: "권한이 없어요." });
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GEMINI_API_KEY) return res.status(500).json({ error: "서버 설정(환경변수)이 빠졌어요." });

  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const result = await collectTrends({
      fetchText: async u => {
        const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(15000) });
        return { status: r.status, text: r.ok ? await r.text() : "" };
      },
      generate: (prompt, schema) => generateJson(prompt, schema, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }),
      loadLatest: async () => {
        const { data, error } = await db.from("beauty_trend_snapshots").select("payload").order("updated_at", { ascending: false }).limit(1);
        if (error) throw error;
        return data?.[0]?.payload ?? null;
      },
      save: async payload => {
        const { error } = await db.from("beauty_trend_snapshots").insert({ updated_at: payload.updatedAt, payload });
        if (error) throw error;
      }
    });
    console.log("[trend-collect]", JSON.stringify({ saved: result.saved, picked: result.picked, candidates: result.candidates }));
    return res.status(200).json(result);
  } catch (e) {
    console.error("[trend-collect] 실패", e?.message || e);
    return res.status(500).json({ error: "트렌드 수집에 실패했어요." });
  }
}
