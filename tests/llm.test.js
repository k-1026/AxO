import { describe, it, expect, vi, afterEach } from "vitest";
import { generateJson, editImage, DEFAULT_IMAGE_MODEL, LlmError } from "../server/llm/gemini.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const geminiText = text => jsonRes({ candidates: [{ content: { parts: [{ text }] } }] });

describe("generateJson", () => {
  it("응답 텍스트를 JSON 객체로 풀어 줘요", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(geminiText('{"a":1}'));
    const schema = { type: "OBJECT", properties: { a: { type: "INTEGER" } } };
    expect(await generateJson("프롬프트", schema, { apiKey: "k", model: "m" })).toEqual({ a: 1 });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/m:generateContent");
    const body = JSON.parse(init.body);
    expect(body.generationConfig).toEqual({
      responseMimeType: "application/json", responseSchema: schema, temperature: 0.4, thinkingConfig: { thinkingLevel: "low" },
    });
    expect(body.contents[0].parts[0].text).toBe("프롬프트");
  });

  it("JSON이 아닌 텍스트는 LlmError(502)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(geminiText("json 아님"));
    await expect(generateJson("p", {}, { apiKey: "k" })).rejects.toMatchObject({ name: "LlmError", status: 502 });
  });

  it("키가 없으면 LlmError", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    globalThis.fetch = vi.fn();
    await expect(generateJson("p", {})).rejects.toBeInstanceOf(LlmError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("키와 모델을 환경변수에서 읽어요", async () => {
    vi.stubEnv("GEMINI_API_KEY", "env-key");
    vi.stubEnv("GEMINI_MODEL", "env-model");
    globalThis.fetch = vi.fn().mockResolvedValue(geminiText("{}"));
    await generateJson("p", {});
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/env-model:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("env-key");
  });

  it("연결이 실패하면 LlmError(502)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(generateJson("p", {}, { apiKey: "k" })).rejects.toMatchObject({ name: "LlmError", status: 502 });
  });

  it("503이면 다시 시도해요", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonRes({ error: { message: "busy" } }, 503))
      .mockResolvedValueOnce(geminiText('{"ok":true}'));
    const p = generateJson("p", {}, { apiKey: "k", model: "m" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("editImage (Gemini 이미지)", () => {
  const imgs = [
    { name: "a.png", bytes: new Uint8Array([1, 2, 3]) },
    { name: "b.png", bytes: new Uint8Array([4, 5]) },
  ];
  const imageRes = b64 => jsonRes({ candidates: [{ content: { parts: [{ text: "설명" }, { inlineData: { mimeType: "image/png", data: b64 } }] } }] });

  it("inlineData 를 바이트로 풀어 줘요", async () => {
    const out = new Uint8Array([9, 8, 7, 6]);
    globalThis.fetch = vi.fn().mockResolvedValue(imageRes(Buffer.from(out).toString("base64")));
    const res = await editImage({ prompt: "p", images: imgs }, { apiKey: "k", model: "x" });
    expect(Array.from(res)).toEqual([9, 8, 7, 6]);
  });

  it("참고 이미지 두 장과 지시문을 한 요청에 담고, 이미지로만 답하게 해요", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(imageRes("AA=="));
    await editImage({ prompt: "p", images: imgs }, { apiKey: "k", model: "x" });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/x:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(init.body);
    const parts = body.contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[0].inlineData).toEqual({ mimeType: "image/png", data: Buffer.from([1, 2, 3]).toString("base64") });
    expect(parts[2].text).toBe("p");
    expect(body.generationConfig).toEqual({ responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } });
  });

  it("모델 기본값은 환경변수, 없으면 DEFAULT_IMAGE_MODEL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(imageRes("AA=="));
    vi.stubEnv("GEMINI_API_KEY", "ek");
    vi.stubEnv("GEMINI_IMAGE_MODEL", "");
    await editImage({ prompt: "p", images: imgs });
    expect(globalThis.fetch.mock.calls[0][0]).toContain(`/${DEFAULT_IMAGE_MODEL}:generateContent`);
    vi.stubEnv("GEMINI_IMAGE_MODEL", "custom");
    await editImage({ prompt: "p", images: imgs });
    expect(globalThis.fetch.mock.calls[1][0]).toContain("/custom:generateContent");
  });

  it("HTTP 400이면 상태가 담긴 LlmError(502)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ error: { message: "bad" } }, 400));
    const err = await editImage({ prompt: "p", images: imgs }, { apiKey: "k" }).catch(e => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(502);
    expect(err.message).toContain("400");
  });

  it("무료 플랜 한도 0(결제 필요)이면 설정 문제 LlmError(500)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ error: { message: "Quota exceeded ... limit: 0, model: x" } }, 429));
    await expect(editImage({ prompt: "p", images: imgs }, { apiKey: "k" })).rejects.toMatchObject({ status: 500 });
  });

  it("일시적인 429는 사용량 많음 LlmError(503)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ error: { message: "Resource exhausted, limit: 10" } }, 429));
    await expect(editImage({ prompt: "p", images: imgs }, { apiKey: "k" })).rejects.toMatchObject({ status: 503 });
  });

  it("키가 없으면 LlmError", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(editImage({ prompt: "p", images: imgs })).rejects.toBeInstanceOf(LlmError);
  });

  it("이미지 데이터가 없으면 LlmError(502)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(geminiText("그림 없이 글만"));
    await expect(editImage({ prompt: "p", images: imgs }, { apiKey: "k" })).rejects.toMatchObject({ status: 502 });
  });
});
