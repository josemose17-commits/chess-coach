import { $, $$, route, go } from './core.js';
import { init as initGames } from './views/games.js';
import { init as initTrain } from './views/train.js';
import { init as initMasters } from './views/masters.js';

const views = { games: initGames, train: initTrain, masters: initMasters };
const ready = new Set();

function show(name) {
  if (!views[name]) name = 'games';
  for (const section of $$('main > [data-view]')) section.hidden = section.dataset.view !== name;
  for (const link of $$('nav [data-go]')) link.setAttribute('aria-current', link.dataset.go === name ? 'page' : 'false');
  if (!ready.has(name)) { ready.add(name); views[name]($(`main > [data-view="${name}"]`)); }
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  window.scrollTo(0, 0);
}

route('view', show);
// Training can be opened from the report ("Train this"), so make sure the view exists first.
route('train', (arg) => { show('train'); go('train-open', arg); });
for (const link of $$('nav [data-go]')) link.onclick = (e) => { e.preventDefault(); show(link.dataset.go); };
show(location.hash.slice(1) || 'games');
