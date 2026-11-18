/*
 * 트렌드·에이전트 DB (Node 기본 node:sqlite, 설치 필요 없음)
 * 파일: idea/trend/live/trend.db
 * 원칙: 쌓기만 해요. 지난 기록을 UPDATE로 덮어쓰거나 DELETE 하지 않아요.
 *       (기사에 약재 태그가 새로 붙는 것만 article_herbs 에 줄을 더해요)
 */
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");

/* 저장소 맨 위 폴더 (IMAGE/ 와 idea/ 가 있는 곳)를 찾아요. beautyagent/site/ 폴더가 어디에 있든(예: beautyagent/site) 같은 데이터를 써요. */
const ROOT = (() => { let d = __dirname; for (let i = 0; i < 5; i++) { if (fs.existsSync(path.join(d, "IMAGE")) && fs.existsSync(path.join(d, "idea"))) return d; d = path.dirname(d); } return path.resolve(__dirname, ".."); })();
const LIVE_DIR = path.join(ROOT, "idea", "trend", "live");
fs.mkdirSync(LIVE_DIR, { recursive: true });
const db = new DatabaseSync(path.join(LIVE_DIR, "trend.db"));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, key TEXT UNIQUE, title TEXT, source TEXT, url TEXT,
  published_at TEXT, collected_at TEXT, via TEXT, query TEXT);
