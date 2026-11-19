#!/usr/bin/env node
/*
 * 한 번만 쓰는 이관 도구: 화면 JS에 하드코딩돼 있던 지식 데이터를 꺼내 beautyagent/site/data/seed/*.json 으로 저장해요.
 * 사용: node beautyagent/site/tools/extract_seed.js <html 파일>
 * 판매 한마디(TALK)처럼 함수였던 것은 {herb} {season} 자리표시가 들어간 문장 틀로 바꿔요.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(process.argv[2], "utf8");
const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
const OUT = path.join(__dirname, "..", "data", "seed");
fs.mkdirSync(OUT, { recursive: true });

/* 선언 하나를 문자열·템플릿까지 고려해 끝(;)까지 잘라요 */
function grab(name) {
  const m = js.match(new RegExp(`\\n(?:const|let) ${name} = `));
  if (!m) throw new Error("없음: " + name);
  let i = m.index + m[0].length, depth = 0; const start = i, stack = [];
  while (i < js.length) {
    const c = js[i];
    if (stack.length && stack[stack.length - 1] !== "{") {           // 문자열 안
      const q = stack[stack.length - 1];
      if (c === "\\") { i += 2; continue; }
      if (q === "`" && c === "$" && js[i + 1] === "{") { stack.push("{"); i += 2; continue; }
      if (c === q) stack.pop();
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { stack.push(c); i++; continue; }
    if (c === "{" || c === "[" || c === "(") { if (stack.length) stack.push("{"); else depth++; }
    else if (c === "}" || c === "]" || c === ")") { if (stack.length) stack.pop(); else depth--; }
    else if (c === ";" && depth === 0 && !stack.length) return js.slice(start, i);
    i++;
  }
  throw new Error("끝 못 찾음: " + name);
}
const ctx = vm.createContext({});
const val = name => vm.runInContext("(" + grab(name) + ")", ctx);

const seed = {
  seasons: { note: "계절 기후 → 피부 고민 → 피부 목적. issues: [기후 이슈, 근거 수치, 피부 고민, 이어지는 피부 목적[]]", data: val("SEASONS") },
  herbs: { note: "원료 후보 12종과 점수 근거 [점수 1~5 또는 null, 근거]", data: val("HERBS") },
  design: { note: "원료별 패키지 색 (main 몸체 · cap 라벨 포인트)", data: val("DESIGN") },
  finish: { note: "피부 목적별 마감 재질", data: val("FINISH") },
  purpose_label: { note: "피부 목적 → 라인 이름", data: val("PURPOSE_LABEL") },
  price_range: { note: "중저가 ml당 정가 범위 (가격 기준표)", data: val("PRICE_RANGE") },
  items: { note: "제품 틀 [용기 종류, 이름, 용량 ml, 정가 원]", data: val("ITEM") },
  line_rule: { note: "피부 목적별 라인 구성 규칙 (first 1차 출시 · next 2차 확장 · extra 별도 1차)", data: val("LINE_RULE") },
  roles: { note: "제품별 역할", data: val("ROLE") },
  combo_why: { note: "목적별 조합 이유", data: val("COMBO_WHY") },
  talk: { note: "셀러 한마디 문장 틀 ({herb} 원료 · {season} 계절)", data: Object.fromEntries(Object.entries(val("TALK")).map(([k, f]) => [k, f("{herb}", "{season}")])) },
  personas: { note: "고객 페르소나 4가지 거부 유형", data: val("PERSONAS") },
  light: { note: "피부 목적별 가벼움 (1~5)", data: val("LIGHT") },
  combo_kw: { note: "상세 화면 조합 키워드", data: val("COMBO_KW") },
  pain_kw: { note: "페르소나 고민 키워드", data: val("PAIN_KW") },
  samples: { note: "청향 로고 2 적용 용기 샘플 사진과 본품 자르기 영역 [x0,y0,x1,y1]", data: { base: val("SAMPLE_BASE"), files: val("SAMPLE"), box: val("PRODUCT_BOX") } },
  season_trend_notes: { note: "실시간 자료가 없을 때 쓰는 계절 기획 가설", data: val("SEASON_TREND_NOTES") },
  trend_sources: { note: "트렌드 에이전트가 확인하는 출처", data: val("TREND_SOURCES") },
  trend_tiers: { note: "출처 3칸 (실시간 신호 · 업계 사례 · 배경 자료)", data: val("TREND_TIERS") }
};
/* beautyComment 안에 박혀 있던 신뢰 출처 도메인 목록 */
const hm = js.match(/const hosts = (\[[^\]]*\]);/);
if (hm) seed.trusted_hosts = { note: "트렌드 근거로 인정하는 기사·자료 도메인", data: JSON.parse(hm[1]) };

for (const [kind, v] of Object.entries(seed)) {
  fs.writeFileSync(path.join(OUT, kind + ".json"), JSON.stringify({ kind, note: v.note, source: "beautyagent/site/public/index.html 하드코딩에서 이관 (2026-11-17)", data: v.data }, null, 2) + "\n");
}
console.log("seed", Object.keys(seed).length, "개 →", path.relative(process.cwd(), OUT));
