import { describe, it, expect } from "vitest";
import {
  ConflictError, NotFoundError, getUser, createPlan, getVersion, insertVersion,
  saveImage, signedUrls, usage, editCount, bumpImageRegens, monthStartKst
} from "../server/store.js";

const has = (ops, m) => ops.some(o => o[0] === m);
const arg = (ops, m) => ops.find(o => o[0] === m)?.slice(1);
const ok = data => ({ data, error: null });

/*
 * 가짜 Supabase 클라이언트예요.
 * from(table)의 체인 호출을 calls에 쌓고, await 하면 respond(table, ops)의 결과를 돌려줘요.
 */
function fakeClient(respond, { user = { id: "u1" }, rpc = () => ok(null) } = {}) {
  const calls = [];
  const uploads = [];
  const rpcs = [];
  const client = {
    calls, uploads, rpcs,
    rpc: async (fn, params) => { rpcs.push([fn, params]); return rpc(fn, params); },
    auth: { getUser: async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "no" } }) },
    from(table) {
      const ops = [];
      calls.push({ table, ops });
      const q = {};
      for (const m of ["select", "insert", "upsert", "update", "delete", "eq", "in", "gte", "order", "limit", "single", "maybeSingle"]) {
        q[m] = (...args) => { ops.push([m, ...args]); return q; };
      }
      q.then = (res, rej) => Promise.resolve().then(() => respond(table, ops)).then(res, rej);
      return q;
    },
    storage: {
      from: bucket => ({
        upload: async (path, bytes, opts) => { uploads.push({ bucket, path, bytes, opts }); return { data: { path }, error: null }; },
        createSignedUrls: async (paths, sec) => ({ data: paths.map(p => ({ path: p, signedUrl: `https://x/${p}?s=${sec}`, error: null })), error: null })
      })
    }
  };
  return client;
}


describe("getUser", () => {
  it("로그인 사용자면 {id}, 아니면 null", async () => {
    expect(await getUser(fakeClient(() => ok(null)))).toEqual({ id: "u1" });
    expect(await getUser(fakeClient(() => ok(null), { user: null }))).toBeNull();
  });
});

describe("createPlan", () => {
  it("create_plan RPC 한 번으로 기획안과 버전 1을 함께 넣어요 (과정 기록은 content.log)", async () => {
    const c = fakeClient(() => ok(null), { rpc: () => ok({ plan_id: "p1", version_id: "v1", version_no: 1 }) });
    const r = await createPlan(c, { season: "여름", herb: "어성초", purpose: "모공·피지", title: "t", content: { plan: {} }, log: [{ step: 1 }] });
    expect(r).toEqual({ plan_id: "p1", version_no: 1 });
    expect(c.rpcs).toHaveLength(1);
    const [fn, params] = c.rpcs[0];
    expect(fn).toBe("create_plan");
    expect(params).toEqual({ p_season: "여름", p_herb: "어성초", p_purpose: "모공·피지", p_title: "t", p_content: { plan: {}, log: [{ step: 1 }] } });
    expect(c.calls).toHaveLength(0); // 표에 직접 넣거나 지우지 않아요
  });

  it("RPC가 실패하면 오류를 던져요", async () => {
    const c = fakeClient(() => ok(null), { rpc: () => ({ data: null, error: { message: "로그인이 필요해요" } }) });
    await expect(createPlan(c, { season: "여름", herb: "쑥", purpose: "보습", title: "t", content: {} })).rejects.toThrow(/기획안 저장/);
  });
});

describe("insertVersion", () => {
  const latest = n => (table, ops) => {
    if (table === "plan_versions" && has(ops, "select") && !has(ops, "insert")) return ok(n === null ? [] : [{ version_no: n }]);
    return ok(null);
  };

  it("baseNo가 최신이 아니면 넣기 전에 ConflictError(409)", async () => {
    const c = fakeClient(latest(2));
    const e = await insertVersion(c, "p1", 1, { content: {}, source: "edit", edit_request: "r" }).catch(x => x);
    expect(e).toBeInstanceOf(ConflictError);
    expect(e.status).toBe(409);
    expect(c.calls.some(x => has(x.ops, "insert"))).toBe(false);
  });

  it("unique 위반(23505)이면 ConflictError", async () => {
    const c = fakeClient((table, ops) => {
      if (table === "plan_versions" && has(ops, "insert")) return { data: null, error: { code: "23505", message: "duplicate key" } };
      return latest(1)(table, ops);
    });
    const e = await insertVersion(c, "p1", 1, { content: {}, source: "edit", edit_request: "r" }).catch(x => x);
    expect(e).toBeInstanceOf(ConflictError);
    expect(e.status).toBe(409);
  });

  it("기획안이 없거나 남의 것이면 NotFoundError(404)", async () => {
    const e = await insertVersion(fakeClient(latest(null)), "p1", 1, { content: {}, source: "edit" }).catch(x => x);
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e.status).toBe(404);
  });

  it("최신 번호 + 1로 넣고, copyImagesFrom의 이미지 행을 새 버전으로 복사해요", async () => {
    const c = fakeClient((table, ops) => {
      if (table === "plan_versions" && has(ops, "insert")) return ok({ id: "v3", version_no: 3 });
      if (table === "plan_images" && has(ops, "select")) return ok([{ idx: 0, path: "u1/p1/2-0.png" }, { idx: 2, path: "u1/p1/2-2.png" }]);
      if (table === "plan_images" && has(ops, "insert")) return ok(null);
      if (table === "plans") return ok(null);
      return latest(2)(table, ops);
    });
    const r = await insertVersion(c, "p1", 2, { content: { a: 1 }, source: "edit", edit_request: "r", copyImagesFrom: { versionId: "v2", idx: [0, 2] } });
    expect(r.version_no).toBe(3);
    const ins = c.calls.find(x => x.table === "plan_versions" && has(x.ops, "insert"));
    expect(arg(ins.ops, "insert")[0]).toMatchObject({ plan_id: "p1", version_no: 3, source: "edit", edit_request: "r", content: { a: 1 } });
    const sel = c.calls.find(x => x.table === "plan_images" && has(x.ops, "select"));
    expect(arg(sel.ops, "eq")).toEqual(["version_id", "v2"]);
    expect(arg(sel.ops, "in")).toEqual(["idx", [0, 2]]);
    const copy = c.calls.find(x => x.table === "plan_images" && has(x.ops, "insert"));
    expect(arg(copy.ops, "insert")[0]).toEqual([
      { version_id: "v3", idx: 0, path: "u1/p1/2-0.png" },
      { version_id: "v3", idx: 2, path: "u1/p1/2-2.png" }
    ]);
  });
});

