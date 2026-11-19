import { defineConfig, loadEnv } from "vite";
import { chatWithGemini, ChatError } from "./server/gemini.js";

// npm run dev 에서도 /api/chat 이 동작하도록, Vercel 함수와 같은 코드를 개발 서버에 붙여요.
// .env 의 GEMINI_API_KEY 는 여기(서버)에서만 읽고 브라우저로 보내지 않아요.
function devChatApi(env) {
  return {
    name: "dev-chat-api",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req, res) => {
        const send = (status, obj) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); };
        if (req.method !== "POST") return send(405, { error: "POST 로만 요청할 수 있어요." });
        let raw = "";
        for await (const chunk of req) raw += chunk;
        try {
          send(200, await chatWithGemini(JSON.parse(raw || "{}"), { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }));
        } catch (e) {
          send(e instanceof ChatError ? e.status : 500, { error: e instanceof ChatError ? e.message : "서버 오류가 났어요." });
        }
      });
    },
  };
}

// base "./" : 빌드 결과(dist)를 GitHub Pages 같은 하위 경로에 올려도 동작해요.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [devChatApi(loadEnv(mode, process.cwd(), ""))],
}));
