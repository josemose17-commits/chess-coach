import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { parseGames, playerColor, whiteValue, winChance, formatScore, MATE, analyseGame, gameRecord, buildProfile, openingFromHeaders, classify } from '../src/analysis.js';
import { explain, describeMove, materialSwing, MOTIFS } from '../src/coach.js';
import { NodeEngine } from './helpers/node-engine.js';

const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.01.02"]
[White "Jojo"]
[Black "Opponent"]
[Result "1-0"]
[ECOUrl "https://www.chess.com/openings/Scholars-Mate-Attempt-2...Nc6-3.Qh5"]
[TimeControl "600"]
[Termination "Jojo won by checkmate"]
[Link "https://www.chess.com/game/live/1"]

1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:57]} 2. Bc4 {[%clk 0:09:50]} 2... Nc6 {[%clk 0:09:50]} 3. Qh5 {[%clk 0:09:45]} 3... Nf6 {[%clk 0:09:40]} 4. Qxf7# {[%clk 0:09:44]} 1-0`;

test('PGN import reads players, clocks, opening names and skips unusable games', () => {
  const [g] = parseGames(pgn + '\n\n[Event "x"]\n[Result "*"]\n\n1. e4 *');
  assert.equal(g.moves.length, 7);
  assert.deepEqual(g.clocks.slice(0, 2), [598, 597]);
  assert.equal(g.opening, 'Scholars Mate Attempt');
  assert.equal(g.timeClass, 'rapid');
  assert.equal(g.id, 'https://www.chess.com/game/live/1');
  assert.equal(playerColor(g.headers, 'jojo'), 'w');
  assert.equal(playerColor(g.headers, 'nobody'), null);
  assert.equal(parseGames(pgn + '\n\n' + pgn).length, 1, 'duplicates collapse');
  assert.equal(openingFromHeaders({ ECO: 'B20' }), 'ECO B20');
});

test('scores convert to one white-relative scale and to winning chances', () => {
  assert.equal(whiteValue({ cp: 50 }, 'b'), -50);
  assert.equal(whiteValue({ mate: 2 }, 'w'), MATE - 2);
  assert.equal(whiteValue({ mate: 0 }, 'w'), -MATE);
  assert.equal(whiteValue({ mate: -3 }, 'b'), MATE - 3);
  assert.equal(Math.round(winChance(0)), 50);
  assert.ok(winChance(300) > 70 && winChance(-300) < 30);
  assert.equal(winChance(MATE - 1), 100);
  assert.equal(formatScore(MATE - 3), '#3');
  assert.equal(formatScore(-120), '-1.2');
  assert.equal(classify(25), 'blunder');
  assert.equal(classify(3), null);
});

