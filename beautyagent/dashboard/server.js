// AxO 에이전트 대시보드 서버 (Node 기본 모듈만 사용)
// 실행: node beautyagent/dashboard/server.js  →  http://localhost:8787
// - GET  /                : dashboard.html
// - GET  /api/events      : 실시간 상태·로그 (Server-Sent Events)
// - POST /api/run         : Claude Code를 헤드리스로 실행 (요청 문장을 body.request로)
// - POST /api/stop        : 실행 중인 Claude Code 프로세스 중지
// 환경 변수: PORT, RUN_LOG(로그 경로), CLAUDE_BIN(claude 실행 파일 경로)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.PORT || 8787);
const LOG = path.resolve(process.env.RUN_LOG || path.join(ROOT, "run_log.jsonl"));
const AGENTS = ["researcher", "competitor-analyzer", "model-simulator", "reviewer"];

/* ── claude 실행 파일 찾기: CLAUDE_BIN → PATH의 claude → 데스크톱 앱에 들어 있는 최신 claude.exe ── */
function findClaude() {
  if (process.env.CLAUDE_BIN) return { cmd: process.env.CLAUDE_BIN, pre: [] };
  const base = path.join(process.env.LOCALAPPDATA || "", "Claude-Data");
  let best = null;
  try {
    for (const a of fs.readdirSync(base)) {
      const cc = path.join(base, a, "claude-code");
      if (!fs.existsSync(cc)) continue;
      for (const ver of fs.readdirSync(cc)) for (const h of fs.readdirSync(path.join(cc, ver))) {
        const exe = path.join(cc, ver, h, "claude.exe");
        if (fs.existsSync(exe)) { const t = fs.statSync(exe).mtimeMs; if (!best || t > best.t) best = { exe, t }; }
      }
    }
  } catch (e) { /* 없으면 PATH의 claude 사용 */ }
  return best ? { cmd: best.exe, pre: [] } : { cmd: "claude", pre: [] };
}
// 테스트용: CLAUDE_BIN이 .js면 node로 실행
function claudeCommand() {
  const c = findClaude();
  return c.cmd.endsWith(".js") ? { cmd: process.execPath, pre: [c.cmd] } : c;
}

/* ── 상태 ── */
const state = {
  run: { status: "idle", pid: null, startedAt: null, endedAt: null, request: "", exitCode: null, error: null },
  agents: Object.fromEntries(AGENTS.map(a => [a, { status: "idle", since: null, task: "", activity: "" }])),
  main: { activity: "" },
};
const taskMap = new Map(); // Task tool_use_id → agent 이름
let child = null;
const clients = new Set();

function send(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
function pushState() { send("state", state); }

/* ── run_log.jsonl 읽기·감시 ── */
let logOffset = 0, logLineNo = 0, partial = "";
function parseLines(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { continue; }
    logLineNo++;
    try { out.push({ line: logLineNo, ...JSON.parse(line) }); }
    catch (e) { out.push({ line: logLineNo, _invalid: true, raw: line.slice(0, 300) }); }
  }
  return out;
}
function readAllLog() {
  logOffset = 0; logLineNo = 0; partial = "";
  if (!fs.existsSync(LOG)) return [];
  const buf = fs.readFileSync(LOG);
  logOffset = buf.length;
  let text = buf.toString("utf8");
  const lastNl = text.lastIndexOf("\n");
  if (lastNl < text.length - 1) { partial = text.slice(lastNl + 1); text = text.slice(0, lastNl + 1); }
  return parseLines(text);
}
let cachedLog = readAllLog();
function checkLog() {
  if (!fs.existsSync(LOG)) return;
  const size = fs.statSync(LOG).size;
  if (size < logOffset) { cachedLog = readAllLog(); send("log-reset", cachedLog); return; } // 파일이 줄어들면 처음부터
  if (size === logOffset) return;
  const fd = fs.openSync(LOG, "r");
  const buf = Buffer.alloc(size - logOffset);
  fs.readSync(fd, buf, 0, buf.length, logOffset); fs.closeSync(fd);
  logOffset = size;
  let text = partial + buf.toString("utf8");
  const lastNl = text.lastIndexOf("\n");
  if (lastNl === -1) { partial = text; return; }
  partial = text.slice(lastNl + 1);
  const entries = parseLines(text.slice(0, lastNl + 1));
  if (entries.length) { cachedLog.push(...entries); send("log", entries); }
}
setInterval(checkLog, 1000);

