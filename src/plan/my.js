/* 마이 기획실: 내 기획안 목록 → 기획안 보기(버전 선택, 광고 시나리오 1개 + 이미지 3장, 이미지 다시 만들기, 오른쪽 수정 챗봇).
   예전 기획안(시나리오 3개, 시나리오마다 이미지 1장)도 그대로 보여 줘요. */
import { callApi, AuthRequired } from "./api.js";
import { mountEditChat } from "../chat/chat.js";
import { hasSupabase, supabase } from "../lib/supabase.js";
import { esc } from "../utils/text.js";
import { productVisual } from "../app.js";
import { LOADING_IMAGES } from "../config/assets.js";
import { qty, unitOf } from "../config/rules.js";

const root = () => document.querySelector("#view-my .page");
let notice = [];       // 보기 화면 위에 보여 줄 안내 (예: 기획안 만들기 직후 이미지 만드는 중)
let seq = 0;           // 늦게 도착한 응답이 화면을 덮어쓰지 않게 해요
let chat = null;       // 지금 기획안의 수정 챗봇 { planId, el } — 버전을 바꿔 다시 그려도 대화가 이어져요
let needLogin = false; // 로그인 안내를 띄운 상태인지 (로그인하면 바로 목록을 다시 불러와요)

const money = n => (Number.isFinite(n) ? `${n.toLocaleString("ko-KR")}원` : "-");
/* 단위당 가격: 마스크·패드는 매당, 나머지는 ml당 */
const perUnit = (type, price, n) => (Number.isFinite(price) && Number.isFinite(n) && n > 0 ? `${unitOf(type)}당 ${Math.round(price / n).toLocaleString("ko-KR")}원` : "-");
const ymd = s => { const d = new Date(s); return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const list = arr => (arr?.length ? `<ul>${arr.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="my-none">없어요.</p>`);

function message(html) { root().innerHTML = `<div class="my-msg">${html}</div>`; }
const showLoginNeeded = () => message(`<p>로그인하면 마이 기획실을 볼 수 있어요.</p>`);
const myOpen = () => !document.getElementById("view-my")?.hidden;
/* 불러오는 동안 로딩 캐릭터(두 장면이 번갈아 나와요)와 문구를 보여 줘요 */
const loading = text => message(`<div class="loading-char" aria-hidden="true">${LOADING_IMAGES.map(src => `<img src="${src}" alt="">`).join("")}</div><p>${esc(text)}</p>`);

async function guard(fn) {
  if (!hasSupabase) return message("<p>로그인 기능이 아직 연결되지 않았어요. 관리자에게 문의해 주세요.</p>");
  needLogin = false;
  try { await fn(); }
  catch (e) {
    if (e instanceof AuthRequired) { needLogin = true; showLoginNeeded(); }
    else message(`<p>${esc(e.message || "불러오지 못했어요.")}</p><button class="btn-line" type="button" data-my-list>목록으로</button>`);
  }
}

/* ── 목록 ── */
export function showList() {
  const my = ++seq;
  notice = [];
  chat = null;
  return guard(async () => {
    loading("불러오는 중이에요…");
    const { plans } = await callApi("/api/plan-get", {});
    if (my !== seq) return;
    if (!plans.length) return message(`<p>아직 만든 기획안이 없어요.</p><p class="my-sub">출시 기획실에서 후보를 골라 [기획안 만들기]를 눌러 보세요.</p>`);
    root().innerHTML = `<h2 class="my-h">마이 기획실</h2><ul class="my-list">${plans.map(p => `
      <li><button type="button" class="my-card" data-plan="${esc(p.id)}">
        <b>${esc(p.season)} · ${esc(p.herb)}</b><span>${esc(p.purpose)}</span>
        <small>최신 v${esc(p.latest_version ?? 1)} · 수정 ${esc(ymd(p.updated_at))}</small>
      </button></li>`).join("")}</ul>`;
  });
}

/* ── 보기 ── */
const IMAGE_KINDS = ["제품 대표 컷", "원료·질감 컷", "사용 장면 컷"]; // server/agents/designer.js 와 같은 순서
let legacy = false;    // 지금 보는 버전이 예전 형식(시나리오 3개)인지

const imgLabel = i => (legacy ? `시나리오 ${i + 1}` : IMAGE_KINDS[i]);
/* 이 버전에 있어야 할 이미지 칸 번호: 지금 형식은 시나리오 1개에 3장, 예전 형식은 시나리오마다 1장 */
const imageSlots = scenarios => (scenarios.length > 1 ? scenarios.slice(0, 3).map((_, i) => i) : scenarios.length ? [0, 1, 2] : []);

function slotHtml(i, url, isLatest) {
  if (url) return `<img src="${esc(url)}" alt="${esc(imgLabel(i))} 이미지" loading="lazy">${isLatest ? `<button type="button" class="my-regen" data-regen="${i}">이미지 다시 만들기</button>` : ""}`;
  return `<div class="my-empty"><p>이미지가 아직 없어요.</p><button type="button" class="btn-line" data-fill="${i}">다시 만들기</button></div>`;
}

const scenarioBody = s => `<div class="my-scn-body">
      <h4>${esc(s.title)}</h4>
      <p class="my-meta">채널 ${esc(s.channel)} · 타깃 ${esc(s.target)}</p>
      <p>${esc(s.concept)}</p>
      <ol class="my-cuts">${(s.cuts || []).map(c => `<li><span>${esc(c.scene)}</span><q>${esc(c.copy)}</q></li>`).join("")}</ol>
    </div>`;

/* 예전 형식: 시나리오마다 이미지 1장 */
function legacyScenarioHtml(s, i, url, isLatest) {
  return `<article class="my-scn"><div class="my-img" data-slot>${slotHtml(i, url, isLatest)}</div>${scenarioBody(s)}</article>`;
}

/* 지금 형식: 광고 시나리오 1개 + 이미지 3장 */
function scenarioSection(scenarios, urls, isLatest) {
  if (legacy) return `<section class="my-sec"><h3>시나리오</h3><div class="my-scns">${scenarios.slice(0, 3).map((s, i) => legacyScenarioHtml(s, i, urls[i], isLatest)).join("")}</div></section>`;
  const s = scenarios[0];
  return `<section class="my-sec"><h3>광고 시나리오</h3>${s ? `<article class="my-scn my-scn-one">${scenarioBody(s)}</article>` : `<p class="my-none">없어요.</p>`}</section>
    <section class="my-sec"><h3>광고 이미지</h3><div class="my-shots">${IMAGE_KINDS.map((k, i) => `<figure class="my-shot"><div class="my-img" data-slot>${slotHtml(i, urls[i], isLatest)}</div><figcaption>${esc(k)}</figcaption></figure>`).join("")}</div></section>`;
}

function render(d) {
  const c = d.version.content, p = c.plan ?? {}, isLatest = d.version.version_no === d.latest_version_no;
  const scenarios = c.scenarios || [];
  legacy = scenarios.length > 1;
  const rows = (p.products || []).map(x => `<tr><td>${esc(x.name)}</td><td>${x.ml ? esc(qty(x.type, x.ml)) : "-"}</td><td>${money(x.price)}</td><td>${perUnit(x.type, x.price, x.ml)}</td><td>${esc(x.role ?? "")}</td><td>${esc(x.status ?? "")}</td></tr>`).join("");
  root().innerHTML = `<div class="my-layout"><div class="my-main">
    <button class="btn-line my-back" type="button" data-my-list>← 목록</button>
    ${notice.length ? `<div class="my-notice" role="status">${notice.map(n => `<p>${esc(n)}</p>`).join("")}</div>` : ""}
    <div class="my-head">
      <div><div class="herb">${esc(d.plan.season)} · ${esc(d.plan.herb)} · ${esc(d.plan.purpose)}</div><h2>${esc(p.concept_name ?? "")}</h2></div>
      <label class="my-ver">버전 <select id="my-ver">${d.versions.map(n => `<option value="${n}"${n === d.version.version_no ? " selected" : ""}>v${n}${n === d.latest_version_no ? " (최신)" : ""}</option>`).join("")}</select></label>
    </div>
    ${isLatest ? "" : `<p class="my-old">지난 버전이에요. 이미지 다시 만들기는 최신 버전에서만 할 수 있어요.</p>`}
    <section class="my-sec"><h3>콘셉트</h3><p>${esc(p.concept ?? "")}</p><h3>타깃</h3><p>${esc(p.target ?? "")}</p></section>
    <section class="my-sec"><h3>핵심 문구</h3>${list(p.key_claims)}</section>
    ${(v => v ? `<section class="my-sec"><h3>제품 이미지</h3><div class="my-product">${v}</div></section>` : "")(productVisual(d.plan.season, d.plan.herb, d.plan.purpose, p.products))}
    <section class="my-sec"><h3>제품 구성</h3><div class="my-table"><table><thead><tr><th>이름</th><th>용량</th><th>정가</th><th>단위당 가격</th><th>역할</th><th>구분</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="my-sec"><h3>근거 메모</h3>${list(p.notes)}</section>
    <section class="my-sec"><h3>주의사항</h3>${list(p.cautions)}</section>
    <section class="my-sec"><h3>검토 의견</h3>${list(p.review_notes)}</section>
    ${scenarioSection(scenarios, d.image_urls || [], isLatest)}
    </div><aside class="my-side" aria-label="기획안 수정"></aside></div>`;
  root().dataset.plan = d.plan.id;
  root().dataset.version = d.version.version_no;
  root().dataset.latest = isLatest ? "1" : "0";
  attachChat(d.plan.id, isLatest);
}

/* 최신 버전에서만 수정 챗봇을 붙여요. 같은 기획안이면 만들어 둔 패널을 옮겨 붙여서 대화가 이어져요. */
function attachChat(planId, isLatest) {
  const side = root().querySelector(".my-side");
  if (!isLatest) {
    side.innerHTML = `<div class="my-side-note"><p>수정은 최신 버전에서 할 수 있어요.</p><button class="btn-line" type="button" data-go-latest>최신 버전 보기</button></div>`;
    return;
  }
  if (chat?.planId === planId) { side.appendChild(chat.el); return; }
  chat = { planId, el: mountEditChat(side, {
    planId,
    getVersionNo: () => Number(root().dataset.version),
    onApplied: (versionNo, regenerate) => afterEdit(planId, versionNo, regenerate),
    onStale: () => openPlan(planId)
  }) };
}

/* 수정을 적용하면 새 버전을 열고, 새로 만들기로 한 이미지 자리를 채워요 (나머지 이미지는 서버가 이전 버전에서 복사해 둬요). */
async function afterEdit(planId, versionNo, regenerate) {
  await openPlan(planId, versionNo);
  if (root().dataset.plan !== planId || Number(root().dataset.version) !== versionNo) return;
  for (const i of regenerate) {
    const btn = root().querySelector(`[data-fill="${i}"]`);
    if (btn) makeImage(btn, i, false);
  }
}

/* fillImages: 기획안을 막 만들었을 때 true. 저장된 기획안을 연 뒤 빈 이미지 칸(최대 3장)을 한꺼번에 채워요. */
export function openPlan(planId, versionNo, notes, { fillImages = false } = {}) {
  const my = ++seq;
  notice = notes ?? [];
  return guard(async () => {
    loading("불러오는 중이에요…");
    const d = await callApi("/api/plan-get", versionNo ? { plan_id: planId, version_no: versionNo } : { plan_id: planId });
    if (my !== seq) return;
    const empty = fillImages && d.version.version_no === d.latest_version_no
      ? imageSlots(d.version.content?.scenarios || []).filter(i => !d.image_urls?.[i]) : [];
    if (empty.length) notice = [...notice, `기획안을 저장했어요. 광고 이미지 ${empty.length}장을 만드는 중이에요 (1~2분). 기다리는 동안 기획안을 읽어 보세요.`];
    render(d);
    for (const i of empty) {
      const btn = root().querySelector(`[data-fill="${i}"]`);
      if (btn) makeImage(btn, i, false, { quiet: true });
    }
  });
}

/* 빈 칸 채우기(regenerate:false) 또는 이미지 다시 만들기(regenerate:true). 한도(402)·만드는 중(409) 문구는 alert로 보여 줘요.
   quiet: 자동으로 채울 때는 alert 대신 그 칸에 실패 이유를 적어요 (3장이 한꺼번에 실패해도 창이 3번 뜨지 않게). */
async function makeImage(btn, idx, regenerate, { quiet = false } = {}) {
  const page = root(), planId = page.dataset.plan, versionNo = Number(page.dataset.version);
  const slot = btn.closest("[data-slot]");
  const old = slot.innerHTML;
  slot.innerHTML = `<div class="my-empty"><span class="my-spin" aria-hidden="true"></span><p>이미지를 만드는 중이에요…</p></div>`;
  const same = () => root().dataset.plan === planId && Number(root().dataset.version) === versionNo && slot.isConnected;
  try {
    const { url } = await callApi("/api/plan-image", { plan_id: planId, version_no: versionNo, idx, regenerate });
    if (same()) slot.innerHTML = slotHtml(idx, url, root().dataset.latest === "1");
  } catch (e) {
    const why = e instanceof AuthRequired ? "로그인이 만료됐어요. 다시 로그인해 주세요." : (e.message || "이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (!quiet) {
      if (same()) slot.innerHTML = old;
      if (!(e instanceof AuthRequired)) alert(why);
      return;
    }
    if (same()) slot.innerHTML = `<div class="my-empty"><p>${esc(why)}</p><button type="button" class="btn-line" data-fill="${idx}">다시 만들기</button></div>`;
  }
}

export function initMy() {
  document.querySelector('.menu [data-view="my"]')?.addEventListener("click", showList);
  /* 로그인·로그아웃하면 새로고침 없이 마이 기획실을 바로 바꿔요.
     Supabase 는 로그인이 유지된 상태에서도 탭으로 돌아올 때 세션을 다시 확인하고 SIGNED_IN 알림을 한 번 더 보내요.
     (다시 로그인하는 게 아니라 "아직 로그인돼 있어요"라는 알림) 그래서 로그인 안내를 띄운 때만 목록을 다시 불러와요. */
  supabase?.auth.onAuthStateChange(event => {
    if (event === "SIGNED_IN" && needLogin && myOpen()) showList();
    if (event === "SIGNED_OUT") {
      ++seq; chat = null; needLogin = true;
      if (myOpen()) showLoginNeeded(); else root().innerHTML = "";
    }
  });
  root()?.addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.plan) openPlan(t.dataset.plan);
    else if ("myList" in t.dataset) showList();
    else if ("goLatest" in t.dataset) openPlan(root().dataset.plan);
    else if (t.dataset.fill != null) makeImage(t, Number(t.dataset.fill), false);
    else if (t.dataset.regen != null) makeImage(t, Number(t.dataset.regen), true);
  });
  root()?.addEventListener("change", e => {
    if (e.target.id === "my-ver") openPlan(root().dataset.plan, Number(e.target.value));
  });
}
