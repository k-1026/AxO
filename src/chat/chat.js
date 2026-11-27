/* 마이 기획실 '기획안 보기' 오른쪽의 수정 챗봇.
   요청 → /api/plan-edit/preview 로 답과 수정안(미리보기 카드)을 받고 → [적용]하면 /api/plan-edit/apply 로 새 버전을 저장해요.
   미리보기는 저장하지 않고 횟수도 세지 않아요. 적용만 수정 횟수에 들어가요. */
import { esc } from "../utils/text.js";
import { callApi, ApiError, AuthRequired } from "../plan/api.js";

const MAX_INPUT = 2000;   // 서버가 받는 메시지 한 개 최대 길이
const MAX_HISTORY = 20;   // 서버가 받는 대화 최대 개수
const GREETING = "이 기획안에서 고치고 싶은 부분을 말씀해 주세요. 바뀌는 내용을 먼저 보여 드리고, **[적용]**을 누르면 새 버전으로 저장해요.";
const SUGGESTIONS = ["타깃을 20대 직장인으로 바꿔 줘", "핵심 문구를 더 짧게 다듬어 줘", "팝업 디자인 이미지를 다시 만들어 줘"];
/* 이미지 번호 → 이름 (server/agents/designer.js 와 같은 순서). 예전 형식 기획안은 my.js 가 getImageKinds 로 알려 줘요 */
const IMAGE_KINDS = ["제품 패키징", "오프라인 팝업 디자인"];
const RETRY_TEXT = "검증에서 걸린 부분을 피해서 고친 안을 다시 제안해 줘";

/* 아주 작은 마크다운: **굵게**, 목록(- / 1.), 줄바꿈. 먼저 이스케이프해서 HTML 주입을 막아요. */
function md(text) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; } };
  for (const raw of String(text).split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(inline((ul || ol)[1]));
    } else {
      flush();
      if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return out.join("");
}

function cardHtml(p, kinds = IMAGE_KINDS) {
  const changes = (p.changes || []).map(c => `<li><b>${esc(c.part)}</b>${c.before ? `<span class="ec-before">${esc(c.before)}</span>` : ""}<span class="ec-after">→ ${esc(c.after)}</span></li>`).join("");
  const names = p.designs ? IMAGE_KINDS : kinds; // 디자인이 새로 생기면 지금 형식 이름
  const imgs = (p.regenerate_images || []).map(i => names[i] || `이미지 ${i + 1}`).join(", ");
  return `<div class="edit-card">
    <p class="ec-sum">${esc(p.summary)}</p>
    ${changes ? `<ul class="ec-list">${changes}</ul>` : ""}
    ${(p.notices || []).map(n => `<p class="ec-img">⚠️ ${esc(n)}</p>`).join("")}
    <p class="ec-img">${imgs ? `새로 만들 이미지: ${esc(imgs)}` : "이미지는 그대로 둬요."}</p>
    <div class="ec-actions"><button type="button" class="btn-line" data-ec="cancel">취소</button><button type="button" class="btn-solid" data-ec="apply">적용</button></div>
  </div>`;
}

/**
 * @param {HTMLElement} container 패널을 넣을 자리
 * @param {{ planId: string, getVersionNo: () => number, getImageKinds?: () => string[], onApplied: (versionNo: number, regenerate: number[]) => void, onStale: () => void }} opts
 * @returns {HTMLElement} 패널 (화면을 다시 그릴 때 옮겨 붙여 대화를 이어 가요)
 */
