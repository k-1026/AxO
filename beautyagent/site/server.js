#!/usr/bin/env node
/*
 * 청향 출시 기획실 · 자체 사이트 서버 (MEJ)
 *
 * 하는 일
 *  1) 출시 기획 화면(beautyagent/site/public/index.html)과 용기 샘플 사진(IMAGE/)을 보여 줘요.
 *  2) 트렌드 수집기를 서버 안에서 쉬지 않고 돌려요.
 *     - Google 뉴스 RSS (키 필요 없음): 약재 12종 + 일반 뷰티 검색어를 차례로 돌며 몇 초마다 1건씩 요청
 *     - 네이버 뉴스 검색 API (키가 있을 때만)
 *     - 네이버 데이터랩 검색어 트렌드 (키가 있을 때만, 하루 호출 한도 때문에 15분마다)
 *  3) 새로 모은 자료는 바로 파일에 쌓고(idea/trend/live/), 브라우저에는 SSE로 바로 밀어 줘요.
 *
 * 실행: node beautyagent/site/server.js            → http://localhost:8790
 *      키는 beautyagent/site/.env 에만 넣어요 (커밋 안 됨). 예시는 beautyagent/site/.env.example
 * 사용하는 것: Node 기본 모듈만 (설치 필요 없음)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

/* 저장소 맨 위 폴더 (IMAGE/ 와 idea/ 가 있는 곳)를 찾아요. beautyagent/site/ 폴더가 어디에 있든(예: beautyagent/site) 같은 데이터를 써요. */
const ROOT = (() => { let d = __dirname; for (let i = 0; i < 5; i++) { if (fs.existsSync(path.join(d, "IMAGE")) && fs.existsSync(path.join(d, "idea"))) return d; d = path.dirname(d); } return path.resolve(__dirname, ".."); })();
const PUB = path.join(__dirname, "public");
const TREND_DIR = path.join(ROOT, "idea", "trend");
const LIVE_DIR = path.join(TREND_DIR, "live");
fs.mkdirSync(LIVE_DIR, { recursive: true });

/* ── 설정 (.env → 환경 변수) ── */
(function loadEnv() {
  const f = path.join(__dirname, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
})();
const PORT = +process.env.PORT || 8790;
const HOST = process.env.HOST || "127.0.0.1";
const NEWS_EVERY_SEC = Math.max(2, +process.env.NEWS_EVERY_SEC || 4);       // Google 뉴스 요청 간격 (검색어 1개씩)
const NAVER_NEWS_EVERY_SEC = Math.max(5, +process.env.NAVER_NEWS_EVERY_SEC || 8);
const DATALAB_EVERY_MIN = Math.max(5, +process.env.DATALAB_EVERY_MIN || 15); // 하루 1,000회 한도 안 (3요청 × 96회 = 288회)
const NAVER_ID = process.env.NAVER_CLIENT_ID || "", NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
const HAS_NAVER = !!(NAVER_ID && NAVER_SECRET);

/* ── 무엇을 찾나 ── */
/* 원료·검색어·집계 낱말·점수 구간은 코드에 적지 않고 DB 지식 표(knowledge)의 최신 버전에서 읽어요.
   처음 내용은 beautyagent/site/data/seed/*.json 이고, 에이전트가 POST /api/knowledge 로 새 버전을 쌓으면 다음 요청부터 바로 써요. */
const DB = require("./db");
const SEED_DIR = path.join(__dirname, "data", "seed");
let KB = {}, HERBS = [], QUERIES = [], PURPOSE_WORDS = {}, NEWS_RULE = {}, COSME = null;
function refreshKB() {
  KB = DB.knowledge().data;
  HERBS = (KB.herbs || []).map(h => h.herb);
  QUERIES = [...HERBS.map(h => ({ q: `${h} 화장품`, herb: h })), ...(KB.trend_queries || []).map(q => ({ q, herb: null }))];
  PURPOSE_WORDS = KB.purpose_words || {};
  NEWS_RULE = KB.news_rule || {};
  COSME = new RegExp(NEWS_RULE.cosmeticWords || ".");
}
DB.loadSeeds(SEED_DIR); refreshKB();
const KW_FILE = path.join(TREND_DIR, "keywords.json");
const KW = fs.existsSync(KW_FILE) ? JSON.parse(fs.readFileSync(KW_FILE, "utf8")) : { groups: [] };
const herbKeywords = h => (KW.groups.find(g => g.herb === h) || {}).keywords || [`${h} 토너`, `${h} 크림`, `${h} 화장품`];

/* ── 저장소 ──
 * news.jsonl : 처음 본 기사 한 줄씩 쌓기만 함 (지우지 않음)
 * state.json : 지금 집계 (덮어씀)
 * fetch_log.jsonl : 요청마다 성공/실패 기록 (쌓기만 함)
 * ../trend.json : 데이터랩 판정 (화면의 📈 뜨는 원료가 읽음)
 * ../트렌드스냅샷_YYYY-MM-DD.md : 하루 1개, 10분마다 다시 씀 */
const NEWS_FILE = path.join(LIVE_DIR, "news.jsonl");
const FETCH_LOG = path.join(LIVE_DIR, "fetch_log.jsonl");
const STATE_FILE = path.join(LIVE_DIR, "state.json");
const TREND_JSON = path.join(TREND_DIR, "trend.json");
const items = new Map(); // key → item (최근 35일 캐시, 원본은 DB)
const keyOf = t => t.replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 60);
/* 제목에 약재 이름이 있고 화장품 낱말도 있을 때만 그 약재로 묶어요 ('쑥쑥', '약방의 감초' 같은 말 거르기) */
const tagHerbs = (title, extra) => { const s = new Set(extra || []); const t = title.replace(/쑥쑥/g, "");
  if (COSME.test(t)) HERBS.forEach(h => { if (t.includes(h)) s.add(h); }); return s; };
