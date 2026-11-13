// "Masters": study annotated classics, or guess the master's moves and get scored.
import { Chess } from 'chess.js';
import { $, esc, judge } from '../core.js';
import { Board } from '../board.js';
import { MASTERS, GAMES } from '../data/masters.js';
import { describeMove } from '../coach.js';
import { formatScore, lineSan, winChance } from '../analysis.js';
import { storyHtml } from '../session.js';

let root, board, game = null, fens = [], moves = [], ply = 0, mode = 'study';
let guess = null; // {score, max, busy, last}
let token = null;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const noteKey = (i) => `${Math.floor(i / 2) + 1}${i % 2 ? 'b' : 'w'}`;
const label = (i) => `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${moves[i].san}`;

export function init(el) {
  root = el;
  el.innerHTML = `
  <section class="hero small"><h1>Learn from the greats.</h1>
    <p>Play through famous games with the key moves explained, then switch to “Guess the move” and try to find what the master played. The engine scores every guess and tells you what yours was missing.</p></section>
  <div class="masters" id="mList">${MASTERS.map((m) => `<button type="button" data-master="${m.id}"><b>${esc(m.name)}</b><span class="muted">${esc(m.years)}</span><span>${esc(m.style)}</span></button>`).join('')}</div>
  <section class="panel">
    <div class="bench">
      <div class="bench-board"><div id="mBoard"></div>
        <div class="row nav"><button type="button" data-nav="start" aria-label="Start">⏮</button><button type="button" data-nav="prev" aria-label="Previous move">◀</button><button type="button" data-nav="next" aria-label="Next move">▶</button><button type="button" data-nav="end" aria-label="End">⏭</button><button type="button" data-nav="flip">Flip</button></div>
      </div>
      <div class="bench-side" id="mSide"></div>
    </div>
  </section>`;
  board = new Board($('#mBoard'), { onMove: onGuess });
  $('#mList').onclick = (e) => { const b = e.target.closest('[data-master]'); if (b) pickMaster(b.dataset.master); };
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', (e) => {
    if (root.hidden || mode !== 'study' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') go(ply - 1);
    if (e.key === 'ArrowRight') go(ply + 1);
  });
  pickMaster(MASTERS[0].id);
}

function pickMaster(id) {
  for (const b of root.querySelectorAll('[data-master]')) b.setAttribute('aria-pressed', String(b.dataset.master === id));
  load(GAMES.find((g) => g.master === id).id);
}

function load(id) {
  game = GAMES.find((g) => g.id === id);
  const chess = new Chess();
  fens = [chess.fen()]; moves = [];
  for (const san of game.moves.split(' ')) { moves.push(chess.move(san)); fens.push(chess.fen()); }
  mode = 'study'; ply = 0; guess = null; token = Symbol();
  board.set({ orientation: game.hero });
  render();
}

function go(n) { ply = Math.max(0, Math.min(moves.length, n)); token = Symbol(); render(); }

function render(extra = '') {
  const master = MASTERS.find((m) => m.id === game.master);
  const last = moves[ply - 1];
  const heroTurn = ply < moves.length && moves[ply].color === game.hero;
  board.set({ fen: fens[ply], lastMove: last ? [last.from, last.to] : null, arrows: [], movable: mode === 'guess' && heroTurn && !guess.busy ? game.hero : null });
  const others = GAMES.filter((g) => g.master === game.master);
  const note = last ? game.notes[noteKey(ply - 1)] : null;
  const list = moves.map((m, i) => {
    if (mode === 'guess' && i >= ply) return '';
    return `${i % 2 === 0 ? `<span class="num">${i / 2 + 1}.</span>` : ''}<button type="button" data-goto="${i + 1}" class="${game.notes[noteKey(i)] ? 'noted' : ''} ${i + 1 === ply ? 'on' : ''}" ${mode === 'guess' ? 'disabled' : ''}>${esc(m.san)}</button>`;
  }).join('');
  let body;
  if (mode === 'study') {
    body = `<div class="feedback">${last ? `<h4>${esc(label(ply - 1))}</h4><p>${esc(note || cap(describeMove(fens[ply - 1], last.lan).slice(0, 3).join(', ')) + '.')}</p>` : `<p>${esc(game.intro)}</p>`}
      ${ply === moves.length ? `<p><b>${game.result === '1-0' ? 'White' : 'Black'} won.</b></p>` : ''}${extra}</div>
      <div class="row">${last ? '<button type="button" data-act="why">What does the engine think?</button>' : ''}<button type="button" class="primary" data-act="guess">Guess ${esc(master.name.split(' ').at(-1))}’s moves</button></div>`;
  } else {
    const done = ply >= moves.length;
    body = `<p class="tag">Guess the move · score ${guess.score} of ${guess.max}</p>
      <div class="status">${done ? `Finished. You scored ${guess.score} of ${guess.max} (${guess.max ? Math.round(100 * guess.score / guess.max) : 0}%).` : guess.busy ? 'Checking…' : `You are ${esc(master.name)} (${game.hero === 'w' ? 'White' : 'Black'}). What did he play here?`}</div>
      ${extra || guess.last || ''}
      <div class="row">${done ? '' : '<button type="button" data-act="reveal">Show me the move</button>'}<button type="button" data-act="study">Back to study mode</button></div>`;
  }
  $('#mSide').innerHTML = `
    <label>Game<select id="mGame">${others.map((g) => `<option value="${g.id}" ${g.id === game.id ? 'selected' : ''}>${esc(g.title)} — ${esc(g.event)}</option>`).join('')}</select></label>
    <h2>${esc(game.white)} – ${esc(game.black)}</h2>
    <p class="muted">${esc(game.event)} · ${esc(game.result)} · study ${game.hero === 'w' ? 'White' : 'Black'}</p>
    <div class="movechips">${list}</div>
    ${body}
    <details class="lesson" ${ply === 0 && mode === 'study' ? 'open' : ''}><summary>What to learn from ${esc(master.name)}</summary><ul>${master.lessons.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>`;
  $('#mGame').onchange = (e) => load(e.target.value);
  $('#mSide .on')?.scrollIntoView({ block: 'nearest' });
}

