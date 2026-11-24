/* POST /api/plan: {season, herb, purpose} → 기획안을 만들어 저장하고 {plan_id, version_no}를 돌려줘요. */
import { HttpError } from "../http.js";
import { runPlanPipeline } from "../orchestrator.js";
import { InvalidCandidateError, InvalidSelectionError } from "../agents/research.js";
import { PlanFormatError } from "../agents/writer.js";
import { canCreate } from "../limits.js";

const isText = v => typeof v === "string" && v.trim() !== "";

export default async function plan(body, { token, deps }) {
  if (!token) throw new HttpError(401, "로그인이 필요해요.");
  const { store } = deps;
  const client = store.userClient(token);
  const user = await store.getUser(client);
  if (!user) throw new HttpError(401, "로그인이 필요해요. 다시 로그인해 주세요.");

  const { season, herb, purpose, products } = body ?? {};
  if (![season, herb, purpose].every(isText)) throw new HttpError(400, "계절·원료·피부 목적을 모두 골라 주세요.");
  if (products != null && (!Array.isArray(products) || products.length > 20 || !products.every(isText))) throw new HttpError(400, "고른 제품을 확인해 주세요.");

  const now = () => deps.now?.() ?? Date.now();
  const allowed = async () => canCreate(await store.usage(client, now()), await store.entitlements(client), now());

  const first = await allowed();
  if (!first.ok) throw new HttpError(402, first.reason);

  let result;
  try {
    const data = await deps.loadData(client);
    result = await runPlanPipeline({ data, season, herb, purpose, products: products ?? undefined, generate: deps.generate, now: now() });
  } catch (e) {
    if (e instanceof InvalidCandidateError) throw new HttpError(400, "고른 조합의 후보를 찾지 못했어요. 다시 골라 주세요.");
    if (e instanceof InvalidSelectionError) throw new HttpError(400, e.message);
    if (e instanceof PlanFormatError) throw new HttpError(502, "AI가 만든 기획안 형식이 맞지 않아요. 다시 시도해 주세요.");
    throw e;
  }

  // 만드는 동안 같은 사용자가 다른 기획안을 만들었을 수 있어서, 저장 직전에 한 번 더 세어요.
  const again = await allowed();
  if (!again.ok) throw new HttpError(402, again.reason);

  const { content, log } = result;
  const title = content.plan?.concept_name || `${herb} ${season} 기획안`;
  const saved = await store.createPlan(client, { season, herb, purpose, title, content, log });
  return { plan_id: saved.plan_id, version_no: saved.version_no };
}