if (fs.existsSync(NEWS_FILE)) { // 예전 텍스트 기록도 DB로 옮겨요 (이미 있으면 건너뜀)
  for (const line of fs.readFileSync(NEWS_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const it = JSON.parse(line); DB.addArticle({ ...it, key: keyOf(it.title) }); (it.herbs || []).forEach(h => DB.addHerb(it.id, h)); } catch (_) {}
  }
}
for (const r of DB.recentArticles(new Date(Date.now() - 35 * 864e5).toISOString())) {
  items.set(r.key, { id: r.id, title: r.title, source: r.source, url: r.url, publishedAt: r.published_at, collectedAt: r.collected_at, via: r.via, query: r.query,
    herbs: new Set((r.herbs || "").split(",").filter(Boolean)) });
}
const beautyImported = DB.importBeautyHistory();
let datalab = fs.existsSync(TREND_JSON) ? safeJson(fs.readFileSync(TREND_JSON, "utf8")) : null;
function safeJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }
const append = (f, o) => { fs.appendFile(f, JSON.stringify(o) + "\n", () => {}); if (f === FETCH_LOG) DB.addFetch(o); };

const src = {
  googleNews: { name: "Google 뉴스 RSS", grade: "🟡", needsKey: false, fetches: 0, ok: 0, fail: 0, lastAt: null, lastOkAt: null, lastErr: null, lastQuery: null },
  naverNews: { name: "네이버 뉴스 검색 API", grade: "🟡", needsKey: true, enabled: HAS_NAVER, fetches: 0, ok: 0, fail: 0, lastAt: null, lastOkAt: null, lastErr: HAS_NAVER ? null : "키 없음", lastQuery: null },
  datalab: { name: "네이버 데이터랩 검색어 트렌드", grade: "🟢", needsKey: true, enabled: HAS_NAVER, fetches: 0, ok: 0, fail: 0, lastAt: null, lastOkAt: null, lastErr: HAS_NAVER ? null : "키 없음", lastQuery: null }
};
const startedAt = new Date().toISOString();

