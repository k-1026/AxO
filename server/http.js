/* API 공통: 오류 → HTTP 상태 바꾸기, 토큰 꺼내기, Vercel·개발 서버 어댑터.
   route 는 `async (body, ctx) => object` 이고 ctx = {token, env, deps} 예요.
   deps 로 generate·editImage·store·loadData·readSample·now 를 바꿔 끼울 수 있어요(테스트용). */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateJson, editImage, LlmError, DEFAULT_FAST_MODEL } from "./llm/gemini.js";
import { loadServerData } from "./data.js";
import { LimitError } from "./limits.js";
import { ConflictError, NotFoundError } from "./store.js";
import * as realStore from "./store.js";

const SAMPLE_DIR = ["public", "IMAGE", "LOGO", "cheonghyang-logo-02", "application-examples"];

export class HttpError extends Error {
  /* extra 는 응답 본문에 함께 보낼 값이에요 (예: 422 의 고칠 점 목록) */
  constructor(status, message, extra) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.extra = extra;
  }
}

/** Authorization: Bearer 토큰 → 토큰, 없으면 null */
export function bearer(req) {
  const h = req?.headers?.authorization ?? req?.headers?.Authorization;
  const m = typeof h === "string" ? /^Bearer\s+(\S+)$/i.exec(h) : null;
  return m ? m[1] : null;
}

/** 실제 연결(deps 로 일부만 바꿔 끼울 수 있어요) */
export function withDeps(deps = {}, env = {}) {
  return {
    store: realStore,
    /* opts.fast: 단순 작업은 빠른 모델(GEMINI_FAST_MODEL, 없으면 DEFAULT_FAST_MODEL)로 불러요 */
    generate: (prompt, schema, opts) => generateJson(prompt, schema, {
      apiKey: env.GEMINI_API_KEY,
      model: opts?.fast ? (env.GEMINI_FAST_MODEL || DEFAULT_FAST_MODEL) : env.GEMINI_MODEL
    }),
    editImage: req => editImage(req, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_IMAGE_MODEL }),
    loadData: client => loadServerData(client),
    // Vercel 에서도 includeFiles 가 같은 상대 경로를 유지하니 process.cwd() 기준으로 읽어요.
    readSample: async name => new Uint8Array(await readFile(path.join(process.cwd(), ...SAMPLE_DIR, name))),
    now: () => Date.now(),
    ...deps
  };
}

const LLM_MESSAGE = {
  503: "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요.",
  504: "AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.",
  500: "서버 설정에 문제가 있어요. 관리자에게 알려 주세요.",
  502: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요."
};
const LLM_STATUS = new Set([500, 502, 503, 504]);

/** 사용자에게 보여 줘도 되는 오류만 그 상태로, 나머지는 500 일반 문구로 바꿔요 */
export function toHttpError(e) {
  // AI 서버 오류 글에는 상대 서버가 보낸 내용(키 일부 등)이 섞일 수 있어서, 상태별 고정 문구만 보내고 자세한 내용은 로그에만 남겨요.
  if (e instanceof LlmError) {
    console.error("[api] LlmError", e.status, e.message);
    return { status: LLM_STATUS.has(e.status) ? e.status : 502, message: LLM_MESSAGE[e.status] ?? LLM_MESSAGE[502] };
  }
  if (e instanceof HttpError || e instanceof LimitError || e instanceof ConflictError || e instanceof NotFoundError) {
    return { status: e.status, message: e.message, extra: e.extra };
  }
  console.error("[api]", e);
  return { status: 500, message: "서버 오류가 났어요. 잠시 후 다시 시도해 주세요." };
}

/** route 를 실행해 {status, body} 로 돌려줘요 */
export async function runRoute(route, body, ctx) {
  try {
    return { status: 200, body: await route(body, ctx) };
  } catch (e) {
    const { status, message, extra } = toHttpError(e);
    return { status, body: { ...extra, error: message } };
  }
}

const parse = raw => {
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(raw || "{}"); } catch { return null; }
};

/** Vercel 함수 handler 로 감싸요 */
export function toVercel(route) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "POST 로만 요청할 수 있어요." });
    }
    const body = parse(req.body);
    if (body === null) return res.status(400).json({ error: "요청 형식이 맞지 않아요." });
    const { status, body: out } = await runRoute(route, body, { token: bearer(req), env: process.env, deps: withDeps({}, process.env) });
    return res.status(status).json(out);
  };
}

/** vite 개발 서버 미들웨어로 감싸요 */
export function toVite(route, env = process.env) {
  return async (req, res) => {
    const send = (status, obj) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(obj));
    };
    if (req.method !== "POST") return send(405, { error: "POST 로만 요청할 수 있어요." });
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = parse(raw);
    if (body === null) return send(400, { error: "요청 형식이 맞지 않아요." });
    const { status, body: out } = await runRoute(route, body, { token: bearer(req), env, deps: withDeps({}, env) });
    send(status, out);
  };
}
