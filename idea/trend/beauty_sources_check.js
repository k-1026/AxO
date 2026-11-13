#!/usr/bin/env node
/*
 * 글로벌 뷰티 트렌드 출처 확인 (서브 에이전트 1단계)
 *
 * 하는 일: idea/trend/sources.json 에 등록된 출처를 하나씩 열어 보고
 *         열리는지(checked) / 막혔는지(unavailable)를 beauty_trends.json 의 sourceChecks 에 기록해요.
 *         내용 요약(items)과 기획 방향(insights)은 서브 에이전트가 지시문(글로벌트렌드_에이전트_지시문.md)대로 채워요.
 *
 * 실행:  node idea/trend/beauty_sources_check.js            (beauty_trends.json 갱신)
 *        node idea/trend/beauty_sources_check.js --dry-run  (파일은 그대로, 결과만 출력)
 *        node idea/trend/beauty_sources_check.js --out <경로> (다른 파일에 저장)
 *
 * 규칙: 공개 페이지에 한 번만 요청하고, 로그인·유료·차단(401/403/429 등)은 상태만 기록하고 우회하지 않아요.
 *       allowedHosts 밖으로 넘어가는 주소는 기록만 하고 따라가지 않아요.
 */
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const SOURCES = JSON.parse(fs.readFileSync(path.join(DIR, "sources.json"), "utf8"));
const DATA_PATH = path.join(DIR, "beauty_trends.json");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : DATA_PATH;

async function check(src) {
  const checkedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const base = { id: src.id, source: src.name, url: src.url, checkedAt };
  try {
    const res = await fetch(src.url, {
      redirect: "manual",
      headers: { "User-Agent": "AxO-trend-check/1.0 (student research)", "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(20000)
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") || "";
      const host = (() => { try { return new URL(loc, src.url).hostname; } catch { return ""; } })();
      if (!src.allowedHosts.includes(host)) return { ...base, status: "unavailable", http: res.status, note: `허용 목록 밖(${host || "알 수 없음"})으로 이동해 따라가지 않음` };
      return { ...base, status: "checked", http: res.status, note: `허용된 주소로 이동 (${host})` };
    }
    if (res.ok) {
      const type = res.headers.get("content-type") || "";
      return { ...base, status: "checked", http: res.status, note: type.includes("pdf") ? "PDF 보고서 열림" : "공개 페이지 열림" };
    }
    const why = res.status === 401 || res.status === 402 ? "로그인·유료" : res.status === 403 || res.status === 429 ? "자동 접근 차단" : "열리지 않음";
    return { ...base, status: "unavailable", http: res.status, note: `${why} → 내용 판단에서 제외, 우회하지 않음` };
  } catch (e) {
    return { ...base, status: "unavailable", http: null, note: `연결 실패 (${e.name === "TimeoutError" ? "20초 초과" : e.message}) → 내용 판단에서 제외` };
  }
}

async function main() {
  const results = [];
  for (const src of SOURCES.sources) {
    const r = await check(src);
    results.push(r);
    console.log(`${r.status === "checked" ? "✅" : "⛔"} ${r.source} · ${r.http ?? "-"} · ${r.note}`);
  }
  if (dry) return;
  const data = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) : { version: 1, items: [], insights: {} };
  const others = (data.sourceChecks || []).filter(c => !results.some(r => r.source === c.source || r.url === c.url));
  data.sourceChecks = [...results, ...others];
  data.updatedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(`저장: ${path.relative(process.cwd(), OUT)} (출처 ${results.length}곳 · 열림 ${results.filter(r => r.status === "checked").length}곳)`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