/* ── 수집기 ── */
const decode = s => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
function addItem(raw, via, q) {
  if (!raw.title || !raw.url) return false;
  const pub = Date.parse(raw.publishedAt);
  if (!Number.isFinite(pub) || Date.now() - pub > 35 * 864e5 || pub > Date.now() + 36e5) return false;
  const k = keyOf(raw.title);
  const old = items.get(k);
  if (old) { if (q.herb && !old.herbs.has(q.herb)) { old.herbs.add(q.herb); DB.addHerb(old.id, q.herb); } return false; }
  const it = { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: raw.title, source: raw.source || "", url: raw.url,
    publishedAt: new Date(pub).toISOString(), collectedAt: new Date().toISOString(), via, query: q.q, herbs: tagHerbs(raw.title, q.herb ? [q.herb] : []) };
  items.set(k, it);
  DB.addArticle({ ...it, key: k }); it.herbs.forEach(h => DB.addHerb(it.id, h));
  append(NEWS_FILE, { ...it, herbs: [...it.herbs] });
  return it;
}
async function getText(url, opts = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (trend-collector)", ...(opts.headers || {}) } });
    const body = await r.text();
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { http: r.status });
    return body;
  } finally { clearTimeout(t); }
}
let gi = 0;
async function tickGoogle() {
  const q = QUERIES[gi++ % QUERIES.length], s = src.googleNews;
  s.fetches++; s.lastAt = new Date().toISOString(); s.lastQuery = q.q;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q.q + " when:30d")}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const xml = await getText(url);
    const added = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const g = tag => { const x = m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? decode(x[1]) : ""; };
      const source = g("source"); let title = g("title");
      if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
      const it = addItem({ title, source, url: g("link"), publishedAt: g("pubDate") }, "google-news", q);
      if (it) added.push(it);
    }
    s.ok++; s.lastOkAt = s.lastAt; s.lastErr = null;
    append(FETCH_LOG, { at: s.lastAt, src: "google-news", q: q.q, ok: true, added: added.length });
    changed(added);
  } catch (e) { s.fail++; s.lastErr = e.message; append(FETCH_LOG, { at: s.lastAt, src: "google-news", q: q.q, ok: false, err: e.message }); changed([]); }
}
let ni = 0;
async function tickNaverNews() {
  const q = QUERIES[ni++ % QUERIES.length], s = src.naverNews;
  s.fetches++; s.lastAt = new Date().toISOString(); s.lastQuery = q.q;
  try {
    const body = await getText(`https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q.q)}&display=50&sort=date`,
      { headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET } });
    const added = [];
    for (const r of (JSON.parse(body).items || [])) {
      const url = r.originallink || r.link; let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}
      const it = addItem({ title: decode(r.title), source: host, url, publishedAt: r.pubDate }, "naver-news", q);
      if (it) added.push(it);
    }
    s.ok++; s.lastOkAt = s.lastAt; s.lastErr = null;
    append(FETCH_LOG, { at: s.lastAt, src: "naver-news", q: q.q, ok: true, added: added.length });
    changed(added);
  } catch (e) { s.fail++; s.lastErr = e.message; append(FETCH_LOG, { at: s.lastAt, src: "naver-news", q: q.q, ok: false, err: e.message }); changed([]); }
}
/* 데이터랩 판정 규칙은 idea/trend/datalab_collect.js 와 같아요 (최근 4주 ÷ 그 전 12주, 1.2 이상 상승 · 0.8 이하 하락) */
const LOOK = KW.lookbackWeeks || 16, RECENT = KW.recentWeeks || 4, UP = 1.2, DOWN = 0.8;
function judge(data) {
  const vals = data.map(d => d.ratio); while (vals.length < LOOK) vals.unshift(0);
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const r = avg(vals.slice(-RECENT)), b = avg(vals.slice(-LOOK, -RECENT));
  if (!r && !b) return { signal: "자료 없음", change: null, score: null };
  if (!b) return { signal: "상승", change: null, score: 5 };
  const change = Math.round(r / b * 100) / 100;
  const signal = change >= UP ? "상승" : change <= DOWN ? "하락" : "보통";
  return { signal, change, score: signal === "상승" ? 5 : signal === "보통" ? 3 : 1, series: vals.map(v => Math.round(v * 10) / 10) };
}
async function tickDatalab() {
  const s = src.datalab; s.fetches++; s.lastAt = new Date().toISOString();
  const iso = d => d.toISOString().slice(0, 10);
  const end = new Date(), start = new Date(end - LOOK * 7 * 864e5), period = { startDate: iso(start), endDate: iso(end) };
  try {
    const herbs = {};
    for (let i = 0; i < HERBS.length; i += 5) {
      const batch = HERBS.slice(i, i + 5); s.lastQuery = batch.join("·");
      const body = await getText("https://openapi.naver.com/v1/datalab/search", { method: "POST",
        headers: { "Content-Type": "application/json", "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
        body: JSON.stringify({ ...period, timeUnit: "week", keywordGroups: batch.map(h => ({ groupName: h, keywords: herbKeywords(h).slice(0, 20) })) }) });
      for (const r of JSON.parse(body).results || []) herbs[r.title] = { ...judge(r.data || []), keywords: herbKeywords(r.title) };
    }
    datalab = { collectedAt: s.lastAt, source: "네이버 데이터랩 검색어 트렌드 (주간, 상대 지수)", grade: "🟢", period,
      rule: `최근 ${RECENT}주 평균 ÷ 그 전 ${LOOK - RECENT}주 평균 · ${UP} 이상 상승(5점) · ${DOWN} 이하 하락(1점) · 그 사이 보통(3점)`, herbs };
    fs.writeFileSync(TREND_JSON, JSON.stringify(datalab, null, 2) + "\n"); // 화면용 최신본 (지난 결과는 DB datalab_runs 에 쌓임)
    DB.addDatalab(s.lastAt, herbs, period);
    s.ok++; s.lastOkAt = s.lastAt; s.lastErr = null;
    append(FETCH_LOG, { at: s.lastAt, src: "datalab", ok: true });
    changed([]);
  } catch (e) { s.fail++; s.lastErr = e.message; append(FETCH_LOG, { at: s.lastAt, src: "datalab", ok: false, err: e.message }); changed([]); }
}

/* ── 집계 ──
 * 약재별 기사 언급: 최근 7일 건수 ÷ (그 전 21일 건수 / 3) → 주당 언급 변화.
 * 점수 구간(가정, 팀이 정할 값): 합계 3건 미만 2점(언급 적음) · 1.5배 이상 5 · 1.1배 이상 4 · 0.8배 이상 3 · 0.5배 이상 2 · 그 아래 1 */
function summarize() {
  const now = Date.now(), d7 = now - 7 * 864e5, d28 = now - 28 * 864e5;
  const all = [...items.values()].filter(it => Date.parse(it.publishedAt) >= now - 35 * 864e5);
  const pub = it => Date.parse(it.publishedAt);
  const herbs = {};
  for (const h of HERBS) {
    const mine = all.filter(it => it.herbs.has(h));
    const recent7 = mine.filter(it => pub(it) >= d7).length, prior21 = mine.filter(it => pub(it) < d7 && pub(it) >= d28).length;
    const weekly = prior21 / 3, ratio = weekly ? Math.round(recent7 / weekly * 100) / 100 : (recent7 ? null : 0);
    let score, signal;
    if (recent7 + prior21 < NEWS_RULE.minTotal) { score = NEWS_RULE.lowScore; signal = "언급 적음"; }
    else if (ratio == null) { score = 5; signal = "새로 언급"; }
    else { score = (NEWS_RULE.cuts.find(([c]) => ratio >= c) || [0, NEWS_RULE.floorScore])[1]; signal = score >= 4 ? "상승" : score === 3 ? "보통" : "하락"; }
    herbs[h] = { recent7, prior21, ratio, score, signal,
      latest: mine.sort((a, b) => pub(b) - pub(a)).slice(0, 4).map(slim) };
  }
  const purposes = {};
  for (const [p, words] of Object.entries(PURPOSE_WORDS)) {
    const hit = all.filter(it => words.some(w => it.title.includes(w)));
    purposes[p] = { words, recent7: hit.filter(it => pub(it) >= d7).length, prior21: hit.filter(it => pub(it) < d7 && pub(it) >= d28).length,
      latest: hit.sort((a, b) => pub(b) - pub(a)).slice(0, 3).map(slim) };
  }
  const newest = [...all].sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt) || pub(b) - pub(a)).slice(0, 12).map(slim);
  return { startedAt, now: new Date(now).toISOString(), hasNaverKey: HAS_NAVER, db: DB.counts(), cycleSec: QUERIES.length * NEWS_EVERY_SEC,
    totals: { items: all.length, collected24h: all.filter(it => now - Date.parse(it.collectedAt) < 864e5).length, stored: items.size },
    rule: { news: `약재 기사 언급: 최근 7일 ÷ 그 전 21일의 주 평균 · ${NEWS_RULE.cuts.map(([c, v]) => `${c}배↑ ${v}점`).join(" · ")} · 그 아래 ${NEWS_RULE.floorScore}점 · 합계 ${NEWS_RULE.minTotal}건 미만 ${NEWS_RULE.lowScore}점 (점수 구간은 가정)`, datalab: datalab && datalab.rule },
    sources: src, herbs, purposes, newest, datalab };
}
const slim = it => ({ id: it.id, title: it.title, source: it.source, url: it.url, publishedAt: it.publishedAt, collectedAt: it.collectedAt, via: it.via, herbs: [...it.herbs] });

