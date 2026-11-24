/* 상세 창의 [기획안 만들기]: 기획안 1건 만들고 → 마이 기획실로 가요. 이미지는 마이 기획실에서 기획안이 열린 뒤 만들어요. */
import { callApi, getToken, AuthRequired } from "./api.js";
import { openPlan } from "./my.js";

export function initCreate({ getCurrentLine }) {
  const btn = document.getElementById("d-create");
  const wait = document.getElementById("plan-wait");
  if (!btn || !wait) return;
  let running = false;
  const sub = t => { document.getElementById("pw-sub").textContent = t; };
  wait.addEventListener("cancel", e => e.preventDefault()); // 만드는 중에는 Esc로 닫히지 않게

  btn.onclick = async () => {
    if (running) return;
    const line = getCurrentLine();
    if (!line) return;
    running = true; btn.disabled = true;
    const detail = document.getElementById("detail");
    try {
      // 로그인을 먼저 확인해요. 안 돼 있으면 로그인 창만 열리고 대기 화면은 뜨지 않아요.
      await getToken();
      wait.showModal(); sub("기획안 글을 쓰는 중이에요…");
      const { plan_id } = await callApi("/api/plan", line);
      wait.close(); detail.close();
      // 저장된 기획안을 마이 기획실에서 열고, 빈 이미지 칸을 바로 채우기 시작해요.
      document.querySelector('.menu [data-view="my"]')?.click();
      openPlan(plan_id, undefined, [], { fillImages: true });
    } catch (e) {
      if (wait.open) wait.close();
      if (!(e instanceof AuthRequired)) alert(e.message || "기획안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally { running = false; btn.disabled = false; }
  };
}
