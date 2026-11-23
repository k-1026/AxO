/* DB 행을 화면·서버가 함께 쓰는 모양으로 바꿔 줘요. 브라우저·Node 어디서나 돌아가도록 import 없이 순수하게 둬요. */

const pair = (score, note) => (note == null && score == null ? undefined : [score, note]);
const gate = (status, note) => (status ? [status, note] : undefined);

export function toSeasons(seasons, issues) {
  const out = {};
  for (const s of seasons) out[s.name] = { eng: s.eng, icon: s.icon, issues: [] };
  for (const i of issues) out[i.season]?.issues.push([i.title, i.stat, i.concern, i.purposes]);
  return out;
}

export function toHerb(r) {
  const h = {
    herb: r.name, hanja: r.hanja ?? "", purposes: r.purposes, words: r.words, seasons: r.seasons, color: r.color,
    scent: pair(r.scent_score, r.scent_note), gb: pair(r.gb_score, r.gb_note), preempt: pair(r.preempt_score, r.preempt_note),
    hanbang: pair(r.hanbang_score, r.hanbang_note), rival: pair(r.rival_score, r.rival_note), origin: pair(r.origin_score, r.origin_note),
    func: r.func ?? undefined, hanbangGate: gate(r.hanbang_gate_status, r.hanbang_gate_note), typeGate: gate(r.type_gate_status, r.type_gate_note),
  };
  for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
  return h;
}

/** herbs 행(herb_designs 포함)에서 약재별 디자인 표를 만들어요. */
export function toDesign(herbRows) {
  const DESIGN = {};
  for (const h of herbRows) {
    const d = Array.isArray(h.herb_designs) ? h.herb_designs[0] : h.herb_designs;
    if (!d) throw new Error(`${h.name} 디자인(herb_designs)이 없어요.`);
    DESIGN[h.name] = { main: d.main, cap: d.cap, liquid: d.liquid, motif: d.motif, from: d.from_label };
  }
  return DESIGN;
}
