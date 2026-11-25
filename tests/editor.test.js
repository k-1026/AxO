import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fallback from "../src/data/fallback.js";
import { pickCandidate } from "../server/agents/research.js";
import { assemblePlan, PlanFormatError } from "../server/agents/writer.js";
import { assembleScenarios } from "../server/agents/designer.js";
import { REVIEW_SCHEMA } from "../server/agents/verifier.js";
import { EDIT_SCHEMA, buildEditPrompt, cleanProposal } from "../server/agents/editor.js";
import { runRoute } from "../server/http.js";
import planEdit from "../server/routes/plan-edit.js";

const NOW = Date.parse("2026-11-23T00:00:00+09:00");
const cand = pickCandidate(fallback, { season: "여름", herb: "어성초", purpose: "모공·피지" }, NOW);
const codeOf = name => cand.l.lineup.find(x => x[1] === name);
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
const content = () => ({
  season: "여름", herb: "어성초", purpose: "모공·피지", candidate: { name: "n" }, palette: { colors: ["#fff"] },
  plan: { ...assemblePlan(rawPlan(), cand, ["메모"]), review_notes: ["치료 같은 말을 인용한 옛 의견"] },
  scenarios: assembleScenarios(rawScn()).scenarios,
  review: { approved: true, issues: [], rounds: 1 }
});

const BASE = { id: "v1", version_no: 1, content: content(), images: [] };
function makeStore(over = {}) {
  return {
    userClient: vi.fn(() => ({ tag: "client" })),
    getUser: vi.fn(async () => ({ id: "u1" })),
    getPlan: vi.fn(async () => ({ id: "p1" })),
    getVersion: vi.fn(async () => BASE),
    editCount: vi.fn(async () => 0),
    entitlements: vi.fn(async () => []),
    insertVersion: vi.fn(async () => ({ id: "v2", version_no: 2 })),
    ...over
  };
}
const approve = { approved: true, issues: [] };
const mkDeps = (store, over = {}) => ({
  store, now: () => NOW, loadData: async () => fallback,
  generate: vi.fn(async (_p, schema) => (schema === REVIEW_SCHEMA ? approve : { reply: "알겠어요.", proposal: null })), ...over
});
const ctx = (deps, token = "tok") => ({ token, env: {}, deps });
const status = async p => { try { await p; return null; } catch (e) { return e.status; } };
const proposal = (o = {}) => ({ summary: "콘셉트 문구 수정", changes: [{ part: "콘셉트", before: "a", after: "b" }], regenerate_images: [], plan: { ...rawPlan(), concept: "수정된 콘셉트예요." }, ...o });
const APPLY = p => ({ plan_id: "p1", base_version_no: 1, proposal: p });
const MSG = [{ role: "user", content: "콘셉트를 바꿔 주세요" }];
const PREVIEW = messages => ({ plan_id: "p1", base_version_no: 1, messages });

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => errSpy.mockRestore());

describe("cleanProposal", () => {
  it("AI가 바꾼 가격·용량을 코드 값으로 되돌려요", () => {
    const raw = proposal();
    raw.plan.products = [{ name: "토너", ml: 1, price: 1 }];
    const out = cleanProposal(raw, content(), cand);
    const t = out.plan.products.find(p => p.name === "토너");
    expect(t.price).toBe(codeOf("토너")[3]);
    expect(t.ml).toBe(codeOf("토너")[2]);
    expect(out.plan.concept).toBe("수정된 콘셉트예요.");
  });
  it("이미지 번호는 0~2 정수만 남기고, 보여 줄 게 없으면 null", () => {
    const out = cleanProposal(proposal({ regenerate_images: [1, 1, 5, -1, "a", 2] }), content(), cand);
    expect(out.regenerate_images).toEqual([1, 2]);
    expect(cleanProposal(null, content(), cand)).toBeNull();
    expect(cleanProposal({ summary: "x", changes: [], regenerate_images: [] }, content(), cand)).toBeNull();
  });
  it("기획안 형식이 틀리면 PlanFormatError", () => {
    expect(() => cleanProposal(proposal({ plan: { ...rawPlan(), key_claims: ["하나"] } }), content(), cand)).toThrow(PlanFormatError);
  });
});

