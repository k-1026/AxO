#!/usr/bin/env node
/*
 * 에이전트용 지식 DB 도구 (서버가 꺼져 있어도 돼요)
 *   node beautyagent/site/kb.js list                         종류별 최신 버전 목록
 *   node beautyagent/site/kb.js get <kind>                   최신 데이터 출력
 *   node beautyagent/site/kb.js history <kind>               버전 기록
 *   node beautyagent/site/kb.js put <kind> <file.json> [--actor 이름] [--source 출처] [--note 메모]
 *        file.json 은 데이터 자체(또는 {"data": …})예요. 바뀐 경우에만 새 버전을 쌓아요. 지난 버전은 지우지 않아요.
 * 서버가 켜져 있으면 1분 안에 화면에 반영돼요 (바로 반영하려면 POST /api/knowledge).
 */
const fs = require("fs");
const DB = require("./db");
const [cmd, kind, file, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : ""; };
if (cmd === "list") {
  const k = DB.knowledge();
  for (const [name, v] of Object.entries(k.versions)) console.log(`${name.padEnd(20)} v${v.versions}  ${v.at}  ${v.actor}  ${v.note || ""}`);
} else if (cmd === "get" && kind) {
  console.log(JSON.stringify(DB.knowledge().data[kind] ?? null, null, 2));
} else if (cmd === "history" && kind) {
  for (const r of DB.knowledgeHistory(kind)) console.log(`#${r.id} ${r.at} ${r.actor} ${r.note || ""}`);
} else if (cmd === "put" && kind && file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const data = j && typeof j === "object" && !Array.isArray(j) && "data" in j ? j.data : j;
  const r = DB.putKnowledge(kind, data, opt("actor") || "agent", opt("source"), opt("note"));
  console.log(r.added ? `저장: ${kind} 새 버전 #${r.id}` : `변경 없음: ${kind} (#${r.id} 그대로)`);
} else {
  console.log("사용: node beautyagent/site/kb.js list | get <kind> | history <kind> | put <kind> <file.json> [--actor 이름] [--source 출처] [--note 메모]");
  process.exit(1);
}
