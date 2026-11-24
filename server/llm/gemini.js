/* Gemini 호출 (서버 전용). 기획 에이전트들이 generateJson 으로 JSON 답을 받아요.
   API 키는 브라우저로 절대 보내지 않아요. */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemini-3.8-flash"; // 바꾸려면 환경변수 GEMINI_MODEL 을 넣어요
const FALLBACK_MODELS = ["gemini-3.5-flash"];   // 기본 모델이 붐빌 때 대신 쓸 모델

const REQUEST_TIMEOUT_MS = 90000;  // Gemini 한 번 호출 기본 최대 대기 시간
const JSON_REQUEST_TIMEOUT_MS = 60000; // 기획 에이전트: 한 번 호출 최대 대기 시간
const TOTAL_TIMEOUT_MS = 110000;   // 다시 시도까지 합친 최대 시간 (vercel.json 의 maxDuration 보다 짧게)

/** 에이전트용 AI 호출(Gemini·OpenAI)이 실패했을 때 던지는 오류예요. status 는 화면에 돌려줄 HTTP 상태예요. */
export class LlmError extends Error {
  constructor(message, status = 502) { super(message); this.name = "LlmError"; this.status = status; }
}

/** JSON 호출이 쓰는 호출부예요: 붐빌 때(503) 한 번 더 시도하고, 그래도 안 되면 다른 모델로 바꿔요.
 *  ErrorClass 는 던질 오류 종류예요(LlmError). */
async function callGemini(payload, apiKey, model, ErrorClass, { requestTimeoutMs = REQUEST_TIMEOUT_MS, totalTimeoutMs = TOTAL_TIMEOUT_MS } = {}) {
  const primary = model || DEFAULT_MODEL;
  const tries = [primary, primary, ...FALLBACK_MODELS.filter(m => m !== primary)];
  const deadline = Date.now() + totalTimeoutMs;
  const timeoutError = () => new ErrorClass("AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.", 504);
  let res, data, useModel;
  for (let i = 0; i < tries.length; i++) {
    useModel = tries[i];
    const left = deadline - Date.now();
    if (left < 3000) break;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(useModel)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: payload,
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, left)),
      });
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") throw timeoutError();
      if (ErrorClass === LlmError) throw new LlmError(`AI에 연결하지 못했어요. (${e?.message || "연결 오류"})`, 502);
      throw e;
    }
    data = await res.json().catch(() => null);
    if (res.status !== 503) break;
    console.warn("[gemini] 503", useModel, "→ 다시 시도");
    if (i < tries.length - 1) await new Promise(r => setTimeout(r, 800));
  }
  if (!res) throw timeoutError();
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    console.error("[gemini]", res.status, msg);
    const busy = res.status === 429 || res.status === 503;
    throw new ErrorClass(busy ? "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요." : `AI 응답을 받지 못했어요. (${msg})`, busy ? 503 : 502);
  }
  return { data, model: useModel };
}

/**
 * 에이전트가 주입받아 쓰는 호출 함수 모양이에요.
 * @typedef {(prompt: string, schema: object) => Promise<object>} GenerateJson
 */

/**
 * 프롬프트를 보내 스키마에 맞는 JSON 객체를 받아요. 키·모델은 안 넘기면 환경변수(GEMINI_API_KEY, GEMINI_MODEL)를 써요.
 * @param {string} prompt
 * @param {object} schema Gemini responseSchema
 * @param {{ apiKey?: string, model?: string }} [env]
 * @returns {Promise<object>}
 */
export async function generateJson(prompt, schema, { apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL } = {}) {
  if (!apiKey) throw new LlmError("서버에 GEMINI_API_KEY 가 설정되지 않았어요.", 500);
  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4, thinkingConfig: { thinkingLevel: "low" } },
  });
  const { data } = await callGemini(payload, apiKey, model, LlmError, { requestTimeoutMs: JSON_REQUEST_TIMEOUT_MS });
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || "").join("").trim();
  if (!text) throw new LlmError(`AI가 답하지 않았어요. (${data?.promptFeedback?.blockReason || cand?.finishReason || "빈 응답"})`, 502);
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError("AI 응답을 JSON으로 해석하지 못했어요.", 502);
  }
}
