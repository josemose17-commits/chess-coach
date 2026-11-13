// "Train": openings, tactics and middlegames, endgames, and any position you like.
import { Chess } from 'chess.js';
import { $, esc, store, save, judge, tabs, route, go } from '../core.js';
import { Board } from '../board.js';
import { PlaySession, sessionMarkup, storyHtml } from '../session.js';
import { OPENINGS, openingById } from '../data/openings.js';
import { ENDGAMES } from '../data/endgames.js';
import { explain, MOTIFS, describeMove } from '../coach.js';
import { lineSan, numbered, CLASSES } from '../analysis.js';

let root, board, session = null, selectTab, current = 'openings';
const LEVELS = [[1320, 'Beginner (about 1300)'], [1600, 'Club player (about 1600)'], [1900, 'Strong club (about 1900)'], [2300, 'Master (about 2300)'], [0, 'Full strength']];
const levelSelect = (id, def = 1600) => `<label>Opponent<select id="${id}">${LEVELS.map(([v, n]) => `<option value="${v}" ${v === def ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
const grouped = (items, value, label) => [...new Set(items.map((i) => i.group))].map((g) => `<optgroup label="${esc(g)}">${items.filter((i) => i.group === g).map((i) => `<option value="${value(i)}">${esc(label(i))}</option>`).join('')}</optgroup>`).join('');
const THEMES = [['mix', 'Anything'], ['middlegame', 'Middlegame'], ['opening', 'Opening tactics'], ['endgame', 'Endgame'], ['hangingPiece', 'Hanging pieces'], ['fork', 'Forks'], ['pin', 'Pins'], ['skewer', 'Skewers'], ['discoveredAttack', 'Discovered attacks'], ['mateIn1', 'Mate in 1'], ['mateIn2', 'Mate in 2'], ['backRankMate', 'Back-rank mates'], ['sacrifice', 'Sacrifices'], ['defensiveMove', 'Defensive moves'], ['kingsideAttack', 'Kingside attacks'], ['rookEndgame', 'Rook endgames'], ['pawnEndgame', 'Pawn endgames']];

export function init(el) {
  root = el;
  el.innerHTML = `
  <section class="hero small"><h1>Train every phase of the game.</h1>
    <p>Play the positions out on the board. Every move you make is checked by the engine, and when it is wrong you are told why.</p></section>
  <div class="tabs" role="tablist">
    <button type="button" role="tab" data-tab="openings">Openings</button>
    <button type="button" role="tab" data-tab="middle">Tactics &amp; middlegame</button>
    <button type="button" role="tab" data-tab="endgame">Endgames</button>
    <button type="button" role="tab" data-tab="any">Any position</button>
  </div>
  <section class="panel">
    <div class="bench">
      <div class="bench-board"><div id="tBoard"></div></div>
      <div class="bench-side"><div id="tSetup"></div><div id="tPanel"></div></div>
    </div>
  </section>`;
  board = new Board($('#tBoard'));
  selectTab = tabs(el, (name) => { current = name; stop(); SETUP[name](); });
  route('train-open', (arg = {}) => {
    const tab = { openings: 'openings', endgame: 'endgame', tactics: 'middle', middlegame: 'middle' }[arg.tab] || 'openings';
    selectTab(tab);
    if (tab === 'middle') startDeck(arg);
    if (tab === 'endgame' && arg.phase) startDeck({ phase: 'Endgame' });
    if (tab === 'openings' && arg.phase) startDeck({ phase: 'Opening' });
  });
  selectTab('openings');
}

function stop() {
  if (session) session.token = Symbol();
  session = null;
  board.onMove = null;
  $('#tPanel').onclick = null;
  board.set({ fen: new Chess().fen(), arrows: [], lastMove: null, movable: null, orientation: 'w' });
  $('#tPanel').innerHTML = '';
}
function play(opts) {
  stop();
  $('#tPanel').innerHTML = sessionMarkup();
  session = new PlaySession({ board, panel: $('#tPanel'), ...opts });
}
const myMistakes = () => store.games.filter((r) => !r.excluded).flatMap((r) => r.events.filter((e) => e.cls !== 'inaccuracy').map((e) => ({ ...e, gameId: r.id, opp: r.color === 'w' ? r.black : r.white })));
const deckButton = (phase, label) => {
  const n = myMistakes().filter((e) => e.phase === phase).length;
  return n ? `<button type="button" data-deck="${phase}">Fix my own ${label} mistakes (${n})</button>` : '';
};

const SETUP = {
  openings() {
    $('#tSetup').innerHTML = `<h2>Opening trainer</h2>
      <label>Opening<select id="oPick">${grouped(OPENINGS, (o) => o.id, (o) => o.name)}</select></label>
      <div class="grid2"><label>You play<select id="oSide"><option value="w">White</option><option value="b">Black</option></select></label>${levelSelect('oLevel')}</div>
      <label class="check"><input type="checkbox" id="oSurprise"> Opponent sometimes leaves the book, so I learn to handle sidelines</label>
      <div id="oIdeas" class="lesson"></div>
      <div class="row"><button type="button" class="primary" id="oDrill">Drill it</button><button type="button" id="oWalk">Walk me through the line</button>${deckButton('Opening', 'opening')}</div>`;
    const show = () => {
      const o = openingById($('#oPick').value);
      $('#oSide').value = o.side;
      $('#oIdeas').innerHTML = `<p class="muted">${esc(numbered(new Chess().fen(), o.sans))}</p><ul>${o.ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    };
    $('#oPick').onchange = show; show();
    $('#oDrill').onclick = () => {
      const o = openingById($('#oPick').value);
      play({ fen: new Chess().fen(), userColor: $('#oSide').value, elo: Number($('#oLevel').value), book: { ids: [o.id], surprise: $('#oSurprise').checked } });
    };
    $('#oWalk').onclick = () => walk(openingById($('#oPick').value));
    bindDeck();
  },
  middle() {
    $('#tSetup').innerHTML = `<h2>Tactics and middlegame</h2>
      <div class="modes">
        <div><h3>Fix my mistakes</h3><p class="muted">Positions from your own games where you went wrong. Find the better move.</p>
          <div class="grid2"><label>Type<select id="dMotif"><option value="">All types</option>${Object.entries(MOTIFS).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('')}</select></label>
          <label>Phase<select id="dPhase"><option value="">All phases</option><option>Opening</option><option>Middlegame</option><option>Endgame</option></select></label></div>
          <button type="button" class="primary" id="dStart">Start (${myMistakes().length} positions)</button></div>
        <div><h3>Themed puzzles</h3><p class="muted">Fresh puzzles from the Lichess puzzle database, by theme.</p>
          <label>Theme<select id="pTheme">${THEMES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
          <button type="button" class="primary" id="pStart">Get a puzzle</button></div>
        <div><h3>Play out a middlegame</h3><p class="muted">Start from the position a main-line opening leads to and play it against the engine with coaching.</p>
          <label>Starting position<select id="mPick">${grouped(OPENINGS, (o) => o.id, (o) => o.name)}</select></label>
          <div class="grid2"><label>You play<select id="mSide"><option value="w">White</option><option value="b">Black</option></select></label>${levelSelect('mLevel')}</div>
          <button type="button" class="primary" id="mStart">Play</button></div>
      </div>`;
    $('#dStart').onclick = () => startDeck({ motif: $('#dMotif').value, phase: $('#dPhase').value });
    $('#pStart').onclick = () => lichessPuzzle($('#pTheme').value);
    $('#mStart').onclick = () => { const o = openingById($('#mPick').value); play({ fen: o.fen, userColor: $('#mSide').value, elo: Number($('#mLevel').value) }); };
  },
  endgame() {
    const done = store.solved.endgames || {};
    $('#tSetup').innerHTML = `<h2>Endgame trainer</h2>
      <label>Lesson<select id="ePick">${grouped(ENDGAMES, (e) => e.id, (e) => (done[e.id] ? '✓ ' : '') + e.name)}</select></label>
      <div id="eLesson" class="lesson"></div>
      <div class="row"><button type="button" class="primary" id="eStart">Play it against the engine</button>${deckButton('Endgame', 'endgame')}</div>`;
    const lesson = () => ENDGAMES.find((e) => e.id === $('#ePick').value);
    const show = () => {
      const e = lesson();
      stop();
      board.set({ fen: e.fen, orientation: e.side });
      $('#eLesson').innerHTML = `<p><b>You are ${e.side === 'w' ? 'White' : 'Black'}. Goal: ${e.goal === 'win' ? 'win' : 'hold the draw'}.</b></p><ul>${e.lesson.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    };
    $('#ePick').onchange = show; show();
    $('#eStart').onclick = () => {
      const e = lesson();
      play({ fen: e.fen, userColor: e.side, elo: 0, depth: 20, goal: e.goal, finishOn: e.group === 'Basic checkmates' ? 'mate' : 'promote',
        onSolved: () => { store.solved.endgames = { ...store.solved.endgames, [e.id]: true }; save(); } });
    };
    bindDeck();
  },
  any() {
    $('#tSetup').innerHTML = `<h2>Any position</h2>
      <p class="muted">Paste a position (FEN) from any game, or leave it empty for the starting position. On Chess.com: Share → copy FEN.</p>
      <label>Position (FEN)<input id="aFen" autocomplete="off" spellcheck="false" placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"></label>
      <div class="grid2"><label>You play<select id="aSide"><option value="">Side to move</option><option value="w">White</option><option value="b">Black</option></select></label>${levelSelect('aLevel')}</div>
      <p id="aError" class="neg" role="alert"></p>
      <button type="button" class="primary" id="aStart">Play from here</button>`;
    $('#aStart').onclick = () => {
      const fen = $('#aFen').value.trim() || new Chess().fen();
      let chess;
      try { chess = new Chess(fen); } catch { $('#aError').textContent = 'That FEN is not a legal chess position.'; return; }
      if (chess.isGameOver()) { $('#aError').textContent = 'The game is already over in that position.'; return; }
      $('#aError').textContent = '';
      play({ fen, userColor: $('#aSide').value || chess.turn(), elo: Number($('#aLevel').value) });
    };
  },
};
function bindDeck() {
  const b = $('[data-deck]', $('#tSetup'));
  if (b) b.onclick = () => startDeck({ phase: b.dataset.deck });
}

// ---- Step through an opening line with its notes -----------------------
function walk(o) {
  stop();
  let at = 0;
  const chess = new Chess();
  const fens = [chess.fen()], moves = [];
  for (const san of o.sans) { moves.push(chess.move(san)); fens.push(chess.fen()); }
  board.set({ orientation: o.side });
  const render = () => {
    const m = moves[at - 1];
    board.set({ fen: fens[at], lastMove: m ? [m.from, m.to] : null, arrows: [] });
    const note = m ? o.notes[at - 1] || describeMove(fens[at - 1], m.lan).slice(0, 2).join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'Step through the main line. The important moves have a note explaining the idea.';
    $('#tPanel').innerHTML = `<div class="feedback"><h4>${m ? esc(numbered(fens[at - 1], [m.san])) : esc(o.name)}</h4><p>${esc(note)}</p>${at === moves.length ? '<p><b>That is the line.</b> Now drill it from memory.</p>' : ''}</div>
      <div class="movelist">${esc(numbered(fens[0], o.sans.slice(0, at)))}</div>
      <div class="row"><button type="button" data-w="-1" ${at ? '' : 'disabled'}>◀ Back</button><button type="button" class="primary" data-w="1" ${at < moves.length ? '' : 'disabled'}>Next ▶</button></div>`;
  };
  $('#tPanel').onclick = (e) => { const d = e.target.closest('[data-w]')?.dataset.w; if (d) { at += Number(d); render(); } };
  render();
}

// ---- Puzzles: your own mistakes, or Lichess puzzles --------------------
function startDeck({ motif = '', phase = '', gameId, ply } = {}) {
  stop();
  const key = (e) => `${e.gameId}#${e.ply}`;
  const solved = store.solved.mistakes ||= {};
  let deck = myMistakes().map((e) => ({ ...e, story: explain(e) })).filter((e) => e.story.valid && (!motif || e.story.motif === motif) && (!phase || e.phase === phase));
  deck.sort((a, b) => (solved[key(a)] || 0) - (solved[key(b)] || 0) || b.loss - a.loss);
  const first = deck.findIndex((e) => e.gameId === gameId && e.ply === ply);
  if (first > 0) deck.unshift(...deck.splice(first, 1));
  if (!deck.length) {
    $('#tPanel').innerHTML = `<div class="feedback"><p>${store.games.length ? 'No positions match those filters.' : 'Analyse your games first (My games tab). Every mistake you made becomes a training position here.'}</p></div>`;
    return;
  }
  let i = 0, state = 'try', tries = 0;
  const token = Symbol();
  session = { token };
  const show = (html = '') => {
    const e = deck[i];
    $('#tPanel').innerHTML = `<p class="tag">Position ${i + 1} of ${deck.length} · ${esc(MOTIFS[e.story.motif].label)}${solved[key(e)] ? ' · solved before' : ''}</p>
      <div class="status">Against ${esc(e.opp)}, move ${Math.floor(e.ply / 2) + 1}. You played <b>${esc(e.story.playedSan)}</b> (${CLASSES[e.cls].toLowerCase()}). Find a better move for ${e.color === 'w' ? 'White' : 'Black'}.</div>
      ${html}<div class="row">${state === 'try' ? '<button type="button" data-p="answer">Show the answer</button>' : ''}<button type="button" class="${state === 'try' ? '' : 'primary'}" data-p="next">${state === 'try' ? 'Skip' : 'Next position'}</button><button type="button" data-p="game">Open in game review</button></div>`;
  };
  const reveal = (heading, tone) => {
    const e = deck[i];
    state = 'done';
    board.set({ fen: e.fen, movable: null, lastMove: null, arrows: e.story.arrows });
    show(`<div class="feedback ${tone}"><p class="tag">${heading}</p>${storyHtml(e.story)}<p class="muted">Better line: ${esc(e.story.bestLine)}</p></div>`);
  };
  const load = () => {
    const e = deck[i];
    state = 'try'; tries = 0;
    board.set({ fen: e.fen, orientation: e.color, movable: e.color, lastMove: null, arrows: [] });
    show();
  };
  board.onMove = async (m) => {
    const e = deck[i];
    if (state !== 'try') return;
    state = 'busy';
    const chess = new Chess(e.fen);
    const move = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    board.set({ fen: chess.fen(), lastMove: [m.from, m.to], movable: null });
    let ok = move.lan === e.best, j = null;
    if (!ok) { j = await judge(e.fen, move.lan, 12); ok = j.loss < 5 && j.cls !== 'missed'; }
    if (session?.token !== token || deck[i] !== e) return;
    if (ok) {
      solved[key(e)] = (solved[key(e)] || 0) + 1; save();
      return reveal(move.lan === e.best ? `Correct: ${move.san}` : `${move.san} is good too. The engine’s first choice was ${e.story.bestSan}`, 'good');
    }
    tries++;
    state = 'try';
    const same = move.lan === e.uci;
    show(`<div class="feedback bad"><p class="tag">${same ? 'That is what you played in the game' : `Not ${esc(move.san)}`}</p>${j.story ? `<p>${esc(j.story.points[0] || j.story.title)}</p>` : ''}<p class="muted">${tries >= 2 ? `Hint: look at your ${{ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[new Chess(e.fen).get(e.best.slice(0, 2)).type]} on ${e.best.slice(0, 2)}.` : 'Try again.'}</p></div>`);
    setTimeout(() => { if (session?.token === token && deck[i] === e && state === 'try') board.set({ fen: e.fen, movable: e.color, lastMove: null }); }, 900);
  };
  $('#tPanel').onclick = (ev) => {
    const act = ev.target.closest('[data-p]')?.dataset.p;
    if (act === 'answer') reveal(`The answer was ${deck[i].story.bestSan}`, 'ok');
    if (act === 'next') { i = (i + 1) % deck.length; load(); }
    if (act === 'game') { go('view', 'games'); go('review', { gameId: deck[i].gameId, ply: deck[i].ply }); }
  };
  load();
}

async function lichessPuzzle(theme) {
  stop();
  const token = Symbol();
  session = { token };
  const panel = $('#tPanel');
  panel.innerHTML = '<div class="status">Fetching a puzzle…</div>';
  let data;
  try {
    const r = await fetch(`https://lichess.org/api/puzzle/next?angle=${encodeURIComponent(theme)}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw Error();
    data = await r.json();
  } catch {
    if (session?.token === token) panel.innerHTML = '<div class="feedback bad"><p>Could not reach the Lichess puzzle service. Check your connection, or train on your own mistakes instead: they work offline.</p></div>';
    return;
  }
  if (session?.token !== token) return;
  const { puzzle, game } = data;
  const chess = new Chess();
  if (puzzle.fen) chess.load(puzzle.fen);
  else for (const san of game.pgn.split(' ').slice(0, puzzle.initialPly + 1)) chess.move(san);
  const me = chess.turn();
  const start = chess.fen();
  let step = 0, lastTry = '';
  const themes = puzzle.themes.map((t) => t.replace(/([A-Z0-9])/g, ' $1').toLowerCase()).join(', ');
  const render = (html = '', done = false) => {
    panel.innerHTML = `<p class="tag">Lichess puzzle · rated ${puzzle.rating}</p>
      <div class="status">${done ? 'Solved.' : `Find the best move for ${me === 'w' ? 'White' : 'Black'}.`}</div>${html}
      <div class="row"><button type="button" class="${done ? 'primary' : ''}" data-z="next">${done ? 'Next puzzle' : 'Skip'}</button>${done ? '' : '<button type="button" data-z="answer">Show the solution</button>'}<a class="button" href="https://lichess.org/training/${esc(puzzle.id)}" target="_blank" rel="noopener">Open on Lichess</a></div>`;
  };
  const finish = (heading) => {
    board.set({ movable: null });
    render(`<div class="feedback good"><h4>${heading}</h4><p>Solution: ${esc(numbered(start, lineSan(start, puzzle.solution, 20)))}</p><p class="muted">Themes: ${esc(themes)}.</p></div>`, true);
  };
  board.set({ fen: chess.fen(), orientation: me, movable: me, arrows: [], lastMove: puzzle.lastMove ? [puzzle.lastMove.slice(0, 2), puzzle.lastMove.slice(2, 4)] : null });
  board.onMove = async (m) => {
    const before = chess.fen();
    const move = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (move.lan === puzzle.solution[step] || chess.isCheckmate()) {
      step++;
      const reply = puzzle.solution[step];
      if (!reply || chess.isCheckmate()) { board.set({ fen: chess.fen(), lastMove: [m.from, m.to] }); return finish(`${esc(move.san)} — that is it.`); }
      const r = chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
      step++;
      board.set({ fen: chess.fen(), lastMove: [r.from, r.to], movable: me });
      return render(`<div class="feedback good"><p>${esc(move.san)} is right. Your opponent answers ${esc(r.san)}. Keep going.</p></div>`);
    }
    chess.undo();
    board.set({ fen: chess.fen(), lastMove: [m.from, m.to], movable: null });
    lastTry = move.san;
    render(`<div class="feedback bad"><p>${esc(move.san)} is not the solution. Checking why…</p></div>`);
    const j = await judge(before, move.lan, 12).catch(() => null);
    if (session?.token !== token || chess.fen() !== before || lastTry !== move.san) return;
    board.set({ fen: before, movable: me, lastMove: null });
    render(`<div class="feedback bad"><p class="tag">Not ${esc(move.san)}</p><p>${esc(j?.story ? (j.story.points.find((p) => !p.startsWith('Better was')) || j.story.title) : 'It is playable, but there is something stronger. Look for checks, captures and threats.')}</p><p class="muted">Try again.</p></div>`);
  };
  panel.onclick = (e) => {
    const act = e.target.closest('[data-z]')?.dataset.z;
    if (act === 'next') lichessPuzzle(theme);
    if (act === 'answer') { board.set({ fen: start, arrows: [{ from: puzzle.solution[0].slice(0, 2), to: puzzle.solution[0].slice(2, 4), kind: 'good' }] }); finish('The solution'); }
  };
  render();
}
