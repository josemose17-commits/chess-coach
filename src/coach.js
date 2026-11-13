// Turns an engine comparison (what was played vs. what was best) into a plain-language
// reason. Every statement is checked against the board: the engine says *that* a move is
// better, the geometry here says *why* in terms a player can reuse.
import { Chess } from 'chess.js';
import { uciMove, lineSan, numbered, isMate, mateIn, formatScore } from './analysis.js';

const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const other = (c) => (c === 'w' ? 'b' : 'w');
const piecesOf = (board, color) => board.board().flat().filter((p) => p && p.color === color);
const material = (board, color) =>
  board.board().flat().filter((p) => p && p.type !== 'k').reduce((s, p) => s + (p.color === color ? 1 : -1) * VALUE[p.type], 0);
const list = (items) => (items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1));
const the = (p, sq) => `${NAME[p.type]} on ${sq}`;

export const MOTIFS = {
  'mate-allowed': { label: 'Walking into checkmate', train: 'tactics',
    habit: 'Before every move, look at the checks your opponent will have afterwards. If a check leaves your king with no squares, deal with that first.' },
  'mate-missed': { label: 'Missing a forced checkmate', train: 'tactics',
    habit: 'When the enemy king is short of squares, list every check you have and follow each one to the end before settling for a quieter move.' },
  'hung-piece': { label: 'Leaving pieces undefended', train: 'tactics',
    habit: 'After choosing a move, do a one-second safety scan: which of my pieces are attacked, and is each one defended as many times as it is attacked?' },
  'missed-capture': { label: 'Not taking free material', train: 'tactics',
    habit: 'At the start of each turn, scan for enemy pieces that are undefended or attacked by something cheaper. Free material comes first.' },
  'tactic-allowed': { label: 'Allowing tactics (forks, pins, forcing lines)', train: 'tactics',
    habit: 'Ask “what are their checks, captures and threats after my move?” Pieces on the same line or a knight-hop apart are a warning sign.' },
  'tactic-missed': { label: 'Missing your own tactics', train: 'tactics',
    habit: 'Look at checks, captures and threats for yourself first. Calculate the forcing line to the end of the captures before judging it.' },
  'opening-principle': { label: 'Breaking opening principles', train: 'openings',
    habit: 'In the first ten moves: fight for the centre, develop a new piece each move, castle, and only then start operations.' },
  'king-safety': { label: 'Loosening your own king', train: 'middlegame',
    habit: 'Treat the pawns in front of your king as a wall. Move them only when you can name the concrete reason.' },
  'endgame-technique': { label: 'Endgame technique', train: 'endgame',
    habit: 'In endgames the king is a fighting piece and passed pawns must be pushed. Activate the king first, then count tempi.' },
  positional: { label: 'Quiet positional decisions', train: 'middlegame',
    habit: 'When nothing is forcing, improve your worst-placed piece and compare your move with the opponent’s best reply before playing it.' },
};

function play(fen, ucis, max = 10) {
  const board = new Chess(fen);
  const moves = [];
  for (const uci of (ucis || []).slice(0, max)) {
    const m = uciMove(board, uci);
    if (!m) break;
    moves.push(m);
  }
  return { board, moves };
}

// Material change for `color` along an engine line, measured where the captures stop.
export function materialSwing(fen, ucis, color, horizon = 6) {
  const board = new Chess(fen);
  const start = material(board, color);
  let result = 0;
  for (let i = 0; i < (ucis || []).length; i++) {
    const m = uciMove(board, ucis[i]);
    if (!m) break;
    result = material(board, color) - start;
    const next = ucis[i + 1];
    const nextIsCapture = next && (board.get(next.slice(2, 4)) || next.length > 4);
    if (i + 1 >= horizon && !nextIsCapture) break;
  }
  return result;
}

function passed(board, square, color) {
  const file = square.charCodeAt(0), rank = Number(square[1]);
  return !board.board().flat().some((p) => p && p.type === 'p' && p.color !== color
    && Math.abs(p.square.charCodeAt(0) - file) <= 1
    && (color === 'w' ? Number(p.square[1]) > rank : Number(p.square[1]) < rank));
}

