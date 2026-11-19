import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** .env 에 URL과 anon 키가 모두 있을 때만 Supabase를 써요. */
export const hasSupabase = Boolean(url && anonKey);

export const supabase = hasSupabase
  ? createClient(url, anonKey, {
      // 로그인 상태를 브라우저에 저장하고, 카카오 로그인 후 돌아온 주소의 인증 코드를 자동으로 처리해요.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    })
  : null;
