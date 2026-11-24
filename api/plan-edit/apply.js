/* Vercel 서버 함수: POST /api/plan-edit/apply  →  미리보기로 본 수정을 검증하고 새 버전으로 저장 (로그인 토큰 필요) */
import { toVercel } from "../../server/http.js";
import planEdit from "../../server/routes/plan-edit.js";

export default toVercel(planEdit.apply);
