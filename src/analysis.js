// Game parsing, move grading and the weakness profile. No DOM or engine code here:
// the engine is passed in as a function so everything is testable under Node.
import { Chess } from 'chess.js';

export const MATE = 100000;
export const isMate = (v) => Math.abs(v) > MATE - 1000;
export const mateIn = (v) => MATE - Math.abs(v);

// Engine score (side to move) -> one number from White's point of view.
// Mates are encoded as +/-(MATE - moves) so they still sort correctly.
export function whiteValue(score, turn) {
  let v;
  if (score.mate !== undefined) v = score.mate > 0 ? MATE - score.mate : -(MATE - Math.abs(score.mate));
  else v = score.cp;
  return turn === 'w' ? v : -v;
}
export const pov = (v, color) => (color === 'w' ? v : -v);
const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));

// Winning chances (0-100) from a centipawn score; the logistic fit Lichess publishes.
export function winChance(v) {
  if (isMate(v)) return v > 0 ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(v, 1500))) - 1);
}
export function formatScore(v) {
  if (isMate(v)) return (v > 0 ? '' : '-') + '#' + mateIn(v);
  return (v > 0 ? '+' : '') + (v / 100).toFixed(1);
}

// Score for positions where the game is over, or null when the engine is needed.
export function terminalScore(fen) {
  const board = new Chess(fen);
  if (board.isCheckmate()) return { mate: 0, pv: [] };
  if (board.isDraw() || board.isStalemate()) return { cp: 0, pv: [] };
  return null;
}

export function uciMove(board, uci) {
  if (!uci || uci.length < 4) return null;
  try { return board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return null; }
}
export function lineSan(fen, ucis, max = 8) {
  const board = new Chess(fen);
  const out = [];
  for (const uci of (ucis || []).slice(0, max)) {
    const m = uciMove(board, uci);
    if (!m) break;
    out.push(m.san);
  }
  return out;
}
// "12. Nf3 Nc6 13. d4" style text for a line starting from a position.
export function numbered(fen, sans) {
  const parts = fen.split(' ');
  let n = Number(parts[5]) || 1;
  let white = parts[1] === 'w';
  return sans.map((san, i) => {
    const prefix = white ? `${n}. ` : i === 0 ? `${n}… ` : '';
    if (!white) n++;
    white = !white;
    return prefix + san;
  }).join(' ');
}

export function phaseOf(fen) {
  const [placement, , , , , move] = fen.split(' ');
  const pieces = (placement.match(/[qrbnQRBN]/g) || []).length;
  if (pieces <= 6) return 'Endgame';
  return Number(move) <= 12 ? 'Opening' : 'Middlegame';
}

function timeClassOf(tc) {
  if (!tc || tc === '-') return 'unknown';
  if (tc.includes('/')) return 'daily';
  const [base, inc = 0] = tc.split('+').map(Number);
  const total = base + 40 * inc;
  return total < 180 ? 'bullet' : total < 600 ? 'blitz' : total < 3600 ? 'rapid' : 'classical';
}

export function openingFromHeaders(headers) {
  const url = headers.ECOUrl || '';
  if (url.includes('/openings/')) {
    const slug = url.split('/openings/')[1].split('?')[0];
    // Drop the trailing move list ("...-3.Nf3-Nc6") and keep the family name.
    const name = slug.replace(/-?\d*\.\.\..*$/, '').replace(/-\d+\..*$/, '').replace(/-/g, ' ').trim();
    if (name) return name.split(' ').slice(0, 4).join(' ');
  }
  if (headers.Opening && headers.Opening !== '?') return headers.Opening.split(':')[0].trim();
  return headers.ECO && headers.ECO !== '?' ? 'ECO ' + headers.ECO : 'Unclassified';
}

