// A small interactive chessboard: click or drag to move, arrows, highlights, promotion picker.
import { Chess } from 'chess.js';

const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const ARROW = { good: '#2e9d5b', bad: '#d0453a', hint: '#3b7dd8', master: '#c58a1c' };

// The piece artwork is one SVG sprite; inline it once so <use href="#wk"> works everywhere.
let sprite;
export function loadPieces() {
  sprite ||= fetch('./pieces.svg').then((r) => r.text()).then((svg) => {
    const holder = document.createElement('div');
    holder.hidden = true;
    holder.innerHTML = svg.slice(svg.indexOf('<svg'));
    document.body.append(holder);
  });
  return sprite;
}

export class Board {
  constructor(el, { onMove } = {}) {
    this.el = el;
    this.onMove = onMove;
    this.state = { fen: new Chess().fen(), orientation: 'w', movable: null, lastMove: null, arrows: [] };
    this.selected = null;
    el.classList.add('board');
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.drag(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', () => this.endDrag());
    loadPieces().then(() => this.render());
  }

  set(patch) {
    Object.assign(this.state, patch);
    if ('fen' in patch) this.selected = null;
    this.render();
  }
  flip() { this.set({ orientation: this.state.orientation === 'w' ? 'b' : 'w' }); }

  squares() {
    const files = this.state.orientation === 'w' ? 'abcdefgh' : 'hgfedcba';
    const ranks = this.state.orientation === 'w' ? '87654321' : '12345678';
    return [...ranks].flatMap((r) => [...files].map((f) => f + r));
  }
  centre(square) {
    const i = this.squares().indexOf(square);
    return [(i % 8) + 0.5, Math.floor(i / 8) + 0.5];
  }

  render() {
    const { fen, lastMove, arrows, movable } = this.state;
    const chess = new Chess(fen);
    this.chess = chess;
    const targets = this.selected ? chess.moves({ square: this.selected, verbose: true }).map((m) => m.to) : [];
    const check = chess.isCheck() ? chess.board().flat().find((p) => p && p.type === 'k' && p.color === chess.turn()).square : null;
    const squares = this.squares();
    const cells = squares.map((sq, i) => {
      const p = chess.get(sq);
      const light = (sq.charCodeAt(0) + Number(sq[1])) % 2 === 1;
      const cls = ['sq', light ? 'light' : 'dark'];
      if (lastMove?.includes(sq)) cls.push('last');
      if (sq === this.selected) cls.push('selected');
      if (sq === check) cls.push('check');
      if (targets.includes(sq)) cls.push(p ? 'capture' : 'target');
      if (p && movable && (movable === 'both' || movable === p.color) && p.color === chess.turn()) cls.push('grab');
      const file = i >= 56 ? `<span class="coord file">${sq[0]}</span>` : '';
      const rank = i % 8 === 0 ? `<span class="coord rank">${sq[1]}</span>` : '';
      const piece = p ? `<svg class="piece" viewBox="0 0 40 40" aria-hidden="true"><use href="#${p.color}${p.type}"/></svg>` : '';
      const label = `${sq}${p ? ` ${p.color === 'w' ? 'white' : 'black'} ${NAMES[p.type]}` : ''}`;
      return `<div class="${cls.join(' ')}" data-sq="${sq}" role="gridcell" aria-label="${label}">${rank}${file}${piece}</div>`;
    });
    const lines = (arrows || []).map((a) => {
      const [x1, y1] = this.centre(a.from), [x2, y2] = this.centre(a.to);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ex = x2 - ((x2 - x1) / len) * 0.3, ey = y2 - ((y2 - y1) / len) * 0.3;
      return `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${ARROW[a.kind] || ARROW.hint}" marker-end="url(#head-${a.kind})"/>`;
    }).join('');
    const heads = Object.entries(ARROW).map(([k, c]) => `<marker id="head-${k}" viewBox="0 0 4 4" refX="1.6" refY="2" markerWidth="2.6" markerHeight="2.6" orient="auto"><path d="M0 0 4 2 0 4z" fill="${c}"/></marker>`).join('');
    this.el.setAttribute('role', 'grid');
    this.el.innerHTML = cells.join('') + `<svg class="arrows" viewBox="0 0 8 8" aria-hidden="true"><defs>${heads}</defs>${lines}</svg>`;
  }

  canMove(square) {
    const p = this.chess.get(square), m = this.state.movable;
    return p && m && p.color === this.chess.turn() && (m === 'both' || m === p.color);
  }
  squareAt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-sq]');
    return el && this.el.contains(el) ? el.dataset.sq : null;
  }

  down(e) {
    if (e.target.closest('.promo')) return;
    const sq = this.squareAt(e);
    if (!sq) return;
    if (this.selected && sq !== this.selected && this.tryMove(this.selected, sq)) return;
    if (!this.canMove(sq)) { this.selected = null; this.render(); return; }
    this.selected = sq;
    this.render();
    const piece = this.el.querySelector(`[data-sq="${sq}"] .piece`);
    this.dragging = { from: sq, piece, x: e.clientX, y: e.clientY, moved: false };
    this.el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  drag(e) {
    const d = this.dragging;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    d.piece.classList.add('dragging');
    d.piece.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
  }
  up(e) {
    const d = this.dragging;
    if (!d) return;
    this.endDrag();
    if (!d.moved) return;
    const sq = this.squareAt(e);
    if (!sq || sq === d.from || !this.tryMove(d.from, sq)) this.render();
  }
  endDrag() {
    if (this.dragging?.piece) { this.dragging.piece.style.transform = ''; this.dragging.piece.classList.remove('dragging'); }
    this.dragging = null;
  }

  tryMove(from, to) {
    const options = this.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!options.length) return false;
    this.selected = null;
    if (options.length > 1) { this.askPromotion(from, to, options[0].color); return true; }
    this.onMove?.({ from, to, promotion: options[0].promotion, uci: from + to + (options[0].promotion || '') });
    return true;
  }
  askPromotion(from, to, color) {
    this.render();
    const box = document.createElement('div');
    box.className = 'promo';
    box.innerHTML = ['q', 'r', 'b', 'n'].map((t) => `<button type="button" data-p="${t}" aria-label="Promote to ${NAMES[t]}"><svg viewBox="0 0 40 40"><use href="#${color}${t}"/></svg></button>`).join('');
    box.onclick = (e) => {
      const p = e.target.closest('[data-p]')?.dataset.p;
      box.remove();
      if (p) this.onMove?.({ from, to, promotion: p, uci: from + to + p });
    };
    this.el.append(box);
  }
}
