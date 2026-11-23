import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { RESEARCH_SCHEMA } from "../server/agents/research.js";
import { PLAN_SCHEMA } from "../server/agents/writer.js";
import { SCENARIO_SCHEMA } from "../server/agents/designer.js";
import { REVIEW_SCHEMA } from "../server/agents/verifier.js";
import { LlmError } from "../server/llm/gemini.js";
import { HttpError, bearer, runRoute } from "../server/http.js";
import plan from "../server/routes/plan.js";
import planImage from "../server/routes/plan-image.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const BODY = { season: "여름", herb: "어성초", purpose: "모공·피지" };

const rawPlan = () => ({
  concept_name: "어성초 산뜻 토너", concept: "번들거림을 가볍게 정돈해요.", target: "20대",
  key_claims: ["산지가 확인돼요", "가볍게 마무리돼요", "수시로 쓰기 좋아요"],
  product_roles: [{ name: "토너", role: "결 정돈" }], cautions: []
});
const rawScn = () => ({
  scenarios: Array.from({ length: 3 }, (_, i) => ({
    title: `시나리오${i}`, concept: "c", target: "t", channel: "인스타",
    cuts: [{ scene: "a", copy: "산뜻해요" }, { scene: "b", copy: "보송해요" }, { scene: "c", copy: "좋아요" }], image_prompt: "x"
  }))
});
const answers = new Map([
  [RESEARCH_SCHEMA, { notes: ["메모 하나"] }], [PLAN_SCHEMA, rawPlan()],
  [REVIEW_SCHEMA, { approved: true, issues: [] }], [SCENARIO_SCHEMA, rawScn()]
]);

function makeStore(over = {}) {
  return {
    userClient: vi.fn(() => ({ tag: "client" })),
    getUser: vi.fn(async () => ({ id: "u1" })),
    usage: vi.fn(async () => ({ totalPlans: 0, plansThisMonth: 0 })),
    entitlements: vi.fn(async () => []),
    createPlan: vi.fn(async () => ({ plan_id: "p1", version_no: 1 })),
    getPlan: vi.fn(async () => ({ id: "p1", season: "여름", herb: "어성초", purpose: "모공·피지", image_regens: 0 })),
    getVersion: vi.fn(async () => null),
    saveImage: vi.fn(async (c, u, p, v, idx) => `${u}/${p}/1-${idx}.png`),
    signedUrls: vi.fn(async (c, paths) => Object.fromEntries(paths.map(p => [p, `https://signed/${p}`]))),
    bumpImageRegens: vi.fn(async () => 1),
    ...over
  };
}
const planDeps = (store, over = {}) => ({
  store, now: () => NOW, loadData: async () => fallback,
  generate: vi.fn(async (_p, schema) => answers.get(schema)), ...over
});
const ctx = (deps, token = "tok") => ({ token, env: {}, deps });
const status = async p => { try { await p; return null; } catch (e) { return e.status; } };

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => errSpy.mockRestore());

describe("http", () => {
  it("bearer는 Authorization 헤더에서 토큰만 꺼내요", () => {
    expect(bearer({ headers: { authorization: "Bearer abc" } })).toBe("abc");
    expect(bearer({ headers: {} })).toBeNull();
    expect(bearer({ headers: { authorization: "Basic x" } })).toBeNull();
  });
  it("runRoute는 HttpError 상태를, 모르는 오류는 500 일반 문구를 돌려줘요", async () => {
    const r1 = await runRoute(async () => { throw new HttpError(418, "차예요"); }, {}, {});
    expect(r1).toEqual({ status: 418, body: { error: "차예요" } });
    const r2 = await runRoute(async () => { throw new Error("SECRET_KEY=abc"); }, {}, {});
    expect(r2.status).toBe(500);
    expect(JSON.stringify(r2.body)).not.toContain("SECRET");
    expect(errSpy).toHaveBeenCalled();
    expect(await runRoute(async () => ({ a: 1 }), {}, {})).toEqual({ status: 200, body: { a: 1 } });
  });
});

