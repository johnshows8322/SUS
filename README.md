# SUS

**Trust nobody. Tell a convincing lie. Spot the truth. Catch the Decoy.**

[![Play now](https://img.shields.io/badge/PLAY%20NOW-SUS-6d28d9?style=for-the-badge)](https://sus-xc0l.onrender.com)

**[▶ Play SUS now](https://sus-xc0l.onrender.com)**

SUS is a real-time multiplayer bluffing party game for game night. Answer weird-but-true trivia with a convincing fake, figure out which answer is real, and catch the secret Decoy before it catches you.

## Features

- **Seven rounds of bluffing trivia:** every round mixes the truth with player fakes and a secret Decoy; the seventh and final round is worth double points.
- **Phone-friendly multiplayer:** 3–8 players join with a four-letter room code. No installs or logins.
- **Live in-room chat:** message the room, pick emojis, and fire off floating quick reactions.
- **The host can play too:** join on a phone and claim the 👑 host badge while the host screen runs the room.
- **Bot players with personalities:** fill empty seats or play solo with a human and bots.
- **Automatic reconnect:** refresh a phone and reconnect to your player when possible.
- **Built-in How to Play:** rules and scoring are available in the game.
- **147-question bank:** weird-but-true trivia across 10 categories.
- **A hidden chat layer:** the bots react to your messages, remember grudges, and sometimes call back your own words.

## Meet the bots

- **Pixel** — sharp, observant, and happy to cross-examine your confidence.
- **Goober** — sloppy, chaotic, and never more than one typo from a theory.
- **Captain Certain** — overconfident enough to treat a guess like a peer-reviewed result.

Their chat is powered by the static, prewritten dataset in `bot-brain.json`: 127 conversation intents, 50 protected core intents with 25+ phrasings each, 729 hidden easter-egg triggers, and 13,000+ response variants. The engine in `bot-chat.js` reacts to chat, remembers grudges, and calls back your own words — with **zero AI APIs, zero keys, and zero runtime AI cost**.

The bots are hiding more than they'll ever show in one game.

## How to Play

1. **Fake:** read the trivia question and submit a believable fake answer.
2. **Vote:** once the answers are shuffled, choose the one you think is true.
3. **Flag the Decoy:** if you can spot the secretly planted Decoy, flag it.

### Scoring

- **+1,000 points** for choosing the truth.
- **+500 points** for every player fooled by your fake.
- **+250 points** for correctly flagging the Decoy.
- **Round 7 doubles the points.**

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Create a room on the host screen, then join from phones with the room code.

## Test

Run the full committed integration and acceptance suite:

```sh
npm test
```

The test suite checks the Core 50 parser and Vault dataset, spoiler safety, room-code and chat toys, unique questions and answer boards, reconnects, round progression, final standings, and Play Again. A GitHub Actions workflow runs the suite on pushes and pull requests.

## Deploy

The repository includes a Render blueprint in `render.yaml`. Configure the web service with build command `npm install`, start command `npm start`, and health check path `/health`. The live game is [sus-xc0l.onrender.com](https://sus-xc0l.onrender.com).

Active rooms are stored in memory and reset if the server restarts.

## Project structure

- `server.js` — Socket.IO game server, rooms, rounds, scoring, reconnects, and chat routing.
- `bot-chat.js` — static-data conversation parser, persona response engine, memory, and Vault behavior.
- `bot-brain.json` — prewritten intents, fragments, personalities, and hidden easter-egg content.
- `questions.json` — trivia questions, Decoys, and bot fake-answer candidates.
- `public/` — browser UI, styles, and client-side game experience.
- `test/smoke.js` — parser, Vault, and multiplayer integration acceptance checks.

## License

MIT. See [LICENSE](LICENSE).