async function why() {
  const i = ply - 1, t = token;
  render('<p class="muted">Asking the engine…</p>');
  const j = await judge(fens[i], moves[i].lan, 14).catch(() => null);
  if (t !== token || !j) return;
  const bestSan = j.best ? lineSan(fens[i], [j.best])[0] : moves[i].san;
  const text = j.same ? `The engine agrees: ${moves[i].san} is its first choice (${formatScore(j.va)} for the side that moved).`
    : j.loss < 4 ? `The engine’s first choice is ${bestSan}, but it rates ${moves[i].san} as practically equal (${formatScore(j.va)}).`
    : `A modern engine prefers ${bestSan} (${formatScore(j.vb)}) to ${moves[i].san} (${formatScore(j.va)}). Great games are not perfect games: what matters is the idea, and the problems it set a human opponent.`;
  render(`<p class="muted">${esc(text)}</p>`);
  if (!j.same && j.best) board.set({ arrows: [{ from: j.best.slice(0, 2), to: j.best.slice(2, 4), kind: 'hint' }] });
}

function startGuess() {
  mode = 'guess';
  guess = { score: 0, max: 0, busy: false, last: '' };
  // Skip the first few opening moves; start when the hero is to move.
  ply = Math.min(8, moves.length - 1);
  while (moves[ply].color !== game.hero) ply++;
  token = Symbol();
  guess.last = `<div class="feedback"><p>The first ${Math.floor(ply / 2)} moves are opening theory and have been played for you. From here, find the moves yourself.</p></div>`;
  render();
}

// Play the master's move, then the opponent's reply, and wait for the next guess.
function advance(html) {
  const i = ply;
  const note = game.notes[noteKey(i)];
  const master = `<p><b>${esc(label(i))}</b>${note ? ': ' + esc(note) : ''}</p>`;
  ply = Math.min(moves.length, i + 1);
  let reply = '';
  if (ply < moves.length) {
    const rNote = game.notes[noteKey(ply)];
    reply = `<p class="muted">The reply was ${esc(label(ply))}.${rNote ? ' ' + esc(rNote) : ''}</p>`;
    ply++;
  }
  guess.busy = false;
  guess.last = html.replace('</div>', master + reply + '</div>');
  render();
  const m = moves[ply - 1];
  if (m) board.set({ lastMove: [m.from, m.to] });
}

async function onGuess(m) {
  if (mode !== 'guess' || guess.busy || ply >= moves.length) return;
  const i = ply, t = token, fen = fens[i], actual = moves[i];
  const chess = new Chess(fen);
  const move = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  guess.max += 3;
  if (move.lan === actual.lan) {
    guess.score += 3;
    return advance(`<div class="feedback good"><p class="tag">+3 · exactly the move played</p></div>`);
  }
  guess.busy = true;
  board.set({ fen: chess.fen(), lastMove: [m.from, m.to], movable: null });
  render('<div class="feedback"><p>Comparing your move with the game…</p></div>');
  board.set({ fen: chess.fen(), lastMove: [m.from, m.to], movable: null });
  let mine, theirs;
  try { mine = await judge(fen, move.lan, 12); theirs = await judge(fen, actual.lan, 12); } catch { guess.busy = false; return render(); }
  if (t !== token) return;
  const gap = winChance(theirs.va) - winChance(mine.va);
  const points = gap <= 3 ? 2 : gap <= 8 ? 1 : 0;
  guess.score += points;
  const head = points === 2 ? `+2 · ${move.san} is as strong as the game move` : points === 1 ? `+1 · ${move.san} is reasonable, but not as strong` : `+0 · ${move.san} is clearly weaker`;
  const detail = points < 2 && mine.story ? storyHtml(mine.story) : `<p>Your move: ${esc(describeMove(fen, move.lan).slice(0, 2).join(', '))}. Engine evaluation ${formatScore(mine.va)} against ${formatScore(theirs.va)} for the game move.</p>`;
  advance(`<div class="feedback ${points === 2 ? 'good' : points ? 'ok' : 'bad'}"><p class="tag">${esc(head)}</p>${detail}</div>`);
}

function onClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.nav) {
    if (t.dataset.nav === 'flip') return board.flip();
    if (mode !== 'study') return;
    return go({ start: 0, prev: ply - 1, next: ply + 1, end: moves.length }[t.dataset.nav]);
  }
  if (t.dataset.goto && mode === 'study') return go(Number(t.dataset.goto));
  const act = t.dataset.act;
  if (act === 'why') return why();
  if (act === 'guess') return startGuess();
  if (act === 'study') { mode = 'study'; guess = null; token = Symbol(); return render(); }
  if (act === 'reveal' && !guess.busy && ply < moves.length) { guess.max += 3; return advance('<div class="feedback ok"><p class="tag">+0 · move shown</p></div>'); }
}