describe("getVersion", () => {
  it("번호가 없으면 최신 버전과 이미지를 돌려줘요", async () => {
    const c = fakeClient(table => {
      if (table === "plan_versions") return ok([{ id: "v2", version_no: 2, content: { x: 1 } }]);
      if (table === "plan_images") return ok([{ idx: 1, path: "u1/p1/2-1.png" }]);
    });
    const v = await getVersion(c, "p1");
    expect(v).toMatchObject({ id: "v2", version_no: 2, content: { x: 1 }, images: [{ idx: 1, path: "u1/p1/2-1.png" }] });
    const vq = c.calls[0];
    expect(arg(vq.ops, "order")).toEqual(["version_no", { ascending: false }]);
  });

  it("없으면 null", async () => {
    expect(await getVersion(fakeClient(() => ok([])), "p1", 9)).toBeNull();
  });
});

describe("saveImage", () => {
  it("idx 0·1을 동시에 저장하면 서로 다른 경로로 올리고 plan_images를 2번 upsert해요", async () => {
    const c = fakeClient((table) => {
      if (table === "plan_versions") return ok({ version_no: 3 });
      return ok(null);
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const paths = await Promise.all([
      saveImage(c, "u1", "p1", "v3", 0, bytes),
      saveImage(c, "u1", "p1", "v3", 1, bytes)
    ]);
    expect(paths).toEqual(["u1/p1/3-0.png", "u1/p1/3-1.png"]);
    expect(c.uploads.map(u => u.bucket)).toEqual(["plan-images", "plan-images"]);
    expect(c.uploads.every(u => u.opts.upsert === true && u.opts.contentType === "image/png")).toBe(true);
    const ups = c.calls.filter(x => x.table === "plan_images" && has(x.ops, "upsert"));
    expect(ups).toHaveLength(2);
    expect(ups.map(x => arg(x.ops, "upsert")[0].idx).sort()).toEqual([0, 1]);
    expect(arg(ups[0].ops, "upsert")[1]).toEqual({ onConflict: "version_id,idx" });
  });

  it("idx가 0~2가 아니면 막아요", async () => {
    await expect(saveImage(fakeClient(() => ok(null)), "u1", "p1", "v1", 3, new Uint8Array())).rejects.toThrow();
  });
});

describe("signedUrls", () => {
  it("경로 → 서명 URL 맵을 돌려줘요", async () => {
    const r = await signedUrls(fakeClient(() => ok(null)), ["a.png", "b.png"]);
    expect(Object.keys(r)).toEqual(["a.png", "b.png"]);
    expect(r["a.png"]).toMatch(/^https:\/\/x\/a\.png/);
    expect(await signedUrls(fakeClient(() => ok(null)), [])).toEqual({});
  });
});

describe("usage · editCount · bumpImageRegens", () => {
  it("이번 달 시작은 한국 시간 기준이에요", () => {
    // 한국 12월 1일 01:00 = UTC 11월 30일 16:00 → 12월 시작(UTC 11-30 15:00)
    expect(monthStartKst(Date.parse("2026-11-30T16:00:00Z"))).toBe("2026-11-30T15:00:00.000Z");
    expect(monthStartKst(Date.parse("2026-11-30T14:00:00Z"))).toBe("2026-10-31T15:00:00.000Z");
  });

  it("usage는 전체 건수와 이번 달 건수를 세요", async () => {
    const c = fakeClient((table, ops) => ({ data: null, error: null, count: has(ops, "gte") ? 2 : 5 }));
    const now = Date.parse("2026-11-23T12:00:00+09:00");
    expect(await usage(c, now)).toEqual({ totalPlans: 5, plansThisMonth: 2 });
    const month = c.calls.find(x => has(x.ops, "gte"));
    expect(arg(month.ops, "gte")).toEqual(["created_at", "2026-10-31T15:00:00.000Z"]);
  });

  it("editCount는 source='edit' 버전만 세요", async () => {
    const c = fakeClient(() => ({ data: null, error: null, count: 4 }));
    expect(await editCount(c, "p1")).toBe(4);
    const eqs = c.calls[0].ops.filter(o => o[0] === "eq").map(o => o.slice(1));
    expect(eqs).toEqual([["plan_id", "p1"], ["source", "edit"]]);
  });

  it("bumpImageRegens는 RPC로 한 번에 1 늘리고 새 값을 돌려줘요", async () => {
    const c = fakeClient(() => ok(null), { rpc: () => ok(3) });
    expect(await bumpImageRegens(c, "p1")).toBe(3);
    expect(c.rpcs).toEqual([["bump_image_regens", { p_plan_id: "p1" }]]);
  });

  it("bumpImageRegens가 null이면(없거나 남의 기획안) NotFoundError", async () => {
    const c = fakeClient(() => ok(null), { rpc: () => ok(null) });
    await expect(bumpImageRegens(c, "p1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
