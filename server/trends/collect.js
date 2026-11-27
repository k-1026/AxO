/* 트렌드 자동 수집 (트렌드 서브에이전트 · 매일 1번, Vercel Cron)
   1) 업계 매체의 공식 공개 RSS(장업신문·뷰티경제)에서 최신 기사 제목·요약을 받아요. 차단된 곳은 우회하지 않아요.
   2) 스킨케어·기초 관련 기사만 거르고, AI(Gemini 1번)가 기사 제목·요약만 근거로 쉬운 말 설명·키워드·계절을 정리해요.
   3) 이전 묶음의 계절 인사이트와 그 근거 기사는 그대로 이어 붙여 새 트렌드 묶음(beauty_trend_snapshots)으로 저장해요.
   DOM·네트워크 없이 돌아가는 부분(파싱·거르기·검증·합치기)은 함수로 나눠서 테스트해요. */
import { BANNED_PHRASES } from "../../src/config/rules.js";

export const FEEDS = [
  { id: "jangup", source: "장업신문", kind: "업계 기사", url: "https://www.jangup.com/rss/allArticle.xml" },
  { id: "thebk", source: "뷰티경제", kind: "업계 기사", url: "https://www.thebk.co.kr/rss/allArticle.xml" }
];
export const SEASONS = ["봄", "여름", "가을", "겨울"];
const LOOKBACK_DAYS = 30;     // 이 기간 안의 기사만 써요
const MAX_CANDIDATES = 40;    // AI에게 보여 줄 기사 수
const MAX_PICK = 8;           // 하루에 새로 고를 트렌드 수
const MAX_ITEMS = 20;         // 묶음에 남길 트렌드 수 (근거 기사는 별도로 항상 남겨요)
const USER_AGENT = "HerbHub-trend-agent/1.0 (student project)";

/* ── RSS 읽기 ─────────────────────────────── */
const ENTITY = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
export const cleanText = s => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, m => ENTITY[m])
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, " ")
  .trim();

const tag = (block, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block); return m ? m[1] : ""; };

/** RSS 글 → [{ title, link, publishedAt(YYYY-MM-DD), summary }] */
export function parseRss(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const title = cleanText(tag(b, "title"));
    const link = cleanText(tag(b, "link"));
    const raw = cleanText(tag(b, "pubDate"));
    // 국내 매체 RSS는 "2026-11-26 10:58:50"(한국 시각, 시간대 없음) 모양이라 +09:00 을 붙여요. 그 밖의 모양은 그대로 읽어요.
    const t = /^\d{4}-\d\d-\d\d/.test(raw) ? Date.parse(raw.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? "" : "+09:00")) : Date.parse(raw);
    const summary = cleanText(tag(b, "description")).slice(0, 300);
    if (!title || !/^https:\/\//.test(link)) continue;
    out.push({ title, link, publishedAt: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "", summary });
  }
  return out;
}

/* ── 스킨케어·기초 관련 기사만 ─────────────── */
const KEEP = /스킨케어|기초|토너|세럼|앰플|에센스|크림|로션|보습|진정|장벽|수분|미스트|패드|마스크팩|시트 ?마스크|클렌|선케어|선크림|자외선|피부|성분|원료|한방|트렌드|제형|민감|트러블|탄력|미백|모공/;
const DROP = /헤어|샴푸|두피|네일|향수|인사|임명|선임|수상|선정|시상|실적|매출액|영업이익|주가|상장|채용|기부|봉사|협약|MOU|후원|부고|결혼|장학/;
export function isSkincareTrend(a, now = Date.now()) {
  const text = `${a.title} ${a.summary}`;
  const age = (now - Date.parse(a.publishedAt)) / 864e5;
  return KEEP.test(text) && !DROP.test(a.title) && Number.isFinite(age) && age >= -1 && age <= LOOKBACK_DAYS;
}

/** 기사 주소의 기사 번호로 안정적인 id 를 만들어요 (같은 기사는 매일 같은 id) */
export function articleId(feedId, link) {
  const n = /idxno=(\d+)/.exec(link)?.[1] || /(\d{4,})/.exec(link)?.[1];
  return n ? `${feedId}-${n}` : `${feedId}-${[...link].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`;
}

/* ── AI 정리 ─────────────────────────────── */
export const PICK_SCHEMA = {
  type: "OBJECT",
  properties: {
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          easy: { type: "STRING" },
          tags: { type: "ARRAY", items: { type: "STRING" } },
          seasons: { type: "ARRAY", items: { type: "STRING", enum: SEASONS } }
        },
        required: ["id", "easy", "tags", "seasons"]
      }
    }
  },
  required: ["picks"]
};