test('explanations name the real reason: mate, hanging piece, free capture, fork', () => {
  // Allowing mate in one.
  const b = new Chess(); b.loadPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5');
  let s = explain({ fen: b.fen(), uci: 'g8f6', best: 'g7g6', pvBest: ['g7g6', 'h5f3'], pvAfter: ['h5f7'], vb: -30, va: -(MATE - 1), loss: 48, phase: 'Opening', next: 'h5f7' });
  assert.equal(s.motif, 'mate-allowed');
  assert.match(s.points[0], /Your opponent played Qxf7#.*checkmate/);
  assert.match(s.points[1], /bishop on c4 protects/);
  // Missing mate in one.
  b.move('Nf6');
  s = explain({ fen: b.fen(), uci: 'd2d3', best: 'h5f7', pvBest: ['h5f7'], pvAfter: ['f6h5'], vb: MATE - 1, va: -500, loss: 90, phase: 'Opening' });
  assert.equal(s.motif, 'mate-missed');
  assert.match(s.title, /checkmate in one/);
  // Moving a piece to an attacked, undefended square.
  s = explain({ fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2', uci: 'f3g5', best: 'b1c3', pvBest: ['b1c3', 'b8c6'], pvAfter: ['d8g5', 'd2d4', 'g5g2'], vb: 30, va: -350, loss: 30, phase: 'Opening' });
  assert.equal(s.motif, 'hung-piece');
  assert.match(s.title, /knight can simply be taken on g5/);
  assert.match(s.points[0], /attacked by the queen on d8.*nothing of yours defends/);
  // Not taking an undefended piece.
  s = explain({ fen: '4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1', uci: 'e1e2', best: 'd2d5', pvBest: ['d2d5'], pvAfter: ['d5f4'], vb: 500, va: 0, loss: 40, phase: 'Endgame' });
  assert.equal(s.motif, 'missed-capture');
  assert.match(s.points[0], /Nothing was defending the knight on d5/);
  // Missing a knight fork of king and rook.
  s = explain({ fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', uci: 'e1e2', best: 'b5c7', pvBest: ['b5c7', 'e8d7', 'c7a8'], pvAfter: ['a8a2'], vb: 500, va: -500, loss: 70, phase: 'Endgame' });
  assert.equal(s.motif, 'tactic-missed');
  assert.match(s.title, /fork with Nc7\+/);
  assert.match(s.points[0], /king on e8 and rook on a8/);
  for (const m of ['mate-allowed', 'hung-piece', 'missed-capture', 'tactic-missed']) assert.ok(MOTIFS[m].habit);
  assert.equal(explain({ fen: 'bad', uci: 'e2e4', best: 'd2d4' }).valid, false);
});

test('move descriptions and material counts are factual', () => {
  assert.match(describeMove(new Chess().fen(), 'g1f3').join(), /develops the knight/);
  assert.match(describeMove(new Chess().fen(), 'e2e4').join(), /centre/);
  assert.match(describeMove('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1g1').join(), /castles/);
  assert.match(describeMove('4k3/8/8/b7/8/8/8/R3K3 w - - 0 1', 'a1a5').join(), /captures the bishop on a5, which nothing was defending/);
  assert.match(describeMove('k3q3/8/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e8').join(), /captures the queen/);
  assert.equal(materialSwing('4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1', ['d2d5'], 'w'), 3);
  assert.equal(materialSwing('4k3/8/2p5/3n4/8/8/3R4/4K3 w - - 0 1', ['d2d5', 'c6d5'], 'w'), -2);
});

test('a real game is graded by the real engine and rolls up into a profile', async () => {
  const engine = new NodeEngine();
  try {
    const [g] = parseGames(pgn);
    const analysis = await analyseGame(g, 'b', async (fen) => (await engine.analyse(fen, { depth: 10 }))[0]);
    assert.equal(analysis.evals.length, 8);
    const blunder = analysis.events.find((e) => e.san === 'Nf6');
    assert.ok(blunder, 'the move that allows mate is flagged');
    assert.equal(blunder.cls, 'blunder');
    assert.equal(blunder.next, 'h5f7');
    assert.equal(blunder.clock, 580);
    const record = gameRecord(g, 'b', analysis, 10);
    assert.equal(record.result, 'loss');
    const profile = buildProfile([record], explain);
    assert.equal(profile.total.loss, 1);
    assert.equal(profile.motifs[0].motif, 'mate-allowed');
    assert.equal(profile.openings[0].name, 'Scholars Mate Attempt');
    assert.ok(profile.phases.find((p) => p.name === 'Opening').errors >= 1);
    assert.ok(JSON.stringify(record).length < 6000, 'records stay small enough for browser storage');
  } finally { engine.close(); }
});

test('opening names drop move suffixes', () => {
  assert.equal(openingFromHeaders({ ECOUrl: 'https://www.chess.com/openings/English-Opening-Agincourt-Defense...3.e3' }), 'English Opening Agincourt Defense');
  assert.equal(openingFromHeaders({ ECOUrl: 'https://www.chess.com/openings/Sicilian-Defense-Open-2...Nc6-3.d4' }), 'Sicilian Defense Open');
});
