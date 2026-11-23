/* 헤더의 'AI Chat' 버튼 → 채팅 팝업. 서버(/api/chat)를 거쳐 Gemini와 대화해요. */
import { esc } from "../utils/text.js";

const API_URL = "/api/chat";
const MAX_INPUT = 2000;
const GREETING = "안녕하세요, HerbHub 상품기획 도우미예요. 지금 화면의 계절과 후보 순위를 보고 답해 드려요.\n\n예: **1위 후보를 추천한 이유를 회의용으로 정리해 줘**";
const SUGGESTIONS = ["1위 후보 추천 이유 정리해 줘", "후보 1·2위를 비교해 줘", "순위에서 제외된 후보는 왜 빠졌어?"];

/* 아주 작은 마크다운: **굵게**, 목록(- / 1.), 줄바꿈. 먼저 이스케이프해서 HTML 주입을 막아요. */
function md(text) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; } };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/), h = line.match(/^#{1,4}\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(inline((ul || ol)[1]));
    } else {
      flush();
      if (h) out.push(`<p><strong>${inline(h[1])}</strong></p>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return out.join("");
}

function panelHtml() {
  return `<section class="chat-panel" id="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" hidden>
  <header class="chat-head">
    <div><strong id="chat-title">AI Chat</strong><span class="chat-sub">HerbHub 상품기획 도우미 · Gemini</span></div>
    <div class="chat-actions">
      <button type="button" class="chat-icon" id="chat-reset" title="새 대화" aria-label="새 대화">↺</button>
      <button type="button" class="chat-icon" id="chat-close" title="닫기" aria-label="닫기">✕</button>
    </div>
  </header>
  <div class="chat-log" id="chat-log" aria-live="polite"></div>
  <div class="chat-suggest" id="chat-suggest">${SUGGESTIONS.map(s => `<button type="button" class="chat-chip">${esc(s)}</button>`).join("")}</div>
  <form class="chat-form" id="chat-form">
    <textarea id="chat-input" rows="1" maxlength="${MAX_INPUT}" placeholder="무엇이든 물어보세요 (Enter 보내기 · Shift+Enter 줄바꿈)" aria-label="메시지"></textarea>
    <button type="submit" class="chat-send" id="chat-send" aria-label="보내기">↑</button>
  </form>
  <p class="chat-note">AI 답변은 참고용이에요. 점수·순위는 화면의 계산 결과를 따르고, 규제 판단은 담당자 확인이 필요해요.</p>
</section>`;
}

/** @param {{ getContext?: () => string }} opts */
export function initChat({ getContext = () => "" } = {}) {
  const btn = document.getElementById("ai-chat-open");
  if (!btn) return;
  document.body.insertAdjacentHTML("beforeend", panelHtml());
  const $ = id => document.getElementById(id);
  const panel = $("chat-panel"), log = $("chat-log"), input = $("chat-input"), send = $("chat-send"), suggest = $("chat-suggest");

  /** @type {{role:'user'|'assistant', content:string}[]} */
  let history = [];
  let busy = false;

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const bubble = (role, html, extra = "") => {
    log.insertAdjacentHTML("beforeend", `<div class="chat-msg ${role}${extra ? " " + extra : ""}"><div class="chat-bubble">${html}</div></div>`);
    scroll();
    return log.lastElementChild;
  };
  const reset = () => {
    history = []; log.innerHTML = ""; suggest.hidden = false;
    bubble("assistant", md(GREETING));
  };
  const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  const setBusy = b => { busy = b; send.disabled = b; input.disabled = b; };

  const open = () => {
    panel.hidden = false; btn.setAttribute("aria-expanded", "true");
    if (!log.childElementCount) reset();
    setTimeout(() => input.focus(), 0);
  };
  const close = () => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); };

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    suggest.hidden = true;
    bubble("user", md(text));
    history.push({ role: "user", content: text });
    input.value = ""; autosize(); setBusy(true);
    const wait = bubble("assistant", `<span class="chat-typing" aria-label="답변 작성 중"><i></i><i></i><i></i></span><span class="chat-slow" hidden>AI 사용량이 많아 답변이 늦어지고 있어요…</span>`);
    const slowTimer = setTimeout(() => { const s = wait.querySelector(".chat-slow"); if (s) s.hidden = false; scroll(); }, 10000);
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: getContext() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) throw new Error(data.error || (res.status === 404 ? "AI 서버(/api/chat)를 찾을 수 없어요. npm run dev 또는 Vercel 배포에서 열어 주세요." : `오류 ${res.status}`));
      history.push({ role: "assistant", content: data.reply });
      wait.querySelector(".chat-bubble").innerHTML = md(data.reply);
    } catch (e) {
      history.pop(); // 실패한 질문은 대화 기록에서 빼고 다시 보낼 수 있게 해요
      wait.classList.add("error");
      wait.querySelector(".chat-bubble").innerHTML = `${esc(e.message || "응답을 받지 못했어요.")} <button type="button" class="chat-retry">다시 보내기</button>`;
      wait.querySelector(".chat-retry").onclick = () => { wait.remove(); log.lastElementChild?.classList.contains("user") && log.lastElementChild.remove(); ask(text); };
    } finally {
      clearTimeout(slowTimer);
      setBusy(false); scroll(); input.focus();
    }
  }

  btn.setAttribute("aria-controls", "chat-panel");
  btn.setAttribute("aria-expanded", "false");
  btn.onclick = () => (panel.hidden ? open() : close());
  $("chat-close").onclick = close;
  $("chat-reset").onclick = () => { if (!busy) { reset(); input.focus(); } };
  panel.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  suggest.addEventListener("click", e => { const c = e.target.closest(".chat-chip"); if (c) ask(c.textContent); });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  $("chat-form").addEventListener("submit", e => { e.preventDefault(); ask(input.value); });
}
