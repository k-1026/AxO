/* Vercel 서버 함수: POST /api/plan  →  기획안 만들기 (로그인 토큰 필요)
   Vercel → Settings → Environment Variables 에 GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY 를 넣어 주세요. */
import { toVercel } from "../server/http.js";
import plan from "../server/routes/plan.js";

export default toVercel(plan);