export function parseGames(text, { maxGames = 100 } = {}) {
  if (text.length > 8_000_000) throw Error('That PGN is too large. Import a smaller batch.');
  const chunks = text.trim().split(/(?=^\[Event\s)/m).filter((s) => s.trim());
  const games = [];
  const seen = new Set();
  for (const pgn of chunks.slice(0, maxGames)) {
    const game = new Chess();
    try { game.loadPgn(pgn); } catch { continue; }
    const headers = game.getHeaders();
    if (!['1-0', '0-1', '1/2-1/2'].includes(headers.Result)) continue;
    if (headers.Variant && !['standard', 'chess', 'normal'].includes(headers.Variant.toLowerCase())) continue;
    if (headers.SetUp === '1' || headers.FEN) continue;
    const moves = game.history({ verbose: true });
    if (moves.length < 4) continue;
    const id = headers.Link || headers.Site?.startsWith('http') && headers.Site
      || [headers.White, headers.Black, headers.UTCDate || headers.Date, headers.UTCTime || '', moves.length].join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    const clocks = [...pgn.matchAll(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g)].map((m) => m[1] * 3600 + m[2] * 60 + Number(m[3]));
    games.push({
      id, headers, moves,
      clocks: clocks.length === moves.length ? clocks : null,
      timeClass: timeClassOf(headers.TimeControl),
      opening: openingFromHeaders(headers),
    });
  }
  return games;
}

export function playerColor(headers, username) {
  const name = username.trim().toLowerCase();
  if (!name) return null;
  if ((headers.White || '').toLowerCase() === name) return 'w';
  if ((headers.Black || '').toLowerCase() === name) return 'b';
  return null;
}

export const CLASSES = { blunder: 'Blunder', mistake: 'Mistake', inaccuracy: 'Inaccuracy', missed: 'Missed win' };
export function classify(loss) {
  return loss >= 20 ? 'blunder' : loss >= 10 ? 'mistake' : loss >= 5 ? 'inaccuracy' : null;
}

// Evaluate every position of a game once and grade the chosen player's moves.
// evaluate(fen) resolves to the engine's best line: {cp|mate, pv:[uci]} from the side to move.
export async function analyseGame(game, color, evaluate, onProgress = () => {}) {
  const { moves } = game;
  const fens = [moves[0].before, ...moves.map((m) => m.after)];
  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    const score = terminalScore(fens[i]) || await evaluate(fens[i]);
    evals.push({ v: whiteValue(score, fens[i].split(' ')[1]), pv: score.pv || [] });
    onProgress(i + 1, fens.length);
  }
  const events = [];
  const phases = {};
  let lossSum = 0, cplSum = 0, mine = 0;
  moves.forEach((m, i) => {
    if (m.color !== color) return;
    const before = evals[i], after = evals[i + 1];
    const vb = pov(before.v, color), va = pov(after.v, color);
    const best = before.pv[0];
    const same = !best || best === m.lan;
    const loss = same ? 0 : Math.max(0, winChance(vb) - winChance(va));
    const cpl = same ? 0 : Math.max(0, clamp(vb, 1000) - clamp(va, 1000));
    const phase = phaseOf(m.before);
    const p = phases[phase] ||= { moves: 0, loss: 0, errors: 0 };
    p.moves++; p.loss += loss; mine++; lossSum += loss; cplSum += cpl;
    let cls = classify(loss);
    // A forced mate that was let go is worth showing even when the position stays winning.
    if (!cls && !same && isMate(vb) && vb > 0 && mateIn(vb) <= 5 && !(isMate(va) && va > 0)) cls = 'missed';
    if (!cls) return;
    if (cls !== 'inaccuracy') p.errors++;
    events.push({
      ply: i, fen: m.before, uci: m.lan, san: m.san, best,
      pvBest: before.pv.slice(0, 10), pvAfter: after.pv.slice(0, 10),
      vb, va, loss: Math.round(loss * 10) / 10, cls, phase, color,
      clock: game.clocks ? game.clocks[i] : null,
      next: moves[i + 1]?.lan || null,
    });
  });
  // "Accuracy" here is simply 100 minus the average winning chances given away per move.
  return {
    evals: evals.map((e) => e.v), events, phases, moves: mine,
    acpl: mine ? Math.round(cplSum / mine) : 0,
    accuracy: mine ? Math.round((100 - lossSum / mine) * 10) / 10 : 100,
  };
}

