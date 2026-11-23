import { defineConfig, loadEnv } from "vite";
import { chatWithGemini, ChatError } from "./server/llm/gemini.js";
import { toVite } from "./server/http.js";
import plan from "./server/routes/plan.js";
import planImage from "./server/routes/plan-image.js";

// npm run dev 에서도 /api/* 가 동작하도록, Vercel 함수와 같은 코드를 개발 서버에 붙여요.
// .env 의 키(GEMINI_API_KEY, OPENAI_API_KEY 등)는 여기(서버)에서만 읽고 브라우저로 보내지 않아요.

// /api/chat 은 예전 방식 그대로 둬요 (새 화면으로 옮길 때 정리해요).
const chatRoute = env => async (req, res) => {
  const send = (status, obj) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "POST 로만 요청할 수 있어요." });
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    send(200, await chatWithGemini(JSON.parse(raw || "{}"), { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }));
  } catch (e) {
    send(e instanceof ChatError ? e.status : 500, { error: e instanceof ChatError ? e.message : "서버 오류가 났어요." });
  }
};

// 경로 → 처리 함수 표. 새 API 는 여기와 api/*.js 에 같이 등록해요.
const routes = env => ({
  "/api/chat": chatRoute(env),
  "/api/plan": toVite(plan, env),
  "/api/plan-image": toVite(planImage, env),
});

function devApi(env) {
  // 저장소(store.js)가 process.env 의 SUPABASE_* 를 읽어서, .env 값을 비어 있는 곳에만 채워 줘요.
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  return {
    name: "dev-api",
    configureServer(server) {
      for (const [path, handler] of Object.entries(routes(process.env))) server.middlewares.use(path, handler);
    },
  };
}

// base "./" : 빌드 결과(dist)를 GitHub Pages 같은 하위 경로에 올려도 동작해요.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [devApi(loadEnv(mode, process.cwd(), ""))],
}));
