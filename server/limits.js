/* 요금제 횟수 값과 확인. 요금제를 다시 계산하면 이 파일의 LIMITS 값만 바꿔요. (순수 함수, 저장소를 부르지 않아요) */

export const LIMITS = {
  free: 1,               // 무료 체험: 평생 1건
  single: 1,             // 건당 이용권: 1장당 1건
  monthly: 20,           // 월 구독: 달마다 20건
  editsPerPlan: 5,       // 기획안 1건당 수정(적용) 5회
  imageRegensPerPlan: 6  // 기획안 1건당 이미지 다시 만들기 6회
};

export class LimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "LimitError";
    this.status = 402;
  }
}

const KST_MS = 9 * 60 * 60 * 1000;

/** 한국 날짜 'YYYY-MM-DD' */
export function todayKst(now) {
  return new Date(new Date(now ?? Date.now()).getTime() + KST_MS).toISOString().slice(0, 10);
}

const day = v => (v ? String(v).slice(0, 10) : null);

/**
 * 새 기획안을 만들 수 있는지 확인해요.
 * (기간 안 월 구독 && 이번 달 20건 미만) 또는 (전체 건수 < 무료 1 + 건당 이용권 남은 건수 합)
 */
export function canCreate(usage, entitlements, now) {
  const totalPlans = usage?.totalPlans ?? 0;
  const plansThisMonth = usage?.plansThisMonth ?? 0;
  const ents = Array.isArray(entitlements) ? entitlements : [];
  const today = todayKst(now);

  const monthlyActive = ents.some(e => {
    if (e?.kind !== "monthly") return false;
    const s = day(e.period_start), t = day(e.period_end);
    return Boolean(s && t && s <= today && today <= t);
  });
  if (monthlyActive && plansThisMonth < LIMITS.monthly) return { ok: true };

  const singles = ents
    .filter(e => e?.kind === "single")
    .reduce((sum, e) => sum + Math.max(0, Number(e.remaining) || 0) * LIMITS.single, 0);
  if (totalPlans < LIMITS.free + singles) return { ok: true };

  if (monthlyActive) {
    return { ok: false, reason: `이번 달 월 구독 기획안 ${LIMITS.monthly}건을 모두 만들었어요. 다음 달에 다시 만들거나 요금제 안내에서 건당 이용권을 확인해 주세요.` };
  }
  if (singles > 0) {
    return { ok: false, reason: "건당 이용권을 모두 사용했어요. 요금제 안내를 확인해 주세요." };
  }
  return { ok: false, reason: `무료 체험 기획안 ${LIMITS.free}건을 이미 만들었어요. 더 만들려면 요금제 안내를 확인해 주세요.` };
}

/** 기획안 1건당 수정(적용) 횟수 확인 */
export function canEdit(editCount) {
  if ((Number(editCount) || 0) < LIMITS.editsPerPlan) return { ok: true };
  return { ok: false, reason: `기획안 1건당 수정은 ${LIMITS.editsPerPlan}회까지예요. 요금제 안내를 확인해 주세요.` };
}

/** 기획안 1건당 이미지 다시 만들기 횟수 확인 */
export function canRegenImage(count) {
  if ((Number(count) || 0) < LIMITS.imageRegensPerPlan) return { ok: true };
  return { ok: false, reason: `이미지 다시 만들기는 기획안 1건당 ${LIMITS.imageRegensPerPlan}회까지예요.` };
}
