// Thin promise wrapper around a Stockfish UCI worker. One search runs at a time;
// calls are queued. Scores are reported from the side to move, as UCI does.
export function parseInfo(line) {
  if (!line.startsWith('info ') || !/\bscore (cp|mate) /.test(line) || !/ pv /.test(line)) return null;
  if (/(lowerbound|upperbound)/.test(line)) return null;
  const score = line.match(/score (cp|mate) (-?\d+)/);
  const depth = line.match(/\bdepth (\d+)/);
  const multipv = line.match(/\bmultipv (\d+)/);
  return {
    [score[1]]: Number(score[2]),
    depth: depth ? Number(depth[1]) : 0,
    multipv: multipv ? Number(multipv[1]) : 1,
    pv: line.split(' pv ')[1].trim().split(/\s+/),
  };
}

export class Engine {
  constructor(url) {
    this.url = url;
    this.queue = Promise.resolve();
    this.ready = null;
    this.listener = null;
    this.fail = null;
  }

  start() {
    if (!this.ready) {
      this.ready = (async () => {
        this.worker = new Worker(this.url);
        this.worker.onmessage = (e) => this.listener?.(String(e.data));
        this.worker.onerror = () => this.fail?.(Error('The chess engine could not load. Reload the page and try again.'));
        await this.until('uci', (s) => s === 'uciok');
        this.worker.postMessage('setoption name Hash value 32');
        await this.until('isready', (s) => s === 'readyok');
      })().catch((e) => { this.ready = null; throw e; });
    }
    return this.ready;
  }

  until(command, done, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer);
        this.listener = null;
        this.fail = null;
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(Error('The engine took too long to answer.')), timeout);
      this.fail = (e) => finish(e);
      this.listener = (line) => { if (done(line)) finish(null, line); };
      this.worker.postMessage(command);
    });
  }

  run(job) {
    const result = this.queue.then(() => this.start()).then(job);
    this.queue = result.catch(() => {});
    return result;
  }

  // Returns the principal variations, best first: [{cp|mate, depth, pv:[uci]}]
  analyse(fen, { depth = 12, multipv = 1, movetime } = {}) {
    return this.run(async () => {
      const lines = new Map();
      this.worker.postMessage('setoption name UCI_LimitStrength value false');
      this.worker.postMessage('setoption name MultiPV value ' + multipv);
      this.worker.postMessage('position fen ' + fen);
      await this.until(movetime ? `go movetime ${movetime}` : `go depth ${depth}`, (line) => {
        const info = parseInfo(line);
        if (info) lines.set(info.multipv, info);
        return line.startsWith('bestmove');
      });
      return [...lines.keys()].sort((a, b) => a - b).map((k) => lines.get(k));
    });
  }

  // A move at reduced playing strength (elo 1320-3190), or full strength when elo is falsy.
  bestMove(fen, { elo, movetime = 400 } = {}) {
    return this.run(async () => {
      this.worker.postMessage('setoption name MultiPV value 1');
      this.worker.postMessage('setoption name UCI_LimitStrength value ' + (elo ? 'true' : 'false'));
      if (elo) this.worker.postMessage('setoption name UCI_Elo value ' + elo);
      this.worker.postMessage('position fen ' + fen);
      const line = await this.until(`go movetime ${movetime}`, (s) => s.startsWith('bestmove'));
      this.worker.postMessage('setoption name UCI_LimitStrength value false');
      const move = line.split(' ')[1];
      return move && move !== '(none)' ? move : null;
    });
  }

  stop() { this.worker?.postMessage('stop'); }
}