/* ── 엑셀 모델 결과 읽기 (파일이 바뀌면 다시 읽어 push) ── */
const MODEL = path.resolve(process.env.MODEL_XLSX || path.join(ROOT, "idea", "market_model_case_AxO.xlsx"));
const PYTHON = process.env.PYTHON || "python";
let model = { status: "loading" }, modelMtime = 0, modelBusy = false;
function readModel() {
  if (modelBusy) return;
  if (!fs.existsSync(MODEL)) { model = { status: "missing", file: path.relative(ROOT, MODEL) }; send("model", model); return; }
  const mt = fs.statSync(MODEL).mtimeMs;
  if (mt === modelMtime) return;
  modelBusy = true;
  execFile(PYTHON, [path.join(__dirname, "read_model.py"), MODEL], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 30000, maxBuffer: 4e6 }, (err, stdout, stderr) => {
    modelBusy = false;
    if (err) { model = { status: "error", error: short(stderr || err.message, 300), file: path.relative(ROOT, MODEL) }; }
    else {
      try { model = { status: "ok", ...JSON.parse(stdout), file: path.relative(ROOT, MODEL), updatedAt: new Date(mt).toISOString() }; modelMtime = mt; }
      catch (e) { model = { status: "error", error: "엑셀 결과를 읽지 못했어요", file: path.relative(ROOT, MODEL) }; }
    }
    send("model", model);
  });
}
setInterval(readModel, 3000);
setTimeout(readModel, 10);

/* ── Claude Code stream-json 해석: 서브에이전트 시작·끝·현재 작업 ── */
function setAgent(name, patch) {
  Object.assign(state.agents[name], patch);
  pushState();
}
function short(s, n = 140) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; }
function describeTool(b) {
  const i = b.input || {};
  const target = i.file_path || i.path || i.pattern || i.query || i.url || i.command || i.description || "";
  return short(`${b.name} ${target}`, 120);
}
function handleEvent(ev) {
  const parent = ev.parent_tool_use_id || null;
  const content = (ev.message && Array.isArray(ev.message.content)) ? ev.message.content : [];
  if (ev.type === "assistant") {
    for (const b of content) {
      if (b.type === "tool_use" && (b.name === "Task" || b.name === "Agent")) {
        const name = b.input && b.input.subagent_type;
        if (AGENTS.includes(name)) {
          taskMap.set(b.id, name);
          setAgent(name, { status: "working", since: new Date().toISOString(), task: short(b.input.description || b.input.prompt, 160), activity: "시작" });
        }
      } else if (parent && taskMap.has(parent)) {
        const name = taskMap.get(parent);
        if (b.type === "tool_use") setAgent(name, { activity: describeTool(b) });
        else if (b.type === "text" && b.text.trim()) setAgent(name, { activity: short(b.text) });
      } else if (!parent) {
        if (b.type === "text" && b.text.trim()) { state.main.activity = short(b.text, 200); pushState(); }
        else if (b.type === "tool_use") { state.main.activity = describeTool(b); pushState(); }
      }
    }
  } else if (ev.type === "user") {
    for (const b of content) {
      if (b.type === "tool_result" && taskMap.has(b.tool_use_id)) {
        const name = taskMap.get(b.tool_use_id);
        taskMap.delete(b.tool_use_id);
        setAgent(name, { status: b.is_error ? "error" : "done", activity: b.is_error ? "오류로 끝남" : "작업 완료" });
      }
    }
  } else if (ev.type === "system" && ev.tool_use_id && /^task_/.test(ev.subtype || "")) {
    // 서브에이전트 진행 이벤트: 시작 · 진행(지금 하는 일) · 끝
    const name = taskMap.get(ev.tool_use_id) || (AGENTS.includes(ev.subagent_type) ? ev.subagent_type : null);
    if (!name) return;
    if (ev.subtype === "task_started" && state.agents[name].status !== "working") {
      taskMap.set(ev.tool_use_id, name);
      setAgent(name, { status: "working", since: new Date().toISOString(), task: short(ev.description, 160), activity: "시작" });
    } else if (ev.subtype === "task_progress") {
      const u = ev.usage || {};
      setAgent(name, { activity: short(ev.description, 120) + (u.tool_uses ? ` · 도구 ${u.tool_uses}회` : "") });
    } else if (ev.subtype === "task_notification" && ev.status && ev.status !== "running") {
      taskMap.delete(ev.tool_use_id);
      setAgent(name, { status: ev.status === "completed" ? "done" : "error", activity: ev.status === "completed" ? "작업 완료" : short("끝남: " + ev.status, 60) });
    }
  } else if (ev.type === "result") {
    state.main.activity = short(ev.result || ev.subtype || "", 200);
    pushState();
  }
}

