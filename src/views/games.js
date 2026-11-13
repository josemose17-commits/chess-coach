// "My games": import from Chess.com, analyse with the engine, report weaknesses,
// and review each missed move on the board.
import { Chess } from 'chess.js';
import { $, $$, esc, engine, store, save, go, route } from '../core.js';
import { Board } from '../board.js';
import { parseGames, playerColor, analyseGame, gameRecord, buildProfile, winChance, pov, formatScore, numbered, lineSan, CLASSES } from '../analysis.js';
import { explain, MOTIFS } from '../coach.js';
import { storyHtml } from '../session.js';

let root, board, profile = null, running = false, stopFlag = false;
let review = null; // {record, ply, variation:{fen, ucis, at, label}|null}
let filters = { motif: '', phase: '', cls: '' }, shown = 25;

const pct = (n) => Math.round(n * 100) + '%';
const resultWord = { win: 'Won', loss: 'Lost', draw: 'Drew' };

export function init(el) {
  root = el;
  el.innerHTML = `
  <section class="hero">
    <h1>Find out what is costing you games.</h1>
    <p>Enter your Chess.com username. Your recent games are checked move by move with Stockfish, and every missed move comes with the reason in plain words.</p>
    <form class="import" id="importForm">
      <label>Chess.com username<input id="username" autocomplete="off" spellcheck="false" placeholder="e.g. magnuscarlsen" required></label>
      <label>Games<select id="count"><option>10</option><option selected>20</option><option>30</option><option>50</option></select></label>
      <label>Time control<select id="timeClass"><option value="">All</option><option value="rapid">Rapid</option><option value="blitz">Blitz</option><option value="bullet">Bullet</option><option value="daily">Daily</option></select></label>
      <label>Depth<select id="depth"><option value="10">Fast</option><option value="12" selected>Standard</option><option value="14">Deep</option></select></label>
      <button class="primary" id="analyse">Analyse my games</button>
    </form>
    <label class="check"><input type="checkbox" id="ratedOnly"> Rated games only (skips casual games where you may be messing around)</label>
    <details class="pgn"><summary>Or paste PGN instead</summary>
      <label>Your name exactly as it appears in the PGN<input id="pgnName" autocomplete="off"></label>
      <label>PGN text<textarea id="pgn" rows="5" placeholder="Paste one or more games"></textarea></label>
      <button type="button" id="analysePgn">Analyse pasted games</button>
    </details>
    <div class="progress" id="progressBox" hidden><progress id="progress" max="1" value="0"></progress><button type="button" id="stop">Stop</button></div>
    <p id="status" role="status" aria-live="polite"></p>
  </section>
  <section id="reviewBox" class="panel" hidden>
    <div class="bench">
      <div class="bench-board"><div id="gBoard"></div>
        <div class="row nav"><button type="button" data-nav="start" aria-label="Start">⏮</button><button type="button" data-nav="prev" aria-label="Previous move">◀</button><button type="button" data-nav="next" aria-label="Next move">▶</button><button type="button" data-nav="end" aria-label="End">⏭</button><button type="button" data-nav="mistake">Next mistake ▸</button><button type="button" data-nav="flip">Flip</button></div>
      </div>
      <div class="bench-side">
        <div class="row between"><h2 id="rTitle"></h2><button type="button" id="rClose">Close</button></div>
        <p class="muted" id="rMeta"></p>
        <div id="rGraph"></div>
        <div id="rMoves" class="movechips"></div>
        <div id="rCoach" class="feedback"></div>
      </div>
    </div>
  </section>
  <div id="report"></div>`;
  $('#username').value = store.username || '';
  board = new Board($('#gBoard'));
  $('#importForm').onsubmit = (e) => { e.preventDefault(); importChessCom(); };
  $('#analysePgn').onclick = () => runAnalysis(parseGames($('#pgn').value), $('#pgnName').value);
  $('#stop').onclick = () => { stopFlag = true; engine.stop(); };
  $('#rClose').onclick = () => { review = null; $('#reviewBox').hidden = true; };
  $('#reviewBox').onclick = onReviewClick;
  $('#report').onclick = onReportClick;
  $('#report').onchange = (e) => {
    if (e.target.dataset.filter) { filters[e.target.dataset.filter] = e.target.value; shown = 25; renderMissed(); }
  };
  document.addEventListener('keydown', (e) => {
    if (!review || root.hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  route('review', ({ gameId, ply }) => openReview(gameId, ply));
  refresh();
}

const status = (text) => { $('#status').textContent = text; };

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 404) throw Error('Chess.com does not know that username. Check the spelling.');
  if (!r.ok) throw Error(`Chess.com answered with an error (${r.status}). Wait a moment and try again.`);
  return r.json();
}

async function importChessCom() {
  if (running) return;
  const name = $('#username').value.trim();
  if (!/^[\w-]{2,40}$/.test(name)) return status('Enter your Chess.com username (letters, numbers, - and _).');
  const want = Number($('#count').value), timeClass = $('#timeClass').value, ratedOnly = $('#ratedOnly').checked;
  status('Fetching your games from Chess.com…');
  let found = [];
  try {
    const { archives = [] } = await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(name.toLowerCase())}/games/archives`);
    for (const url of archives.slice(-12).reverse()) {
      if (!url.startsWith('https://api.chess.com/pub/player/')) continue;
      const { games = [] } = await getJson(url);
      found.push(...games.filter((g) => g.rules === 'chess' && g.pgn && (!timeClass || g.time_class === timeClass) && (!ratedOnly || g.rated)));
      if (found.length >= want) break;
    }
  } catch (e) { return status(e.message === 'Failed to fetch' ? 'Could not reach Chess.com. Check your connection and try again.' : e.message); }
  if (!found.length) return status('No finished standard games found for that username and time control.');
  found = found.sort((a, b) => b.end_time - a.end_time).slice(0, want);
  store.username = name; save();
  runAnalysis(parseGames(found.map((g) => g.pgn).join('\n\n')), name);
}

async function runAnalysis(games, name) {
  if (running) return;
  games = games.map((g) => ({ game: g, color: playerColor(g.headers, name || '') })).filter((g) => g.color);
  if (!games.length) return status(name ? `No games found where “${name}” is one of the players.` : 'Enter your name as it appears in the PGN.');
  const depth = Number($('#depth').value);
  const todo = games.filter(({ game }) => !store.games.some((r) => r.id === game.id && r.depth >= depth && r.player === name.toLowerCase()));
  const totalPlies = todo.reduce((s, { game }) => s + game.moves.length + 1, 0);
  running = true; stopFlag = false;
  $('#progressBox').hidden = false; $('#analyse').disabled = true;
  let done = 0, finished = 0;
  const began = Date.now();
  try {
    if (todo.length) { status('Starting the engine…'); await engine.start(); }
    for (const { game, color } of todo) {
      const cache = new Map();
      const evaluate = async (fen) => {
        if (stopFlag) throw Error('stopped');
        if (!cache.has(fen)) cache.set(fen, (await engine.analyse(fen, { depth }))[0]);
        return cache.get(fen);
      };
      const analysis = await analyseGame(game, color, evaluate, () => {
        done++;
        $('#progress').value = done / totalPlies;
        const left = ((Date.now() - began) / done) * (totalPlies - done) / 1000;
        status(`Analysing game ${finished + 1} of ${todo.length} · about ${left > 90 ? Math.round(left / 60) + ' min' : Math.max(1, Math.round(left)) + ' s'} left`);
      });
      const record = { ...gameRecord(game, color, analysis, depth), player: name.toLowerCase() };
      store.games = [record, ...store.games.filter((r) => r.id !== record.id)].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 150);
      finished++;
      if (!save()) status('Browser storage is full; results are shown but may not be kept.');
      refresh();
    }
    status(todo.length ? `Done: ${finished} game${finished === 1 ? '' : 's'} analysed. Your report is below.` : 'These games were already analysed. Your report is below.');
  } catch (e) {
    status(e.message === 'stopped' ? `Stopped. ${finished} game${finished === 1 ? ' is' : 's are'} in the report.` : e.message);
  } finally {
    running = false; $('#progressBox').hidden = true; $('#analyse').disabled = false;
  }
}

function records() {
  const name = (store.username || '').toLowerCase();
  const mine = store.games.filter((r) => !name || r.player === name);
  return mine.length ? mine : store.games;
}

function refresh() {
  const list = records().filter((r) => !r.excluded);
  profile = list.length ? buildProfile(list, explain) : null;
  renderReport();
}

function weaknessCards() {
  const { motifs, phases, openings, time, conversion, total } = profile;
  const cards = motifs.slice(0, 4).map((g) => ({
    title: MOTIFS[g.motif].label, habit: MOTIFS[g.motif].habit, examples: g.examples.slice(0, 3), train: MOTIFS[g.motif].train, motif: g.motif,
    evidence: `${g.count} serious mistake${g.count === 1 ? '' : 's'} of this kind in ${g.games} of your ${total.games} games, costing about ${Math.round(g.loss / total.games)}% of your winning chances per game.`,
  }));
  const extra = [];
  const allMoves = phases.reduce((s, p) => s + p.moves, 0), allErrors = phases.reduce((s, p) => s + p.errors, 0);
  const worst = phases.filter((p) => p.moves >= 30).sort((a, b) => b.rate - a.rate)[0];
  if (worst && allErrors >= 4 && worst.rate >= 1.3 * (100 * allErrors / allMoves)) {
    extra.push({ title: `Your ${worst.name.toLowerCase()} is where games slip`, train: worst.name === 'Opening' ? 'openings' : worst.name === 'Endgame' ? 'endgame' : 'middlegame', phase: worst.name,
      evidence: `${worst.rate.toFixed(1)} serious mistakes per 100 moves in the ${worst.name.toLowerCase()}, against ${(100 * allErrors / allMoves).toFixed(1)} across all phases.`,
      habit: worst.name === 'Opening' ? 'Pick one opening per colour and drill it until the first ten moves are automatic.' : worst.name === 'Endgame' ? 'Work through the endgame lessons: most endgame errors are missing technique, not missing talent.' : 'Slow down when the position gets tense: list checks, captures and threats for both sides before each move.' });
  }
  const bad = openings.filter((o) => o.games >= 3 && o.score <= 0.35).sort((a, b) => a.score - b.score)[0];
  if (bad) extra.push({ title: `${bad.name} as ${bad.color === 'w' ? 'White' : 'Black'} is costing you points`, train: 'openings',
    evidence: `You scored ${bad.win} win${bad.win === 1 ? '' : 's'}, ${bad.draw} draw${bad.draw === 1 ? '' : 's'} and ${bad.loss} loss${bad.loss === 1 ? '' : 'es'} in ${bad.games} games, and stand at ${formatScore(Math.round(bad.eval))} on average after 12 moves.`,
    habit: bad.eval < -50 ? 'You are already worse out of the opening. Learn the main line and its ideas in the opening trainer, or switch to a simpler system.' : 'The opening itself is fine: review these games for what goes wrong in the middlegame that follows.' });
  if (time.errors >= 5 && time.rushed / time.errors >= 0.35) extra.push({ title: 'Mistakes pile up when you are low on time', train: 'middlegame',
    evidence: `${time.rushed} of your ${time.errors} serious mistakes came with under 10% of your clock left${time.lostOnTime ? `, and you lost ${time.lostOnTime} game${time.lostOnTime === 1 ? '' : 's'} on time` : ''}.`,
    habit: 'Spend less on routine opening moves and keep a reserve for the critical moments. In time trouble, only check: is my move safe?' });
  if (conversion.thrown.length >= 2 && conversion.thrown.length / conversion.winning >= 0.25) extra.push({ title: 'Winning positions are slipping away', train: 'endgame',
    evidence: `You reached a clearly winning position (+3 or more) in ${conversion.winning} games and did not win ${conversion.thrown.length} of them.`,
    habit: 'When ahead: trade pieces, not pawns; keep your king safe; and ask what your opponent’s only counter-chance is before each move.' });
  cards.splice(2, 0, ...extra);
  return cards.slice(0, 6);
}

function renderReport() {
  const box = $('#report');
  if (!profile && records().length) {
    box.innerHTML = `<section class="panel empty"><h2>Every game is excluded</h2><p>Include at least one game below to see your report.</p></section>${gamesPanel()}`;
    return;
  }
  if (!profile) {
    box.innerHTML = `<section class="panel empty"><h2>No games analysed yet</h2><p>Your report will show your recurring weaknesses, every missed move with its explanation, and how you do in each opening and phase of the game. Analysis runs in your browser and takes a few minutes for 20 games.</p></section>`;
    return;
  }
  const { total, phases, openings } = profile;
  const cards = weaknessCards();
  const maxRate = Math.max(...phases.map((p) => p.rate), 0.1);
  box.innerHTML = `
  <section class="tiles">
    <div><strong>${total.games}</strong><span>games analysed</span></div>
    <div><strong>${total.win}–${total.draw}–${total.loss}</strong><span>wins – draws – losses</span></div>
    <div><strong>${total.accuracy ?? '–'}</strong><span>average accuracy</span></div>
    <div><strong>${(profile.events.filter((e) => e.cls === 'blunder').length / total.games).toFixed(1)}</strong><span>blunders per game</span></div>
  </section>
  <section class="panel"><h2>Your biggest weaknesses</h2>
    ${cards.length ? `<ol class="weaknesses">${cards.map((c, i) => `<li>
      <h3>${esc(c.title)}</h3><p>${esc(c.evidence)}</p><p class="habit"><b>What to do:</b> ${esc(c.habit)}</p>
      ${(c.examples || []).map((e) => `<button type="button" class="example" data-game="${esc(e.gameId)}" data-ply="${e.ply}"><span class="badge ${e.cls}">${CLASSES[e.cls]}</span> ${esc(e.label)}, move ${Math.floor(e.ply / 2) + 1}: ${esc(e.story.title)}</button>`).join('')}
      <div class="row"><button type="button" class="primary" data-train="${c.train}" data-motif="${c.motif || ''}" data-phase="${c.phase || ''}">Train this</button>${c.motif ? `<button type="button" data-show-motif="${c.motif}">See all ${profile.motifs.find((m) => m.motif === c.motif).count} examples</button>` : ''}</div>
    </li>`).join('')}</ol>` : '<p>No serious mistakes found in these games. Analyse more games or use the deeper setting for a fuller picture.</p>'}
  </section>
  <section class="panel two">
    <div><h2>By phase of the game</h2>
      ${phases.map((p) => `<div class="bar"><span>${p.name}</span><div><i style="width:${(100 * p.rate / maxRate).toFixed(0)}%"></i></div><span class="muted">${p.moves ? p.rate.toFixed(1) + ' per 100 moves' : 'no moves'}</span></div>`).join('')}
      <p class="muted">Serious mistakes (blunders and mistakes) per 100 of your moves.</p>
    </div>
    <div><h2>Your openings</h2>
      <table><thead><tr><th>Opening</th><th>As</th><th>Games</th><th>Score</th><th title="Engine evaluation after 12 moves, from your side">After 12 moves</th></tr></thead><tbody>
      ${openings.slice(0, 8).map((o) => `<tr><td>${esc(o.name)}</td><td>${o.color === 'w' ? 'White' : 'Black'}</td><td>${o.games}</td><td>${pct(o.score)}</td><td class="${o.eval < -50 ? 'neg' : o.eval > 50 ? 'pos' : ''}">${formatScore(Math.round(o.eval))}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </section>
  <section class="panel" id="missedPanel"><h2>Moves you missed</h2>
    <div class="filters">
      <label>Type<select data-filter="motif"><option value="">All types</option>${profile.motifs.map((m) => `<option value="${m.motif}">${esc(MOTIFS[m.motif].label)}</option>`).join('')}</select></label>
      <label>Phase<select data-filter="phase"><option value="">All phases</option><option>Opening</option><option>Middlegame</option><option>Endgame</option></select></label>
      <label>Severity<select data-filter="cls"><option value="">Blunders and mistakes</option><option value="blunder">Blunders only</option><option value="all">Include inaccuracies</option></select></label>
    </div>
    <div id="missed"></div>
  </section>
  ${gamesPanel()}`;
  for (const [k, v] of Object.entries(filters)) { const s = $(`[data-filter="${k}"]`, box); if (s) s.value = v; }
  renderMissed();
}

// A game that is far messier than your usual play is probably not a serious one.
function oddOnes(list) {
  const acc = list.map((r) => r.accuracy).sort((a, b) => a - b);
  const median = acc[Math.floor(acc.length / 2)];
  return new Set(list.filter((r) => list.length >= 5 && r.accuracy < median - 8).map((r) => r.id));
}

function gamesPanel() {
  const list = records();
  const odd = oddOnes(list);
  const out = list.filter((r) => r.excluded).length;
  return `<section class="panel"><div class="row between"><h2>Your games</h2><button type="button" id="clearGames">Clear saved games</button></div>
    <p class="muted">Played a game for fun or blundered on purpose? Exclude it and it no longer counts towards your weaknesses, missed moves or training positions.${out ? ` ${out} game${out === 1 ? ' is' : 's are'} excluded.` : ''}${odd.size ? ' Games marked “unusual” were much less accurate than your normal play.' : ''}</p>
    <div class="games">${list.map((r) => `<div class="gamerow ${r.excluded ? 'excluded' : ''}"><button type="button" class="game" data-game="${esc(r.id)}" data-ply="0">
      <span class="res ${r.result}">${resultWord[r.result]}</span>
      <span><b>${esc(r.color === 'w' ? r.black : r.white)}</b>${r.oppRating ? ` (${r.oppRating})` : ''} · as ${r.color === 'w' ? 'White' : 'Black'}</span>
      <span class="muted">${esc(r.opening)}</span>
      <span class="muted">${esc(r.date)} · ${esc(r.timeClass)}</span>
      <span>${r.accuracy} acc · ${r.events.filter((e) => e.cls === 'blunder').length} blunders${odd.has(r.id) && !r.excluded ? ' <span class="badge mistake">unusual</span>' : ''}</span></button>
      <button type="button" data-exclude="${esc(r.id)}" aria-pressed="${Boolean(r.excluded)}">${r.excluded ? 'Include' : 'Exclude'}</button></div>`).join('')}</div>
  </section>`;
}

function renderMissed() {
  const list = profile.events.filter((e) =>
    (!filters.motif || e.story.motif === filters.motif) && (!filters.phase || e.phase === filters.phase)
    && (filters.cls === 'all' || (filters.cls === 'blunder' ? e.cls === 'blunder' : e.cls !== 'inaccuracy')));
  $('#missed').innerHTML = list.length ? list.slice(0, shown).map((e) => `<button type="button" class="missed" data-game="${esc(e.gameId)}" data-ply="${e.ply}">
      <span class="badge ${e.cls}">${CLASSES[e.cls]}</span>
      <span><b>${esc(e.story.title)}</b><br><span class="muted">${esc(e.label)} · move ${Math.floor(e.ply / 2) + 1} · you played ${esc(e.story.playedSan)}, best was ${esc(e.story.bestSan)} · ${e.phase}</span></span></button>`).join('')
    + (list.length > shown ? `<button type="button" id="more">Show more (${list.length - shown} left)</button>` : '') : '<p class="muted">Nothing matches these filters.</p>';
}

function onReportClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.exclude !== undefined) {
    const r = store.games.find((g) => g.id === t.dataset.exclude);
    r.excluded = !r.excluded; save();
    const y = window.scrollY;
    refresh();
    return window.scrollTo(0, y);
  }
  if (t.dataset.game !== undefined) return openReview(t.dataset.game, Number(t.dataset.ply));
  if (t.id === 'more') { shown += 25; return renderMissed(); }
  if (t.dataset.showMotif) { filters = { motif: t.dataset.showMotif, phase: '', cls: '' }; shown = 25; renderReport(); return $('#missedPanel').scrollIntoView({ behavior: 'smooth' }); }
  if (t.dataset.train) return go('train', { tab: t.dataset.train, motif: t.dataset.motif, phase: t.dataset.phase });
  if (t.id === 'clearGames' && confirm('Remove all analysed games saved in this browser?')) { store.games = []; store.solved = {}; save(); review = null; $('#reviewBox').hidden = true; refresh(); }
}

// ---- Review of one game -------------------------------------------------
function openReview(gameId, ply) {
  const record = store.games.find((r) => r.id === gameId);
  if (!record) return;
  const chess = new Chess();
  const fens = [chess.fen()], moves = [];
  for (const san of record.sans) { moves.push(chess.move(san)); fens.push(chess.fen()); }
  review = { record, fens, moves, ply, variation: null };
  $('#reviewBox').hidden = false;
  board.set({ orientation: record.color });
  $('#rTitle').textContent = `${record.white} – ${record.black}`;
  $('#rMeta').innerHTML = `${resultWord[record.result]} as ${record.color === 'w' ? 'White' : 'Black'} · ${esc(record.opening)} · ${esc(record.date)}${record.url ? ` · <a href="${esc(record.url)}" target="_blank" rel="noopener">Open on Chess.com</a>` : ''}`;
  renderReview();
  $('#reviewBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function graph() {
  const { record, ply } = review;
  const n = record.evals.length, w = 600, h = 90;
  const x = (i) => (i / Math.max(1, n - 1)) * w;
  const y = (v) => h - (winChance(pov(v, record.color)) / 100) * h;
  const pts = record.evals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = record.events.filter((e) => e.cls !== 'inaccuracy').map((e) => `<circle cx="${x(e.ply + 1).toFixed(1)}" cy="${y(record.evals[e.ply + 1]).toFixed(1)}" r="4" class="${e.cls}"/>`).join('');
  return `<svg class="graph" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Your winning chances through the game">
    <polygon points="0,${h} ${pts} ${w},${h}"/><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}"/>${dots}
    <line class="cursor" x1="${x(ply)}" x2="${x(ply)}" y1="0" y2="${h}"/></svg>`;
}

function renderReview() {
  const { record, fens, moves, ply, variation } = review;
  const event = record.events.find((e) => e.ply === ply);
  const story = event ? explain(event) : null;
  if (variation) {
    const chess = new Chess(variation.fen);
    let last = null;
    for (const uci of variation.ucis.slice(0, variation.at)) last = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    board.set({ fen: chess.fen(), lastMove: last ? [last.from, last.to] : null, arrows: [] });
  } else {
    const last = moves[ply - 1];
    board.set({ fen: fens[ply], lastMove: last ? [last.from, last.to] : null, arrows: story?.valid ? story.arrows : [] });
  }
  $('#rGraph').innerHTML = graph();
  const byPly = Object.fromEntries(record.events.map((e) => [e.ply, e.cls]));
  $('#rMoves').innerHTML = moves.map((m, i) => `${i % 2 === 0 ? `<span class="num">${i / 2 + 1}.</span>` : ''}<button type="button" data-goto="${byPly[i] ? i : i + 1}" class="${byPly[i] || ''} ${(byPly[i] ? i : i + 1) === ply && !variation ? 'on' : ''}">${esc(m.san)}</button>`).join('');
  $('#rMoves .on')?.scrollIntoView({ block: 'nearest' });
  const coach = $('#rCoach');
  const evalText = `Engine evaluation for you: ${formatScore(pov(record.evals[ply], record.color))}`;
  if (story?.valid) {
    const chips = (label, fen, ucis, key) => ucis.length ? `<p class="line"><span class="muted">${label}</span> ${lineSan(fen, ucis).map((san, i) => `<button type="button" data-var="${key}" data-at="${i + 1}" class="${variation?.key === key && variation.at === i + 1 ? 'on' : ''}">${esc(san)}</button>`).join('')}</p>` : '';
    coach.className = 'feedback bad';
    coach.innerHTML = `<p class="tag">${CLASSES[event.cls]} · move ${Math.floor(ply / 2) + 1} · you played ${esc(story.playedSan)}</p>${storyHtml(story)}
      ${chips('Better:', event.fen, story.bestUcis, 'best')}
      ${chips(`After ${story.playedSan}:`, story.afterPlayed, story.replyUcis, 'reply')}
      <p class="muted">Click a move to see it on the board. Red arrow: your move. Green arrow: the better one.</p>
      <div class="row">${variation ? '<button type="button" data-var="">Back to the game</button>' : ''}<button type="button" class="primary" data-practice="1">Practise this position</button></div>`;
  } else {
    coach.className = 'feedback';
    const next = moves[ply];
    coach.innerHTML = `<p>${ply === 0 ? 'Start of the game. ' : ''}${next ? `${next.color === record.color ? 'You' : 'Your opponent'} played ${esc(next.san)} next.` : 'End of the game.'}</p><p class="muted">${evalText}. Flagged moves are coloured in the move list; press “Next mistake” to jump between them.</p>`;
  }
}

function step(d) {
  review.variation = null;
  review.ply = Math.max(0, Math.min(review.moves.length, review.ply + d));
  renderReview();
}

function onReviewClick(e) {
  const t = e.target.closest('button');
  if (!t || !review) return;
  const { record, moves } = review;
  if (t.dataset.nav) {
    const nav = t.dataset.nav;
    if (nav === 'flip') return board.flip();
    if (nav === 'mistake') {
      const next = record.events.filter((ev) => ev.cls !== 'inaccuracy').map((ev) => ev.ply).sort((a, b) => a - b);
      review.ply = next.find((p) => p > review.ply) ?? next[0] ?? review.ply;
      review.variation = null;
      return renderReview();
    }
    return step(nav === 'start' ? -999 : nav === 'end' ? 999 : nav === 'prev' ? -1 : 1);
  }
  if (t.dataset.goto) { review.ply = Number(t.dataset.goto); review.variation = null; return renderReview(); }
  if (t.dataset.var !== undefined) {
    const event = record.events.find((ev) => ev.ply === review.ply);
    const story = explain(event);
    review.variation = !t.dataset.var ? null : t.dataset.var === 'best'
      ? { key: 'best', fen: event.fen, ucis: story.bestUcis, at: Number(t.dataset.at) }
      : { key: 'reply', fen: story.afterPlayed, ucis: story.replyUcis, at: Number(t.dataset.at) };
    return renderReview();
  }
  if (t.dataset.practice) return go('train', { tab: 'tactics', gameId: record.id, ply: review.ply });
}
