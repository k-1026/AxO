// src/data/fallback.js 의 데이터를 supabase/seed.sql 로 바꿔요.  실행: npm run seed:sql
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = await import(pathToFileURL(path.join(root, "src/data/fallback.js")).href);

const q = v => v == null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const arr = a => `array[${(a || []).map(q).join(", ")}]::text[]`;
const json = v => `${q(JSON.stringify(v))}::jsonb`;
const values = rows => rows.map(r => `  (${r.join(", ")})`).join(",\n");

const out = [];
out.push(`-- 자동 생성 파일이에요 (npm run seed:sql). 직접 고치지 말고 src/data/fallback.js 를 고친 뒤 다시 만드세요.
-- schema.sql 을 먼저 실행한 뒤 실행하세요. 기존 기본 데이터를 지우고 다시 넣어요 (트렌드 수집본은 기존 행을 남겨요).
begin;

delete from public.season_issues;
delete from public.seasons;
delete from public.herb_designs;
delete from public.herbs;
delete from public.trend_sources;
delete from public.trend_tiers;
`);

const seasons = Object.entries(data.SEASONS);
out.push(`insert into public.seasons (name, eng, icon, sort_order) values
${values(seasons.map(([name, s], i) => [q(name), q(s.eng), q(s.icon), i]))};
`);
out.push(`insert into public.season_issues (season, title, stat, concern, purposes, sort_order) values
${values(seasons.flatMap(([name, s]) => s.issues.map(([t, n, c, p], j) => [q(name), q(t), q(n), q(c), arr(p), j])))};
`);

const sc = (h, k) => [q(h[k]?.[0]), q(h[k]?.[1])];
out.push(`insert into public.herbs (name, hanja, purposes, words, seasons, color,
  scent_score, scent_note, gb_score, gb_note, preempt_score, preempt_note, hanbang_score, hanbang_note,
  rival_score, rival_note, origin_score, origin_note, func,
  hanbang_gate_status, hanbang_gate_note, type_gate_status, type_gate_note, sort_order) values
${values(data.HERBS.map((h, i) => [q(h.herb), q(h.hanja || ""), arr(h.purposes), q(h.words), arr(h.seasons), q(h.color),
  ...sc(h, "scent"), ...sc(h, "gb"), ...sc(h, "preempt"), ...sc(h, "hanbang"), ...sc(h, "rival"), ...sc(h, "origin"), q(h.func),
  q(h.hanbangGate?.[0]), q(h.hanbangGate?.[1]), q(h.typeGate?.[0]), q(h.typeGate?.[1]), i]))};
`);
out.push(`insert into public.herb_designs (herb, main, cap, liquid, motif, from_label) values
${values(Object.entries(data.DESIGN).map(([herb, d]) => [q(herb), q(d.main), q(d.cap), q(d.liquid), q(d.motif), q(d.from)]))};
`);
out.push(`insert into public.trend_tiers (id, name, cadence, rule, sort_order) values
${values(Object.entries(data.TREND_TIERS).map(([id, t], i) => [q(id), q(t.name), q(t.cadence), q(t.rule), i]))};
`);
out.push(`insert into public.trend_sources (id, name, url, type, tier, sort_order) values
${values(data.TREND_SOURCES.map((s, i) => [q(s.id), q(s.name), q(s.url), q(s.type), q(s.tier), i]))};
`);

const b = data.BEAUTY_TRENDS;
out.push(`-- 뷰티 트렌드 수집본: 같은 updatedAt 행이 없을 때만 넣어요.
insert into public.beauty_trend_snapshots (updated_at, payload)
select ${q(b.updatedAt)}::timestamptz, ${json(b)}
where not exists (select 1 from public.beauty_trend_snapshots where updated_at = ${q(b.updatedAt)}::timestamptz);
`);
if (data.HERB_TREND) {
  const t = data.HERB_TREND;
  out.push(`insert into public.herb_trend_snapshots (collected_at, herbs)
select ${q(t.collectedAt)}::date, ${json(t.herbs)}
where not exists (select 1 from public.herb_trend_snapshots where collected_at = ${q(t.collectedAt)}::date);
`);
}
out.push("commit;");

fs.writeFileSync(path.join(root, "supabase/seed.sql"), out.join("\n") + "\n");
console.log("supabase/seed.sql 생성 완료");