/* ── 실행·중지 ── */
/* ── 단계 현황: run_log를 요약해 실행 지시에 넣음 (메인이 처음부터 다시 판단하지 않도록) ── */
const STEP_NAMES = ["결정 질문·판정 기준", "자료 수집", "가정 세우기", "시장 규모", "경쟁 비교", "포지셔닝", "단위경제", "계단식 비용", "손익·손익분기", "월별 현금흐름", "민감도·역산", "우선순위", "결론·검토"];
// 단계가 기대는 앞 단계 (이 결과가 없거나 낡았을 때만 앞 단계를 다시 함)
const STEP_DEPS = { 1: [], 2: [], 3: [2], 4: [2, 3], 5: [2], 6: [5], 7: [3], 8: [7], 9: [4, 7, 8], 10: [9], 11: [9], 12: [5, 6], 13: [1, 9, 10, 11, 12] };
function stepSummary() {
  const latest = {}, review = {};
  for (const e of cachedLog) if (!e._invalid && e.step != null) (e.actor === "reviewer" ? review : latest)[+e.step] = e;
  const xlsxT = fs.existsSync(MODEL) ? fs.statSync(MODEL).mtimeMs : 0;
  const lines = [];
  for (let n = 1; n <= 13; n++) {
    const e = latest[n], r = review[n];
    if (!e) { lines.push(`- ${n}단계 ${STEP_NAMES[n - 1]}: 기록 없음 (앞 단계: ${STEP_DEPS[n].join(",") || "없음"})`); continue; }
    const t = Date.parse(e.timestamp || "") || 0;
    const stale = t && xlsxT > t + 60000 ? " · 이 기록 뒤에 엑셀이 바뀜" : "";
    lines.push(`- ${n}단계 ${STEP_NAMES[n - 1]}: ${e.status || "상태 없음"} (줄 ${e.line}, ${e.actor || ""}, ${e.timestamp || ""})${e.status_reason ? " — " + String(e.status_reason).slice(0, 120) : ""}${stale}${r ? ` · 검토 ${r.verdict || r.status}` : ""}`);
  }
  return lines.join("\n");
}
const STEP_RULES = [
  "[단계 선택 규칙] 매번 1단계부터 다시 하지 않는다. 아래 '현재 단계 현황'을 보고 필요한 단계만 돌린다.",
  "- 요청이 있으면: 요청이 가리키는 단계만 고른다. 그 단계의 앞 단계(괄호 안) 결과가 '통과' 또는 '보류'로 이미 있으면 다시 하지 않고 그 결과(run_log, 엑셀 덤프)를 그대로 쓴다. 앞 단계 기록이 없거나 '이 기록 뒤에 엑셀이 바뀜'이고 요청 단계에 영향이 있을 때만 앞 단계를 다시 한다.",
  "- '통과'인 단계는 건너뛴다. 단, 요청이 다시 하라고 하거나 그 단계가 쓰는 입력이 바뀌었으면 다시 한다.",
  "- '보류'(사람이 정할 값이 비어 막힌 단계)는 해당 칸이 채워졌는지만 덤프로 확인한다. 아직 비어 있으면 다시 돌리지 않고 [확인필요]로 둔 채 뒤 단계를 진행한다.",
  "- '미통과'는 사유를 보고 고칠 수 있는 것(자료 보강, 계산 수정, reviewer 지적)만 그 단계를 다시 맡긴다. 사람이 정할 값 때문이면 '보류'로 기록하고 넘어간다.",
  "- 서로 기대지 않는 단계는 동시에 맡긴다 (예: 2단계와 5단계, 10단계와 11단계).",
  "- 시작할 때 '이번에 돌릴 단계 / 건너뛸 단계와 이유'를 한 줄로 밝힌다.",
].join("\n");
function buildPrompt(request) {
  return [
    "CLAUDE.md와 playbook.md를 먼저 읽고 그 절차대로 아래 요청을 진행해.",
    "- 단계별로 맡은 서브에이전트(researcher, competitor-analyzer, model-simulator, reviewer)에게 Task로 맡겨.",
    "- 단계를 하나 끝낼 때마다 CLAUDE.md 규칙대로 run_log.jsonl 맨 끝에 한 줄을 추가해. actor에는 실제로 그 단계를 한 서브에이전트 이름을 적어.",
    "- git commit·push는 하지 마. 사람에게 질문할 수 없으니 막히면 [확인필요]로 남기고 다음으로 넘어가.",
    "",
    STEP_RULES,
    "",
    "[현재 단계 현황 — run_log.jsonl 요약, 서버가 실행 직전에 만듦]",
    stepSummary(),
    "",
    "요청: " + request,
  ].join("\n");
}
// 요청을 비워 두고 실행하면: 필요한 단계만 골라 13단계 결론까지 진행
const AUTO_REQUEST = [
  "[자동 실행] 기준 엑셀 idea/market_model_case_AxO.xlsx의 사업(한방 기초라인 출시)에 대해 13단계 결론까지 필요한 단계만 진행해.",
  "1) '현재 단계 현황'에서 기록이 없거나, 고칠 수 있는 이유로 미통과이거나, 입력이 바뀐 단계만 고른다. 통과·보류 단계는 다시 하지 않는다.",
  "2) 고른 단계는 앞 단계 순서를 지키되 서로 기대지 않는 단계는 동시에 돌린다. reviewer 점검은 4·6·11단계 묶음과 13단계에서 받는다 (이미 그 묶음이 검토를 통과했고 바뀐 게 없으면 생략).",
  "3) 사람이 정해야 하는 값은 근거 있는 제안값을 세우되 엑셀 입력 칸은 비워 두고 [확인필요]로 기록한다.",
  "4) 마지막에 13단계 결론(가 / 부 / 조건부 시행)과 남은 [확인필요]·보류 목록을 정리한다.",
].join("\n");
// 메인 에이전트를 '지휘만 하는' 역할로 고정 (직접 조사·계산하지 않고 서브에이전트에게 맡김)
const ORCHESTRATOR = [
  "너는 이번 실행의 오케스트레이터(지휘자)다. 직접 조사·계산·파일 편집을 하지 않는다.",
  "네가 직접 해도 되는 일: CLAUDE.md · playbook.md · run_log.jsonl 읽기, Task 도구로 서브에이전트 호출, run_log.jsonl에 줄 추가.",
  "그 밖의 모든 일(자료 검색, 엑셀 읽기·수정, 계산, 경쟁 분석, 검토)은 반드시 Task 도구로 담당 서브에이전트에게 맡긴다:",
  "- researcher: 2단계 자료 수집, 3단계 가정의 근거, 4단계 시장 규모 입력값, 1단계 판정 기준의 근거",
  "- competitor-analyzer: 5단계 경쟁 비교, 6단계 포지셔닝, 12단계 우선순위 점수 근거",
  "- model-simulator: 3단계 가정 세우기, 7~11단계 엑셀 계산, 13단계 결론 시트의 숫자",
  "- reviewer: 검토는 묶어서 한다. 4단계(시장)·6단계(포지셔닝)·11단계(민감도)가 끝난 뒤 그때까지의 단계를 한꺼번에 점검하고, 마지막에 13단계 결론을 심사한다. 미통과가 나오면 해당 단계만 다시 맡긴다.",
  "서로 기다릴 필요가 없는 일(예: 2단계 자료 수집과 5단계 경쟁 비교)은 Task를 한 번에 여러 개 호출해 동시에 진행한다.",
  "서브에이전트가 결과를 돌려주면 그 내용으로 run_log.jsonl 맨 끝에 한 줄을 추가한다 (actor = 그 서브에이전트 이름). 서브에이전트에게는 run_log를 직접 쓰지 말고 기록할 내용을 결과 끝에 JSON으로 달라고 한다.",
  "pip 등 패키지 설치는 하지 않는다. 필요한 도구가 없으면 [확인필요]로 남긴다.",
  "",
  "[속도 규칙]",
  "- 서브에이전트에게 맡길 때 playbook에서 그 단계 부분만 요약해 넘기고, 아래 '파일 지도'에서 그 단계에 필요한 파일 경로를 함께 적어 준다. 저장소 전체 검색(Grep·Glob)은 지도에 없는 것을 찾을 때만 한다.",
  "- 엑셀 내용은 원본을 새로 해석하지 말고 미리 풀어 둔 덤프를 읽는다: beautyagent/dashboard/cache/xlsx/_index.md 와 시트별 md (칸 · 수식 · 값). 엑셀 수정은 model-simulator만 원본에 하고, 수정 뒤에는 python beautyagent/dashboard/dump_model.py idea/market_model_case_AxO.xlsx beautyagent/dashboard/cache/xlsx 로 덤프를 다시 만든다.",
  "- 덤프·임시 파일을 idea/ 나 research/ 에 만들지 않는다. 임시 파일은 beautyagent/dashboard/cache/ 에 둔다.",
  "",
  "[파일 지도]",
  "- 공통 규칙: CLAUDE.md, playbook.md",
  "- 1단계 판정 기준: cosmetics-launch-checklist.md, 덤프 안내.md",
  "- 2~4단계 자료·가정·시장: research/HSJ_가격기준_K5.md, research/LJH_올리브영-상위제품-가격.md, research/MEJ_원가율_업계기준.md, research/한방화장품 시장조사_산업규모 및 약령시의 현재.md, research/MEJ_기초라인_유형별구성.md, research/HSJ_시장근거.md, 덤프 자료.md · 가정.md · 시장규모.md",
  "- 5·6·12단계 경쟁·포지셔닝·우선순위: research/LJH_원료별-경쟁제품.md, research/HSJ_가격기준_K5.md(4장), research/MEJ_기능성화장품_원료후보표.md, 덤프 경쟁비교.md · 포지셔닝.md · 원료순위.md",
  "- 7~11단계 계산: 덤프 가정.md · 단위경제.md · 손익.md · 주문수량표.md · 민감도.md, idea/MEJ_출시가_결정과정.md",
  "- 13단계 결론: 덤프 전체, run_log.jsonl",
].join("\n");
const CACHE = path.join(__dirname, "cache", "xlsx");
function refreshDump() {
  try {
    const idx = path.join(CACHE, "_index.md");
    if (fs.existsSync(MODEL) && (!fs.existsSync(idx) || fs.statSync(idx).mtimeMs < fs.statSync(MODEL).mtimeMs)) {
      require("child_process").execFileSync(PYTHON, [path.join(__dirname, "dump_model.py"), MODEL, CACHE], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 60000 });
    }
    return true;
  } catch (e) { return false; }
}
function startRun(request) {
  request = String(request || "").trim() || AUTO_REQUEST;
  if (child) return { ok: false, error: "이미 실행 중이에요" };
  const { cmd, pre } = claudeCommand();
  const args = [...pre, "-p", buildPrompt(request), "--output-format", "stream-json", "--verbose",
    "--permission-mode", "acceptEdits",
    "--allowedTools", "Read,Grep,Glob,Edit,Write,WebSearch,WebFetch,Task,Agent,Bash(python:*),Bash(py:*),PowerShell",
    "--disallowedTools", "Bash(git push:*),Bash(git commit:*),Bash(pip:*),Bash(pip3:*),Bash(python -m pip:*),Bash(py -m pip:*)",
    "--append-system-prompt", ORCHESTRATOR];
  for (const a of AGENTS) state.agents[a] = { status: "idle", since: null, task: "", activity: "" };
  taskMap.clear();
  state.main.activity = refreshDump() ? "엑셀 덤프 확인 완료 · Claude Code 시작 중…" : "엑셀 덤프를 만들지 못했어요 · Claude Code 시작 중…";
  try {
    child = spawn(cmd, args, { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    state.run = { ...state.run, status: "error", error: String(e.message) }; pushState();
    return { ok: false, error: String(e.message) };
  }
  state.run = { status: "running", pid: child.pid, startedAt: new Date().toISOString(), endedAt: null, request: request === AUTO_REQUEST ? "자동 실행 · 필요한 단계만 골라 결론까지" : request, exitCode: null, error: null };
  pushState();
  let buf = "";
  const raw = fs.createWriteStream(path.join(__dirname, "last_run.stream.jsonl"), { flags: "w" });
  child.stdout.on("data", d => {
    raw.write(d);
    buf += d.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { handleEvent(JSON.parse(line)); } catch (e) { /* JSON 아닌 줄은 무시 */ }
    }
  });
  child.stderr.on("data", d => { state.main.activity = short("stderr: " + d.toString("utf8"), 200); pushState(); });
  child.on("error", e => { state.run.status = "error"; state.run.error = String(e.message); child = null; pushState(); });
  child.on("exit", code => {
    raw.end();
    const stopped = state.run.status === "stopping";
    state.run = { ...state.run, status: stopped ? "stopped" : (code === 0 ? "finished" : "error"), exitCode: code, endedAt: new Date().toISOString(), pid: null };
    for (const a of AGENTS) if (state.agents[a].status === "working") state.agents[a] = { ...state.agents[a], status: stopped ? "stopped" : "error", activity: stopped ? "중지됨" : "끝나지 않음" };
    child = null; taskMap.clear(); checkLog(); pushState();
  });
  return { ok: true };
}
function stopRun() {
  if (!child) return { ok: false, error: "실행 중이 아니에요" };
  state.run.status = "stopping"; pushState();
  if (process.platform === "win32") execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => {});
  else child.kill("SIGTERM");
  return { ok: true };
}

/* ── HTTP ── */
function readBody(req) {
  return new Promise(resolve => { let s = ""; req.on("data", d => { s += d; if (s.length > 1e5) req.destroy(); }); req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch (e) { resolve({}); } }); });
}
function json(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(fs.readFileSync(path.join(__dirname, "dashboard.html")));
  }
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: hello\ndata: ${JSON.stringify({ state, log: cachedLog, model, logPath: path.relative(ROOT, LOG) || LOG, claude: claudeCommand().cmd })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await readBody(req);
    const request = String(body.request || "").trim();
    const r = startRun(request.slice(0, 2000)); // 비어 있으면 playbook 전체 자동 진행
    return json(res, r.ok ? 200 : 409, r);
  }
  if (req.method === "POST" && url.pathname === "/api/stop") {
    const r = stopRun();
    return json(res, r.ok ? 200 : 409, r);
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, "127.0.0.1", () => {
  console.log(`AxO 대시보드: http://localhost:${PORT}`);
  console.log(`로그 파일: ${LOG}`);
  console.log(`Claude Code: ${claudeCommand().cmd}`);
});

process.on("SIGINT", () => { if (child) stopRun(); process.exit(0); });
