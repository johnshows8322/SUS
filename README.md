# SUS

A real-time bluffing party game for 3–8 phone players, with a host-only display. Built with Node.js, Express, Socket.IO, and a responsive browser UI.

## Run locally

Requires Node.js 20+.

```sh
npm install
npm start
```

Open `http://localhost:3000`. The host creates a room; 3–8 players join on their phones with the room code.

## Test

```sh
npm test
```

## Deploy

The repository includes a Render blueprint (`render.yaml`). Configure the Render web service to build with `npm install`, start with `npm start`, and use `/health` as the health check. Active rooms are stored in memory and reset if the server restarts.

## Gameplay

Seven rounds of bluffing trivia: players invent fake answers, vote for the truth, and try to identify the secret Decoy. The final round awards double points. Decoys are prewritten in the question bank; no live AI API key or runtime AI costs are required.