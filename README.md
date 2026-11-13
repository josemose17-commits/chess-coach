# Play Like the Greats

A browser app that reviews your Chess.com games, explains what went wrong, and lets you train it.

- **My games** – enter a Chess.com username; recent games are fetched from the public Chess.com API and checked move by move with Stockfish 18. The report ranks your recurring weaknesses (hanging pieces, missed tactics, opening principles, time trouble, failing to convert…), shows mistakes per phase and results per opening, and lists every missed move with a plain-language reason. Each one opens on a board with your move, the better move and both continuations. PGN paste is also supported.
- **Train** – an opening trainer (28 lines with ideas; drill against book replies, optional surprise sidelines, then play on against the engine), tactics from your own mistakes, themed Lichess puzzles, middlegame sparring from opening tabiyas, 11 endgame lessons played against the engine, and "any position" from a FEN. Every move you make is graded and explained.
- **Masters** – 12 annotated classics (Morphy, Anderssen, Rubinstein, Capablanca, Tal, Fischer, Kasparov, Carlsen…). Step through them, ask the engine about any move, or play "guess the move" and get scored.

## Run

Node 22+.

```bash
npm ci
npm test
npm run build
npm run dev
```

Open http://localhost:3000 (the page must be served, not opened as a file). `dist/` is the complete static site.

## How it works

- `src/analysis.js` – PGN parsing, move grading (loss of winning chances: 5% inaccuracy, 10% mistake, 20% blunder), weakness profile.
- `src/coach.js` – turns an engine comparison into a reason by checking the board: mates, hanging pieces, forks, pins, skewers, discovered attacks, opening principles, king safety, endgame technique. It only states what the position shows.
- `src/session.js`, `src/views/` – the trainer and the three screens. `src/board.js` – the board. `src/data/` – openings, endgames, master games.
- Tests replay every opening line and master game for legality and check game results and endgame goals against the real engine.

Analysis runs entirely in the browser; analysed games are saved in `localStorage` on the device. Engine verdicts are depth-limited (the lite single-threaded Stockfish build), so treat close calls as guidance rather than proof.

## Deployment

`.github/workflows/chess.yml` tests and builds on pull requests, and deploys `dist/` to GitHub Pages on pushes to the branch named in the workflow.

## Credits

- [chess.js](https://github.com/jhlywa/chess.js) 1.4.0 (BSD-2-Clause)
- [Stockfish.js](https://github.com/nmrugg/stockfish.js/tree/v18.0.8) 18.0.8 (GPL-3.0), shipped unmodified as a separate worker with its licence in `dist/engine/`
- Piece artwork by Cburnett and Rfc1394 (CC BY-SA 3.0) via [cm-chessboard](https://github.com/shaack/cm-chessboard)
- Puzzles from the [Lichess](https://lichess.org/training) puzzle API

The original Python playlist tool is kept in `legacy/`.