/* ── 하루 스냅샷 md (지시문 3번 형식: 출처·등급·확인일) ── */
function writeSnapshot(sum) {
  const day = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  const rows = HERBS.map(h => { const x = sum.herbs[h], d = sum.datalab && sum.datalab.herbs && sum.datalab.herbs[h];
    return `| ${h} | ${x.recent7} | ${x.prior21} | ${x.ratio ?? "–"} | ${x.signal} (${x.score}점) | ${d ? `${d.signal} · ${d.change ?? "–"}` : "미확인 (키 없음)"} |`; }).join("\n");
  const arts = sum.newest.map((it, i) => `| ${i + 1} | ${it.title.replace(/\|/g, "/")} | ${it.source} | ${it.publishedAt.slice(0, 10)} | 🟡 | ${it.collectedAt.slice(0, 10)} | ${it.url} |`).join("\n");
  const md = `---
담당: MEJ (트렌드 수집기 자동 생성 · beautyagent/site/server.js)
영역: 트렌드
주제: 트렌드 스냅샷 ${day}
최종수정: ${sum.now}
상태: 자동 수집 중
---

# 트렌드 스냅샷 ${day}

## 핵심 내용
- [사실] ${sum.startedAt.slice(0, 16)}부터 수집기가 Google 뉴스${HAS_NAVER ? "·네이버 뉴스·데이터랩" : ""}를 쉬지 않고 돌며 기사 ${sum.totals.items}건을 모았어요 (최근 35일 발행분).
- [해석] 기사 언급 수는 관심의 신호일 뿐 검색량·판매량이 아니에요. 점수 구간은 가정이에요.
${HAS_NAVER ? "" : "- [확인필요] 네이버 데이터랩 검색 흐름은 API 키가 없어 미확인이에요.\n"}
## 약재별 신호
| 약재 | 최근 7일 기사 | 그 전 21일 기사 | 주당 변화(배) | 기사 신호 | 데이터랩 검색 흐름 |
|---|---|---|---|---|---|
${rows}

규칙: ${sum.rule.news}${sum.rule.datalab ? "\n데이터랩: " + sum.rule.datalab : ""}

## 최근 수집 기사
| # | 제목 | 출처 | 발행일 | 등급 | 확인일 | URL |
|---|---|---|---|---|---|---|
${arts}

## ⚠️ 광고 표현 체크
- 기사 제목은 근거 링크로만 쓰고, 기획 문구에는 의약품식 효능 표현(치료·염증 완화 등)을 옮기지 않아요.
`;
  const f = path.join(TREND_DIR, `트렌드스냅샷_${day}.md`);
  const hm = new Date(Date.now() + 9 * 36e5).toISOString().slice(11, 16);
  if (!fs.existsSync(f)) fs.writeFileSync(f, md.replace("## 약재별 신호", `## 약재별 신호 (${hm} 기록)`));
  else fs.appendFileSync(f, `\n## ${hm} 기록 (덧붙임)\n| 약재 | 최근 7일 기사 | 그 전 21일 기사 | 주당 변화(배) | 기사 신호 | 데이터랩 검색 흐름 |\n|---|---|---|---|---|---|\n${rows}\n누적 기사 ${sum.totals.items}건\n`);
}

