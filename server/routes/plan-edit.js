/* POST /api/plan-edit/preview: {plan_id, base_version_no, messages} → {reply, proposal}. 저장하지 않고 횟수도 세지 않아요.
   POST /api/plan-edit/apply: {plan_id, base_version_no, proposal} → 글·숫자를 서버에서 다시 조립하고 검증한 뒤 새 버전으로 저장해요 → {version_no, regenerate_images}.
   proposal 은 화면이 오가며 들고 있는 값이라 믿지 않아요. 제품 이름·용량·정가는 코드 값으로 다시 채우고, 검증을 통과해야만 저장해요. */
import { HttpError } from "../http.js";
import { pickCandidate, applySelection, keepSavedProducts, withProducts, withVolumes, InvalidCandidateError, InvalidSelectionError } from "../agents/research.js";
import { assemblePlan, PlanFormatError } from "../agents/writer.js";
import { assembleDesigns, DESIGN_KINDS } from "../agents/designer.js";
import { EDIT_SCHEMA, SCOPE, buildEditPrompt, cleanProposal, narrowForDirection, maxImageIdx } from "../agents/editor.js";
import { verifyContent } from "../orchestrator.js";
import { latestPalette } from "../data.js";
import { canEdit } from "../limits.js";
import { publicContent } from "./plan-get.js";

const isText = v => typeof v === "string" && v.trim() !== "";
const uniq = a => [...new Set(a)];
const MAX_MESSAGES = 20, MAX_CHARS = 2000;

async function open(body, { token, deps }) {
  if (!token) throw new HttpError(401, "로그인이 필요해요.");
  const { store } = deps;
  const client = store.userClient(token);
  const user = await store.getUser(client);
  if (!user) throw new HttpError(401, "로그인이 필요해요. 다시 로그인해 주세요.");

  const { plan_id, base_version_no } = body ?? {};
  if (!isText(plan_id) || !Number.isInteger(base_version_no)) throw new HttpError(400, "기획안과 버전 번호를 확인해 주세요.");
  const plan = await store.getPlan(client, plan_id);
  if (!plan) throw new HttpError(404, "기획안을 찾지 못했어요.");
  return { store, client, plan_id, base_version_no };
}

/* 저장된 내용의 계절·원료·목적으로 후보를 다시 만들어요. 자료가 바뀌어 못 찾으면 409 */
async function rebuild(client, content, deps) {
  const data = await deps.loadData(client);
  try {
    const picked = applySelection(pickCandidate(data, { season: content?.season, herb: content?.herb, purpose: content?.purpose }, deps.now?.() ?? Date.now()), content?.candidate?.selected);
    const cand = keepSavedProducts(picked, content?.plan?.products); // 저장할 때의 제품·가격 그대로
    return { data, cand };
  } catch (e) {
    if (e instanceof InvalidCandidateError || e instanceof InvalidSelectionError) throw new HttpError(409, "원료 자료가 바뀌어 수정할 수 없어요.");
    throw e;
  }
}

/* 화면에 보내는 제안: 보여 줄 칸만 허용 목록으로 남겨요. image_prompt·product_roles 는 apply 가 다시 조립하는 데 필요해서 같이 보내요 */
function toClient(p) {
  const out = { summary: p.summary, changes: p.changes, regenerate_images: p.regenerate_images };
  if (p.products) out.products = p.products;
  if (p.volumes) out.volumes = p.volumes;
  if (p.notices) out.notices = p.notices;
  if (p.plan) out.plan = { ...publicContent({ plan: p.plan }).plan, product_roles: p.plan.product_roles };
  if (p.designs) {
    out.designs = publicContent({ designs: p.designs }).designs.map((d, i) => ({ ...d, image_prompt: p.designs[i].image_prompt }));
  }
  return out;
}

const validMessages = m =>
  Array.isArray(m) && m.length >= 1 && m.length <= MAX_MESSAGES &&
  m.every(x => x && (x.role === "user" || x.role === "assistant") && isText(x.content) && x.content.length <= MAX_CHARS) &&
  m[m.length - 1].role === "user";

