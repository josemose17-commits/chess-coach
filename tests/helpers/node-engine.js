// Runs the same Stockfish build under Node so tests can exercise the real engine.
import { spawn } from 'node:child_process';
import { parseInfo } from '../../src/engine.js';

export class NodeEngine {
  constructor() {
    this.proc = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-18-lite-single.js']);
    this.buffer = '';
    this.listener = null;
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop();
      for (const line of lines) this.listener?.(line.trim());
    });
    this.ready = this.until('uci', (s) => s === 'uciok');
  }
  until(command, done) {
    return new Promise((resolve) => {
      this.listener = (line) => { if (done(line)) { this.listener = null; resolve(line); } };
      this.proc.stdin.write(command + '\n');
    });
  }
  async analyse(fen, { depth = 12, multipv = 1 } = {}) {
    await this.ready;
    const lines = new Map();
    this.proc.stdin.write(`setoption name MultiPV value ${multipv}\nposition fen ${fen}\n`);
    await this.until('go depth ' + depth, (line) => {
      const info = parseInfo(line);
      if (info) lines.set(info.multipv, info);
      return line.startsWith('bestmove');
    });
    return [...lines.keys()].sort((a, b) => a - b).map((k) => lines.get(k));
  }
  close() { this.proc.kill(); }
}
