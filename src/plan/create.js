/* 상세 창의 [기획안 만들기]: 기획안 1건 만들고 → 이미지 3장 채우고 → 마이 기획실로 가요. */
import { callApi, AuthRequired } from "./api.js";
import { esc } from "../utils/text.js";

/* Task 10에서 이 함수를 openPlan(plan_id)으로 바꿔요. 지금은 임시 결과만 보여 줘요. */
function afterCreate(planId, images) {
  const ok = images.filter(r => r.status === "fulfilled").length;
  document.querySelector('.menu [data-view="my"]')?.click();
  const page = document.querySelector("#view-my .page");
  if (page) page.innerHTML = `<div class="plan-temp"><h2>기획안이 저장됐어요 (v1)</h2><p>이미지 ${ok}/${images.length}장을 만들었어요.</p><p class="note">기획안 번호 ${esc(planId)}</p></div>`;
}

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
      // 로그인이 안 돼 있으면 callApi가 로그인 창을 열고 곧바로 멈춰요. 그때는 대기 화면을 바로 닫아요.
      wait.showModal(); sub("기획안 글을 쓰는 중이에요…");
      const { plan_id, version_no } = await callApi("/api/plan", line);
      sub("이미지를 만드는 중이에요…");
      const images = await Promise.allSettled([0, 1, 2].map(idx =>
        callApi("/api/plan-image", { plan_id, version_no, idx, regenerate: false })));
      wait.close(); detail.close();
      afterCreate(plan_id, images);
    } catch (e) {
      if (wait.open) wait.close();
      if (!(e instanceof AuthRequired)) alert(e.message || "기획안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally { running = false; btn.disabled = false; }
  };
}
