import { describe, it, expect, vi, afterEach } from "vitest";
import { generateJson, LlmError } from "../server/llm/gemini.js";
import { editImage, DEFAULT_IMAGE_MODEL } from "../server/llm/openai.js";

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

describe("editImage", () => {
  const imgs = [
    { name: "a.png", bytes: new Uint8Array([1, 2, 3]) },
    { name: "b.png", bytes: new Uint8Array([4, 5]) },
  ];

  it("b64_json을 바이트로 풀어 줘요", async () => {
    const out = new Uint8Array([9, 8, 7, 6]);
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ data: [{ b64_json: Buffer.from(out).toString("base64") }] }));
    const res = await editImage({ prompt: "p", images: imgs }, { apiKey: "k", model: "x" });
    expect(res.length).toBe(4);
    expect(Array.from(res)).toEqual([9, 8, 7, 6]);
  });

  it("multipart 본문에 image[] 두 개와 필드를 담아요", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ data: [{ b64_json: "AA==" }] }));
    await editImage({ prompt: "p", images: imgs }, { apiKey: "k", model: "x" });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.getAll("image[]")).toHaveLength(2);
    expect(init.body.get("model")).toBe("x");
    expect(init.body.get("prompt")).toBe("p");
    expect(init.body.get("size")).toBe("1024x1024");
    expect(init.body.get("n")).toBe("1");
    expect(init.body.has("response_format")).toBe(false);
  });

  it("모델 기본값은 환경변수, 없으면 DEFAULT_IMAGE_MODEL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ data: [{ b64_json: "AA==" }] }));
    vi.stubEnv("OPENAI_API_KEY", "ek");
    vi.stubEnv("OPENAI_IMAGE_MODEL", "");
    await editImage({ prompt: "p", images: imgs });
    expect(globalThis.fetch.mock.calls[0][1].body.get("model")).toBe(DEFAULT_IMAGE_MODEL);
    vi.stubEnv("OPENAI_IMAGE_MODEL", "custom");
    await editImage({ prompt: "p", images: imgs });
    expect(globalThis.fetch.mock.calls[1][1].body.get("model")).toBe("custom");
  });

  it("HTTP 400이면 상태가 담긴 LlmError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ error: { message: "bad" } }, 400));
    const err = await editImage({ prompt: "p", images: imgs }, { apiKey: "k" }).catch(e => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.message).toContain("400");
  });

  it("키가 없으면 LlmError", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(editImage({ prompt: "p", images: imgs })).rejects.toBeInstanceOf(LlmError);
  });

  it("이미지 데이터가 없으면 LlmError(502)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ data: [] }));
    await expect(editImage({ prompt: "p", images: imgs }, { apiKey: "k" })).rejects.toMatchObject({ status: 502 });
  });
});
