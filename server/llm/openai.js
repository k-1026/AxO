/* OpenAI 이미지 편집 호출 (서버 전용). API 키는 브라우저로 절대 보내지 않아요. */
import { LlmError } from "./gemini.js";

const ENDPOINT = "https://api.openai.com/v1/images/edits";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2"; // 바꾸려면 환경변수 OPENAI_IMAGE_MODEL 을 넣어요
const REQUEST_TIMEOUT_MS = 120000; // 이미지 한 장 편집 최대 대기 시간

/**
 * 에이전트가 주입받아 쓰는 호출 함수 모양이에요.
 * @typedef {(req: { prompt: string, images: { name: string, bytes: Uint8Array }[], size?: string }) => Promise<Uint8Array>} EditImage
 */

/**
 * 참고 이미지들을 바탕으로 새 이미지를 한 장 만들어요. 키·모델은 안 넘기면 환경변수(OPENAI_API_KEY, OPENAI_IMAGE_MODEL)를 써요.
 * @param {{ prompt: string, images: { name: string, bytes: Uint8Array }[], size?: string }} req
 * @param {{ apiKey?: string, model?: string }} [env]
 * @returns {Promise<Uint8Array>}
 */
export async function editImage({ prompt, images, size = "1024x1024" }, { apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_IMAGE_MODEL } = {}) {
  if (!apiKey) throw new LlmError("서버에 OPENAI_API_KEY 가 설정되지 않았어요.", 500);
  const form = new FormData();
  form.append("model", model || DEFAULT_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", "1");
  for (const img of images) form.append("image[]", new Blob([img.bytes], { type: "image/png" }), img.name);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new LlmError("이미지 만들기가 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.", 504);
    throw new LlmError(`이미지 서버에 연결하지 못했어요. (${e?.message || "연결 오류"})`, 502);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || "오류";
    console.error("[openai]", res.status, msg);
    throw new LlmError(`이미지 응답을 받지 못했어요. (HTTP ${res.status}: ${msg})`, res.status === 429 ? 503 : 502);
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new LlmError("이미지 데이터가 비어 있어요.", 502);
  return new Uint8Array(Buffer.from(b64, "base64"));
}