/* ── 실시간 전송 (SSE) ── */
const clients = new Set();
let lastSummary = summarize(), dirty = false;
function changed(added) { dirty = true; if (added.length) broadcast("new", added.map(slim)); }
function broadcast(ev, data) { const s = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(s); }
setInterval(() => {
  if (dirty) { dirty = false; lastSummary = summarize(); fs.writeFile(STATE_FILE, JSON.stringify(lastSummary, null, 2), () => {}); broadcast("state", lastSummary); }
  broadcast("tick", { now: new Date().toISOString(), sources: Object.fromEntries(Object.entries(src).map(([k, v]) => [k, { lastAt: v.lastAt, lastOkAt: v.lastOkAt, lastErr: v.lastErr, lastQuery: v.lastQuery, fetches: v.fetches }])) });
}, 1000);
setInterval(() => DB.addStats(new Date().toISOString(), lastSummary.herbs, lastSummary.purposes), 10 * 60000); // 집계를 10분마다 DB에 쌓기
setInterval(() => writeSnapshot(lastSummary), 60 * 60000);                  // 스냅샷 md는 매시간 덧붙이기
setInterval(() => { if (DB.importBeautyHistory()) dirty = true; }, 10 * 60000);
setInterval(() => { const r = DB.loadSeeds(SEED_DIR).filter(x => x.added); if (r.length) { refreshKB(); dirty = true; r.forEach(x => broadcast("knowledge", x)); } }, 60000); // 매시간 작업이 바꾼 beauty_trends.json 도 쌓기

