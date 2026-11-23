/* POST /api/plan-image: {plan_id, version_no?, idx, regenerate?} → 시나리오 idx의 이미지를 만들어 저장하고 {idx, url}을 돌려줘요.
   regenerate 는 최신 버전에서만 되고, 아닐 때는 비어 있는 idx만 채워요(이미 있으면 그대로 돌려줘서 두 번 만들지 않아요). */
import { HttpError } from "../http.js";
import { pickCandidate, InvalidCandidateError } from "../agents/research.js";
import { buildImagePrompt, sampleFilesFor } from "../agents/designer.js";
import { latestPalette } from "../data.js";
import { canRegenImage } from "../limits.js";

const isText = v => typeof v === "string" && v.trim() !== "";

export default async function planImage(body, { token, deps }) {
  if (!token) throw new HttpError(401, "로그인이 필요해요.");
  const { store } = deps;
  const client = store.userClient(token);
  const user = await store.getUser(client);
  if (!user) throw new HttpError(401, "로그인이 필요해요. 다시 로그인해 주세요.");

  const { plan_id, version_no, idx } = body ?? {};
  const regenerate = body?.regenerate === true;
  if (!isText(plan_id) || !Number.isInteger(idx) || idx < 0 || idx > 2) throw new HttpError(400, "기획안과 이미지 번호를 확인해 주세요.");
  if (version_no != null && !Number.isInteger(version_no)) throw new HttpError(400, "버전 번호를 확인해 주세요.");

  const plan = await store.getPlan(client, plan_id);
  if (!plan) throw new HttpError(404, "기획안을 찾지 못했어요.");

  const latest = await store.getVersion(client, plan_id);
  const version = version_no == null || version_no === latest?.version_no ? latest : await store.getVersion(client, plan_id, version_no);
  if (!version) throw new HttpError(404, "기획안 버전을 찾지 못했어요.");
  if (regenerate && version.version_no !== latest.version_no) {
    throw new HttpError(409, "최신 버전이 아니에요. 최신 버전을 불러온 뒤 다시 만들어 주세요.");
  }

  const urlOf = async p => (await store.signedUrls(client, [p]))[p];
  const existing = (version.images ?? []).find(i => i.idx === idx);
  if (existing && !regenerate) return { idx, url: await urlOf(existing.path) };

  const content = version.content ?? {};
  const scenario = content.scenarios?.[idx];
  if (!scenario) throw new HttpError(404, "그 번호의 시나리오가 없어요.");

  if (regenerate) {
    const ok = canRegenImage(plan.image_regens);
    if (!ok.ok) throw new HttpError(402, ok.reason);
    const n = await store.bumpImageRegens(client, plan_id);
    // 동시에 눌러 한도를 넘었다면 만들지 않아요.
    const over = canRegenImage(n - 1);
    if (!over.ok) throw new HttpError(402, over.reason);
  }

  let cand;
  const data = await deps.loadData(client);
  try {
    cand = pickCandidate(data, { season: content.season, herb: content.herb, purpose: content.purpose }, deps.now?.() ?? Date.now());
  } catch (e) {
    if (e instanceof InvalidCandidateError) throw new HttpError(404, "기획안의 후보 정보를 찾지 못했어요.");
    throw e;
  }
  const palette = content.palette ?? latestPalette(data, content.season);
  const names = sampleFilesFor(cand);
  const images = await Promise.all(names.map(async name => ({ name, bytes: await deps.readSample(name) })));

  const bytes = await deps.editImage({ prompt: buildImagePrompt(scenario, cand, data, palette), images });
  const saved = await store.saveImage(client, user.id, plan_id, version.id, idx, bytes);
  return { idx, url: await urlOf(saved) };
}
