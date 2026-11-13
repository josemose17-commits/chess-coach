// A compact opening book. Each line is checked for legality by the test suite.
// `side` is the colour the line is mainly a repertoire choice for.
import { Chess } from 'chess.js';

export const OPENINGS = [
  { id: 'italian', group: '1.e4 e5', side: 'w', name: 'Italian Game (Giuoco Pianissimo)',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3',
    ideas: ['Aim the bishop at f7 and build a slow centre with c3 and d3, keeping d4 in reserve.', 'Reroute the b1 knight: Nbd2–f1–g3 heads for the kingside.', 'Black mirrors the plan; the side that times the central break (d4 or …d5) better usually takes over.'],
    notes: { 4: 'The bishop eyes f7, the weakest square in Black’s camp.', 6: 'Prepares d4 and gives the bishop a retreat on c2.', 8: 'The quiet move: the e4 pawn is supported and nothing is rushed.', 14: 'The bishop steps back before …Na5 or …b5 can hit it.' } },
  { id: 'two-knights', group: '1.e4 e5', side: 'b', name: 'Two Knights Defence (meeting 4.Ng5)',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5',
    ideas: ['4.Ng5 attacks f7 twice. The only good defence is to block the bishop with …d5.', 'Never recapture 5…Nxd5: that allows the Fried Liver sacrifice on f7. Play 5…Na5.', 'Black gives a pawn but gets fast development and chases White’s pieces around.'],
    notes: { 7: 'Blocks the bishop’s diagonal. This is the only move that holds f7 comfortably.', 9: 'Hits the bishop. Recapturing on d5 with the knight would invite Nxf7.', 17: 'Gains space with tempo; Black’s activity is worth the pawn.' } },
  { id: 'fried-liver', group: '1.e4 e5', side: 'w', name: 'Fried Liver Attack',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3',
    traps: [9],
    ideas: ['If Black recaptures 5…Nxd5, the knight sacrifice on f7 drags the king into the open.', 'The pinned knight on d5 is the target: pile up with Qf3, Nc3 and the bishop.', 'Know it as White to punish the mistake, and as Black to avoid it.'],
    notes: { 10: 'The sacrifice. The king must take or lose the queen or rook.', 12: 'Check and a second attacker on d5. The king has to step forward to e6 to hold the knight.', 14: 'A third attacker on the pinned knight. Black’s king is stuck in the centre.' } },
  { id: 'scholars', group: '1.e4 e5', side: 'b', name: 'Stopping Scholar’s Mate',
    moves: 'e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6',
    traps: [2, 6],
    ideas: ['First defend e5 with …Nc6, then answer the mate threat on f7 with …g6.', 'When the queen returns to f3 threatening f7 again, …Nf6 blocks.', 'White’s queen has moved three times; Black is simply ahead in development.'],
    notes: { 3: 'Defends e5. Not 2…g6?, which loses the e5 pawn and the rook to Qxe5+.', 5: 'Stops Qxf7# and chases the queen.', 7: 'Blocks the f-file. Black now develops with …Bg7 and castles.' } },
  { id: 'ruy-closed', group: '1.e4 e5', side: 'w', name: 'Ruy Lopez (Closed)',
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
    ideas: ['Pressure the knight that defends e5, then build a big centre with c3 and d4.', 'The bishop lands on b3 or c2, pointing at the kingside for later.', 'Black gets queenside space with …a6 and …b5; White plays on the centre and kingside.'],
    notes: { 4: 'Indirect pressure on e5 through its defender.', 10: 'Defends e4, so now Bxc6 followed by Nxe5 is a real threat.', 16: 'Stops …Bg4, which would pin the knight and undermine d4.' } },
  { id: 'berlin', group: '1.e4 e5', side: 'b', name: 'Ruy Lopez (Berlin Defence)',
    moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8',
    ideas: ['Black takes on e4 and heads for an early queen trade.', 'Black keeps the bishop pair; White has the healthier pawn majority on the kingside.', 'The king is fine on d8 with queens off. This is a middlegame without queens, not a draw.'],
    notes: { 7: 'Safe because Re1 or d4 wins the pawn back but not more.', 9: 'The knight retreats with tempo on the bishop.', 15: 'With queens gone the uncastled king is no problem.' } },
  { id: 'scotch', group: '1.e4 e5', side: 'w', name: 'Scotch Game',
    moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4',
    ideas: ['Open the centre at once and take space with e5.', 'Both queens block their bishops for a while; whoever untangles first stands better.', 'c4 challenges the d5 knight before Black is coordinated.'],
    notes: { 4: 'Opens lines immediately rather than building slowly.', 10: 'Kicks the knight; Black pins the pawn with …Qe7.', 14: 'Questions the knight on d5.' } },
  { id: 'petrov', group: '1.e4 e5', side: 'b', name: 'Petrov Defence',
    moves: 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Be7 O-O Nc6',
    ideas: ['Counter-attack e4 instead of defending e5.', 'Never play 3…Nxe4 at once: Qe2 wins material. First …d6 to chase the knight.', 'The result is a symmetrical, solid centre with a strong knight on e4.'],
    notes: { 5: 'First kick the knight. 3…Nxe4? 4.Qe2 is a well-known trap.', 7: 'Now the pawn can be taken safely.' } },
  { id: 'najdorf', group: 'Sicilian', side: 'b', name: 'Sicilian Najdorf (English Attack)',
    moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O',
    ideas: ['…a6 keeps White’s pieces out of b5 and prepares …b5 and …e5.', 'Opposite-side castling: White storms with g4–g5, Black with …b5–b4.', 'Black’s d5 square is a hole; the break …d5 at the right moment solves everything.'],
    notes: { 9: 'The Najdorf move: controls b5 and keeps options open.', 11: 'Gains space and kicks the knight, at the price of the d5 square.', 18: 'Castling opposite sides. Speed of attack now matters more than material.' } },
  { id: 'dragon', group: 'Sicilian', side: 'b', name: 'Sicilian Dragon (Yugoslav Attack)',
    moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O',
    ideas: ['The g7 bishop is Black’s best piece, aiming down the long diagonal at White’s king.', 'White plans Bh6 to trade it and h4–h5 to open the h-file.', 'Black attacks down the c-file: …Rc8, …Ne5, and often an exchange sacrifice on c3.'],
    notes: { 9: 'Prepares the fianchetto: the “Dragon” bishop.', 12: 'Supports e4 and stops …Ng4 hitting the e3 bishop.', 18: 'Both sides now race to attack the other king.' } },
  { id: 'sveshnikov', group: 'Sicilian', side: 'b', name: 'Sicilian Sveshnikov',
    moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5',
    ideas: ['Black accepts a hole on d5 in return for active pieces and space.', 'White’s knight is driven to the edge on a3.', 'Play revolves around the d5 square and Black’s …f5 break.'],
    notes: { 9: 'Kicks the knight, conceding d5.', 15: 'Threatens …b4, forking the knights.' } },
  { id: 'alapin', group: 'Sicilian', side: 'w', name: 'Sicilian Alapin (2.c3)',
    moves: 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb5',
    ideas: ['Build a full pawn centre with c3 and d4 and avoid the heavy Open Sicilian theory.', 'Black hits e4 at once, so the pawn advances and gains space.', 'Positions are open and logical; development decides.'],
    notes: { 2: 'Prepares d4 with a pawn recapture.', 3: 'Attacks e4 before White can support it with d4.' } },
  { id: 'french-advance', group: 'French & Caro-Kann', side: 'w', name: 'French Defence (Advance)',
    moves: 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 Nh6 b4 cxd4 cxd4 Nf5',
    ideas: ['White’s pawn chain d4–e5 points at the kingside; that is where White plays.', 'Black attacks the base of the chain on d4 with …c5, …Nc6, …Qb6 and …Nf5.', 'Black’s light-squared bishop is the problem piece of the whole opening.'],
    notes: { 5: 'Attack the chain at its base.', 9: 'Adds a third attacker on d4 and eyes b2.', 15: 'The knight joins the siege of d4.' } },
  { id: 'french-exchange', group: 'French & Caro-Kann', side: 'b', name: 'French Defence (Exchange)',
    moves: 'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6 O-O O-O',
    ideas: ['The symmetrical structure frees Black’s light-squared bishop.', 'With one open file, the fight is for piece activity and the e-file.', 'Breaking symmetry (for example castling opposite sides) is how either side plays for a win.'],
    notes: {} },
  { id: 'caro-advance', group: 'French & Caro-Kann', side: 'b', name: 'Caro-Kann (Advance)',
    moves: 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 cxd4 Nxd4 Ne7',
    ideas: ['Like the French, but the bishop gets out to f5 before …e6 shuts it in.', 'Black then hits the centre with …c5.', 'White has space; Black has a solid structure with no bad piece.'],
    notes: { 5: 'The whole point of the Caro-Kann: the bishop comes out first.', 9: 'The standard strike at the base of the chain.' } },
  { id: 'caro-classical', group: 'French & Caro-Kann', side: 'b', name: 'Caro-Kann (Classical)',
    moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6',
    ideas: ['Black develops the bishop with tempo on the e4 knight.', 'White gains kingside space with h4–h5; Black gets a rock-solid position.', '…h6 gives the bishop a retreat; forgetting it loses the bishop to h5.'],
    notes: { 11: 'Makes room on h7. Without it h5 would trap the bishop.', 13: 'Stops Ne5.' } },
  { id: 'scandinavian', group: 'Other 1.e4', side: 'b', name: 'Scandinavian Defence',
    moves: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6',
    ideas: ['Black removes White’s e-pawn on move one at the cost of queen tempi.', '…c6 gives the queen a way home via c7 or d8.', 'The structure is a Caro-Kann: solid, with the light bishop outside the chain.'],
    notes: { 5: 'Out of the knight’s reach while still eyeing the centre.', 9: 'An escape route for the queen and control of d5.' } },
  { id: 'pirc', group: 'Other 1.e4', side: 'b', name: 'Pirc Defence',
    moves: 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5',
    ideas: ['Black lets White build a centre and attacks it later with …e5 or …c5.', 'White’s Be3, Qd2, f3 set-up plans Bh6 and a kingside pawn storm.', 'Black often delays castling and expands on the queenside first.'],
    notes: { 9: 'Prepares …b5 and keeps the king flexible.' } },
  { id: 'qgd', group: '1.d4 d5', side: 'w', name: 'Queen’s Gambit Declined',
    moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6',
    ideas: ['c4 is not a real gambit: it pressures d5 to win the centre.', 'Black holds d5 solidly; the c8 bishop is the piece to solve, often via …b6.', 'White’s typical plans: the minority attack (b4–b5) or central expansion with e4.'],
    notes: { 2: 'Offers a wing pawn to deflect Black’s centre pawn.', 6: 'The pin adds pressure on d5 through the knight.', 13: 'The Tartakower: the bishop will come to b7.' } },
  { id: 'qga', group: '1.d4 d5', side: 'b', name: 'Queen’s Gambit Accepted',
    moves: 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6',
    ideas: ['Black takes the pawn but does not try to keep it.', 'The time White spends recapturing is used for …c5, hitting the centre.', '…a6 and …b5 gain queenside space with tempo on the bishop.'],
    notes: { 3: 'Trying to hold the pawn with …b5 usually backfires after a4.', 9: 'The freeing break.' } },
  { id: 'slav', group: '1.d4 d5', side: 'b', name: 'Slav Defence',
    moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O',
    ideas: ['Supports d5 with the c-pawn so the c8 bishop stays free.', 'Black takes on c4 only when White can’t recapture comfortably.', 'a4 stops …b5; in return Black gets the b4 square.'],
    notes: { 3: 'Unlike …e6, this keeps the bishop’s diagonal open.', 8: 'Prevents …b5 holding the pawn.', 9: 'The bishop gets out before …e6.' } },
  { id: 'london', group: '1.d4 d5', side: 'w', name: 'London System',
    moves: 'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3',
    ideas: ['One set-up against almost everything: Bf4, e3, c3, Nd2, Ngf3, Bd3.', 'The pawn triangle c3–d4–e3 is very solid; the bishop sits outside it.', 'Typical plans: Ne5 followed by f4, or the e4 break.'],
    notes: { 2: 'The bishop comes out before e3 closes the diagonal.', 12: 'Keeps the bishop: if Black trades on g3, the h-file opens for the rook.' } },
  { id: 'kid', group: '1.d4 Nf6', side: 'b', name: 'King’s Indian Defence (Classical)',
    moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7',
    ideas: ['Black gives White the centre, then strikes with …e5.', 'After d5 the position is locked: White attacks on the queenside (c5), Black on the kingside (…f5–f4, …g5).', 'It is a race. The side that opens lines first wins.'],
    notes: { 11: 'The central strike the whole set-up prepares.', 14: 'Closes the centre. Attacks now go on the wings.', 15: 'Heads for the kingside; …Nd7 and …f5 follow.' } },
  { id: 'nimzo', group: '1.d4 Nf6', side: 'b', name: 'Nimzo-Indian Defence',
    moves: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6',
    ideas: ['The pin on c3 stops e4 without committing Black’s pawns.', 'Black is ready to give up the bishop pair to double White’s c-pawns.', 'Black then chooses a centre: …d5 and …c5, or a dark-square blockade.'],
    notes: { 5: 'Controls e4 by pinning its supporter.', 11: 'Hits d4 while development finishes.' } },
  { id: 'grunfeld', group: '1.d4 Nf6', side: 'b', name: 'Grünfeld Defence (Exchange)',
    moves: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5',
    ideas: ['Black invites a huge white centre, then attacks it with pieces and …c5.', 'The g7 bishop and pressure on d4 are Black’s whole game.', 'If the centre holds, White is better; if it cracks, Black is.'],
    notes: { 5: 'Challenges the centre immediately.', 13: 'The key break against d4.' } },
  { id: 'qid', group: '1.d4 Nf6', side: 'b', name: 'Queen’s Indian Defence',
    moves: 'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O',
    ideas: ['Control e4 with pieces: the knight on f6 and the bishop on b7.', 'Solid and flexible; Black often follows with …Ne4 or …d5.', 'White tries d5 or Nc3 and Qc2 to force through e4.'],
    notes: { 5: 'Prepares the fianchetto to fight for e4.' } },
  { id: 'catalan', group: '1.d4 Nf6', side: 'w', name: 'Catalan Opening',
    moves: 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6',
    ideas: ['Queen’s Gambit pawns plus a bishop on g2 raking the long diagonal.', 'If Black takes on c4, White regains it and keeps lasting queenside pressure.', 'The g2 bishop makes developing Black’s c8 bishop awkward.'],
    notes: { 4: 'The bishop will pressure d5 and b7 from g2.', 12: 'Regains the pawn; Qxc4 is coming.' } },
  { id: 'english', group: 'Flank openings', side: 'w', name: 'English Opening (Reversed Sicilian)',
    moves: 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7',
    ideas: ['A Sicilian with an extra tempo: White controls d5 from the wing.', 'The g2 bishop and the half-open c-file give queenside pressure.', 'Typical plan: a3, b4 and a queenside pawn advance.'],
    notes: { 0: 'Controls d5 without committing the centre pawns.', 11: 'Steps away from the bishop’s diagonal.' } },
];

// Index every book position so transpositions are recognised.
const key = (fen) => fen.split(' ').slice(0, 4).join(' ');
const index = new Map();
for (const o of OPENINGS) {
  const board = new Chess();
  o.sans = o.moves.split(' ');
  o.sans.forEach((san, i) => {
    const k = key(board.fen());
    const m = board.move(san);
    const entry = index.get(k) || [];
    let hit = entry.find((x) => x.uci === m.lan);
    if (!hit) entry.push(hit = { uci: m.lan, san: m.san, ids: [], note: '', trap: true });
    hit.ids.push(o.id);
    // A "trap" move is a known mistake the line exists to punish; it is never a recommendation.
    if (!o.traps?.includes(i)) hit.trap = false;
    if (o.notes[i] && !hit.note) hit.note = o.notes[i];
    index.set(k, entry);
  });
  o.fen = board.fen();
}
export const bookMoves = (fen) => index.get(key(fen)) || [];
export const openingById = (id) => OPENINGS.find((o) => o.id === id);
