/* 총괄: 후보 선택 → 자료 정리 → 기획안 → 검증(필요하면 1회 재작성) → 시나리오 순서로 에이전트를 이어 불러요. */
import { pickCandidate, RESEARCH_SCHEMA, buildResearchPrompt, cleanNotes } from "./agents/research.js";
import { PLAN_SCHEMA, buildPlanPrompt, assemblePlan } from "./agents/writer.js";
import { SCENARIO_SCHEMA, buildScenarioPrompt, assembleScenarios } from "./agents/designer.js";
import { checkRules, REVIEW_SCHEMA, buildReviewPrompt, cleanReview } from "./agents/verifier.js";
import { latestPalette } from "./data.js";

export const MAX_REVISIONS = 1;

const uniq = a => [...new Set(a)];
const UNREADABLE = "AI 검토 응답을 해석하지 못했어요.";

/* 코드 규칙 + AI 검토. 둘 다 통과해야 approved예요. notes는 의견으로만 남겨요 */
export async function verifyContent(content, cand, data, generate) {
  const { fix, notes } = checkRules(content, cand, data);
  const raw = await generate(buildReviewPrompt(content, cand, content.season, data), REVIEW_SCHEMA);
  const readable = raw !== null && typeof raw === "object" && !Array.isArray(raw);
  const ai = readable ? cleanReview(raw) : { approved: false, issues: [UNREADABLE] };
  return { approved: fix.length === 0 && ai.approved, issues: uniq([...fix, ...ai.issues]), notes };
}

export async function runPlanPipeline({ data, season, herb, purpose, generate, now }) {
  const t = now ?? Date.now();
  const log = [];
  const step = (agent, ok, note) => log.push({ step: log.length + 1, agent, ok, note });

  const cand = pickCandidate(data, { season, herb, purpose }, t);
  const l = cand.l;
  step("후보 생성", true, `${l.name} 후보를 골랐어요.`);

  const notes = cleanNotes(await generate(buildResearchPrompt(cand, season, data), RESEARCH_SCHEMA));
  step("후보 생성", true, `근거 메모 ${notes.length}개를 정리했어요.`);

  const writePlan = async revise => assemblePlan(await generate(buildPlanPrompt(cand, season, data, notes, revise), PLAN_SCHEMA), cand, notes);
  let plan = await writePlan();
  step("작성", true, "기획안을 썼어요.");

  const content = {
    season, herb, purpose,
    candidate: { name: l.name, lineup: l.lineup, extra: l.extra, functional: l.functional, mid: cand.mid, evid: cand.evid },
    plan, scenarios: [], palette: latestPalette(data, season), review: { approved: false, issues: [], rounds: 0 }
  };

  let verdict = await verifyContent({ season, plan }, cand, data, generate);
  let rounds = 1;
  step("검증", verdict.approved, verdict.approved ? "검토를 통과했어요." : `고칠 점 ${verdict.issues.length}개를 찾았어요.`);
  while (!verdict.approved && rounds <= MAX_REVISIONS) {
    plan = await writePlan({ previous: plan, issues: verdict.issues });
    rounds++;
    step("작성", true, "고칠 점을 반영해 기획안을 다시 썼어요.");
    verdict = await verifyContent({ season, plan }, cand, data, generate);
    step("검증", verdict.approved, verdict.approved ? "다시 검토해 통과했어요." : `남은 의견 ${verdict.issues.length}개를 기록하고 계속해요.`);
  }
  content.plan = plan;

  const review_notes = [...verdict.notes];
  if (!verdict.approved) review_notes.unshift(...verdict.issues);

  const scn = assembleScenarios(await generate(buildScenarioPrompt(plan, cand, season, data, content.palette), SCENARIO_SCHEMA));
  content.scenarios = scn.scenarios;
  /* 기획안의 의견 글은 빼고 검사해요 (의견 속 금지어가 다시 잡히지 않게) */
  const after = checkRules({ plan: { ...plan, review_notes: [] }, scenarios: scn.scenarios }, cand, data);
  review_notes.push(...after.fix, ...after.notes, ...scn.notes);
  step("디자인", true, `시나리오 ${scn.scenarios.length}개를 만들었어요.`);

  if (!content.palette) review_notes.push("트렌드 팔레트 자료 없음");
  plan.review_notes = uniq(review_notes);
  content.review = { approved: verdict.approved, issues: verdict.issues, rounds };
  return { content, log };
}
