/* Vercel 서버 함수: POST /api/plan-get  →  내 기획안 목록 또는 기획안 한 건 보기 (로그인 토큰 필요) */
import { toVercel } from "../server/http.js";
import planGet from "../server/routes/plan-get.js";

export default toVercel(planGet);
