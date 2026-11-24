/* POST /api/plan-edit/preview: {plan_id, base_version_no, messages} → {reply, proposal}. 저장하지 않고 횟수도 세지 않아요.
   POST /api/plan-edit/apply: {plan_id, base_version_no, proposal} → 글·숫자를 서버에서 다시 조립하고 검증한 뒤 새 버전으로 저장해요 → {version_no, regenerate_images}.
   proposal 은 화면이 오가며 들고 있는 값이라 믿지 않아요. 제품 이름·용량·정가는 코드 값으로 다시 채우고, 검증을 통과해야만 저장해요. */
import { HttpError } from "../http.js";
import { pickCandidate, applySelection, keepSavedProducts, InvalidCandidateError, InvalidSelectionError } from "../agents/research.js";
import { assemblePlan, PlanFormatError } from "../agents/writer.js";
import { assembleScenarios } from "../agents/designer.js";
import { EDIT_SCHEMA, buildEditPrompt, cleanProposal } from "../agents/editor.js";
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

/* 화면에 보내는 제안: 보여 줄 칸만 허용 목록으로 남겨요. image_prompts·product_roles 는 apply 가 다시 조립하는 데 필요해서 같이 보내요 */
function toClient(p) {
  const out = { summary: p.summary, changes: p.changes, regenerate_images: p.regenerate_images };
  if (p.plan) out.plan = { ...publicContent({ plan: p.plan }).plan, product_roles: p.plan.product_roles };
  if (p.scenarios) {
    out.scenarios = publicContent({ scenarios: p.scenarios }).scenarios.map((s, i) => ({ ...s, image_prompts: p.scenarios[i].image_prompts }));
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
  const raw = await deps.generate(buildEditPrompt(base.content, body.messages, cand, data), EDIT_SCHEMA);
  const reply = isText(raw?.reply) ? raw.reply.trim() : "";
  if (!reply) throw new HttpError(502, "AI가 만든 답 형식이 맞지 않아요. 다시 시도해 주세요.");
  let proposal;
  try {
    proposal = cleanProposal(raw.proposal, base.content, cand);
  } catch (e) {
    if (e instanceof PlanFormatError) throw new HttpError(502, "AI가 만든 수정안 형식이 맞지 않아요. 다시 시도해 주세요.");
    throw e;
  }
  return { reply, proposal: proposal ? toClient(proposal) : null };
}

async function apply(body, ctx) {
  const { store, client, plan_id, base_version_no } = await open(body, ctx);
  const { deps } = ctx;
  const prop = body?.proposal;
  if (!prop || typeof prop !== "object" || Array.isArray(prop) || !isText(prop.summary)) throw new HttpError(400, "수정안을 확인해 주세요.");
  if (prop.regenerate_images != null && !Array.isArray(prop.regenerate_images)) throw new HttpError(400, "수정안을 확인해 주세요.");

  const ok = canEdit(await store.editCount(client, plan_id));
  if (!ok.ok) throw new HttpError(402, ok.reason);

  const base = await store.getVersion(client, plan_id, base_version_no);
  if (!base) throw new HttpError(404, "기획안 버전을 찾지 못했어요.");
  const latest = await store.getVersion(client, plan_id);
  if (latest && latest.version_no !== base.version_no) throw new HttpError(409, "최신 버전이 아니에요. 최신 버전을 불러온 뒤 다시 요청해 주세요.");

  const old = base.content ?? {};
  const { data, cand } = await rebuild(client, old, deps);
  const regen = uniq((prop.regenerate_images ?? []).filter(i => Number.isInteger(i) && i >= 0 && i <= 2));

  // 글만 받고, 숫자·제품 목록은 코드 값으로 다시 조립해요.
  const notes = [];
  let plan = old.plan, scenarios = old.scenarios;
  try {
    if (prop.plan != null) {
      const p = prop.plan;
      const roles = Array.isArray(p?.product_roles) ? p.product_roles : (Array.isArray(p?.products) ? p.products.map(x => ({ name: x?.name, role: x?.role })) : []);
      plan = assemblePlan({ ...p, product_roles: roles }, cand, old.plan?.notes);
    }
    if (prop.scenarios != null) {
      const list = Array.isArray(prop.scenarios) ? prop.scenarios : prop.scenarios?.scenarios;
      const s = assembleScenarios({ scenarios: list });
      scenarios = s.scenarios;
      notes.push(...s.notes);
    }
  } catch (e) {
    if (e instanceof PlanFormatError) throw new HttpError(400, "수정안 형식이 맞지 않아요. 미리보기를 다시 받아 주세요.");
    throw e;
  }
  if (!plan || !Array.isArray(scenarios)) throw new HttpError(409, "저장된 기획안 내용이 올바르지 않아 수정할 수 없어요.");

  // 이전 의견 글에는 금지 표현이 인용돼 있을 수 있어서 비우고, 이번 검증 결과를 새로 써요.
  plan = { ...plan, review_notes: [] };
  const content = { ...old, plan, scenarios };
  const verdict = await verifyContent({ season: old.season, plan, scenarios }, cand, data, deps.generate);
  if (!verdict.approved) throw new HttpError(422, "검증을 통과하지 못했어요.", { issues: verdict.issues });

  const palette = old.palette ?? latestPalette(data, old.season);
  const review_notes = uniq([...verdict.notes, ...notes, ...(palette ? [] : ["트렌드 팔레트 자료 없음"])]);
  content.plan = { ...plan, review_notes };
  content.review = { approved: true, issues: [], rounds: 1 };

  const saved = await store.insertVersion(client, plan_id, base.version_no, {
    content, source: "edit", edit_request: prop.summary.trim().slice(0, 200),
    copyImagesFrom: { versionId: base.id, idx: [0, 1, 2].filter(i => !regen.includes(i)) }
  });
  return { version_no: saved.version_no, regenerate_images: regen };
}

export default { preview, apply };
