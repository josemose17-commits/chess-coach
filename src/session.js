// A training game against the book or the engine, with a coach comment on every move.
import { Chess } from 'chess.js';
import { engine, judge, esc, $ } from './core.js';
import { bookMoves } from './data/openings.js';
import { describeMove } from './coach.js';
import { formatScore, lineSan, numbered, whiteValue, pov } from './analysis.js';

export const posKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function storyHtml(story, extra = '') {
  return `<h4>${esc(story.title)}</h4>${story.points.map((p) => `<p>${esc(p)}</p>`).join('')}<p class="muted">${esc(story.verdict)}</p>${extra}`;
}

export function sessionMarkup() {
  return `<div class="status" data-role="status" role="status" aria-live="polite"></div>
    <div class="feedback" data-role="feedback" hidden></div>
    <div class="movelist" data-role="moves"></div>
    <div class="row">
      <button type="button" data-act="hint">Hint</button>
      <button type="button" data-act="ideas">Show top ideas</button>
      <button type="button" data-act="back">Take back</button>
      <button type="button" data-act="restart">Restart</button>
      <button type="button" data-act="flip">Flip board</button>
    </div>`;
}

export class PlaySession {
  // opts: {board, panel, fen, userColor, elo, depth, book:{ids,surprise}|null, personal:{me,opp}|null, goal, finishOn, onSolved}
  // personal.me / personal.opp map a position key to the moves seen in the player's own games: [{uci, san, n}]
  constructor(opts) {
    Object.assign(this, { depth: 12, elo: 0, book: null, goal: null }, opts);
    this.id = Symbol();
    this.panel.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act && this[act]) this[act]();
    };
    this.board.onMove = (m) => this.userMove(m);
    this.restart();
  }
  // Recommended book moves here: the chosen opening first, never a known mistake.
  bookFor(fen) {
    const mine = (o) => o.ids.some((id) => this.book.ids.includes(id));
    return bookMoves(fen).filter((o) => !o.trap).sort((a, b) => mine(b) - mine(a));
  }
  el(role) { return $(`[data-role="${role}"]`, this.panel); }
  alive(token) { return this.token === token; }

  restart() {
    this.token = Symbol();
    this.chess = new Chess(this.fen);
    this.busy = false; this.over = false; this.waiting = false; this.promoted = false; this.hintStep = 0; this.outOfBook = false; this.userMoves = 0;
    this.board.set({ orientation: this.userColor, arrows: [], lastMove: null });
    this.say(null);
    this.draw();
    if (this.chess.turn() !== this.userColor) this.opponent(); else this.status('Your move.');
  }
  flip() { this.board.flip(); }
  status(text) { this.el('status').textContent = text; }
  say(tone, html) {
    const box = this.el('feedback');
    box.hidden = !tone;
    box.className = 'feedback ' + (tone || '');
    box.innerHTML = html || '';
  }
  draw(arrows = []) {
    const last = this.chess.history({ verbose: true }).at(-1);
    this.board.set({ fen: this.chess.fen(), lastMove: last ? [last.from, last.to] : null, arrows,
      movable: this.over || this.busy ? null : this.userColor });
    const sans = this.chess.history();
    this.el('moves').textContent = sans.length ? numbered(this.fen, sans) : '';
  }

  async userMove(m) {
    if (this.busy || this.over) return;
    const token = this.token;
    const before = this.chess.fen();
    const book = this.book && !this.outOfBook ? this.bookFor(before) : [];
    const move = this.chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    this.busy = true; this.hintStep = 0; this.userMoves++;
    this.draw();
    const hit = book.find((b) => b.uci === move.lan);
    if (hit) {
      this.say('good', `<h4>${esc(move.san)} is the book move</h4><p>${esc(hit.note || cap(describeMove(before, move.lan).join(', ')) + '.')}</p>`);
      return this.opponent();
    }
    this.status('Checking your move…');
    let j;
    try { j = await judge(before, move.lan, this.depth); } catch (e) { this.busy = false; this.status(e.message); return; }
    if (!this.alive(token)) return;
    const seen = this.personal?.me.get(posKey(before));
    const total = seen?.reduce((n, x) => n + x.n, 0);
    const usual = seen?.[0];
    const mineHere = seen?.find((x) => x.uci === move.lan);
    const bookLine = seen ? `<p class="muted">${mineHere ? `You played ${esc(move.san)} in ${mineHere.n} of your ${total} game${total === 1 ? '' : 's'} from this position.` : `In your games you ${total > 1 ? 'usually ' : ''}played ${esc(usual.san)} here (${usual.n} of ${total}).`}</p>`
      : book.length ? `<p>The main line here is <b>${esc(book.map((b) => b.san).join(' or '))}</b>${book[0].note ? ': ' + esc(book[0].note) : '.'}</p>` : '';
    if (book.length) this.leaveBook(false);
    if (this.chess.isCheckmate()) return this.finish(true, `${move.san} is checkmate.`);
    if (this.chess.isGameOver()) return this.finish(this.goal === 'draw' || !this.goal && j.vb < -100, this.chess.isStalemate() ? 'Stalemate: the game is drawn.' : 'The game is drawn.');
    const slip = this.goal === 'win' ? j.va < 150 && j.vb >= 150 : this.goal === 'draw' ? j.va < -250 && j.vb >= -250 : false;
    if (j.cls && j.cls !== 'inaccuracy' || slip) {
      const what = slip ? (this.goal === 'win' ? 'This lets the win slip' : 'This loses the draw') : j.cls === 'blunder' ? 'Blunder' : j.cls === 'missed' ? 'Missed win' : 'Mistake';
      this.say('bad', `<p class="tag">${what}</p>${storyHtml(j.story || { title: `${move.san} changes the result`, points: [`The engine’s move was ${lineSan(before, [j.best])[0]}.`], verdict: `Evaluation for you: ${formatScore(j.vb)} before, ${formatScore(j.va)} after.` }, bookLine)}
        <div class="row"><button type="button" class="primary" data-act="back">Take it back and try again</button><button type="button" data-act="resume">Play on anyway</button></div>`);
      this.draw(j.story?.arrows || []);
      this.status('Have another look at this position.');
      this.waiting = true;
      return;
    }
    if (j.cls === 'inaccuracy') this.say('ok', `<p class="tag">Inaccuracy</p>${storyHtml(j.story, bookLine)}`);
    else if (j.same) this.say('good', `<h4>${esc(move.san)} is the engine’s first choice</h4><p>${esc(cap(describeMove(before, move.lan).slice(0, 3).join(', ')))}.</p>${bookLine}`);
    else if (j.va >= j.vb) this.say('good', `<h4>${esc(move.san)} is a strong move</h4><p>${esc(cap(describeMove(before, move.lan).slice(0, 3).join(', ')))}. Evaluation for you: ${formatScore(j.va)}.</p>${bookLine}`);
    else this.say('good', `<h4>${esc(move.san)} is a good move</h4><p>The engine slightly prefers ${esc(lineSan(before, [j.best])[0])}, but the difference is small (${formatScore(j.va)} for you).</p>${bookLine}`);
    if (this.goal && this.checkGoal(j, move)) return;
    return this.opponent();
  }

  checkGoal(j, move) {
    if (move.promotion) this.promoted = true;
    if (this.goal === 'win' && this.finishOn === 'promote' && this.promoted && j.va >= 500) {
      this.finish(true, 'The pawn has queened safely. The rest is a basic checkmate.');
      return true;
    }
    if (this.goal === 'draw' && this.userMoves >= 8 && j.va > -150) {
      this.finish(true, 'You have held the position: the defence works. Keep this method in mind for your own games.');
      return true;
    }
    return false;
  }

  resume() { if (!this.waiting) return; this.waiting = false; this.say(null); this.opponent(); }

  leaveBook(byOpponent) {
    if (this.outOfBook) return;
    this.outOfBook = true;
    this.note = byOpponent ? 'Your opponent has left the book. No more memorised moves: use the ideas of the opening and I will comment on each move.' : '';
  }

  async opponent() {
    const token = this.token;
    this.busy = true;
    this.draw(this.board.state.arrows);
    if (this.chess.isGameOver()) return this.finish(false, 'The game is over.');
    this.status('Opponent is thinking…');
    let uci = null;
    try {
      if (this.book && !this.outOfBook) {
        const options = bookMoves(this.chess.fen());
        const preferred = options.filter((o) => o.ids.some((id) => this.book.ids.includes(id)));
        const pool = preferred.length ? preferred : options.filter((o) => !o.trap);
        if (pool.length && this.book.surprise && Math.random() < 0.3) {
          const lines = await engine.analyse(this.chess.fen(), { depth: 10, multipv: 5 });
          const top = whiteValue(lines[0], 'w');
          const odd = lines.filter((l) => !options.some((o) => o.uci === l.pv[0]) && top - whiteValue(l, 'w') < 90);
          if (odd.length) { uci = odd[Math.floor(Math.random() * odd.length)].pv[0]; this.leaveBook(true); }
        }
        if (!uci && pool.length) uci = pool[Math.floor(Math.random() * pool.length)].uci;
        if (!uci) { this.leaveBook(false); this.note = 'That is the end of the book line. From here it is a real game: play the plans of the opening and I will comment on each move.'; }
      }
      if (!uci && this.personal && !this.outOfBook) {
        const options = this.personal.opp.get(posKey(this.chess.fen())) || [];
        let roll = Math.random() * options.reduce((n, o) => n + o.n, 0);
        uci = options.find((o) => (roll -= o.n) < 0)?.uci;
        if (!uci) { this.outOfBook = true; this.note = 'None of your opponents went this way, so from here the engine plays. Keep going: this is the middlegame your opening leads to.'; }
      }
      uci ||= await engine.bestMove(this.chess.fen(), { elo: this.elo, movetime: this.elo ? 300 : 700 });
    } catch (e) { this.busy = false; this.status(e.message); return; }
    if (!this.alive(token)) return;
    await new Promise((r) => setTimeout(r, 350));
    if (!this.alive(token)) return;
    const move = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    this.busy = false;
    this.draw();
    if (this.chess.isCheckmate()) return this.finish(false, `${move.san} is checkmate. Take back a few moves to find where it went wrong.`);
    if (this.chess.isGameOver()) return this.finish(this.goal === 'draw', 'The game is drawn.');
    this.status(`Opponent played ${move.san}. Your move.${this.note ? ' ' + this.note : ''}`);
    this.note = '';
  }

  finish(success, text) {
    this.over = true; this.busy = false; this.waiting = false;
    this.draw();
    const goalText = this.goal ? (success ? 'Lesson complete. ' : 'Not this time. ') : '';
    this.status(goalText + text);
    if (success && this.goal) this.onSolved?.();
  }

  back() {
    if (!this.chess.history().length) return;
    this.token = Symbol();
    this.chess.undo();
    if (this.chess.turn() !== this.userColor && this.chess.history().length) this.chess.undo();
    this.busy = false; this.over = false; this.waiting = false; this.hintStep = 0;
    if (this.book && this.bookFor(this.chess.fen()).length) this.outOfBook = false;
    if (this.personal) this.outOfBook = false;
    this.say(null);
    this.draw();
    if (this.chess.turn() !== this.userColor) this.opponent(); else this.status('Your move.');
  }

  async hint() {
    if (this.busy || this.over) return;
    const fen = this.chess.fen();
    const book = this.book && !this.outOfBook ? this.bookFor(fen)[0] : null;
    const uci = book ? book.uci : (await engine.analyse(fen, { depth: this.depth }))[0]?.pv[0];
    if (!uci || fen !== this.chess.fen()) return;
    const piece = this.chess.get(uci.slice(0, 2));
    if (this.hintStep++ === 0) {
      this.say('ok', `<h4>Hint</h4><p>Look at your ${NAMES[piece.type]} on ${uci.slice(0, 2)}. Press Hint again to see the move.</p>`);
    } else {
      this.say('ok', `<h4>Hint: ${esc(lineSan(fen, [uci])[0])}</h4><p>${esc(book?.note || cap(describeMove(fen, uci).slice(0, 3).join(', ')) + '.')}</p>`);
      this.draw([{ from: uci.slice(0, 2), to: uci.slice(2, 4), kind: 'hint' }]);
    }
  }

  async ideas() {
    if (this.busy || this.over) return;
    const fen = this.chess.fen();
    this.status('Looking for the best ideas…');
    const lines = await engine.analyse(fen, { depth: Math.max(this.depth, 13), multipv: 3 });
    if (fen !== this.chess.fen()) return;
    const me = this.chess.turn();
    this.say('ok', `<h4>The engine’s top ideas</h4><ol class="ideas">${lines.map((l) => `<li><b>${esc(lineSan(fen, l.pv, 1)[0])}</b> <span class="muted">(${formatScore(pov(whiteValue(l, me), me))})</span> — ${esc(describeMove(fen, l.pv[0]).slice(0, 2).join(', '))}.<br><span class="muted">${esc(numbered(fen, lineSan(fen, l.pv, 6)))}</span></li>`).join('')}</ol>`);
    this.draw(lines.map((l, i) => ({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), kind: i ? 'hint' : 'good' })));
    this.status('Your move.');
  }
}
