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
import planGet from "../server/routes/plan-get.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const BODY = { season: "여름", herb: "어성초", purpose: "모공·피지" };

const rawPlan = () => ({
  concept_name: "어성초 산뜻 토너", concept: "번들거림을 가볍게 정돈해요.", target: "20대",
  key_claims: ["산지가 확인돼요", "가볍게 마무리돼요", "수시로 쓰기 좋아요"],
  product_roles: [{ name: "토너", role: "결 정돈" }], cautions: []
});
const rawScn = () => ({
  scenarios: Array.from({ length: 1 }, (_, i) => ({
    title: `시나리오${i}`, concept: "c", target: "t", channel: "인스타",
    cuts: [{ scene: "a", copy: "산뜻해요" }, { scene: "b", copy: "보송해요" }, { scene: "c", copy: "좋아요" }], image_prompts: ["x0", "x1", "x2"]
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
    claimImage: vi.fn(async (c, u) => `${u}/pending:t`),
    releaseClaim: vi.fn(async () => {}),
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
  it("고른 제품으로 기획안을 만들고, 고른 목록을 저장해요", async () => {
    const store = makeStore(), deps = planDeps(store);
    await plan({ ...BODY, products: ["토너", "세럼", "패드·팩"] }, ctx(deps));
    const { content } = store.createPlan.mock.calls[0][1];
    expect(content.candidate.selected).toEqual(["토너", "세럼", "패드·팩"]);
    expect(content.plan.products.map(x => [x.name, x.price])).toEqual([["토너", 15000], ["세럼", 19000], ["패드·팩", 18000]]);
  });
  it("고른 제품이 잘못되면 400, generate가 안 불려요", async () => {
    const deps = planDeps(makeStore());
    expect(await status(plan({ ...BODY, products: [] }, ctx(deps)))).toBe(400);
    expect(await status(plan({ ...BODY, products: ["아이크림"] }, ctx(deps)))).toBe(400);
    expect(await status(plan({ ...BODY, products: "토너" }, ctx(deps)))).toBe(400);
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("정상이면 createPlan을 한 번 부르고 plan_id를 돌려줘요", async () => {
    const store = makeStore(), deps = planDeps(store);
    expect(await plan(BODY, ctx(deps))).toEqual({ plan_id: "p1", version_no: 1 });
    expect(store.createPlan).toHaveBeenCalledTimes(1);
    const [, arg] = store.createPlan.mock.calls[0];
    expect(arg).toMatchObject({ season: "여름", herb: "어성초", purpose: "모공·피지", title: "어성초 산뜻 토너" });
    expect(arg.content.scenarios).toHaveLength(1);
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
  it("AI 서버 오류 글(키 조각 포함)은 응답에 나가지 않고 상태별 고정 문구만 나가요", async () => {
    const r = await runRoute(async () => { throw new LlmError("Incorrect API key: sk-test123", 502); }, {}, {});
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain("sk-");
    expect(errSpy.mock.calls.flat().join(" ")).toContain("sk-test123");
    const r2 = await runRoute(async () => { throw new LlmError("x sk-abc", 504); }, {}, {});
    expect(r2.status).toBe(504);
    expect(JSON.stringify(r2.body)).not.toContain("sk-");
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
    expect(req.prompt).toContain("Scene: x1"); // 이미지 1번 설명(원료·질감 컷)을 써요
    const save = store.saveImage.mock.calls[0];
    expect(save.slice(1, 5)).toEqual(["u1", "p1", "v1", 1]);
    expect(save[5]).toEqual(new Uint8Array([9, 9]));
    expect(store.bumpImageRegens).not.toHaveBeenCalled();
  });
  it("예전 형식(시나리오 3개)도 idx 번째 시나리오의 설명으로 만들어요", async () => {
    const c = await makeContent();
    c.scenarios = [0, 1, 2].map(i => ({ ...c.scenarios[0], image_prompts: undefined, image_prompt: `old${i}` }));
    const store = makeStore({ getVersion: vi.fn(async () => version(c)) }), deps = imgDeps(store);
    await planImage(B, ctx(deps));
    expect(deps.editImage.mock.calls[0][0].prompt).toContain("Scene: old1");
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
  it("regenerate: 테스트 계정(unlimited)은 6회를 넘어도 만들어요", async () => {
    const c = await makeContent();
    const store = makeStore({
      getVersion: vi.fn(async () => version(c)),
      getPlan: vi.fn(async () => ({ id: "p1", season: "여름", herb: "어성초", purpose: "모공·피지", image_regens: 9 })),
      bumpImageRegens: vi.fn(async () => 10),
      entitlements: vi.fn(async () => [{ kind: "unlimited" }])
    }), deps = imgDeps(store);
    expect(await planImage({ ...B, regenerate: true }, ctx(deps))).toMatchObject({ idx: 1 });
    expect(deps.editImage).toHaveBeenCalledTimes(1);
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
  it("같은 빈 자리에 동시에 두 번 요청해도 editImage는 한 번만 불러요", async () => {
    const c = await makeContent();
    let taken = false;
    const store = makeStore({
      getVersion: vi.fn(async () => version(c)),
      claimImage: vi.fn(async (cl, u) => { if (taken) return null; taken = true; return `${u}/pending:t`; })
    });
    const deps = imgDeps(store);
    const res = await Promise.allSettled([planImage(B, ctx(deps)), planImage(B, ctx(deps))]);
    expect(deps.editImage).toHaveBeenCalledTimes(1);
    expect(res.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(res.find(r => r.status === "rejected").reason.status).toBe(409);
  });
  it("만들기에 실패하면 자리를 풀어서 나중에 다시 만들 수 있어요", async () => {
    const c = await makeContent();
    let taken = false;
    const store = makeStore({
      getVersion: vi.fn(async () => version(c)),
      claimImage: vi.fn(async (cl, u) => { if (taken) return null; taken = true; return `${u}/pending:t`; }),
      releaseClaim: vi.fn(async () => { taken = false; })
    });
    const editImage = vi.fn()
      .mockRejectedValueOnce(new LlmError("바빠요", 503))
      .mockResolvedValue(new Uint8Array([1]));
    const deps = imgDeps(store, { editImage });
    expect(await status(planImage(B, ctx(deps)))).toBe(503);
    expect(store.releaseClaim).toHaveBeenCalledTimes(1);
    expect(store.releaseClaim.mock.calls[0][5 - 1]).toBe("u1/pending:t");
    expect(await planImage(B, ctx(deps))).toEqual({ idx: 1, url: "https://signed/u1/p1/1-1.png" });
    expect(editImage).toHaveBeenCalledTimes(2);
  });
  it("regenerate는 자리 예약 없이 바로 만들어요", async () => {
    const c = await makeContent();
    const store = makeStore({ getVersion: vi.fn(async () => version(c)) });
    await planImage({ ...B, regenerate: true }, ctx(imgDeps(store)));
    expect(store.claimImage).not.toHaveBeenCalled();
  });
  it("editImage가 LlmError면 그 상태를 그대로 써요", async () => {
    const c = await makeContent();
    const store = makeStore({ getVersion: vi.fn(async () => version(c)) });
    const deps = imgDeps(store, { editImage: vi.fn(async () => { throw new LlmError("바빠요", 503); }) });
    expect(await status(planImage(B, ctx(deps)))).toBe(503);
    expect(store.saveImage).not.toHaveBeenCalled();
  });
});

describe("/api/plan-get", () => {
  const content = {
    season: "여름", herb: "어성초", purpose: "모공·피지",
    candidate: { name: "n", lineup: [], mid: 3, evid: 4, secret_internal: 1 },
    plan: { concept_name: "c", concept: "k", target: "t", key_claims: ["a"], notes: [], cautions: [], review_notes: [], secret_internal: 1,
      products: [{ type: "toner", name: "p", ml: 100, price: 1000, role: "r", status: "1차", secret_internal: 1 }] },
    scenarios: [0, 1, 2].map(i => ({ title: `s${i}`, concept: "c", target: "t", channel: "ch", image_prompt: "secret", secret_internal: 1, cuts: [{ scene: "a", copy: "b", secret_internal: 1 }] })),
    secret_internal: 1,
    log: { x: 1 }
  };
  const ver = (over = {}) => ({ id: "v2", version_no: 2, content, images: [{ idx: 1, path: "u1/p1/2-1.png" }], ...over });
  const getStore = (over = {}) => makeStore({
    listPlans: vi.fn(async () => [{ id: "p1", season: "여름", latest_version: 2 }]),
    listVersionNos: vi.fn(async () => [2, 1]),
    getVersion: vi.fn(async () => ver()),
    ...over
  });

  it("토큰 없으면 401, 잘못된 입력은 400", async () => {
    const deps = { store: getStore() };
    expect(await status(planGet({}, ctx(deps, null)))).toBe(401);
    expect(await status(planGet({ plan_id: 7 }, ctx(deps)))).toBe(400);
    expect(await status(planGet({ plan_id: "p1", version_no: 1.5 }, ctx(deps)))).toBe(400);
  });
  it("plan_id가 없으면 본인 목록을 본인 client로 가져와요", async () => {
    const store = getStore();
    const out = await planGet({}, ctx({ store }));
    expect(out).toEqual({ plans: [{ id: "p1", season: "여름", latest_version: 2 }] });
    expect(store.userClient).toHaveBeenCalledWith("tok");
    expect(store.listPlans.mock.calls[0][0]).toEqual({ tag: "client" });
  });
  it("남의 기획안이면 404", async () => {
    const store = getStore({ getPlan: vi.fn(async () => null) });
    expect(await status(planGet({ plan_id: "x" }, ctx({ store })))).toBe(404);
    expect(store.getVersion).not.toHaveBeenCalled();
  });
  it("없는 버전이면 404", async () => {
    const store = getStore({ getVersion: vi.fn(async () => null) });
    expect(await status(planGet({ plan_id: "p1", version_no: 9 }, ctx({ store })))).toBe(404);
  });
  it("버전·버전 목록·이미지 주소 3칸을 돌려주고, 내부 점수·프롬프트·로그는 빼요", async () => {
    const store = getStore();
    const out = await planGet({ plan_id: "p1" }, ctx({ store }));
    expect(out.versions).toEqual([2, 1]);
    expect(out.image_urls).toEqual([null, "https://signed/u1/p1/2-1.png", null]);
    expect(out.version.version_no).toBe(2);
    expect(out.latest_version_no).toBe(2);
    expect(out.plan).toMatchObject({ id: "p1", season: "여름", herb: "어성초" });
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/image_prompt|secret|"log"|"mid"|"evid"|candidate/);
    const c = out.version.content;
    expect(Object.keys(c).sort()).toEqual(["herb", "plan", "purpose", "scenarios", "season"]);
    expect(Object.keys(c.plan).sort()).toEqual(["cautions", "concept", "concept_name", "key_claims", "notes", "products", "review_notes", "target"]);
    expect(Object.keys(c.plan.products[0]).sort()).toEqual(["ml", "name", "price", "role", "status", "type"]);
    expect(Object.keys(c.scenarios[0]).sort()).toEqual(["channel", "concept", "cuts", "target", "title"]);
    expect(Object.keys(c.scenarios[0].cuts[0]).sort()).toEqual(["copy", "scene"]);
    expect(out.version.content.scenarios).toHaveLength(3);
    expect(store.getVersion).toHaveBeenCalledWith({ tag: "client" }, "p1", undefined);
  });
  it("version_no를 주면 그 버전을 불러와요", async () => {
    const store = getStore();
    await planGet({ plan_id: "p1", version_no: 1 }, ctx({ store }));
    expect(store.getVersion).toHaveBeenCalledWith({ tag: "client" }, "p1", 1);
  });
});
