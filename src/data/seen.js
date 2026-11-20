/* 재추천: 같은 사용자에게 이미 보여 준 후보 라인을 기억해요.
   로그인했으면 Supabase recommendation_history 테이블에, 아니면 이 브라우저(localStorage)에 저장해요.
   Supabase 테이블이 아직 없거나 저장에 실패하면 브라우저 저장으로 대신해요. */
import { supabase, hasSupabase } from "../lib/supabase.js";

const LOCAL_KEY = "seen-lines-v1";

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {}; } catch (_) { return {}; }
}
function writeLocal(all) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); } catch (_) { /* 저장 불가 브라우저: 이번 방문 동안만 기억 */ }
}

async function currentUserId() {
  if (!hasSupabase) return null;
  try { const { data } = await supabase.auth.getSession(); return data.session?.user?.id ?? null; } catch (_) { return null; }
}

/** 계절별로 이미 보여 준 라인 키(원료|목적) 목록: { 봄: Set, 여름: Set, … } */
export async function loadSeen() {
  const uid = await currentUserId();
  if (uid) {
    const { data, error } = await supabase.from("recommendation_history").select("season, line_key");
    if (!error) {
      const out = {};
      data.forEach(r => (out[r.season] ||= new Set()).add(r.line_key));
      return out;
    }
  }
  return Object.fromEntries(Object.entries(readLocal()).map(([k, v]) => [k, new Set(v)]));
}

/** 방금 보여 준 라인 키를 기록해요. */
export async function addSeen(season, keys) {
  if (!keys.length) return;
  const uid = await currentUserId();
  if (uid) {
    const { error } = await supabase.from("recommendation_history")
      .upsert(keys.map(line_key => ({ user_id: uid, season, line_key })), { onConflict: "user_id,season,line_key", ignoreDuplicates: true });
    if (!error) return;
  }
  const all = readLocal();
  all[season] = [...new Set([...(all[season] || []), ...keys])];
  writeLocal(all);
}