// Enemy pieces a just-moved piece now threatens for real: the king, anything worth
// more than the attacker, or anything with no defender.
function threats(board, square) {
  const piece = board.get(square);
  if (!piece) return [];
  const enemy = other(piece.color);
  return piecesOf(board, enemy).filter((t) => board.attackers(t.square, piece.color).includes(square)
    && (t.type === 'k' || VALUE[t.type] > VALUE[piece.type] || (t.type !== 'p' && !board.attackers(t.square, enemy).length)))
    .sort((a, b) => VALUE[b.type] - VALUE[a.type]);
}

// Along a slider's line: the first enemy piece and the one standing behind it.
function lineTactic(board, square) {
  const piece = board.get(square);
  if (!piece || !'bqr'.includes(piece.type)) return null;
  const dirs = [];
  if (piece.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  if (piece.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  for (const [df, dr] of dirs) {
    const hits = [];
    let f = square.charCodeAt(0) - 97 + df, r = Number(square[1]) - 1 + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8 && hits.length < 2) {
      const sq = String.fromCharCode(97 + f) + (r + 1);
      const p = board.get(sq);
      if (p) hits.push({ ...p, square: sq });
      f += df; r += dr;
    }
    if (hits.length < 2 || hits.some((h) => h.color === piece.color) || hits[0].type === 'p') continue;
    const [front, back] = hits;
    if (back.type === 'k' && front.type !== 'k') return { kind: 'pin', front, back };
    if (front.type === 'k' && back.type !== 'p') return { kind: 'skewer', front, back };
    if (VALUE[back.type] > VALUE[front.type] && VALUE[front.type] > 1 && VALUE[back.type] > VALUE[piece.type]) return { kind: 'pin', front, back };
    if (VALUE[front.type] > VALUE[back.type] && VALUE[front.type] > VALUE[piece.type] && back.type !== 'p') return { kind: 'skewer', front, back };
  }
  return null;
}

// Attacks on valuable targets opened up by moving a piece out of the way.
function discovered(before, after, move) {
  const enemy = other(move.color);
  const found = [];
  for (const t of piecesOf(after, enemy)) {
    if (t.type === 'p') continue;
    const now = after.attackers(t.square, move.color).filter((s) => s !== move.to);
    const was = before.attackers(t.square, move.color);
    const fresh = now.filter((s) => !was.includes(s));
    if (!fresh.length) continue;
    const attacker = after.get(fresh[0]);
    if (t.type === 'k' || VALUE[t.type] > VALUE[attacker.type] || !after.attackers(t.square, enemy).length) found.push({ target: t, from: fresh[0], attacker });
  }
  return found;
}

const HOME = { w: ['b1', 'g1', 'c1', 'f1'], b: ['b8', 'g8', 'c8', 'f8'] };
const undeveloped = (board, color) => HOME[color].filter((sq) => { const p = board.get(sq); return p && p.color === color && 'nb'.includes(p.type); }).length;

// Factual things a move does, in order of importance. Used for best moves, hints and master moves.
export function describeMove(fen, uci) {
  const before = new Chess(fen);
  const after = new Chess(fen);
  const m = uciMove(after, uci);
  if (!m) return [];
  const me = m.color, enemy = other(me);
  const facts = [];
  const phase = Number(fen.split(' ')[5]);
  const endgame = (fen.split(' ')[0].match(/[qrbnQRBN]/g) || []).length <= 6;
  if (after.isCheckmate()) return ['delivers checkmate'];
  if (m.san.startsWith('O-O')) facts.push('castles, tucking the king away and bringing a rook towards the centre');
  if (m.captured) {
    const free = !before.attackers(m.to, enemy).length;
    facts.push(`captures the ${NAME[m.captured]} on ${m.to}${free ? ', which nothing was defending' : VALUE[m.captured] > VALUE[m.piece] ? `, winning a ${NAME[m.captured]} for a ${NAME[m.piece]} at worst` : ''}`);
  }
  if (m.promotion) facts.push(`promotes to a ${NAME[m.promotion]}`);
  const disc = discovered(before, after, m);
  if (after.isCheck()) facts.push(disc.some((d) => d.target.type === 'k') ? `uncovers a check from the ${the(disc.find((d) => d.target.type === 'k').attacker, disc.find((d) => d.target.type === 'k').from)}` : 'gives check, so the reply is forced');
  const hit = threats(after, m.to).filter((t) => t.type !== 'k');
  const targets = threats(after, m.to);
  if (targets.length >= 2) facts.push(`forks the ${list(targets.map((t) => the(t, t.square)))}`);
  else if (hit.length) facts.push(`attacks the ${the(hit[0], hit[0].square)}`);
  const line = lineTactic(after, m.to);
  if (line) facts.push(line.kind === 'pin'
    ? `pins the ${the(line.front, line.front.square)} to the ${NAME[line.back.type]} behind it`
    : `skewers the ${NAME[line.front.type]}: when it moves, the ${the(line.back, line.back.square)} falls`);
  for (const d of disc.filter((d) => d.target.type !== 'k').slice(0, 1)) facts.push(`uncovers an attack from the ${the(d.attacker, d.from)} on the ${the(d.target, d.target.square)}`);
  if (m.piece !== 'k' && before.attackers(m.from, enemy).length && !after.attackers(m.to, enemy).length && !m.captured) facts.push(`moves the ${NAME[m.piece]} out of attack`);
  const rescued = piecesOf(before, me).filter((p) => p.type !== 'k' && p.square !== m.from && before.attackers(p.square, enemy).length
    && !before.attackers(p.square, me).length && after.attackers(p.square, me).includes(m.to));
  if (rescued.length) facts.push(`defends the ${the(rescued[0], rescued[0].square)}, which was attacked and unprotected`);
  if ('nb'.includes(m.piece) && HOME[me].includes(m.from) && phase <= 15) facts.push(`develops the ${NAME[m.piece]}`);
  if (m.piece === 'p') {
    if (passed(after, m.to, me) && (endgame || (me === 'w' ? Number(m.to[1]) >= 5 : Number(m.to[1]) <= 4))) facts.push('advances a passed pawn: no enemy pawn can stop it');
    else if ('de'.includes(m.to[0]) && '45'.includes(m.to[1]) && phase <= 12 && !m.captured) facts.push('stakes a claim in the centre');
  }
  if (m.piece === 'r') {
    const pawnsOnFile = before.board().flat().filter((p) => p && p.type === 'p' && p.square[0] === m.to[0]);
    if (m.from[0] !== m.to[0] && !pawnsOnFile.length) facts.push(`puts the rook on the open ${m.to[0]}-file`);
    else if (m.from[0] !== m.to[0] && !pawnsOnFile.some((p) => p.color === me)) facts.push(`puts the rook on the half-open ${m.to[0]}-file`);
    if (m.to[1] === (me === 'w' ? '7' : '2') && m.from[1] !== m.to[1]) facts.push('invades the seventh rank, where rooks attack pawns from the side');
  }
  if (m.piece === 'k' && endgame && !m.san.startsWith('O-O')) {
    const centre = (sq) => Math.abs(sq.charCodeAt(0) - 100.5) + Math.abs(Number(sq[1]) - 4.5);
    if (centre(m.to) < centre(m.from)) facts.push('brings the king towards the centre, where it becomes a fighting piece');
  }
  if (!facts.length) facts.push(m.piece === 'p' ? `pushes the pawn to ${m.to}` : `improves the ${NAME[m.piece]} (${m.from} → ${m.to})`);
  return facts;
}
const sentence = (facts) => { const s = list(facts.slice(0, 3)); return s[0].toUpperCase() + s.slice(1) + '.'; };

// event: {fen, uci (played), best, pvBest, pvAfter, vb, va, loss, cls, phase, next}
export function explain(e) {
  const invalid = { valid: false, motif: 'positional', title: 'This position could not be verified', points: [], bestSan: '', playedSan: '', bestLine: '', replyLine: '' };
  let start;
  try { start = new Chess(e.fen); } catch { return invalid; }
  const me = start.turn(), enemy = other(me);
  const afterPlayed = new Chess(e.fen), afterBest = new Chess(e.fen);
  const played = uciMove(afterPlayed, e.uci), best = uciMove(afterBest, e.best);
  if (!played || !best) return invalid;
  const afterReply = new Chess(afterPlayed.fen());
  const reply = uciMove(afterReply, e.pvAfter?.[0]);
  const bestSans = lineSan(e.fen, e.pvBest?.length ? e.pvBest : [e.best]);
  const replySans = lineSan(afterPlayed.fen(), e.pvAfter || []);
  const bestLine = numbered(e.fen, bestSans);
  const replyLine = numbered(afterPlayed.fen(), replySans);
  const gainBest = materialSwing(e.fen, e.pvBest?.length ? e.pvBest : [e.best], me);
  const gainPlayed = materialSwing(e.fen, [e.uci, ...(e.pvAfter || [])], me);
  const swing = gainBest - gainPlayed;
  const points = [];
  const bestFacts = describeMove(e.fen, e.best);
  let motif = 'positional', title = '';
  const pts = (n) => `${n} point${n === 1 ? '' : 's'} of material`;
  const happened = reply && e.next === e.pvAfter[0];
  const replyVerb = happened ? 'Your opponent played' : 'Your opponent can play';

  if (isMate(e.va) && e.va < 0 && !(isMate(e.vb) && e.vb < 0)) {
    const n = mateIn(e.va);
    motif = 'mate-allowed';
    title = n <= 1 ? 'This allows checkmate next move' : `This allows a forced mate in ${n}`;
    if (reply && afterReply.isCheckmate()) {
      points.push(`${replyVerb} ${reply.san}, and it is checkmate: your king has no escape square, the checking piece cannot be captured and nothing can block.`);
      const guards = afterReply.attackers(reply.to, enemy).filter((s) => s !== reply.to).map((s) => the(afterReply.get(s), s));
      if (reply.captured && guards.length) points.push(`Your king cannot take on ${reply.to} because the ${list(guards)} protects that square.`);
    } else points.push(`After ${played.san} the engine finds a forced mate: ${replyLine}. Every one of your replies is answered by another check or mating threat.`);
    points.push(`${best.san} was needed. ${sentence(bestFacts)}`);
  } else if (isMate(e.vb) && e.vb > 0 && !(isMate(e.va) && e.va > 0 && mateIn(e.va) <= mateIn(e.vb))) {
    const n = mateIn(e.vb);
    motif = 'mate-missed';
    title = n === 1 ? 'You had checkmate in one' : `You had a forced mate in ${n}`;
    points.push(n === 1 ? `${best.san} is checkmate on the spot.` : `The mating line is ${bestLine}. Each move is a check or leaves only one defence, so your opponent never gets time to organise.`);
    if (e.va > 300) points.push(`${played.san} still keeps a winning position (${formatScore(e.va)}), but a forced mate ends the game without giving any counter-chances.`);
  } else if (gainPlayed <= -1 && swing >= 1 && reply) {
    const lost = -gainPlayed;
    motif = 'hung-piece';
    if (reply.captured && reply.to === played.to) {
      const defenders = afterPlayed.attackers(played.to, me).length;
      title = `Your ${NAME[played.piece]} can simply be taken on ${played.to}`;
      points.push(defenders
        ? `${played.san} puts the ${NAME[played.piece]} on a square covered by the ${the(start.get(reply.from), reply.from)}. It is defended, but ${reply.san} still wins material because the ${NAME[reply.piece]} is worth less than what it takes.`
        : `${played.san} puts the ${NAME[played.piece]} on a square attacked by the ${the(start.get(reply.from) || afterPlayed.get(reply.from), reply.from)}, and nothing of yours defends it. ${reply.san} wins it for free.`);
    } else if (reply.captured) {
      const victim = { type: reply.captured };
      const wasAttacked = start.attackers(reply.to, enemy).includes(reply.from);
      const defendedBefore = start.attackers(reply.to, me);
      const defendedAfter = afterPlayed.attackers(reply.to, me);
      title = `This leaves your ${NAME[victim.type]} on ${reply.to} hanging`;
      if (defendedBefore.includes(played.from) && !defendedAfter.includes(played.to)) {
        points.push(`Your ${NAME[played.piece]} on ${played.from} was guarding the ${NAME[victim.type]} on ${reply.to}. Once it moved away, ${reply.san} wins material.`);
      } else if (wasAttacked) {
        points.push(`Your ${NAME[victim.type]} on ${reply.to} was already attacked by the ${the(start.get(reply.from), reply.from)}${defendedBefore.length ? ' and not defended well enough' : ' and had no defender'}. ${played.san} does nothing about that, so ${reply.san} wins material.`);
      } else {
        points.push(`${played.san} opens the way for ${reply.san}, which captures your ${NAME[victim.type]} on ${reply.to}.`);
      }
    } else {
      motif = 'tactic-allowed';
      const fork = threats(afterReply, reply.to);
      const line = lineTactic(afterReply, reply.to);
      if (fork.length >= 2) {
        title = `This walks into a fork on ${reply.to}`;
        points.push(`${replyVerb} ${reply.san}, attacking your ${list(fork.map((t) => the(t, t.square)))} at the same time. You can only deal with one of them.`);
      } else if (line) {
        title = line.kind === 'pin' ? `This allows a pin against your ${NAME[line.front.type]}` : `This allows a skewer through your ${NAME[line.front.type]}`;
        points.push(line.kind === 'pin'
          ? `${reply.san} pins your ${the(line.front, line.front.square)} to the ${NAME[line.back.type]} on ${line.back.square}; it cannot move away without losing something bigger.`
          : `${reply.san} attacks your ${the(line.front, line.front.square)}, and when it moves the ${the(line.back, line.back.square)} behind it is lost.`);
      } else {
        title = 'This allows a forcing sequence that wins material';
        points.push(`${replyVerb} ${reply.san}. It ${list(describeMove(afterPlayed.fen(), e.pvAfter[0]).slice(0, 2))}.`);
      }
    }
    points.push(`The engine’s line is ${replyLine}, leaving you ${pts(lost)} down.`);
    points.push(`Better was ${best.san}. ${sentence(bestFacts)}`);
  } else if (swing >= 1 && gainBest >= 1) {
    const targets = threats(afterBest, best.to);
    const line = lineTactic(afterBest, best.to);
    const disc = discovered(start, afterBest, best);
    motif = 'tactic-missed';
    if (best.captured && (!start.attackers(best.to, enemy).length || VALUE[best.captured] > VALUE[best.piece])) {
      motif = 'missed-capture';
      const free = !start.attackers(best.to, enemy).length;
      title = `The ${NAME[best.captured]} on ${best.to} could be taken`;
      points.push(free
        ? `Nothing was defending the ${NAME[best.captured]} on ${best.to}. ${best.san} wins it for free.`
        : `${best.san} takes a ${NAME[best.captured]} with a ${NAME[best.piece]}. Even if your opponent recaptures, you come out ahead.`);
    } else if (targets.length >= 2) {
      title = `You missed a fork with ${best.san}`;
      points.push(`${best.san} attacks the ${list(targets.map((t) => the(t, t.square)))} at once. Your opponent cannot save ${targets.length > 2 ? 'them all' : 'both'}.`);
    } else if (line) {
      title = `You missed a ${line.kind} with ${best.san}`;
      points.push(line.kind === 'pin'
        ? `${best.san} pins the ${the(line.front, line.front.square)} to the ${NAME[line.back.type]} behind it, and a pinned piece can be attacked again until it falls.`
        : `${best.san} hits the ${the(line.front, line.front.square)}; when it steps aside the ${the(line.back, line.back.square)} behind it is lost.`);
    } else if (disc.length) {
      title = `You missed a discovered attack with ${best.san}`;
      points.push(`Moving the ${NAME[best.piece]} uncovers the ${the(disc[0].attacker, disc[0].from)}’s attack on the ${the(disc[0].target, disc[0].target.square)}, while the ${NAME[best.piece]} makes a threat of its own.`);
    } else {
      title = gainBest - Math.max(0, gainPlayed) >= 2 ? `${best.san} wins material` : `${best.san} was stronger: it wins a pawn’s worth`;
      points.push(`${sentence(bestFacts)} Followed up correctly, your opponent cannot hold everything.`);
    }
    points.push(`The line is ${bestLine}, which wins ${pts(gainBest - Math.max(0, gainPlayed))}${gainPlayed > 0 ? ' more than your move' : ''}.`);
    if (gainPlayed <= 0) points.push(`After ${played.san} that chance is gone${reply ? `: ${reply.san} is a good answer` : ''}.`);
  } else {
    const dev = undeveloped(start, me);
    const kingSq = piecesOf(start, me).find((p) => p.type === 'k').square;
    const castled = kingSq[1] === (me === 'w' ? '1' : '8') && 'abcgh'.includes(kingSq[0]);
    const shield = played.piece === 'p' && !played.captured && castled && Math.abs(played.from.charCodeAt(0) - kingSq.charCodeAt(0)) <= 1
      && played.from[1] === (me === 'w' ? '2' : '7');
    if (e.phase === 'Opening' && best.san.startsWith('O-O')) {
      motif = 'opening-principle'; title = 'It was time to castle';
      points.push(`Your king is still in the middle. ${best.san} gets it to safety and connects your rooks before the centre opens.`);
    } else if (e.phase === 'Opening' && played.piece === 'q' && !played.captured && dev >= 2) {
      motif = 'opening-principle'; title = 'The queen came out too early';
      points.push(`You still had ${dev} minor pieces on their starting squares. An early queen becomes a target: your opponent develops with tempo by attacking it${reply ? ` (for example ${reply.san})` : ''}.`);
    } else if (e.phase === 'Opening' && 'nb'.includes(played.piece) && !HOME[me].includes(played.from) && !played.captured && dev >= 2 && !start.attackers(played.from, enemy).length) {
      motif = 'opening-principle'; title = 'The same piece moved twice in the opening';
      points.push(`The ${NAME[played.piece]} was already developed, and ${dev} minor pieces were still at home. Each extra move with one piece is a move your opponent uses to bring out a new one.`);
    } else if (e.phase === 'Opening' && played.piece === 'p' && 'abgh'.includes(played.from[0]) && !played.captured && dev >= 2 && (best.piece !== 'p')) {
      motif = 'opening-principle'; title = 'A side pawn move instead of development';
      points.push(`${played.san} does not help you develop or control the centre, and you still had ${dev} minor pieces to bring out.`);
    } else if (shield && best.piece !== 'p') {
      motif = 'king-safety'; title = 'This loosens the pawns in front of your king';
      points.push(`${played.san} moves a pawn from your king’s shelter. The squares it used to guard are now permanent weaknesses${reply ? `, and ${reply.san} starts to use them` : ''}.`);
    } else if (e.phase === 'Endgame') {
      motif = 'endgame-technique'; title = `Endgame technique: ${best.san} was the right plan`;
    } else if (best.captured || best.san.includes('+')) {
      motif = 'tactic-missed'; title = `A forcing move was stronger: ${best.san}`;
    } else if (reply && (reply.captured || reply.san.includes('+')) && e.loss >= 10) {
      motif = 'tactic-allowed'; title = `This allows ${reply.san}`;
      points.push(`${replyVerb} ${reply.san}, ${reply.captured ? `capturing on ${reply.to}` : 'with check'}, and you are forced to react: ${replyLine}.`);
    } else {
      title = `${best.san} was the stronger plan`;
    }
    points.push(`${best.san}: ${sentence(bestFacts).replace(/^./, (c) => c.toLowerCase())}`);
    if (bestSans.length > 1) points.push(`The engine’s idea continues ${bestLine}.`);
    if (reply && motif !== 'tactic-allowed') points.push(`After your ${played.san}, the strongest answer is ${reply.san} (${sentence(describeMove(afterPlayed.fen(), e.pvAfter[0])).replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}).`);
  }
  const verdict = isMate(e.va) || isMate(e.vb)
    ? `Evaluation for you: ${formatScore(e.vb)} before, ${formatScore(e.va)} after.`
    : `Evaluation for you went from ${formatScore(e.vb)} to ${formatScore(e.va)}, about ${Math.round(e.loss)}% of your winning chances.`;
  return {
    valid: true, motif, title, points, verdict,
    playedSan: played.san, bestSan: best.san, bestLine, replyLine,
    bestUcis: (e.pvBest?.length ? e.pvBest : [e.best]).slice(0, bestSans.length),
    replyUcis: (e.pvAfter || []).slice(0, replySans.length),
    afterPlayed: afterPlayed.fen(),
    arrows: [{ from: played.from, to: played.to, kind: 'bad' }, { from: best.from, to: best.to, kind: 'good' }],
  };
}
