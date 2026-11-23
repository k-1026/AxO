/* POST /api/plan-get: {plan_id?, version_no?}
   plan_id 가 없으면 내 기획안 목록 {plans}, 있으면 {plan, version, versions, latest_version_no, image_urls}를 돌려줘요.
   내부 점수·이미지 프롬프트·작업 기록은 화면에 필요 없어서 여기서 빼고 보내요. */
import { HttpError } from "../http.js";

const isText = v => typeof v === "string" && v.trim() !== "";

/* 화면에 보여 줄 내용만 남겨요 */
function publicContent(c) {
  const { log, ...rest } = c ?? {};
  const candidate = rest.candidate && typeof rest.candidate === "object"
    ? (({ mid, evid, ...r }) => r)(rest.candidate) : rest.candidate;
  const scenarios = Array.isArray(rest.scenarios)
    ? rest.scenarios.map(({ image_prompt, ...r }) => r) : rest.scenarios;
  return { ...rest, candidate, scenarios };
}

export default async function planGet(body, { token, deps }) {
  if (!token) throw new HttpError(401, "로그인이 필요해요.");
  const { store } = deps;
  const client = store.userClient(token);
  const user = await store.getUser(client);
  if (!user) throw new HttpError(401, "로그인이 필요해요. 다시 로그인해 주세요.");

  const { plan_id, version_no } = body ?? {};
  if (plan_id == null) return { plans: await store.listPlans(client) };
  if (!isText(plan_id)) throw new HttpError(400, "기획안 번호를 확인해 주세요.");
  if (version_no != null && !Number.isInteger(version_no)) throw new HttpError(400, "버전 번호를 확인해 주세요.");

  const plan = await store.getPlan(client, plan_id);
  if (!plan) throw new HttpError(404, "기획안을 찾지 못했어요.");
  const [version, versions] = await Promise.all([
    store.getVersion(client, plan_id, version_no ?? undefined),
    store.listVersionNos(client, plan_id)
  ]);
  if (!version) throw new HttpError(404, "기획안 버전을 찾지 못했어요.");

  const urls = await store.signedUrls(client, version.images.map(i => i.path));
  const image_urls = [0, 1, 2].map(idx => {
    const img = version.images.find(i => i.idx === idx);
    return (img && urls[img.path]) || null;
  });
  const { images, ...v } = version;
  return {
    plan: { id: plan.id, season: plan.season, herb: plan.herb, purpose: plan.purpose },
    version: { ...v, content: publicContent(v.content) },
    versions,
    latest_version_no: versions[0] ?? version.version_no,
    image_urls
  };
}
