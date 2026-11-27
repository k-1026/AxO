/* 단순 작업(자료 정리)만 빠른 모델로 불러요 (HSJ 결정 2026-11-27) */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { withDeps } from "../server/http.js";
import { DEFAULT_FAST_MODEL, DEFAULT_MODEL } from "../server/llm/gemini.js";
import { runPlanPipeline } from "../server/orchestrator.js";
import { RESEARCH_SCHEMA } from "../server/agents/research.js";

const answer = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "{\"a\":1}" }] } }] }) });
const calledModel = f => decodeURIComponent(/models\/([^:]+):/.exec(f.mock.calls[0][0])[1]);

afterEach(() => vi.unstubAllGlobals());

describe("빠른 모델 고르기", () => {
  it("fast 를 붙이면 기본값은 DEFAULT_FAST_MODEL", async () => {
    const f = vi.fn(async () => answer());
    vi.stubGlobal("fetch", f);
    await withDeps({}, { GEMINI_API_KEY: "k" }).generate("p", {}, { fast: true });
    expect(calledModel(f)).toBe(DEFAULT_FAST_MODEL);
  });
  it("GEMINI_FAST_MODEL 환경변수가 있으면 그걸 써요", async () => {
    const f = vi.fn(async () => answer());
    vi.stubGlobal("fetch", f);
    await withDeps({}, { GEMINI_API_KEY: "k", GEMINI_FAST_MODEL: "my-fast" }).generate("p", {}, { fast: true });
    expect(calledModel(f)).toBe("my-fast");
  });
  it("fast 가 없으면 기본 모델 그대로", async () => {
    const f = vi.fn(async () => answer());
    vi.stubGlobal("fetch", f);
    await withDeps({}, { GEMINI_API_KEY: "k" }).generate("p", {});
    expect(calledModel(f)).toBe(DEFAULT_MODEL);
  });
});

describe("기획안 만들기에서 fast 는 자료 정리에만", () => {
  it("RESEARCH 만 fast", async () => {
    const seen = [];
    const generate = async (_p, schema, opts) => {
      seen.push([schema === RESEARCH_SCHEMA, !!opts?.fast]);
      if (schema === RESEARCH_SCHEMA) return { notes: ["메모"] };
      if (schema.properties?.approved) return { approved: true, issues: [] };
      if (schema.properties?.designs) return { designs: [{ title: "a", description: "b", image_prompt: "c" }, { title: "d", description: "e", image_prompt: "f" }] };
      return { concept_name: "어성초 산뜻 토너", concept: "번들거림 정돈", target: "20대", key_claims: ["산지 확인", "가벼운 마무리", "수시 사용"], product_roles: [{ name: "토너", role: "결 정돈" }], cautions: [] };
    };
    await runPlanPipeline({ data: fallback, season: "여름", herb: "어성초", purpose: "모공·피지", now: Date.parse("2026-11-23T00:00:00+09:00"), generate });
    expect(seen.length).toBeGreaterThanOrEqual(4);
    for (const [isResearch, fast] of seen) expect(fast).toBe(isResearch);
  });
});
