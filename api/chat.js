/* Vercel 서버 함수: POST /api/chat  →  Gemini 응답
   Vercel → Settings → Environment Variables 에 GEMINI_API_KEY (선택: GEMINI_MODEL) 를 넣어 주세요. */
import { chatWithGemini, ChatError } from "../server/llm/gemini.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 로만 요청할 수 있어요." });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const out = await chatWithGemini(body, { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
    return res.status(200).json(out);
  } catch (e) {
    const status = e instanceof ChatError ? e.status : 500;
    if (!(e instanceof ChatError)) console.error("[api/chat]", e);
    return res.status(status).json({ error: e instanceof ChatError ? e.message : "서버 오류가 났어요." });
  }
}
