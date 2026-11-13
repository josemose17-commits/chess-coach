// Shared browser-side pieces: the engine instance, saved data, and small DOM helpers.
import { Chess } from 'chess.js';
import { Engine } from './engine.js';
import { whiteValue, pov, winChance, terminalScore, phaseOf, classify, isMate, mateIn } from './analysis.js';
import { explain } from './coach.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const engine = new Engine(new URL('./engine/stockfish-18-lite-single.js', location.href));

const KEY = 'chessCoach.v2';
export const store = { username: '', games: [], solved: {} };
try { Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* start fresh */ }
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; }
}

async function best(fen, depth) {
  return terminalScore(fen) || (await engine.analyse(fen, { depth }))[0];
}

// Compare a move with the engine's choice in the same position.
export async function judge(fen, uci, depth = 12) {
  const board = new Chess(fen);
  const color = board.turn();
  const before = await best(fen, depth);
  board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const after = await best(board.fen(), depth);
  const vb = pov(whiteValue(before, color), color);
  const va = pov(whiteValue(after, board.turn()), color);
  const top = before.pv[0];
  const same = !top || top === uci;
  const loss = same ? 0 : Math.max(0, winChance(vb) - winChance(va));
  let cls = classify(loss);
  if (!cls && !same && isMate(vb) && vb > 0 && mateIn(vb) <= 5 && !(isMate(va) && va > 0)) cls = 'missed';
  const event = { fen, uci, best: top, pvBest: before.pv.slice(0, 10), pvAfter: after.pv.slice(0, 10), vb, va, loss, cls, phase: phaseOf(fen), color };
  return { event, loss, cls, same, vb, va, best: top, story: cls ? explain(event) : null };
}

export function tabs(root, onChange) {
  const buttons = $$('[data-tab]', root);
  const select = (name) => {
    for (const b of buttons) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    onChange(name);
  };
  for (const b of buttons) b.onclick = () => select(b.dataset.tab);
  return select;
}

// Cross-view navigation: views register handlers, others call go('train', {...}).
const routes = {};
export const route = (name, fn) => { routes[name] = fn; };
export const go = (name, arg) => routes[name]?.(arg);