/* ── 웹 서버 ── */
const json = (res, o) => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".css": "text/css; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
const ALLOW = [path.join(ROOT, "IMAGE"), TREND_DIR]; // 저장소에서 밖으로 보여 줄 폴더만
function sendFile(res, f) {
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("없음"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(f).pipe(res);
  });
}
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const p = decodeURIComponent(u.pathname);
  if (p === "/api/trend") { res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }); return res.end(JSON.stringify(lastSummary)); }
  if (p === "/api/trend/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`event: state\ndata: ${JSON.stringify(lastSummary)}\n\n`); clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (p === "/api/trend/history") return json(res, { herb: u.searchParams.get("herb"), rows: DB.herbHistory(u.searchParams.get("herb") || "") });
  if (p === "/api/db") return json(res, DB.counts());
  if (p === "/api/knowledge" && req.method === "GET") return json(res, DB.knowledge());
  if (p === "/api/knowledge/history") return json(res, DB.knowledgeHistory(u.searchParams.get("kind") || ""));
  if (p === "/api/beauty-trends") return json(res, DB.latestBeauty());
  if (p === "/api/knowledge" && req.method === "POST") {
    let body = ""; req.on("data", c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on("end", () => { try { const d = JSON.parse(body);
      if (!d.kind || d.data === undefined) throw new Error("kind, data 가 필요해요");
      const r = DB.putKnowledge(d.kind, d.data, d.actor || "agent", d.source || "", d.note || "");
      refreshKB(); dirty = true; broadcast("knowledge", { kind: d.kind, id: r.id, added: r.added });
      return json(res, r);
    } catch (e) { res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); res.end(e.message); } });
    return;
  }
  if (p === "/api/decisions" && req.method === "GET") return json(res, DB.decisions(u.searchParams.get("season") || "", u.searchParams.get("loop") || ""));
  if (p === "/api/agent-runs" && req.method === "GET") return json(res, DB.agentRuns(u.searchParams.get("agent") || "", u.searchParams.get("season") || "", 10));
  if ((p === "/api/decisions" || p === "/api/agent-runs") && req.method === "POST") {
    let body = ""; req.on("data", c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => { try { const d = JSON.parse(body);
      if (p === "/api/decisions") return json(res, { id: DB.addDecision(d) });
      DB.addAgentRun(d.agent, d.season, d.input, d.output); return json(res, { ok: true });
    } catch (e) { res.writeHead(400); res.end(e.message); } });
    return;
  }
  if (p === "/" || p === "/index.html") return sendFile(res, path.join(PUB, "index.html"));
  const f = path.resolve(ROOT, "." + p);
  if (ALLOW.some(d => f === d || f.startsWith(d + path.sep)) && !f.includes(`${path.sep}.`)) return sendFile(res, f);
  const pf = path.resolve(PUB, "." + p);
  if (pf.startsWith(PUB + path.sep)) return sendFile(res, pf);
  res.writeHead(404); res.end();
}).listen(PORT, HOST, () => {
  console.log(`청향 출시 기획실 → http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`트렌드 수집: Google 뉴스 ${NEWS_EVERY_SEC}초마다 1건 (검색어 ${QUERIES.length}개 한 바퀴 ${QUERIES.length * NEWS_EVERY_SEC}초)` + (HAS_NAVER ? ` · 네이버 뉴스 ${NAVER_NEWS_EVERY_SEC}초 · 데이터랩 ${DATALAB_EVERY_MIN}분` : " · 네이버 키 없음 → 데이터랩·네이버 뉴스 꺼짐"));
  const c = DB.counts();
  console.log(`DB: idea/trend/live/trend.db (쌓기만 함) · 기사 ${c.a}건 · 요청 ${c.f}건 · 집계 ${c.s}줄 · beauty_trends 지난 버전 ${c.b}개 (이번에 ${beautyImported}개 추가)`);
});

/* ── 시작 ── */
const loop = (fn, ms) => { let busy = false; const run = async () => { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } }; run(); setInterval(run, ms); };
loop(tickGoogle, NEWS_EVERY_SEC * 1000);
if (HAS_NAVER) { loop(tickNaverNews, NAVER_NEWS_EVERY_SEC * 1000); loop(tickDatalab, DATALAB_EVERY_MIN * 60000); }
setTimeout(() => { DB.addStats(new Date().toISOString(), lastSummary.herbs, lastSummary.purposes); writeSnapshot(lastSummary); }, 60000);
