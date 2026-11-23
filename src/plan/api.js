/* 기획안 API 호출: 로그인 토큰을 붙여 보내고, 오류는 읽기 쉬운 문구로 바꿔요. */
import { supabase, hasSupabase } from "../lib/supabase.js";
import { openAuthDialog } from "../auth/auth.js";

export class AuthRequired extends Error {
  constructor() { super("로그인이 필요해요."); this.name = "AuthRequired"; }
}

const PRICING_MSG = "이용 가능한 횟수를 모두 썼어요. 요금제 화면에서 이용권이나 월 구독을 확인해 주세요.";

/* 요청 전에 로그인 여부만 확인해요. 로그인이 안 돼 있으면 로그인 창을 열고 AuthRequired를 던져요. */
export async function getToken() {
  if (!hasSupabase) throw new Error("로그인 기능이 아직 연결되지 않았어요. 관리자에게 문의해 주세요.");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) { openAuthDialog(); throw new AuthRequired(); }
  return token;
}

export async function callApi(path, body) {
  const token = await getToken();
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
