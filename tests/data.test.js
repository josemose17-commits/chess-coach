import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { OPENINGS, bookMoves } from '../src/data/openings.js';
import { ENDGAMES } from '../src/data/endgames.js';
import { MASTERS, GAMES } from '../src/data/masters.js';
import { NodeEngine } from './helpers/node-engine.js';
import { whiteValue, terminalScore } from '../src/analysis.js';

test('every opening line is legal and its notes point at real moves', () => {
  for (const o of OPENINGS) {
    const board = new Chess();
    for (const san of o.moves.split(' ')) assert.doesNotThrow(() => board.move(san), `${o.id}: ${san}`);
    for (const i of Object.keys(o.notes)) assert.ok(Number(i) < o.sans.length, `${o.id} note ${i}`);
    assert.equal(o.ideas.length, 3);
  }
  assert.ok(bookMoves(new Chess().fen()).length >= 3);
});

test('master games are legal, end as recorded, and notes match the hero or opponent moves', () => {
  for (const g of GAMES) {
    const board = new Chess();
    const sans = g.moves.split(' ');
    for (const san of sans) assert.doesNotThrow(() => board.move(san), `${g.id}: ${san}`);
    assert.ok(MASTERS.some((m) => m.id === g.master));
    for (const key of Object.keys(g.notes)) {
      const ply = (parseInt(key) - 1) * 2 + (key.endsWith('b') ? 1 : 0);
      assert.ok(ply < sans.length, `${g.id} note ${key}`);
    }
    if (sans.at(-1).endsWith('#')) assert.ok(board.isCheckmate(), g.id);
  }
});

test('engine agrees with every master game result and every endgame goal', async () => {
  const engine = new NodeEngine();
  try {
    for (const g of GAMES) {
      const board = new Chess();
      for (const san of g.moves.split(' ')) board.move(san);
      const score = terminalScore(board.fen()) || (await engine.analyse(board.fen(), { depth: 14 }))[0];
      const v = whiteValue(score, board.turn());
      assert.ok(g.result === '1-0' ? v > 150 : v < -150, `${g.id}: final evaluation ${v}`);
    }
    for (const e of ENDGAMES) {
      const [score] = await engine.analyse(e.fen, { depth: 22 });
      const v = whiteValue(score, e.fen.split(' ')[1]) * (e.side === 'w' ? 1 : -1);
      if (e.goal === 'win') assert.ok(v > 200, `${e.id}: ${v}`);
      else assert.ok(Math.abs(v) < 120, `${e.id}: ${v}`);
    }
  } finally { engine.close(); }
});

test('known mistakes in trap lines are never offered as recommended book moves', () => {
  const afterE4E5 = new Chess(); afterE4E5.move('e4'); afterE4E5.move('e5');
  const qh5 = bookMoves(afterE4E5.fen()).find((m) => m.san === 'Qh5');
  assert.equal(qh5.trap, true);
  assert.equal(bookMoves(afterE4E5.fen()).find((m) => m.san === 'Nf3').trap, false);
});
