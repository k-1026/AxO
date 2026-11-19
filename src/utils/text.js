export const eulReul = w => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? "을" : "를"; };
export const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
export const dots = n => "●".repeat(n) + "○".repeat(5 - n);
export const chips = arr => arr.map(t => `<span class="kwc">${esc(t)}</span>`).join("");
export const stars = n => "★".repeat(n);
export const won = n => n.toLocaleString("ko-KR") + "원";
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const scoreText = r => (r.lo === r.hi ? `${r.lo}` : `${r.lo}~${r.hi}`) + "점";