async function preview(body, ctx) {
  const { store, client, plan_id, base_version_no } = await open(body, ctx);
  const { deps } = ctx;
  if (!validMessages(body?.messages)) throw new HttpError(400, `대화는 ${MAX_MESSAGES}개 이하, 한 개당 ${MAX_CHARS}자 이하여야 하고 마지막은 내 말이어야 해요.`);

  const base = await store.getVersion(client, plan_id, base_version_no);
  if (!base) throw new HttpError(404, "기획안 버전을 찾지 못했어요.");
  const latest = await store.getVersion(client, plan_id);
  if (latest && latest.version_no !== base.version_no) throw new HttpError(409, "최신 버전이 아니에요. 최신 버전을 불러온 뒤 다시 요청해 주세요.");

  const { data, cand } = await rebuild(client, base.content, deps);
  const prompt = buildEditPrompt(base.content, body.messages, cand, data);
  /* AI 답 모양이 어긋나거나, '방향' 요청인데 한 줄만 바꿨으면 무엇이 문제인지 알려 주고 한 번 더 받아요.
     두 번째도 형식이 틀리면 첫 번째 쓸 만한 답을 쓰고, 그것도 없으면 오류 대신 다시 말해 달라고 답해요. */
  let best = null, problem = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await deps.generate(attempt ? `${prompt}\n\n[지난 답의 문제]\n${problem}\n위 문제를 고쳐 understanding, reply, proposal을 빠짐없이 다시 써 주세요.` : prompt, EDIT_SCHEMA);
    let reply = isText(raw?.reply) ? raw.reply.trim() : "", proposal;
    try {
      proposal = cleanProposal(raw?.proposal, base.content, cand);
    } catch (e) {
      if (!(e instanceof PlanFormatError)) throw e;
      console.warn("[plan-edit] 수정안 형식 오류, 다시 받아요:", e.message);
      problem = e.message;
      continue;
    }
    if (!reply && proposal) reply = "이렇게 바꿔 볼게요.";
    if (!reply) { problem = "reply(답)가 비어 있어요."; continue; }
    best = { reply, proposal };
    const narrow = raw?.understanding?.scope === SCOPE.direction ? narrowForDirection(proposal, base.content) : null;
    if (!narrow) break;
    console.warn("[plan-edit] 방향 요청인데 일부만 바뀜, 다시 받아요:", narrow);
    problem = `사용자의 요청은 '방향' 변경이에요. 그런데 ${narrow} 기획안과 시나리오 전체를 새 방향에 맞게 다시 쓰세요.`;
  }
  if (!best) return { reply: "수정안을 만들다가 AI 답이 어긋났어요. 같은 요청을 조금 다르게 한 번 더 말씀해 주세요.", proposal: null };
  const { reply, proposal } = best;
  return { reply, proposal: proposal ? toClient(proposal) : null };
}

