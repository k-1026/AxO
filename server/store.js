/* 기획안 저장소: 사용자 로그인 토큰으로 Supabase를 불러요. 서비스 키는 쓰지 않아서 RLS가 그대로 적용돼요.
 * userClient 말고는 모두 client를 첫 인자로 받아요 (테스트에서 가짜 client를 넣을 수 있게). */
import { createClient } from "@supabase/supabase-js";

export const BUCKET = "plan-images";
const SIGNED_URL_SECONDS = 60 * 60;
const KST_MS = 9 * 60 * 60 * 1000;

export class ConflictError extends Error {
  constructor(message = "다른 곳에서 먼저 새 버전이 저장됐어요. 최신 버전을 다시 불러와 주세요.") {
    super(message);
    this.name = "ConflictError";
    this.status = 409;
  }
}

export class NotFoundError extends Error {
  constructor(message = "기획안을 찾지 못했어요.") {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
  }
}

export class StoreError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "StoreError";
    this.status = 500;
    this.cause = cause;
  }
}

/* 조회 결과에 에러가 있으면 던지고, 없으면 그대로 돌려줘요 */
function check(res, what) {
  if (res?.error) {
    if (res.error.code === "23505") throw new ConflictError();
    throw new StoreError(`${what}에 실패했어요: ${res.error.message ?? "알 수 없는 오류"}`, res.error);
  }
  return res;
}

export function userClient(token) {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    }
  );
}

/** 로그인 사용자 {id}, 아니면 null */
export async function getUser(client) {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) return null;
    return { id: data.user.id };
  } catch {
    return null;
  }
}

/** 한국 시간으로 이번 달 1일 0시를 UTC ISO 문자열로 돌려줘요 */
export function monthStartKst(now) {
  const k = new Date(new Date(now ?? Date.now()).getTime() + KST_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST_MS).toISOString();
}

/** plans 1행 + 버전 1을 넣어요. 과정 기록(log)은 버전 내용 안에 같이 남겨요. */
export async function createPlan(client, { season, herb, purpose, title, content, log }) {
  const plan = check(
    await client.from("plans").insert({ season, herb, purpose, title }).select("id").single(),
    "기획안 저장"
  ).data;
  const body = log === undefined ? content : { ...content, log };
  const ver = await client.from("plan_versions")
    .insert({ plan_id: plan.id, version_no: 1, content: body, source: "generate", edit_request: null })
    .select("id, version_no").single();
  if (ver?.error) {
    // 버전을 못 넣었으면 빈 기획안이 남지 않게 지워요 (지우기 실패는 원래 오류를 덮지 않아요)
    try { await client.from("plans").delete().eq("id", plan.id); } catch { /* 무시 */ }
    check(ver, "기획안 버전 저장");
  }
  return { plan_id: plan.id, version_no: 1 };
}

/* 그 기획안의 최신 버전 번호. 기획안이 없거나 남의 것이면(RLS) null */
async function latestVersionNo(client, planId) {
  const rows = check(
    await client.from("plan_versions").select("version_no").eq("plan_id", planId)
      .order("version_no", { ascending: false }).limit(1),
    "버전 조회"
  ).data;
  return rows?.[0]?.version_no ?? null;
}

/** 버전 하나와 그 이미지들. versionNo가 없으면 최신 버전. 없으면 null */
export async function getVersion(client, planId, versionNo) {
  let q = client.from("plan_versions")
    .select("id, version_no, content, source, edit_request, created_at")
    .eq("plan_id", planId);
  q = versionNo == null ? q.order("version_no", { ascending: false }) : q.eq("version_no", versionNo);
  const rows = check(await q.limit(1), "버전 조회").data;
  const v = rows?.[0];
  if (!v) return null;
  const images = check(
    await client.from("plan_images").select("idx, path").eq("version_id", v.id).order("idx", { ascending: true }),
    "이미지 조회"
  ).data ?? [];
  return { ...v, images: images.map(({ idx, path }) => ({ idx, path })) };
}

/**
 * 새 버전을 "최신 번호 + 1"로 넣어요.
 * baseNo가 최신이 아니거나, 동시에 저장해 유일 제약(23505)에 걸리면 ConflictError(409).
 * copyImagesFrom = {versionId, idx: number[]} 이면 그 이미지 행을 새 버전으로 복사해요.
 */