describe("/api/plan", () => {
  it("토큰이 없으면 401, 아무것도 부르지 않아요", async () => {
    const deps = planDeps(makeStore());
    expect(await status(plan(BODY, ctx(deps, null)))).toBe(401);
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("토큰이 잘못되면 401", async () => {
    const deps = planDeps(makeStore({ getUser: vi.fn(async () => null) }));
    expect(await status(plan(BODY, ctx(deps)))).toBe(401);
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("본문 값이 비었거나 문자열이 아니면 400", async () => {
    const deps = planDeps(makeStore());
    expect(await status(plan({ ...BODY, herb: "" }, ctx(deps)))).toBe(400);
    expect(await status(plan({ ...BODY, season: 3 }, ctx(deps)))).toBe(400);
    expect(await status(plan(null, ctx(deps)))).toBe(400);
  });
  it("무료 1건을 이미 쓴 사용자는 402, generate가 안 불려요", async () => {
    const store = makeStore({ usage: vi.fn(async () => ({ totalPlans: 1, plansThisMonth: 1 })) });
    const deps = planDeps(store);
    expect(await status(plan(BODY, ctx(deps)))).toBe(402);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(store.createPlan).not.toHaveBeenCalled();
  });
  it("정상이면 createPlan을 한 번 부르고 plan_id를 돌려줘요", async () => {
    const store = makeStore(), deps = planDeps(store);
    expect(await plan(BODY, ctx(deps))).toEqual({ plan_id: "p1", version_no: 1 });
    expect(store.createPlan).toHaveBeenCalledTimes(1);
    const [, arg] = store.createPlan.mock.calls[0];
    expect(arg).toMatchObject({ season: "여름", herb: "어성초", purpose: "모공·피지", title: "어성초 산뜻 토너" });
    expect(arg.content.scenarios).toHaveLength(3);
    expect(arg.log.length).toBeGreaterThan(0);
  });
  it("generate가 LlmError(504)면 504, createPlan은 안 불려요", async () => {
    const store = makeStore();
    const deps = planDeps(store, { generate: vi.fn(async () => { throw new LlmError("느려요", 504); }) });
    expect(await status(plan(BODY, ctx(deps)))).toBe(504);
    expect(store.createPlan).not.toHaveBeenCalled();
  });
  it("후보가 없는 조합은 400", async () => {
    const deps = planDeps(makeStore());
    expect(await status(plan({ season: "여름", herb: "없는약재", purpose: "없는목적" }, ctx(deps)))).toBe(400);
  });
  it("AI 결과 형식이 틀리면 502", async () => {
    const bad = vi.fn(async (_p, schema) => (schema === PLAN_SCHEMA ? { concept_name: "" } : answers.get(schema)));
    const store = makeStore();
    expect(await status(plan(BODY, ctx(planDeps(store, { generate: bad }))))).toBe(502);
    expect(store.createPlan).not.toHaveBeenCalled();
  });
  it("동시 요청: 시작 땐 0건이어도 createPlan 직전에 다시 세어 402", async () => {
    const usage = vi.fn()
      .mockResolvedValueOnce({ totalPlans: 0, plansThisMonth: 0 })
      .mockResolvedValue({ totalPlans: 1, plansThisMonth: 1 });
    const store = makeStore({ usage }), deps = planDeps(store);
    expect(await status(plan(BODY, ctx(deps)))).toBe(402);
    expect(deps.generate).toHaveBeenCalled();
    expect(usage).toHaveBeenCalledTimes(2);
    expect(store.createPlan).not.toHaveBeenCalled();
  });
  it("저장소 오류는 500 일반 문구로 바뀌어요", async () => {
    const store = makeStore({ createPlan: vi.fn(async () => { throw new Error("db 비밀"); }) });
    const r = await runRoute(plan, BODY, ctx(planDeps(store)));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("비밀");
  });
});

describe("/api/plan-image", () => {
  /* 실제 파이프라인으로 만든 기획안 내용 */
  const makeContent = async () => {
    const s = makeStore();
    await plan(BODY, ctx(planDeps(s)));
    return s.createPlan.mock.calls[0][1].content;
  };
  const version = (c, over = {}) => ({ id: "v1", version_no: 1, content: c, images: [], ...over });
  const imgDeps = (store, over = {}) => ({
    store, now: () => NOW, loadData: async () => fallback,
    readSample: vi.fn(async name => new Uint8Array([name.length])),
    editImage: vi.fn(async () => new Uint8Array([9, 9])), ...over
  });
  const B = { plan_id: "p1", version_no: 1, idx: 1 };

  it("토큰 없으면 401, 잘못된 입력은 400", async () => {
    const deps = imgDeps(makeStore());
    expect(await status(planImage(B, ctx(deps, null)))).toBe(401);
    expect(await status(planImage({ ...B, idx: 3 }, ctx(deps)))).toBe(400);
    expect(await status(planImage({ ...B, idx: 1.5 }, ctx(deps)))).toBe(400);
    expect(await status(planImage({ ...B, plan_id: 7 }, ctx(deps)))).toBe(400);
  });
  it("정상: 후보 샘플 파일 이름으로 editImage를 부르고 같은 idx로 저장해요", async () => {
    const c = await makeContent();
    const store = makeStore({ getVersion: vi.fn(async () => version(c)) }), deps = imgDeps(store);
    expect(await planImage(B, ctx(deps))).toEqual({ idx: 1, url: "https://signed/u1/p1/1-1.png" });
    const req = deps.editImage.mock.calls[0][0];
    expect(req.images.length).toBeGreaterThan(0);
    expect(req.images.map(i => i.name)).toEqual(deps.readSample.mock.calls.map(x => x[0]));
    expect(req.images.every(i => /^(toner|serum|cream|lotion-pump|mist)\.png$/.test(i.name))).toBe(true);
    expect(req.prompt).toContain("no logo");
    const save = store.saveImage.mock.calls[0];
    expect(save.slice(1, 5)).toEqual(["u1", "p1", "v1", 1]);
    expect(save[5]).toEqual(new Uint8Array([9, 9]));
    expect(store.bumpImageRegens).not.toHaveBeenCalled();
  });
  it("남의 기획안(안 보임)이면 404", async () => {
    const store = makeStore({ getPlan: vi.fn(async () => null) }), deps = imgDeps(store);
    expect(await status(planImage(B, ctx(deps)))).toBe(404);
    expect(deps.editImage).not.toHaveBeenCalled();
  });
  it("버전이 없으면 404", async () => {
    const store = makeStore({ getVersion: vi.fn(async () => null) });
    expect(await status(planImage(B, ctx(imgDeps(store))))).toBe(404);
  });
  it("다시 만들기 없이 이미 있는 idx는 만들지 않고 그 이미지를 돌려줘요", async () => {
    const c = await makeContent();
    const store = makeStore({ getVersion: vi.fn(async () => version(c, { images: [{ idx: 1, path: "u1/p1/1-1.png" }] })) });
    const deps = imgDeps(store);
    expect(await planImage(B, ctx(deps))).toEqual({ idx: 1, url: "https://signed/u1/p1/1-1.png" });
    expect(deps.editImage).not.toHaveBeenCalled();
    expect(store.bumpImageRegens).not.toHaveBeenCalled();
  });
  it("regenerate: 횟수를 올린 뒤 새로 만들어요", async () => {
    const c = await makeContent();
    const store = makeStore({ getVersion: vi.fn(async () => version(c, { images: [{ idx: 1, path: "old" }] })) });
    const deps = imgDeps(store);
    await planImage({ ...B, regenerate: true }, ctx(deps));
    expect(store.bumpImageRegens).toHaveBeenCalledTimes(1);
    expect(deps.editImage).toHaveBeenCalledTimes(1);
    expect(store.saveImage).toHaveBeenCalledTimes(1);
  });
  it("regenerate: 6회를 다 썼으면 402, 만들지 않아요", async () => {
    const c = await makeContent();
    const store = makeStore({
      getVersion: vi.fn(async () => version(c)),
      getPlan: vi.fn(async () => ({ id: "p1", season: "여름", herb: "어성초", purpose: "모공·피지", image_regens: 6 }))
    }), deps = imgDeps(store);
    expect(await status(planImage({ ...B, regenerate: true }, ctx(deps)))).toBe(402);
    expect(store.bumpImageRegens).not.toHaveBeenCalled();
    expect(deps.editImage).not.toHaveBeenCalled();
  });
  it("regenerate: 최신 버전이 아니면 409", async () => {
    const c = await makeContent();
    const store = makeStore({
      getVersion: vi.fn(async (cl, pid, no) => (no == null ? version(c, { id: "v3", version_no: 3 }) : version(c, { id: "v1", version_no: no })))
    }), deps = imgDeps(store);
    expect(await status(planImage({ ...B, regenerate: true }, ctx(deps)))).toBe(409);
    expect(store.bumpImageRegens).not.toHaveBeenCalled();
    expect(deps.editImage).not.toHaveBeenCalled();
  });
  it("editImage가 LlmError면 그 상태를 그대로 써요", async () => {
    const c = await makeContent();
    const store = makeStore({ getVersion: vi.fn(async () => version(c)) });
    const deps = imgDeps(store, { editImage: vi.fn(async () => { throw new LlmError("바빠요", 503); }) });
    expect(await status(planImage(B, ctx(deps)))).toBe(503);
    expect(store.saveImage).not.toHaveBeenCalled();
  });
});
