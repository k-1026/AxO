/* 기획안 API 호출: 로그인 토큰을 붙여 보내고, 오류는 읽기 쉬운 문구로 바꿔요. */
import { supabase, hasSupabase } from "../lib/supabase.js";
import { openAuthDialog } from "../auth/auth.js";

export class AuthRequired extends Error {
  constructor() { super("로그인이 필요해요."); this.name = "AuthRequired"; }
}

const PRICING_MSG = "이용 가능한 횟수를 모두 썼어요. 요금제 화면에서 이용권이나 월 구독을 확인해 주세요.";

export async function callApi(path, body) {
  const token = hasSupabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
  if (!token) { openAuthDialog(); throw new AuthRequired(); }
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch { throw new Error("네트워크 연결을 확인해 주세요."); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { openAuthDialog(); throw new AuthRequired(); }
  if (res.status === 402) throw new Error(PRICING_MSG);
  if (!res.ok) throw new Error(data.error || "잠시 후 다시 시도해 주세요.");
  return data;
}