export async function insertVersion(client, planId, baseNo, { content, source, edit_request, copyImagesFrom } = {}) {
  const latest = await latestVersionNo(client, planId);
  if (latest === null) throw new NotFoundError();
  if (latest !== Number(baseNo)) throw new ConflictError();

  const ver = check(
    await client.from("plan_versions")
      .insert({ plan_id: planId, version_no: latest + 1, content, source, edit_request: edit_request ?? null })
      .select("id, version_no").single(),
    "새 버전 저장"
  ).data;

  const idx = copyImagesFrom?.idx ?? [];
  if (copyImagesFrom?.versionId && idx.length) {
    const rows = check(
      await client.from("plan_images").select("idx, path").eq("version_id", copyImagesFrom.versionId).in("idx", idx),
      "이미지 조회"
    ).data ?? [];
    if (rows.length) {
      check(
        await client.from("plan_images").insert(rows.map(r => ({ version_id: ver.id, idx: r.idx, path: r.path }))),
        "이미지 복사"
      );
    }
  }

  check(await client.from("plans").update({ updated_at: new Date().toISOString() }).eq("id", planId), "기획안 수정일 저장");
  return { id: ver.id, version_no: ver.version_no };
}

/** 이미지를 {user_id}/{plan_id}/{version_no}-{idx}.png 로 올리고 plan_images에 upsert해요. 경로를 돌려줘요. */
export async function saveImage(client, userId, planId, versionId, idx, bytes) {
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) throw new StoreError(`이미지 번호가 올바르지 않아요: ${idx}`);
  const ver = check(
    await client.from("plan_versions").select("version_no").eq("id", versionId).eq("plan_id", planId).single(),
    "버전 조회"
  ).data;
  if (!ver) throw new NotFoundError();

  const path = `${userId}/${planId}/${ver.version_no}-${idx}.png`;
  check(
    await client.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true }),
    "이미지 업로드"
  );
  check(
    await client.from("plan_images").upsert({ version_id: versionId, idx, path }, { onConflict: "version_id,idx" }),
    "이미지 경로 저장"
  );
  return path;
}

/** 경로 → 서명 URL (1시간) */
export async function signedUrls(client, paths) {
  const list = [...new Set((paths ?? []).filter(Boolean))];
  if (!list.length) return {};
  const data = check(await client.storage.from(BUCKET).createSignedUrls(list, SIGNED_URL_SECONDS), "이미지 주소 만들기").data ?? [];
  const out = {};
  for (const d of data) if (d?.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
  return out;
}

/** 내 기획안 목록 (최근 수정 순). latest_version은 가장 큰 버전 번호예요. */
export async function listPlans(client) {
  const rows = check(
    await client.from("plans")
      .select("id, season, herb, purpose, title, created_at, updated_at, plan_versions(version_no)")
      .order("updated_at", { ascending: false }),
    "기획안 목록 조회"
  ).data ?? [];
  return rows.map(({ plan_versions, ...p }) => ({
    ...p,
    latest_version: (plan_versions ?? []).reduce((m, v) => Math.max(m, v.version_no ?? 0), 0) || null
  }));
}

/**
 * 이미지 다시 만들기 횟수를 1 늘리고 새 값을 돌려줘요. (서버가 canRegenImage로 먼저 확인해요)
 * 사용자는 image_regens 칸을 직접 고칠 수 없어서(schema.sql의 칸별 권한) DB 함수로 한 번에 늘려요.
 */
export async function bumpImageRegens(client, planId) {
  const n = check(await client.rpc("bump_image_regens", { p_plan_id: planId }), "이미지 횟수 저장").data;
  if (n === null || n === undefined) throw new NotFoundError();
  return Number(n);
}

/** 내 사용량: 전체 기획안 수, 이번 달(한국 시간) 기획안 수 */
export async function usage(client, now) {
  const total = check(await client.from("plans").select("id", { count: "exact", head: true }), "사용량 조회");
  const month = check(
    await client.from("plans").select("id", { count: "exact", head: true }).gte("created_at", monthStartKst(now)),
    "사용량 조회"
  );
  return { totalPlans: total.count ?? 0, plansThisMonth: month.count ?? 0 };
}

/** 그 기획안의 수정(source='edit') 버전 수 */
export async function editCount(client, planId) {
  const res = check(
    await client.from("plan_versions").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("source", "edit"),
    "수정 횟수 조회"
  );
  return res.count ?? 0;
}

/** 내 이용권 목록 */
export async function entitlements(client) {
  return check(
    await client.from("entitlements").select("kind, remaining, period_start, period_end, created_at"),
    "이용권 조회"
  ).data ?? [];
}
