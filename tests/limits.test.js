import { describe, it, expect } from "vitest";
import { LIMITS, canCreate, canEdit, canRegenImage, LimitError } from "../server/limits.js";

const NOW = Date.parse("2026-11-23T12:00:00+09:00");
const use = (totalPlans, plansThisMonth = totalPlans) => ({ totalPlans, plansThisMonth });
const monthly = (period_start, period_end) => ({ kind: "monthly", remaining: null, period_start, period_end });
const single = remaining => ({ kind: "single", remaining, period_start: null, period_end: null });

describe("LIMITS", () => {
  it("요금제 횟수 값이 한 곳에 있어요", () => {
    expect(LIMITS).toEqual({ free: 1, single: 1, monthly: 20, editsPerPlan: 5, imageRegensPerPlan: 6 });
  });
});

describe("canCreate", () => {
  it("이용권이 없고 0건이면 무료 체험으로 만들 수 있어요", () => {
    expect(canCreate(use(0), [], NOW)).toEqual({ ok: true });
  });

  it("이용권이 없고 1건을 만들었으면 막아요", () => {
    const r = canCreate(use(1), [], NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/요금제/);
  });

  it("건당 이용권 remaining 1이면 무료 1건을 쓴 뒤에도 만들 수 있어요", () => {
    expect(canCreate(use(1), [single(1)], NOW).ok).toBe(true);
    expect(canCreate(use(2), [single(1)], NOW).ok).toBe(false);
  });

  it("건당 이용권 여러 장은 합쳐서 세요", () => {
    expect(canCreate(use(2), [single(1), single(1)], NOW).ok).toBe(true);
    expect(canCreate(use(3), [single(1), single(1)], NOW).ok).toBe(false);
  });

  it("월 구독 기간 안이면 이번 달 19건까지 ok, 20건이면 막아요", () => {
    const ents = [monthly("2026-11-01", "2026-11-30")];
    expect(canCreate(use(30, 19), ents, NOW).ok).toBe(true);
    const r = canCreate(use(30, 20), ents, NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/20건/);
  });

  it("월 구독 기간의 첫날·마지막 날도 기간 안이에요 (한국 날짜 기준)", () => {
    const ents = [monthly("2026-11-23", "2026-11-23")];
    expect(canCreate(use(5, 0), ents, NOW).ok).toBe(true);
    // UTC로는 11-22 20:00 이지만 한국은 11-23 이에요.
    expect(canCreate(use(5, 0), ents, Date.parse("2026-11-22T20:00:00Z")).ok).toBe(true);
  });

  it("기간 밖 월 구독은 무료 규칙을 따라요", () => {
    const ents = [monthly("2026-10-01", "2026-10-31")];
    expect(canCreate(use(0, 0), ents, NOW).ok).toBe(true);
    expect(canCreate(use(1, 0), ents, NOW).ok).toBe(false);
  });

  it("월 구독 20건을 다 써도 남은 건당 이용권이 있으면 만들 수 있어요", () => {
    const ents = [monthly("2026-11-01", "2026-11-30"), single(25)];
    expect(canCreate(use(20, 20), ents, NOW).ok).toBe(true);
  });
});

describe("canEdit · canRegenImage", () => {
  it("수정은 기획안 1건당 5회까지예요", () => {
    expect(canEdit(4).ok).toBe(true);
    const r = canEdit(5);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/5회/);
  });

  it("이미지 다시 만들기는 기획안 1건당 6회까지예요", () => {
    expect(canRegenImage(5).ok).toBe(true);
    const r = canRegenImage(6);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/6회/);
  });
});

describe("LimitError", () => {
  it("상태 코드 402를 가져요", () => {
    const e = new LimitError("요금제 안내");
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(402);
    expect(e.message).toBe("요금제 안내");
  });
});