CREATE TABLE IF NOT EXISTS article_herbs (article_id TEXT, herb TEXT, added_at TEXT, PRIMARY KEY (article_id, herb));
CREATE TABLE IF NOT EXISTS fetches (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, src TEXT, query TEXT, ok INTEGER, added INTEGER, err TEXT);
CREATE TABLE IF NOT EXISTS herb_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, herb TEXT, recent7 INTEGER, prior21 INTEGER, ratio REAL, score INTEGER, signal TEXT);
CREATE TABLE IF NOT EXISTS purpose_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, purpose TEXT, recent7 INTEGER, prior21 INTEGER);
CREATE TABLE IF NOT EXISTS datalab_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, herb TEXT, signal TEXT, change REAL, score INTEGER, series TEXT, period TEXT);
CREATE TABLE IF NOT EXISTS beauty_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, commit_hash TEXT UNIQUE, committed_at TEXT, imported_at TEXT, json TEXT);
CREATE TABLE IF NOT EXISTS agent_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, agent TEXT, season TEXT, input TEXT, output TEXT);
CREATE TABLE IF NOT EXISTS decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, loop TEXT, season TEXT, target TEXT, decision TEXT, reason TEXT, detail TEXT, round INTEGER);
CREATE TABLE IF NOT EXISTS knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, kind TEXT, json TEXT, hash TEXT, actor TEXT, source TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS i_kn ON knowledge(kind, id);
CREATE INDEX IF NOT EXISTS i_art_pub ON articles(published_at);
CREATE INDEX IF NOT EXISTS i_hs ON herb_stats(herb, at);
`);

const q = {
  insArticle: db.prepare(`INSERT OR IGNORE INTO articles (id,key,title,source,url,published_at,collected_at,via,query) VALUES (?,?,?,?,?,?,?,?,?)`),
  insHerb: db.prepare(`INSERT OR IGNORE INTO article_herbs (article_id,herb,added_at) VALUES (?,?,?)`),
  insFetch: db.prepare(`INSERT INTO fetches (at,src,query,ok,added,err) VALUES (?,?,?,?,?,?)`),
  insHerbStat: db.prepare(`INSERT INTO herb_stats (at,herb,recent7,prior21,ratio,score,signal) VALUES (?,?,?,?,?,?,?)`),
  insPurposeStat: db.prepare(`INSERT INTO purpose_stats (at,purpose,recent7,prior21) VALUES (?,?,?,?)`),
  insDatalab: db.prepare(`INSERT INTO datalab_runs (at,herb,signal,change,score,series,period) VALUES (?,?,?,?,?,?,?)`),
  insBeauty: db.prepare(`INSERT OR IGNORE INTO beauty_snapshots (commit_hash,committed_at,imported_at,json) VALUES (?,?,?,?)`),
  insAgent: db.prepare(`INSERT INTO agent_runs (at,agent,season,input,output) VALUES (?,?,?,?,?)`),
  insDecision: db.prepare(`INSERT INTO decisions (at,loop,season,target,decision,reason,detail,round) VALUES (?,?,?,?,?,?,?,?)`),
  recentArticles: db.prepare(`SELECT a.*, (SELECT group_concat(herb) FROM article_herbs h WHERE h.article_id = a.id) AS herbs FROM articles a WHERE published_at >= ?`),
  herbHistory: db.prepare(`SELECT at, recent7, prior21, ratio, score, signal FROM herb_stats WHERE herb = ? ORDER BY at`),
  counts: db.prepare(`SELECT (SELECT count(*) FROM articles) a, (SELECT count(*) FROM fetches) f, (SELECT count(*) FROM herb_stats) s, (SELECT count(*) FROM datalab_runs) d, (SELECT count(*) FROM beauty_snapshots) b, (SELECT count(*) FROM agent_runs) g, (SELECT count(*) FROM decisions) c, (SELECT min(collected_at) FROM articles) since`),
  lastBeauty: db.prepare(`SELECT commit_hash FROM beauty_snapshots ORDER BY id DESC LIMIT 1`),
  decisionsBy: db.prepare(`SELECT * FROM decisions WHERE season = ? AND loop = ? ORDER BY id`),
  agentLast: db.prepare(`SELECT * FROM agent_runs WHERE agent = ? AND season = ? ORDER BY id DESC LIMIT ?`),
  insKnow: db.prepare(`INSERT INTO knowledge (at,kind,json,hash,actor,source,note) VALUES (?,?,?,?,?,?,?)`),
  lastKnow: db.prepare(`SELECT * FROM knowledge WHERE kind = ? ORDER BY id DESC LIMIT 1`),
  lastSeedKnow: db.prepare(`SELECT * FROM knowledge WHERE kind = ? AND actor = 'seed-file' ORDER BY id DESC LIMIT 1`),
  latestKnow: db.prepare(`SELECT k.* FROM knowledge k JOIN (SELECT kind, max(id) id FROM knowledge GROUP BY kind) m ON k.id = m.id`),
  histKnow: db.prepare(`SELECT id, at, kind, hash, actor, source, note FROM knowledge WHERE kind = ? ORDER BY id`),
  lastBeautyJson: db.prepare(`SELECT json, committed_at FROM beauty_snapshots ORDER BY committed_at DESC, id DESC LIMIT 1`)
};
const sha = s => require("crypto").createHash("sha1").update(s).digest("hex").slice(0, 16);

module.exports = {
  db,
  addArticle(it) {
    const r = q.insArticle.run(it.id, it.key, it.title, it.source, it.url, it.publishedAt, it.collectedAt, it.via, it.query);
    return r.changes > 0;
  },
  addHerb(articleId, herb) { q.insHerb.run(articleId, herb, new Date().toISOString()); },
  addFetch(f) { q.insFetch.run(f.at, f.src, f.q || null, f.ok ? 1 : 0, f.added ?? null, f.err || null); },
  addStats(at, herbs, purposes) {
    db.exec("BEGIN");
    for (const [h, x] of Object.entries(herbs)) q.insHerbStat.run(at, h, x.recent7, x.prior21, x.ratio, x.score, x.signal);
    for (const [p, x] of Object.entries(purposes)) q.insPurposeStat.run(at, p, x.recent7, x.prior21);
    db.exec("COMMIT");
  },
  addDatalab(at, herbs, period) {
    db.exec("BEGIN");
    for (const [h, x] of Object.entries(herbs)) q.insDatalab.run(at, h, x.signal, x.change, x.score, JSON.stringify(x.series || []), JSON.stringify(period));
    db.exec("COMMIT");
  },
  addAgentRun(agent, season, input, output) { q.insAgent.run(new Date().toISOString(), agent, season, JSON.stringify(input), JSON.stringify(output)); },
  addDecision(d) { const r = q.insDecision.run(new Date().toISOString(), d.loop, d.season, d.target, d.decision, d.reason || "", JSON.stringify(d.detail || {}), d.round || 1); return Number(r.lastInsertRowid); },
  decisions(season, loop) { return q.decisionsBy.all(season, loop).map(r => ({ ...r, detail: JSON.parse(r.detail || "{}") })); },
  agentRuns(agent, season, n = 5) { return q.agentLast.all(agent, season, n).map(r => ({ ...r, input: JSON.parse(r.input), output: JSON.parse(r.output) })); },
  recentArticles(sinceIso) { return q.recentArticles.all(sinceIso); },
  herbHistory(herb) { return q.herbHistory.all(herb); },
  counts() { return q.counts.get(); },
  /* 지식 데이터: 바뀔 때마다 새 버전 한 줄을 더해요 (같은 내용이면 건너뜀). 최신 버전이 화면에 쓰여요. */
  putKnowledge(kind, data, actor, source, note) {
    const json = JSON.stringify(data), hash = sha(json), last = q.lastKnow.get(kind);
    if (last && last.hash === hash) return { kind, id: last.id, added: false };
    const r = q.insKnow.run(new Date().toISOString(), kind, json, hash, actor || "unknown", source || "", note || "");
    return { kind, id: Number(r.lastInsertRowid), added: true };
  },
  knowledge() {
    const out = { data: {}, versions: {} };
    for (const r of q.latestKnow.all()) {
      out.data[r.kind] = JSON.parse(r.json);
      out.versions[r.kind] = { id: r.id, at: r.at, actor: r.actor, source: r.source, note: r.note, versions: q.histKnow.all(r.kind).length };
    }
    return out;
  },
  knowledgeHistory(kind) { return q.histKnow.all(kind); },
  /* 시드 폴더의 JSON이 바뀌었으면 새 버전으로 쌓아요 */
  loadSeeds(dir) {
    const res = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const kind = j.kind || f.replace(/\.json$/, "");
      // 시드 파일 자체가 바뀌었을 때만 쌓아요. 에이전트가 쌓은 새 버전을 시드가 되돌리지 않게 해요.
      const lastSeed = q.lastSeedKnow.get(kind);
      if (lastSeed && lastSeed.hash === sha(JSON.stringify(j.data))) { res.push({ kind, id: lastSeed.id, added: false }); continue; }
      res.push(this.putKnowledge(kind, j.data, "seed-file", j.source || `beautyagent/site/data/seed/${f}`, j.note));
    }
    return res;
  },
  latestBeauty() { const r = q.lastBeautyJson.get(); return r ? JSON.parse(r.json) : null; },
  /* 매시간 덮어써지던 beauty_trends.json 의 지난 버전을 git 기록에서 모두 꺼내 쌓아요 + 지금 파일도 */
  importBeautyHistory() {
    const rel = "idea/trend/beauty_trends.json";
    let added = 0;
    for (const ref of ["origin/research", "HEAD"]) {
      let log = "";
      try { log = execFileSync("git", ["log", "--format=%H %cI", ref, "--", rel], { cwd: ROOT, encoding: "utf8" }); } catch (_) { continue; }
      for (const line of log.trim().split("\n").filter(Boolean).reverse()) {
        const [hash, at] = line.split(" ");
        try {
          const json = execFileSync("git", ["show", `${hash}:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 32 << 20 });
          added += q.insBeauty.run(hash, at, new Date().toISOString(), json).changes;
        } catch (_) {}
      }
    }
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f)) {
      const json = fs.readFileSync(f, "utf8");
      const hash = "file:" + require("crypto").createHash("sha1").update(json).digest("hex").slice(0, 12);
      added += q.insBeauty.run(hash, fs.statSync(f).mtime.toISOString(), new Date().toISOString(), json).changes;
    }
    return added;
  }
};
