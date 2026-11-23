/* Gemini 대화 호출 (서버 전용). Vercel 함수(api/chat.js)와 개발 서버(vite.config.js)가 같이 써요.
   API 키는 브라우저로 절대 보내지 않아요. */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemini-3.8-flash"; // 바꾸려면 환경변수 GEMINI_MODEL 을 넣어요
const FALLBACK_MODELS = ["gemini-3.5-flash"];   // 기본 모델이 붐빌 때 대신 쓸 모델

const MAX_MESSAGES = 20;        // 최근 대화만 보내요
const MAX_MESSAGE_CHARS = 4000; // 메시지 하나 최대 길이
const MAX_CONTEXT_CHARS = 4000; // 화면 정보 최대 길이
const REQUEST_TIMEOUT_MS = 90000;  // Gemini 한 번 호출 최대 대기 시간
const TOTAL_TIMEOUT_MS = 110000;   // 다시 시도까지 합친 최대 시간 (vercel.json 의 maxDuration 보다 짧게)

const SYSTEM_PROMPT = `너는 한방 화장품 상품기획 도우미 'HerbHub'야.
- 기획자가 계절별 기초라인(토너·세럼·크림·로션·미스트) 출시 후보를 고르고, 추천 이유를 이해하고, 팀 회의에 제안하도록 도와.
- 한국어 존댓말로, 짧은 문단과 목록으로 답해.
- 화면 정보(현재 계절, 후보 순위)가 주어지면 그 내용을 근거로 답하고, 화면에 없는 사실은 추측이라고 밝혀.
- 점수와 순위는 화면의 계산 코드가 정한 값이야. 네가 점수를 새로 만들거나 바꾸지 마.
- 화장품 광고 규정을 지켜: 치료·염증 완화·재생 같은 의약품식 효능 표현은 쓰지 말고, 원료 안전·기능성·광고 표현 판단은 담당자 확인이 필요하다고 안내해.`;

export class ChatError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function clean(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new ChatError("메시지가 없어요.");
  const list = messages.slice(-MAX_MESSAGES).map(m => {
    const role = m?.role === "assistant" ? "model" : m?.role === "user" ? "user" : null;
    const text = typeof m?.content === "string" ? m.content.trim() : "";
    if (!role || !text) throw new ChatError("메시지 형식이 맞지 않아요.");
    if (text.length > MAX_MESSAGE_CHARS) throw new ChatError(`메시지는 ${MAX_MESSAGE_CHARS}자까지 보낼 수 있어요.`);
    return { role, parts: [{ text }] };
  });
  while (list.length && list[0].role !== "user") list.shift(); // Gemini는 user 로 시작해야 해요
  if (!list.length || list[list.length - 1].role !== "user") throw new ChatError("마지막 메시지는 사용자 메시지여야 해요.");
  return list;
}

/**
 * @param {{ messages: {role:'user'|'assistant', content:string}[], context?: string }} body
 * @param {{ apiKey?: string, model?: string }} env
 * @returns {Promise<{ reply: string, model: string }>}
 */
export async function chatWithGemini(body, { apiKey, model } = {}) {
  if (!apiKey) throw new ChatError("서버에 GEMINI_API_KEY 가 설정되지 않았어요.", 500);
  const contents = clean(body?.messages);
  const context = typeof body?.context === "string" ? body.context.slice(0, MAX_CONTEXT_CHARS) : "";
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: context ? `${SYSTEM_PROMPT}\n\n[지금 화면 정보]\n${context}` : SYSTEM_PROMPT }] },
    contents,
    // 대화용이라 깊게 생각하지 않게 해서(low) 응답을 빠르게 받아요.
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low" } },
  });

  // 모델이 일시적으로 붐비면(503) 한 번 더 시도하고, 그래도 안 되면 다른 Flash 모델로 바꿔 시도해요.
  const primary = model || DEFAULT_MODEL;
  const tries = [primary, primary, ...FALLBACK_MODELS.filter(m => m !== primary)];
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let res, data, useModel;
  for (let i = 0; i < tries.length; i++) {
    useModel = tries[i];
    const left = deadline - Date.now();
    if (left < 3000) break;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(useModel)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: payload,
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, left)),
      });
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new ChatError("AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.", 504);
      throw e;
    }
    data = await res.json().catch(() => null);
    if (res.status !== 503) break;
    console.warn("[gemini] 503", useModel, "→ 다시 시도");
    if (i < tries.length - 1) await new Promise(r => setTimeout(r, 800));
  }
  if (!res) throw new ChatError("AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.", 504);
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    console.error("[gemini]", res.status, msg);
    const busy = res.status === 429 || res.status === 503;
    throw new ChatError(busy ? "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요." : `AI 응답을 받지 못했어요. (${msg})`, busy ? 503 : 502);
  }
  const cand = data?.candidates?.[0];
  const reply = (cand?.content?.parts || []).map(p => p.text || "").join("").trim();
  if (!reply) {
    const why = data?.promptFeedback?.blockReason || cand?.finishReason || "빈 응답";
    throw new ChatError(`AI가 답하지 않았어요. (${why})`, 502);
  }
  return { reply, model: useModel };
}
