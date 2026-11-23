/* 마이 기획실: 내 기획안 목록 → 기획안 보기(버전 선택, 시나리오 3개, 이미지 다시 만들기). */
import { callApi, AuthRequired } from "./api.js";
import { hasSupabase } from "../lib/supabase.js";
import { esc } from "../utils/text.js";

const root = () => document.querySelector("#view-my .page");
let notice = [];       // 기획안 만들기 직후 이미지 실패 안내 (보기 화면 위에 보여 줘요)
let seq = 0;           // 늦게 도착한 응답이 화면을 덮어쓰지 않게 해요

const money = n => (Number.isFinite(n) ? `${n.toLocaleString("ko-KR")}원` : "-");
const perMl = (price, ml) => (Number.isFinite(price) && Number.isFinite(ml) && ml > 0 ? `${Math.round(price / ml).toLocaleString("ko-KR")}원` : "-");
const ymd = s => { const d = new Date(s); return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const list = arr => (arr?.length ? `<ul>${arr.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="my-none">없어요.</p>`);

function message(html) { root().innerHTML = `<div class="my-msg">${html}</div>`; }

async function guard(fn) {
  if (!hasSupabase) return message("<p>로그인 기능이 아직 연결되지 않았어요. 관리자에게 문의해 주세요.</p>");
  try { await fn(); }
  catch (e) {
    if (e instanceof AuthRequired) message(`<p>로그인하면 내가 만든 기획안을 볼 수 있어요.</p><p class="my-sub">로그인한 뒤 위 메뉴의 마이 기획실을 다시 눌러 주세요.</p>`);
    else message(`<p>${esc(e.message || "불러오지 못했어요.")}</p><button class="btn-line" type="button" data-my-list>목록으로</button>`);
  }
}

/* ── 목록 ── */
export function showList() {
  const my = ++seq;
  notice = [];
  return guard(async () => {
    message("<p>불러오는 중이에요…</p>");
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
function slotHtml(i, url, isLatest) {
  if (url) return `<img src="${esc(url)}" alt="시나리오 ${i + 1} 이미지" loading="lazy">${isLatest ? `<button type="button" class="my-regen" data-regen="${i}">이미지 다시 만들기</button>` : ""}`;
  return `<div class="my-empty"><p>이미지가 아직 없어요.</p><button type="button" class="btn-line" data-fill="${i}">다시 만들기</button></div>`;
}

function scenarioHtml(s, i, url, isLatest) {
  return `<article class="my-scn">
    <div class="my-img" data-slot>${slotHtml(i, url, isLatest)}</div>
    <div class="my-scn-body">
      <h4>${esc(s.title)}</h4>
      <p class="my-meta">채널 ${esc(s.channel)} · 타깃 ${esc(s.target)}</p>
      <p>${esc(s.concept)}</p>
      <ol class="my-cuts">${(s.cuts || []).map(c => `<li><span>${esc(c.scene)}</span><q>${esc(c.copy)}</q></li>`).join("")}</ol>
    </div>
  </article>`;
}

function render(d) {
  const c = d.version.content, p = c.plan ?? {}, isLatest = d.version.version_no === d.latest_version_no;
  const rows = (p.products || []).map(x => `<tr><td>${esc(x.name)}</td><td>${x.ml ? `${esc(x.ml)}ml` : "-"}</td><td>${money(x.price)}</td><td>${perMl(x.price, x.ml)}</td><td>${esc(x.role ?? "")}</td><td>${esc(x.status ?? "")}</td></tr>`).join("");
  root().innerHTML = `
    <button class="btn-line my-back" type="button" data-my-list>← 목록</button>
    ${notice.length ? `<div class="my-notice" role="status">${notice.map(n => `<p>${esc(n)}</p>`).join("")}</div>` : ""}
    <div class="my-head">
      <div><div class="herb">${esc(d.plan.season)} · ${esc(d.plan.herb)} · ${esc(d.plan.purpose)}</div><h2>${esc(p.concept_name ?? "")}</h2></div>
      <label class="my-ver">버전 <select id="my-ver">${d.versions.map(n => `<option value="${n}"${n === d.version.version_no ? " selected" : ""}>v${n}${n === d.latest_version_no ? " (최신)" : ""}</option>`).join("")}</select></label>
    </div>
    ${isLatest ? "" : `<p class="my-old">지난 버전이에요. 이미지 다시 만들기는 최신 버전에서만 할 수 있어요.</p>`}
    <section class="my-sec"><h3>콘셉트</h3><p>${esc(p.concept ?? "")}</p><h3>타깃</h3><p>${esc(p.target ?? "")}</p></section>
    <section class="my-sec"><h3>핵심 문구</h3>${list(p.key_claims)}</section>
    <section class="my-sec"><h3>제품 구성</h3><div class="my-table"><table><thead><tr><th>이름</th><th>용량</th><th>정가</th><th>ml당 가격</th><th>역할</th><th>구분</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="my-sec"><h3>근거 메모</h3>${list(p.notes)}</section>
    <section class="my-sec"><h3>주의사항</h3>${list(p.cautions)}</section>
    <section class="my-sec"><h3>검토 의견</h3>${list(p.review_notes)}</section>
    <section class="my-sec"><h3>시나리오</h3><div class="my-scns">${(c.scenarios || []).slice(0, 3).map((s, i) => scenarioHtml(s, i, d.image_urls[i], isLatest)).join("")}</div></section>`;
  root().dataset.plan = d.plan.id;
  root().dataset.version = d.version.version_no;
}

export function openPlan(planId, versionNo, notes) {
  const my = ++seq;
  notice = notes ?? [];
  return guard(async () => {
    message("<p>불러오는 중이에요…</p>");
    const d = await callApi("/api/plan-get", versionNo ? { plan_id: planId, version_no: versionNo } : { plan_id: planId });
    if (my !== seq) return;
    render(d);
  });
}

/* 빈 칸 채우기(regenerate:false) 또는 이미지 다시 만들기(regenerate:true). 한도(402)·만드는 중(409) 문구는 alert로 보여 줘요. */
async function makeImage(btn, idx, regenerate) {
  const page = root(), planId = page.dataset.plan, versionNo = Number(page.dataset.version);
  const slot = btn.closest("[data-slot]");
  const old = slot.innerHTML;
  slot.innerHTML = `<div class="my-empty"><p>이미지를 만드는 중이에요…</p></div>`;
  const same = () => root().dataset.plan === planId && Number(root().dataset.version) === versionNo && slot.isConnected;
  try {
    const { url } = await callApi("/api/plan-image", { plan_id: planId, version_no: versionNo, idx, regenerate });
    if (same()) slot.innerHTML = slotHtml(idx, url, true);
  } catch (e) {
    if (same()) slot.innerHTML = old;
    if (!(e instanceof AuthRequired)) alert(e.message || "이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export function initMy() {
  document.querySelector('.menu [data-view="my"]')?.addEventListener("click", showList);
  root()?.addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.plan) openPlan(t.dataset.plan);
    else if ("myList" in t.dataset) showList();
    else if (t.dataset.fill != null) makeImage(t, Number(t.dataset.fill), false);
    else if (t.dataset.regen != null) makeImage(t, Number(t.dataset.regen), true);
  });
  root()?.addEventListener("change", e => {
    if (e.target.id === "my-ver") openPlan(root().dataset.plan, Number(e.target.value));
  });
}
