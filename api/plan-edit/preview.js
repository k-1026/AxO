/* Vercel 서버 함수: POST /api/plan-edit/preview  →  수정 요청에 대한 답과 바꿀 내용 미리보기 (저장 안 함, 로그인 토큰 필요) */
import { toVercel } from "../../server/http.js";
import planEdit from "../../server/routes/plan-edit.js";

export default toVercel(planEdit.preview);
