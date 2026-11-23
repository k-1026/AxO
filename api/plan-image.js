/* Vercel 서버 함수: POST /api/plan-image  →  시나리오 이미지 만들기 (로그인 토큰 필요)
   OPENAI_API_KEY 가 필요해요. 용기 샘플 이미지는 vercel.json 의 includeFiles 로 함께 배포돼요. */
import { toVercel } from "../server/http.js";
import planImage from "../server/routes/plan-image.js";

export default toVercel(planImage);
