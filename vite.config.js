import { defineConfig } from "vite";

// base "./" : 빌드 결과(dist)를 GitHub Pages 같은 하위 경로에 올려도 동작해요.
export default defineConfig({
  base: "./",
});
