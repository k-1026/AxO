/* HerbHub 첫 진입 인트로: 전통 약장(서랍장). 모양은 yakjang.css (시안 디자인 그대로).
   - 마우스: 커서가 닿은 서랍 한 칸만 부드럽게 열려요.
   - 클릭: 서랍이든 약장 틀이든 아무 곳이나 누르면 메인으로 가요.
     템플릿처럼 약장이 사라져 빈 바탕만 잠깐 남고 → 인트로가 걷히며 → 메인(상단바·내용)이 천천히 나타나요.
   - 터치: 첫 터치는 서랍만 열고, 열린 서랍을 한 번 더 누르면 메인으로 가요.
   - 키보드: 약장에 초점을 두고 Enter/Space. */
import { showView } from "../app.js";

/* 상단 5행 × 6열 = 작은 서랍 30개 (앞판에는 이름을 손잡이 양쪽에: 두 글자는 1+1, 세 글자는 1+2)
   약재 이름은 대한민국약전(KP 12)·약전외한약규격집(KHP) 이름 그대로 (한국한의학연구원 한약기원사전 확인, 2026-11-26) */
const SMALL_HERBS = [
  ["인삼", "원기 회복 · 보양"], ["감초", "조화 · 온중"], ["당귀", "보혈 · 순환"], ["천궁", "행기 · 활혈"], ["작약", "양혈 · 진정"], ["숙지황", "자음 · 보신"],
  ["황기", "보기 · 승양"], ["백출", "건비 · 익기"], ["복령", "이수 · 안신"], ["진피", "이기 · 건위"], ["반하", "조습 · 화담"], ["육계", "온중 · 산한"],
  ["생강", "해표 · 온위"], ["대추", "보비 · 화약"], ["길경", "선폐 · 이인"], ["황금", "청열 · 안태"], ["목향", "행기 · 지통"], ["맥문동", "윤폐 · 청심"],
  ["시호", "해열 · 소간"], ["황련", "청열 · 조습"], ["황백", "사화 · 해독"], ["치자", "제번 · 청열"], ["연교", "청열 · 산결"], ["금은화", "해독 · 소풍"],
  ["박하", "소풍 · 청두"], ["형개", "거풍 · 해표"], ["방풍", "거풍 · 승습"], ["독활", "거풍 · 지통"], ["강활", "산한 · 거풍"], ["우슬", "활혈 · 강근"]
];
/* 하단 1행 × 3열 = 큰 서랍 3개 */
const LARGE_HERBS = [["오미자", "수렴 · 생진"], ["구기자", "자보 · 명목"], ["산수유", "보익 · 고삽"]];

const LEAVE_MS = 380;  // 약장이 사라지는 시간 (빈 바탕만 남음)
const GONE_MS = 450;   // 인트로 바탕이 걷히는 시간
const PAGE_IN_MS = 1200; // 메인이 나타나는 애니메이션 시간

const drawerHtml = ([name, note], large) => `
  <div class="drawer-slot ${large ? "is-large" : "is-small"}" data-drawer="${name}">
    <div class="drawer-cavity"><span class="drawer-cavity-herb">${note}</span></div>
    <div class="drawer-box">
      <div class="drawer-top-wall"></div>
      <div class="drawer-side-left"></div>
      <div class="drawer-side-right"></div>
      <div class="drawer-bottom-wall"></div>
      <div class="drawer-front${name.length > 2 ? " is-long" : ""}">
        <span class="herb-char">${name[0]}</span>
        <span class="brass-ring" aria-hidden="true"></span>
        <span class="herb-char">${[...name.slice(1)].map(c => `<span>${c}</span>`).join("")}</span>
      </div>
    </div>
  </div>`;

/* 은은한 나무 서랍 마찰음 (시안 그대로). 브라우저가 막으면 조용히 넘어가요 */
let audioCtx = null;
function playWoodDrawerSound() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    const duration = 0.16;
    const size = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((i / size) * Math.PI) * 0.14;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(220, audioCtx.currentTime);
    filter.Q.setValueAtTime(2.4, audioCtx.currentTime);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    noise.start();
  } catch { /* 오디오 정책 제한 */ }
}

export function initYakjang() {
  const root = document.createElement("div");
  root.className = "yj-intro";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "HerbHub 입장");
  root.innerHTML = `
    <div class="cabinet-stage" role="button" tabindex="0" aria-label="약장을 열고 HerbHub로 입장하기">
      <div class="yakjang-wrapper">
        <div class="yakjang-left-wing" aria-hidden="true"></div>
        <div class="yakjang-top-panel" aria-hidden="true"></div>
        <div class="yakjang-top-roof" aria-hidden="true"></div>
        <div class="yakjang-body">
          <div class="yj-grid-small">${SMALL_HERBS.map(h => drawerHtml(h, false)).join("")}</div>
          <div class="yj-grid-large">${LARGE_HERBS.map(h => drawerHtml(h, true)).join("")}</div>
        </div>
        <div class="yakjang-legs" aria-hidden="true"><div class="yakjang-leg"></div><div class="yakjang-leg"></div><div class="yakjang-leg"></div><div class="yakjang-leg"></div></div>
        <div class="yakjang-floor-shadow" aria-hidden="true"></div>
      </div>
    </div>`;
  document.body.appendChild(root);
  document.body.style.overflow = "hidden"; // 인트로 동안 뒤 페이지가 스크롤되지 않게

  const stage = root.querySelector(".cabinet-stage");
  let openSlot = null, leaving = false, lastPointer = "mouse";

  function open(slot) {
    if (leaving || slot === openSlot) return;
    openSlot?.classList.remove("is-open");
    slot.classList.add("is-open");
    openSlot = slot;
    playWoodDrawerSound();
  }
  function close(slot) {
    if (leaving) return;
    slot.classList.remove("is-open");
    if (openSlot === slot) openSlot = null;
  }

  /* 템플릿식 전환: 약장 사라짐 → 빈 바탕 → 인트로 걷힘 → 메인이 천천히 나타남 */
  function enter() {
    if (leaving) return;
    leaving = true;
    showView("home");
    root.classList.add("is-leaving");
    setTimeout(() => {
      document.body.style.overflow = "";
      document.body.classList.add("page-entering");
      root.classList.add("is-gone");
      setTimeout(() => root.remove(), GONE_MS);
      setTimeout(() => document.body.classList.remove("page-entering"), PAGE_IN_MS);
    }, LEAVE_MS);
  }

  root.querySelectorAll("[data-drawer]").forEach(slot => {
    slot.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") open(slot); });
    slot.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") close(slot); });
  });
  stage.addEventListener("pointerdown", e => { lastPointer = e.pointerType || "mouse"; });
  stage.addEventListener("click", e => {
    if (lastPointer !== "mouse") {
      // 터치: 첫 터치는 그 서랍만 열고, 열린 서랍을 다시 누르면 입장
      const slot = e.target.closest("[data-drawer]");
      if (slot && slot !== openSlot) { open(slot); return; }
    }
    enter();
  });
  stage.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enter(); }
  });
}