async function apply(body, ctx) {
  const { store, client, plan_id, base_version_no } = await open(body, ctx);
  const { deps } = ctx;
  const prop = body?.proposal;
  if (!prop || typeof prop !== "object" || Array.isArray(prop) || !isText(prop.summary)) throw new HttpError(400, "수정안을 확인해 주세요.");
  if (prop.regenerate_images != null && !Array.isArray(prop.regenerate_images)) throw new HttpError(400, "수정안을 확인해 주세요.");

  const ok = canEdit(await store.editCount(client, plan_id), await store.entitlements(client));
  if (!ok.ok) throw new HttpError(402, ok.reason);

  const base = await store.getVersion(client, plan_id, base_version_no);
  if (!base) throw new HttpError(404, "기획안 버전을 찾지 못했어요.");
  const latest = await store.getVersion(client, plan_id);
  if (latest && latest.version_no !== base.version_no) throw new HttpError(409, "최신 버전이 아니에요. 최신 버전을 불러온 뒤 다시 요청해 주세요.");

  const old = base.content ?? {};
  const rebuilt = await rebuild(client, old, deps);
  const { data } = rebuilt;
  // 제품 구성을 바꾸는 수정이면 이름만 받고, 용량·정가는 저장된 값·기준표 값으로 다시 짜요.
  if (prop.products != null && !Array.isArray(prop.products)) throw new HttpError(400, "수정안을 확인해 주세요.");
  const swap = withProducts(rebuilt.cand, prop.products?.length ? prop.products : null);
  // 용량을 바꾸는 수정이면 용량만 받고, 정가는 서버가 다시 계산해요. 최소 용량보다 작으면 저장하지 않아요.
  if (prop.volumes != null && !Array.isArray(prop.volumes)) throw new HttpError(400, "수정안을 확인해 주세요.");
  const vol = withVolumes(swap ? swap.cand : rebuilt.cand, prop.volumes?.length ? prop.volumes : null);
  if (vol.rejected.length) throw new HttpError(400, vol.rejected.join(" "));
  const cand = vol.cand;
  let regen = uniq((prop.regenerate_images ?? []).filter(i => Number.isInteger(i) && i >= 0 && i <= 2));

  // 글만 받고, 숫자·제품 목록은 코드 값으로 다시 조립해요.
  const notes = [];
  let plan = old.plan, scenarios = Array.isArray(old.scenarios) ? old.scenarios : [], designs = Array.isArray(old.designs) ? old.designs : [];
  try {
    if (prop.plan != null || swap || vol.volumes.length) {
      const p = prop.plan ?? { concept_name: old.plan?.concept_name, concept: old.plan?.concept, target: old.plan?.target, key_claims: old.plan?.key_claims, cautions: old.plan?.cautions, products: old.plan?.products };
      const roles = Array.isArray(p?.product_roles) ? p.product_roles : (Array.isArray(p?.products) ? p.products.map(x => ({ name: x?.name, role: x?.role })) : []);
      plan = assemblePlan({ ...p, product_roles: roles }, cand, old.plan?.notes);
    }
    if (prop.designs != null) {
      const list = Array.isArray(prop.designs) ? prop.designs : prop.designs?.designs;
      const d = assembleDesigns({ designs: list });
      designs = d.designs;
      notes.push(...d.notes);
    }
  } catch (e) {
    if (e instanceof PlanFormatError) throw new HttpError(400, "수정안 형식이 맞지 않아요. 미리보기를 다시 받아 주세요.");
    throw e;
  }
  if (!plan) throw new HttpError(409, "저장된 기획안 내용이 올바르지 않아 수정할 수 없어요.");

  /* 예전 형식(시나리오) 기획안에 디자인이 새로 생기면 지금 형식으로 바꾸고, 이미지 2장은 모두 새로 만들어요 (예전 이미지는 복사하지 않아요) */
  const converted = designs.length > 0 && !(Array.isArray(old.designs) && old.designs.length);
  if (converted) { scenarios = []; regen = DESIGN_KINDS.map((_, i) => i); }
  const last = maxImageIdx({ designs });
  regen = regen.filter(i => i <= last);
  const keep = converted ? [] : Array.from({ length: last + 1 }, (_, i) => i).filter(i => !regen.includes(i));

  // 이전 의견 글에는 금지 표현이 인용돼 있을 수 있어서 비우고, 이번 검증 결과를 새로 써요.
  plan = { ...plan, review_notes: [] };
  const content = { ...old, plan, scenarios, designs };
  const verdict = await verifyContent({ season: old.season, plan, scenarios, designs }, cand, data, deps.generate);
  if (!verdict.approved) throw new HttpError(422, "검증을 통과하지 못했어요.", { issues: verdict.issues });

  const palette = old.palette ?? latestPalette(data, old.season);
  const review_notes = uniq([...verdict.notes, ...notes, ...(palette ? [] : ["트렌드 팔레트 자료 없음"])]);
  content.plan = { ...plan, review_notes };
  content.review = { approved: true, issues: [], rounds: 1 };

  const saved = await store.insertVersion(client, plan_id, base.version_no, {
    content, source: "edit", edit_request: prop.summary.trim().slice(0, 200),
    copyImagesFrom: { versionId: base.id, idx: keep }
  });
  return { version_no: saved.version_no, regenerate_images: regen };
}

export default { preview, apply };