describe("buildEditPrompt", () => {
  it("대화와 지금 기획안을 넣고, 옛 의견 글(금지어 인용 가능)은 빼요", () => {
    const p = buildEditPrompt(content(), MSG, cand, fallback);
    expect(p).toContain("콘셉트를 바꿔 주세요");
    expect(p).toContain("어성초 산뜻 토너");
    expect(p).not.toContain("옛 의견");
    expect(EDIT_SCHEMA.required).toContain("proposal");
  });
});

describe("/api/plan-edit/preview", () => {
  it("대화가 잘못되면 400, AI를 부르지 않아요", async () => {
    const deps = mkDeps(makeStore());
    for (const messages of [[], [{ role: "assistant", content: "x" }], [{ role: "user", content: "a".repeat(2001) }], Array.from({ length: 21 }, () => MSG[0]), "x"]) {
      expect(await status(planEdit.preview(PREVIEW(messages), ctx(deps)))).toBe(400);
    }
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("토큰이 없으면 401", async () => {
    expect(await status(planEdit.preview(PREVIEW(MSG), ctx(mkDeps(makeStore()), null)))).toBe(401);
  });
  it("질문이면 proposal null, 저장·횟수 없음", async () => {
    const store = makeStore(), deps = mkDeps(store);
    expect(await planEdit.preview(PREVIEW(MSG), ctx(deps))).toEqual({ reply: "알겠어요.", proposal: null });
    expect(store.insertVersion).not.toHaveBeenCalled();
    expect(store.editCount).not.toHaveBeenCalled();
  });
  it("수정안이면 코드 값으로 다시 채워 돌려주고 내부 칸은 빼요", async () => {
    const aiPlan = { ...rawPlan(), concept: "새 콘셉트예요.", products: [{ name: "토너", price: 1 }], review_notes: ["x"], secret: "숨김" };
    const deps = mkDeps(makeStore(), {
      generate: vi.fn(async () => ({ reply: "이렇게 바꿔 볼게요.", proposal: { summary: "콘셉트 수정", changes: [{ part: "콘셉트", before: "a", after: "b" }], plan: aiPlan, regenerate_images: [0] } }))
    });
    const out = await planEdit.preview(PREVIEW(MSG), ctx(deps));
    expect(out.reply).toBe("이렇게 바꿔 볼게요.");
    expect(out.proposal.regenerate_images).toEqual([0]);
    expect(out.proposal.plan.concept).toBe("새 콘셉트예요.");
    expect(out.proposal.plan.products.find(p => p.name === "토너").price).toBe(codeOf("토너")[3]);
    expect(out.proposal.plan.review_notes).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("숨김");
  });
  it("base가 최신이 아니면 409, 자료가 바뀌어 후보가 없으면 409", async () => {
    const old = makeStore({ getVersion: vi.fn(async (_c, _p, no) => (no === 1 ? BASE : { ...BASE, id: "v2", version_no: 2 })) });
    expect(await status(planEdit.preview(PREVIEW(MSG), ctx(mkDeps(old))))).toBe(409);
    const gone = makeStore({ getVersion: vi.fn(async () => ({ ...BASE, content: { ...content(), herb: "없는약재" } })) });
    expect(await status(planEdit.preview(PREVIEW(MSG), ctx(mkDeps(gone))))).toBe(409);
  });
  it("AI 수정안 형식이 틀리면 502", async () => {
    const deps = mkDeps(makeStore(), { generate: vi.fn(async () => ({ reply: "네", proposal: { summary: "s", changes: [], regenerate_images: [], plan: { ...rawPlan(), key_claims: [] } } })) });
    expect(await status(planEdit.preview(PREVIEW(MSG), ctx(deps)))).toBe(502);
  });
});

describe("/api/plan-edit/apply", () => {
  it("정상이면 새 버전을 저장하고 이미지는 다시 만들 것만 빼고 복사해요", async () => {
    const store = makeStore(), deps = mkDeps(store);
    const out = await planEdit.apply(APPLY(proposal({ regenerate_images: [1] })), ctx(deps));
    expect(out).toEqual({ version_no: 2, regenerate_images: [1] });
    const [, planId, baseNo, arg] = store.insertVersion.mock.calls[0];
    expect([planId, baseNo]).toEqual(["p1", 1]);
    expect(arg).toMatchObject({ source: "edit", edit_request: "콘셉트 문구 수정", copyImagesFrom: { versionId: "v1", idx: [0, 2] } });
    expect(arg.content.plan.concept).toBe("수정된 콘셉트예요.");
    expect(arg.content.plan.review_notes.join()).not.toContain("옛 의견");
    expect(arg.content.season).toBe("여름");
    expect(arg.content.scenarios).toHaveLength(1);
    expect(arg.content.palette).toEqual({ colors: ["#fff"] });
  });
  it("기획안 글만 바뀌면 시나리오는 그대로 남아요", async () => {
    const store = makeStore();
    await planEdit.apply(APPLY(proposal()), ctx(mkDeps(store)));
    expect(store.insertVersion.mock.calls[0][3].content.scenarios).toEqual(BASE.content.scenarios);
  });
  it("클라이언트가 바꾼 가격은 코드 값으로 되돌려 저장해요", async () => {
    const store = makeStore();
    const p = proposal();
    p.plan.products = [{ name: "토너", price: 1, ml: 1 }];
    await planEdit.apply(APPLY(p), ctx(mkDeps(store)));
    const t = store.insertVersion.mock.calls[0][3].content.plan.products.find(x => x.name === "토너");
    expect(t.price).toBe(codeOf("토너")[3]);
  });
  it("금지어가 든 수정안은 422와 고칠 점, 저장 안 해요", async () => {
    const store = makeStore();
    const out = await runRoute(planEdit.apply, APPLY(proposal({ plan: { ...rawPlan(), concept: "여드름 치료에 좋아요." } })), ctx(mkDeps(store)));
    expect(out.status).toBe(422);
    expect(out.body.error).toBe("검증을 통과하지 못했어요.");
    expect(out.body.issues.join()).toContain("치료");
    expect(store.insertVersion).not.toHaveBeenCalled();
  });
  it("AI 검토가 거절해도 422", async () => {
    const store = makeStore();
    const deps = mkDeps(store, { generate: vi.fn(async () => ({ approved: false, issues: ["어색해요"] })) });
    const out = await runRoute(planEdit.apply, APPLY(proposal()), ctx(deps));
    expect(out).toEqual({ status: 422, body: { error: "검증을 통과하지 못했어요.", issues: ["어색해요"] } });
    expect(store.insertVersion).not.toHaveBeenCalled();
  });
  it("테스트 계정(unlimited)은 수정 5회를 넘어도 저장돼요", async () => {
    const store = makeStore({ editCount: vi.fn(async () => 9), entitlements: vi.fn(async () => [{ kind: "unlimited" }]) }), deps = mkDeps(store);
    const out = await planEdit.apply(APPLY(proposal()), ctx(deps));
    expect(out.version_no).toBe(2);
    expect(store.insertVersion).toHaveBeenCalledTimes(1);
  });
  it("수정 5회를 다 쓴 기획안은 402, 검증도 안 해요", async () => {
    const store = makeStore({ editCount: vi.fn(async () => 5) }), deps = mkDeps(store);
    expect(await status(planEdit.apply(APPLY(proposal()), ctx(deps)))).toBe(402);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(store.insertVersion).not.toHaveBeenCalled();
  });
  it("base가 오래됐으면 409", async () => {
    const store = makeStore({ getVersion: vi.fn(async (_c, _p, no) => (no === 1 ? BASE : { ...BASE, id: "v3", version_no: 3 })) });
    expect(await status(planEdit.apply(APPLY(proposal()), ctx(mkDeps(store))))).toBe(409);
    expect(store.insertVersion).not.toHaveBeenCalled();
  });
  it("수정안 형식이 틀리면 400, 남의 기획안이면 404, 토큰 없으면 401", async () => {
    const deps = mkDeps(makeStore());
    expect(await status(planEdit.apply(APPLY(null), ctx(deps)))).toBe(400);
    expect(await status(planEdit.apply(APPLY(proposal({ plan: { ...rawPlan(), key_claims: [] } })), ctx(deps)))).toBe(400);
    expect(await status(planEdit.apply(APPLY(proposal()), ctx(mkDeps(makeStore({ getPlan: vi.fn(async () => null) })))))).toBe(404);
    expect(await status(planEdit.apply(APPLY(proposal()), ctx(deps, null)))).toBe(401);
  });
  it("이미지만 다시 만드는 수정도 저장돼요", async () => {
    const store = makeStore();
    const out = await planEdit.apply(APPLY({ summary: "이미지 다시", changes: [], regenerate_images: [0] }), ctx(mkDeps(store)));
    expect(out.regenerate_images).toEqual([0]);
    expect(store.insertVersion.mock.calls[0][3].copyImagesFrom.idx).toEqual([1, 2]);
  });
});
