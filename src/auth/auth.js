/* 화면 우측 상단 로그인: 카카오 간편 로그인 + 이메일 로그인/회원가입 (Supabase Auth) */
import { supabase, hasSupabase } from "../lib/supabase.js";
import { esc } from "../utils/text.js";

const KAKAO_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.54 2 10.9c0 2.82 1.87 5.3 4.69 6.7l-.96 3.5c-.08.3.26.54.52.37l4.15-2.74c.52.06 1.05.1 1.6.1 5.52 0 10-3.54 10-7.93S17.52 3 12 3z"/></svg>`;

// 로그인 후 돌아올 주소: 지금 보고 있는 페이지 (Supabase Redirect URLs 에 등록돼 있어야 해요)
const redirectTo = () => window.location.origin + window.location.pathname;

const displayName = user => {
  const m = user.user_metadata || {};
  return m.name || m.full_name || m.nickname || m.preferred_username || user.email || "사용자";
};

const ERRORS = {
  "Invalid login credentials": "이메일 또는 비밀번호가 맞지 않아요.",
  "Email not confirmed": "이메일 인증을 먼저 완료해 주세요. 받은 메일함을 확인해 주세요.",
  "User already registered": "이미 가입된 이메일이에요. 로그인해 주세요.",
};
const friendly = e => ERRORS[e?.message] || e?.message || "잠시 후 다시 시도해 주세요.";

function dialogHtml() {
  return `<dialog id="auth-dialog" class="auth-dialog" aria-labelledby="auth-title">
  <form method="dialog" class="auth-box" id="auth-form" novalidate>
    <div class="auth-head">
      <h2 id="auth-title">로그인</h2>
      <button class="close" type="button" id="auth-close">닫기</button>
    </div>
    <p class="auth-sub">로그인하면 기획안과 피드백을 저장할 수 있어요.</p>
    <button type="button" class="kakao-btn" id="auth-kakao">${KAKAO_ICON}<span>카카오로 시작하기</span></button>
    <div class="auth-or"><span>또는 이메일</span></div>
    <label class="auth-field"><span>이메일</span><input type="email" id="auth-email" autocomplete="email" required></label>
    <label class="auth-field"><span>비밀번호</span><input type="password" id="auth-password" autocomplete="current-password" minlength="6" required></label>
    <p class="auth-msg" id="auth-msg" role="status" aria-live="polite"></p>
    <button type="submit" class="auth-submit" id="auth-submit">이메일로 로그인</button>
    <p class="auth-switch"><span id="auth-switch-text">계정이 없으신가요?</span> <button type="button" id="auth-switch">회원가입</button></p>
  </form>
</dialog>`;
}

/* 로그인 창을 여는 함수. initAuth()가 만들어 둔 창을 열어요. */
let openAuth = () => {};
export const openAuthDialog = () => openAuth();

export function initAuth() {
  const slot = document.getElementById("auth");
  if (!slot) return;

  if (!hasSupabase) {
    slot.innerHTML = `<button class="auth-btn" type="button" disabled title=".env 에 Supabase 설정이 없어 로그인을 쓸 수 없어요">로그인</button>`;
    return;
  }

  document.body.insertAdjacentHTML("beforeend", dialogHtml());
  const $ = id => document.getElementById(id);
  const dlg = $("auth-dialog"), msg = $("auth-msg"), submit = $("auth-submit");
  let mode = "signin";

  const setMsg = (text, kind = "") => { msg.textContent = text; msg.className = "auth-msg" + (kind ? " " + kind : ""); };
  const setMode = m => {
    mode = m;
    const up = m === "signup";
    $("auth-title").textContent = up ? "회원가입" : "로그인";
    submit.textContent = up ? "이메일로 가입하기" : "이메일로 로그인";
    $("auth-switch-text").textContent = up ? "이미 계정이 있으신가요?" : "계정이 없으신가요?";
    $("auth-switch").textContent = up ? "로그인" : "회원가입";
    $("auth-password").autocomplete = up ? "new-password" : "current-password";
    setMsg("");
  };
  const open = () => { setMode("signin"); dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", ""); $("auth-email").focus(); };
  const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute("open"));

  openAuth = open;
  $("auth-close").onclick = close;
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
  $("auth-switch").onclick = () => setMode(mode === "signin" ? "signup" : "signin");

  $("auth-kakao").onclick = async () => {
    setMsg("카카오 로그인 화면으로 이동하고 있어요…");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: redirectTo() } });
    if (error) setMsg(friendly(error), "err");
  };

  $("auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("auth-email").value.trim(), password = $("auth-password").value;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return setMsg("이메일 주소를 확인해 주세요.", "err");
    if (password.length < 6) return setMsg("비밀번호는 6자 이상이어야 해요.", "err");
    submit.disabled = true;
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (data.session) close();
        else setMsg("가입 확인 메일을 보냈어요. 메일의 링크를 누르면 로그인돼요.", "ok");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        close();
      }
    } catch (err) { setMsg(friendly(err), "err"); }
    finally { submit.disabled = false; }
  });

  const render = user => {
    if (!user) {
      slot.innerHTML = `<button class="auth-btn" type="button" id="auth-open">로그인</button>`;
      $("auth-open").onclick = open;
      return;
    }
    const name = displayName(user), avatar = user.user_metadata?.avatar_url;
    const kakao = user.app_metadata?.provider === "kakao";
    slot.innerHTML = `<span class="auth-user" title="${esc(user.email || name)}">
        ${avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="auth-ini" aria-hidden="true">${esc(name.slice(0, 1))}</span>`}
        <span class="auth-name">${esc(name)}</span>${kakao ? `<span class="auth-kakao-tag">카카오</span>` : ""}
      </span><button class="auth-btn ghost" type="button" id="auth-logout">로그아웃</button>`;
    $("auth-logout").onclick = async () => { await supabase.auth.signOut(); };
  };

  supabase.auth.onAuthStateChange((_event, session) => render(session?.user ?? null));
  supabase.auth.getSession().then(({ data }) => render(data.session?.user ?? null));

  // 카카오에서 로그인을 취소하거나 실패하면 주소에 error_description 이 붙어 돌아와요.
  const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
  const err = params.get("error_description");
  if (err) {
    open(); setMsg(`로그인하지 못했어요: ${err}`, "err");
    history.replaceState(null, "", redirectTo());
  }
}
