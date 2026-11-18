#!/usr/bin/env node
/*
 * 한 번만 쓰는 이관 도구: 화면 JS의 하드코딩 데이터 선언을 지우고 `let 이름;` 으로 바꿔요.
 * 값은 시작할 때 /api/knowledge (DB 최신 버전)에서 채워요.
 * 사용: node beautyagent/site/tools/strip_hardcoded.js beautyagent/site/public/index.html
 */
const fs = require("fs");
const file = process.argv[2];
let html = fs.readFileSync(file, "utf8");

function declEnd(src, from) {
  let i = from, depth = 0; const stack = [];
  while (i < src.length) {
    const c = src[i];
    if (stack.length && stack[stack.length - 1] !== "{") {
      const q = stack[stack.length - 1];
      if (c === "\\") { i += 2; continue; }
      if (q === "`" && c === "$" && src[i + 1] === "{") { stack.push("{"); i += 2; continue; }
      if (c === q) stack.pop();
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { stack.push(c); i++; continue; }
    if ("{[(".includes(c)) { if (stack.length) stack.push("{"); else depth++; }
    else if ("}])".includes(c)) { if (stack.length) stack.pop(); else depth--; }
    else if (c === ";" && depth === 0 && !stack.length) return i;
    i++;
  }
  throw new Error("끝 못 찾음");
}
const NAMES = ["SEASONS", "HERBS", "DESIGN", "FINISH", "PURPOSE_LABEL", "PRICE_RANGE", "ITEM", "LINE_RULE", "ROLE", "COMBO_WHY", "TALK",
  "PERSONAS", "LIGHT", "COMBO_KW", "PAIN_KW", "SAMPLE_BASE", "SAMPLE", "PRODUCT_BOX", "SEASON_TREND_NOTES", "BEAUTY_TRENDS", "TREND_SOURCES", "TREND_TIERS"];
for (const n of NAMES) {
  const m = html.match(new RegExp(`\\n(const|let) ${n} = `));
  if (!m) throw new Error("없음: " + n);
  const start = m.index + 1, end = declEnd(html, m.index + m[0].length);
  html = html.slice(0, start) + `let ${n}; /* 지식 DB에서 채움 (kind: ${n.toLowerCase()}) */` + html.slice(end + 1);
}
fs.writeFileSync(file, html);
console.log("지운 선언", NAMES.length, "개");