export function mountEditChat(container, { planId, getVersionNo, getImageKinds, onApplied, onStale }) {
  container.insertAdjacentHTML("beforeend", `<section class="edit-chat" aria-labelledby="edit-chat-title">
    <header class="chat-head"><div><strong id="edit-chat-title">기획안 수정</strong><span class="chat-sub">AI에게 말로 고쳐 달라고 해 보세요</span></div></header>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-suggest">${SUGGESTIONS.map(s => `<button type="button" class="chat-chip">${esc(s)}</button>`).join("")}</div>
    <form class="chat-form">
      <textarea rows="1" maxlength="${MAX_INPUT}" placeholder="고칠 내용을 적어 주세요" aria-label="수정 요청"></textarea>
      <button type="submit" class="chat-send" aria-label="보내기">↑</button>
    </form>
    <p class="chat-note">[적용]할 때마다 수정 횟수 1회를 써요 (기획안 1건당 5회). 저장 전에 금지 표현 검증을 다시 해요.</p>
  </section>`);
  const panel = container.lastElementChild;
  const log = panel.querySelector(".chat-log"), input = panel.querySelector("textarea"), send = panel.querySelector(".chat-send"), suggest = panel.querySelector(".chat-suggest");

  /** @type {{role:'user'|'assistant', content:string}[]} */
  let history = [];
  let busy = false;

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const bubble = (role, html, extra = "") => {
    log.insertAdjacentHTML("beforeend", `<div class="chat-msg ${role}${extra ? " " + extra : ""}"><div class="chat-bubble">${html}</div></div>`);
    scroll();
    return log.lastElementChild;
  };
  const waiting = () => bubble("assistant", `<span class="chat-typing" aria-label="답변 작성 중"><i></i><i></i><i></i></span>`);
  const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  const setBusy = b => { busy = b; send.disabled = b; input.disabled = b; panel.querySelectorAll("[data-ec]").forEach(x => { x.disabled = b; }); };
  const remember = (role, content) => { history.push({ role, content: content.slice(0, MAX_INPUT) }); history = history.slice(-MAX_HISTORY); };
  const closeCards = () => panel.querySelectorAll(".edit-card .ec-actions").forEach(a => a.remove());

  /* 다른 곳에서 먼저 고쳐졌으면(409) 최신 버전을 다시 불러와요 */
  const isStale = e => e instanceof ApiError && e.status === 409 && /최신/.test(e.message);
  function stale() {
    bubble("assistant", md("다른 곳에서 먼저 수정됐어요. 최신 버전을 불러올게요."));
    history = []; closeCards();
    onStale();
  }

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    suggest.hidden = true;
    closeCards();
    bubble("user", md(text));
    remember("user", text);
    input.value = ""; autosize(); setBusy(true);
    const wait = waiting();
    try {
      const { reply, proposal } = await callApi("/api/plan-edit/preview", { plan_id: planId, base_version_no: getVersionNo(), messages: history });
      remember("assistant", reply);
      wait.querySelector(".chat-bubble").innerHTML = md(reply) + (proposal ? cardHtml(proposal, getImageKinds?.() || IMAGE_KINDS) : "");
      if (proposal) wait._proposal = proposal;
    } catch (e) {
      history.pop(); // 실패한 요청은 대화 기록에서 빼요
      wait.remove();
      if (e instanceof AuthRequired) bubble("assistant", md("로그인이 필요해요. 로그인한 뒤 다시 보내 주세요."), "error");
      else if (isStale(e)) stale();
      else bubble("assistant", esc(e.message || "답을 받지 못했어요. 잠시 후 다시 시도해 주세요."), "error");
    } finally {
      setBusy(false); scroll(); input.focus();
    }
  }

  async function apply(msg) {
    const proposal = msg._proposal;
    if (!proposal || busy) return;
    setBusy(true);
    const wait = waiting();
    try {
      const { version_no, regenerate_images } = await callApi("/api/plan-edit/apply", { plan_id: planId, base_version_no: getVersionNo(), proposal });
      wait.querySelector(".chat-bubble").innerHTML = md(`**v${version_no}** 버전으로 저장했어요.${regenerate_images?.length ? " 이미지를 새로 만드는 중이에요." : ""}`);
      closeCards();
      history = []; // 새 버전에서 대화를 새로 시작해요
      onApplied(version_no, regenerate_images || []);
    } catch (e) {
      wait.remove();
      if (e instanceof AuthRequired) bubble("assistant", md("로그인이 필요해요. 로그인한 뒤 다시 눌러 주세요."), "error");
      else if (isStale(e)) stale();
      else if (e instanceof ApiError && e.status === 422) {
        closeCards();
        const issues = (e.data?.issues || []).map(i => `- ${i}`).join("\n");
        bubble("assistant", md(`검증을 통과하지 못해 저장하지 않았어요.${issues ? `\n${issues}` : ""}\n\n고친 안을 다시 제안할까요?`), "error");
        input.value = RETRY_TEXT; autosize();
      } else bubble("assistant", esc(e.message || "저장하지 못했어요. 잠시 후 다시 시도해 주세요."), "error");
    } finally {
      setBusy(false); scroll();
    }
  }

  bubble("assistant", md(GREETING));
  suggest.addEventListener("click", e => { const c = e.target.closest(".chat-chip"); if (c) ask(c.textContent); });
  log.addEventListener("click", e => {
    const b = e.target.closest("[data-ec]");
    if (!b) return;
    const msg = b.closest(".chat-msg");
    if (b.dataset.ec === "apply") apply(msg);
    else { b.closest(".ec-actions").remove(); bubble("assistant", md("알겠어요. 적용하지 않았어요.")); }
  });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  panel.querySelector(".chat-form").addEventListener("submit", e => { e.preventDefault(); ask(input.value); });
  return panel;
}
