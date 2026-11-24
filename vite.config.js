import { defineConfig, loadEnv } from "vite";
import { toVite } from "./server/http.js";
import plan from "./server/routes/plan.js";
import planImage from "./server/routes/plan-image.js";
import planGet from "./server/routes/plan-get.js";
import planEdit from "./server/routes/plan-edit.js";

// npm run dev 에서도 /api/* 가 동작하도록, Vercel 함수와 같은 코드를 개발 서버에 붙여요.
// .env 의 키(GEMINI_API_KEY 등)는 여기(서버)에서만 읽고 브라우저로 보내지 않아요.

// 경로 → 처리 함수 표. 새 API 는 여기와 api/*.js 에 같이 등록해요.
const routes = env => ({
  "/api/plan": toVite(plan, env),
  "/api/plan-image": toVite(planImage, env),
  "/api/plan-get": toVite(planGet, env),
  "/api/plan-edit/preview": toVite(planEdit.preview, env),
  "/api/plan-edit/apply": toVite(planEdit.apply, env),
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
  // 개인정보 처리방침(privacy.html)도 함께 빌드해요 → /privacy 로 열려요 (vercel.json cleanUrls)
  build: { rollupOptions: { input: { main: "index.html", privacy: "privacy.html" } } },
}));