export function buildPickPrompt(candidates) {
  return [
    "당신은 한방 기초 화장품 출시 기획을 돕는 트렌드 정리 담당이에요.",
    `아래 업계 기사 중에서 기초 스킨케어 기획에 참고할 만한 소비자·제품 트렌드 기사를 최대 ${MAX_PICK}개 골라 주세요.`,
    "- 회사 소식(인사·실적·행사 후원)이나 한 브랜드 신제품 홍보만 있는 기사는 고르지 마세요. 여러 제품·소비자 흐름이 보이는 기사를 먼저 고르세요.",
    "- easy: 화장품을 잘 모르는 사람도 알 수 있게, 기사 제목·요약에 있는 내용만 쉬운 존댓말 1~2문장으로 풀어 쓰세요.",
    "  · 기사에 없는 사실·숫자·평가를 더하지 마세요. '인기예요', '많아요'처럼 기사보다 센 표현 대신 '소개됐어요', '다뤘어요', '주목받고 있어요(기사에 그렇게 적힌 경우만)'처럼 쓰세요.",
    "  · 연예인·행사 이름보다 어떤 제품·피부 고민·사용감이 이야기됐는지를 쓰세요.",
    "  · 해외 시장(중국·미국 등) 이야기라면 어느 나라 이야기인지 꼭 문장에 넣으세요. 국내 흐름처럼 쓰면 안 돼요.",
    `  · 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    "- tags: 기사에 나온 핵심 키워드 2~4개 (예: 보습, 진정, 산뜻한 사용감).",
    "- seasons: 기사에 계절이나 계절 상황(환절기, 폭염, 장마, 건조주의보, 한파 등)이 적혀 있을 때만 그 계절을 넣고, 아니면 빈 목록으로 두세요.",
    "- id 는 아래 [기사]의 id 를 그대로 쓰세요.",
    "",
    "[기사]",
    ...candidates.map(c => `- id: ${c.id} | ${c.source} ${c.publishedAt} | 제목: ${c.title} | 요약: ${c.summary}`)
  ].join("\n");
}

const banned = s => BANNED_PHRASES.some(b => s.includes(b));
/** AI 답 → 믿고 쓸 수 있는 트렌드만. 없는 id·빈 설명·금지 표현은 버려요 */
export function cleanPicks(raw, candidates) {
  const byId = new Map(candidates.map(c => [c.id, c]));
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(raw?.picks) ? raw.picks : []) {
    const c = byId.get(p?.id);
    const easy = typeof p?.easy === "string" ? p.easy.trim() : "";
    if (!c || seen.has(c.id) || !easy || easy.length > 200 || banned(easy)) continue;
    seen.add(c.id);
    const tags = (Array.isArray(p.tags) ? p.tags : []).filter(t => typeof t === "string" && t.trim() && !banned(t)).map(t => t.trim()).slice(0, 4);
    const seasons = (Array.isArray(p.seasons) ? p.seasons : []).filter(s => SEASONS.includes(s));
    out.push({ ...c, easy, tags, seasons: [...new Set(seasons)] });
    if (out.length >= MAX_PICK) break;
  }
  return out;
}

/* ── 새 묶음 만들기 ───────────────────────── */
/** 이전 묶음 + 오늘 고른 트렌드 → 새 묶음. 계절 인사이트와 그 근거 기사는 그대로 이어 가요 */
export function mergeSnapshot(prev, picks, checks, now = Date.now()) {
  const nowIso = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
  const insights = prev?.insights || {};
  const evidence = new Set(Object.values(insights).flatMap(i => i?.evidenceIds || []));
  const fresh = picks.map(p => ({
    id: p.id, source: p.source, kind: p.kind, title: p.title, url: p.link, publishedAt: p.publishedAt, checkedAt: nowIso,
    summary: p.summary, tags: p.tags, easy: p.easy, seasons: p.seasons
  }));
  const ids = new Set(fresh.map(i => i.id));
  const recent = (prev?.items || []).filter(i => i && !ids.has(i.id) && (now - Date.parse(i.publishedAt)) / 864e5 <= LOOKBACK_DAYS);
  const keep = [...fresh, ...recent].slice(0, MAX_ITEMS);
  const kept = new Set(keep.map(i => i.id));
  const evidenceItems = (prev?.items || []).filter(i => evidence.has(i.id) && !kept.has(i.id));
  const sourceChecks = [...(prev?.sourceChecks || []).filter(c => !checks.some(n => n.id === c.id)), ...checks];
  return { version: 1, updatedAt: nowIso, intervalMinutes: 1440, lookbackDays: LOOKBACK_DAYS, sourceChecks, items: [...keep, ...evidenceItems], insights };
}

/* ── 실행 ─────────────────────────────────── */
/**
 * 수집 한 번. deps: fetchText(url) → {status, text}, generate(prompt, schema), loadLatest() → payload|null, save(payload), now()
 * 돌려주는 값: { saved, picked, candidates, checks }
 */
export async function collectTrends(deps) {
  const now = deps.now?.() ?? Date.now();
  const checks = [], candidates = [];
  for (const f of FEEDS) {
    const checkedAt = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
    try {
      const { status, text } = await deps.fetchText(f.url);
      if (status !== 200) { checks.push({ id: `rss-${f.id}`, source: `${f.source} RSS`, url: f.url, checkedAt, status: "unavailable", http: status, note: "RSS를 받지 못함 · 우회하지 않음" }); continue; }
      const arts = parseRss(text);
      const good = arts.filter(a => isSkincareTrend(a, now));
      checks.push({ id: `rss-${f.id}`, source: `${f.source} RSS`, url: f.url, checkedAt, status: "checked", http: status, note: `공개 RSS 기사 ${arts.length}건 중 스킨케어 관련 ${good.length}건` });
      for (const a of good) candidates.push({ ...a, id: articleId(f.id, a.link), source: f.source, kind: f.kind });
    } catch (e) {
      checks.push({ id: `rss-${f.id}`, source: `${f.source} RSS`, url: f.url, checkedAt, status: "unavailable", http: 0, note: `연결 실패 (${e?.name || "오류"})` });
    }
  }
  const list = candidates.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_CANDIDATES);
  if (!list.length) return { saved: false, picked: 0, candidates: 0, checks };
  const picks = cleanPicks(await deps.generate(buildPickPrompt(list), PICK_SCHEMA), list);
  if (!picks.length) return { saved: false, picked: 0, candidates: list.length, checks };
  const prev = await deps.loadLatest();
  const payload = mergeSnapshot(prev, picks, checks, now);
  await deps.save(payload);
  return { saved: true, picked: picks.length, candidates: list.length, checks };
}