export function gameRecord(game, color, analysis, depth) {
  const h = game.headers;
  const won = (h.Result === '1-0' && color === 'w') || (h.Result === '0-1' && color === 'b');
  const base = Number((h.TimeControl || '').split('+')[0]) || null;
  return {
    id: game.id, white: h.White || 'White', black: h.Black || 'Black', color,
    result: h.Result === '1/2-1/2' ? 'draw' : won ? 'win' : 'loss',
    date: (h.UTCDate || h.Date || '').replace(/\./g, '-'),
    opening: game.opening, timeClass: game.timeClass, baseTime: base,
    termination: h.Termination || '', url: /^https?:/.test(game.id) ? game.id : '',
    rating: Number(color === 'w' ? h.WhiteElo : h.BlackElo) || null,
    oppRating: Number(color === 'w' ? h.BlackElo : h.WhiteElo) || null,
    sans: game.moves.map((m) => m.san), depth, ...analysis,
  };
}

// Aggregate analysed games into the numbers the report shows.
// explain(event) comes from coach.js and supplies the motif for each mistake.
export function buildProfile(records, explain) {
  const total = { games: records.length, win: 0, draw: 0, loss: 0, moves: 0, lossSum: 0 };
  const phases = { Opening: { moves: 0, loss: 0, errors: 0 }, Middlegame: { moves: 0, loss: 0, errors: 0 }, Endgame: { moves: 0, loss: 0, errors: 0 } };
  const openings = new Map();
  const motifs = new Map();
  const events = [];
  const time = { withClock: 0, errors: 0, rushed: 0, lostOnTime: 0 };
  const conversion = { winning: 0, thrown: [], losing: 0, saved: 0 };
  for (const r of records) {
    total[r.result]++; total.moves += r.moves; total.lossSum += (100 - r.accuracy) * r.moves;
    for (const [name, p] of Object.entries(r.phases || {})) {
      phases[name].moves += p.moves; phases[name].loss += p.loss; phases[name].errors += p.errors;
    }
    const key = `${r.opening} (${r.color === 'w' ? 'White' : 'Black'})`;
    const o = openings.get(key) || { name: r.opening, color: r.color, games: 0, win: 0, draw: 0, loss: 0, evalSum: 0 };
    o.games++; o[r.result]++;
    o.evalSum += clamp(pov(r.evals[Math.min(24, r.evals.length - 1)], r.color), 600);
    openings.set(key, o);

    const mine = r.evals.map((v) => pov(v, r.color));
    const sustained = (test) => mine.some((v, i) => i > 0 && test(v) && test(mine[i - 1]));
    if (sustained((v) => v >= 300)) { conversion.winning++; if (r.result !== 'win') conversion.thrown.push(r); }
    if (sustained((v) => v <= -300)) { conversion.losing++; if (r.result !== 'loss') conversion.saved++; }
    if (r.result === 'loss' && /time/i.test(r.termination)) time.lostOnTime++;

    for (const e of r.events) {
      const story = explain(e);
      if (!story.valid) continue;
      const item = { ...e, gameId: r.id, story, label: `vs ${r.color === 'w' ? r.black : r.white}` };
      events.push(item);
      if (e.cls !== 'inaccuracy') {
        const g = motifs.get(story.motif) || { motif: story.motif, count: 0, loss: 0, games: new Set(), examples: [] };
        g.count++; g.loss += e.loss; g.games.add(r.id); g.examples.push(item);
        motifs.set(story.motif, g);
        if (e.clock !== null && r.baseTime) {
          time.errors++;
          if (e.clock < Math.max(20, r.baseTime * 0.1)) time.rushed++;
        }
      }
    }
    if (r.events.some((e) => e.clock !== null)) time.withClock++;
  }
  const rate = (p) => (p.moves ? (100 * p.errors) / p.moves : 0);
  return {
    total: { ...total, accuracy: total.moves ? Math.round((100 - total.lossSum / total.moves) * 10) / 10 : null },
    phases: Object.entries(phases).map(([name, p]) => ({ name, ...p, rate: rate(p) })),
    openings: [...openings.values()].map((o) => ({ ...o, score: (o.win + o.draw / 2) / o.games, eval: o.evalSum / o.games }))
      .sort((a, b) => b.games - a.games),
    motifs: [...motifs.values()].map((g) => ({ ...g, games: g.games.size, examples: g.examples.sort((a, b) => b.loss - a.loss) }))
      .sort((a, b) => b.loss - a.loss),
    events: events.sort((a, b) => b.loss - a.loss),
    time, conversion,
  };
}
