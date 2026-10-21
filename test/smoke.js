const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const questions = require('../questions.json');

const port = 31000 + (process.pid % 20000);
const url = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
const clients = [];
let logs = '';

child.stdout.on('data', chunk => { logs += chunk.toString(); });
child.stderr.on('data', chunk => { logs += chunk.toString(); });

function connectClient() {
  const socket = io(url, { transports: ['websocket'], reconnection: false, timeout: 3000 });
  clients.push(socket);
  return socket;
}
function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error('Timed out waiting for ' + event));
    }, timeout);
    const handler = (...args) => {
      clearTimeout(timer);
      resolve(...args);
    };
    socket.once(event, handler);
  });
}
function waitForState(socket, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('state', handler);
      reject(new Error('Timed out waiting for game state; recent server logs: ' + logs));
    }, timeout);
    const handler = state => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('state', handler);
      resolve(state);
    };
    socket.on('state', handler);
  });
}
async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Server exited early: ' + logs);
    try {
      const response = await fetch(url + '/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Server did not become healthy: ' + logs);
}
async function main() {
  assert.ok(questions.length >= 10, 'question bank should contain at least 10 questions');
  for (const question of questions) {
    assert.ok(question.question && question.answer && question.decoy, 'question needs question, truth, and decoy');
    assert.notEqual(question.answer.toLowerCase(), question.decoy.toLowerCase(), 'truth and decoy must differ');
  }

  await waitForServer();
  const host = connectClient();
  await waitForEvent(host, 'connect');
  const roomCreated = waitForEvent(host, 'created');
  host.emit('createRoom');
  const roomCode = await roomCreated;
  assert.match(roomCode, /^[A-Z]{4}$/);

  const players = [];
  for (let i = 0; i < 3; i++) {
    const socket = connectClient();
    await waitForEvent(socket, 'connect');
    const joined = waitForEvent(socket, 'joined');
    socket.emit('joinRoom', { code: roomCode, name: 'Tester ' + (i + 1) });
    await joined;
    players.push(socket);
  }

  const writingStates = players.map(socket => waitForState(socket, state => state.phase === 'writing'));
  host.emit('startGame');
  const states = await Promise.all(writingStates);
  const question = questions.find(item => item.question === states[0].question.question);
  assert.ok(question, 'active question must exist in question bank');

  for (let i = 0; i < players.length; i++) {
    players[i].emit('submitAnswer', 'Invented answer number ' + (i + 1));
  }

  const votingStates = players.map(socket => waitForState(socket, state => state.phase === 'voting'));
  const boards = await Promise.all(votingStates);
  const truthId = boards[0].answers.find(answer => answer.text === question.answer)?.id;
  const decoyId = boards[0].answers.find(answer => answer.text === question.decoy)?.id;
  assert.ok(truthId, 'truth answer should appear on the board');
  assert.ok(decoyId, 'decoy answer should appear on the board');

  const revealStates = players.map(socket => waitForState(socket, state => state.phase === 'reveal'));
  for (const socket of players) socket.emit('vote', { answerId: truthId, decoyId });
  const reveals = await Promise.all(revealStates);
  for (const state of reveals) {
    assert.equal(state.me.score, 1250, 'correct truth vote and Decoy flag should score 1250');
    assert.ok(state.answers.some(answer => answer.truth), 'reveal should identify the truth');
    assert.ok(state.answers.some(answer => answer.decoy), 'reveal should identify the Decoy');
  }

  console.log('SUS integration test passed: room creation, 3-player join, answer submission, voting, Decoy flagging, reveal, and scoring.');
}
main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const socket of clients) socket.disconnect();
    child.kill();
  });
