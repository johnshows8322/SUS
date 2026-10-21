const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QUESTIONS = require('./questions.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function token() {
  return crypto.randomBytes(8).toString('hex');
}
function code() {
  let value;
  do {
    value = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join('');
  } while (rooms.has(value));
  return value;
}
function pub(room, who) {
  const me = room.players.find(player => player.id === who) || null;
  const showResults = ['reveal', 'final'].includes(room.phase);
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    players: room.players.map(({ id, name, score, connected }) => ({ id, name, score, connected, answered: Object.hasOwn(room.answers || {}, id), voted: Object.hasOwn(room.votes || {}, id) })),
    question: room.q ? { category: room.q.category, question: room.q.question } : null,
    answers: ['voting', 'reveal', 'final'].includes(room.phase)
      ? room.board.map(answer => ({
          id: answer.id,
          text: answer.text,
          truth: showResults ? answer.truth : undefined,
          decoy: showResults ? answer.decoy : undefined,
          authors: showResults ? answer.authors.map(id => room.players.find(p => p.id === id)?.name || 'Player') : undefined,
          own: answer.authors.includes(who)
        }))
      : [],
    me: me ? { ...me, socket: undefined, answered: Object.hasOwn(room.answers || {}, me.id), voted: Object.hasOwn(room.votes || {}, me.id) } : null,
    finalScores: room.finalScores || []
  };
}
function send(room) {
  if (room.host) io.to(room.host).emit('state', pub(room, null));
  for (const player of room.players) {
    if (player.socket) io.to(player.socket).emit('state', pub(room, player.id));
  }
}
function timer(room, ms, callback) {
  clearTimeout(room.timer);
  room.timer = setTimeout(callback, ms);
}
function nextQuestion(room) {
  if (!room.usedQuestions) room.usedQuestions = new Set();
  if (room.usedQuestions.size >= QUESTIONS.length) room.usedQuestions.clear();
  const available = QUESTIONS.map((question, index) => ({ question, index }))
    .filter(item => !room.usedQuestions.has(item.index));
  const picked = available[(Math.random() * available.length) | 0];
  room.usedQuestions.add(picked.index);
  return picked.question;
}
function begin(room) {
  if (room.round >= 7) {
    room.phase = 'final';
    room.finalScores = [...room.players]
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({ name: player.name, score: player.score, rank: index + 1 }));
    send(room);
    return;
  }
  room.round += 1;
  room.q = nextQuestion(room);
  room.answers = {};
  room.votes = {};
  room.flags = {};
  room.board = [];
  room.phase = 'writing';
  send(room);
  timer(room, 45000, () => board(room));
}
function board(room) {
  if (room.phase !== 'writing') return;
  const grouped = new Map();
  for (const [playerId, text] of Object.entries(room.answers)) {
    const key = text.trim().toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { id: token(), text, authors: [], truth: false, decoy: false });
    grouped.get(key).authors.push(playerId);
  }
  room.board = [
    ...grouped.values(),
    { id: token(), text: room.q.answer, authors: [], truth: true, decoy: false },
    { id: token(), text: room.q.decoy, authors: [], truth: false, decoy: true }
  ].sort(() => Math.random() - 0.5);
  room.phase = 'voting';
  send(room);
  timer(room, 30000, () => reveal(room));
}
function reveal(room) {
  if (room.phase !== 'voting') return;
  for (const [playerId, answerId] of Object.entries(room.votes)) {
    const answer = room.board.find(item => item.id === answerId);
    const player = room.players.find(item => item.id === playerId);
    if (!answer || !player) continue;
    if (answer.truth) player.score += room.round === 7 ? 2000 : 1000;
    if (!answer.truth && !answer.decoy && !answer.authors.includes(playerId)) {
      for (const authorId of answer.authors) {
        const author = room.players.find(item => item.id === authorId);
        if (author) author.score += room.round === 7 ? 1000 : 500;
      }
    }
  }
  for (const [playerId, answerId] of Object.entries(room.flags)) {
    if (room.board.find(answer => answer.id === answerId)?.decoy) {
      const player = room.players.find(item => item.id === playerId);
      if (player) player.score += room.round === 7 ? 500 : 250;
    }
  }
  room.phase = 'reveal';
  send(room);
  timer(room, 7000, () => begin(room));
}

io.on('connection', socket => {
  socket.on('createRoom', () => {
    const roomCode = code();
    const room = { code: roomCode, host: socket.id, players: [], phase: 'lobby', round: 0 };
    rooms.set(roomCode, room);
    socket.data.host = roomCode;
    socket.emit('created', roomCode);
    send(room);
  });

  socket.on('joinRoom', ({ code: roomCode, name } = {}) => {
    const room = rooms.get(String(roomCode || '').toUpperCase());
    const cleanName = String(name || '').trim().slice(0, 18);
    if (!room) return socket.emit('errorMessage', 'Room code not found.');
    if (room.phase !== 'lobby') return socket.emit('errorMessage', 'That game has already started.');
    if (!cleanName) return socket.emit('errorMessage', 'Enter your name.');
    if (room.players.length >= 8) return socket.emit('errorMessage', 'Room is full.');
    if (room.players.some(player => player.name.toLowerCase() === cleanName.toLowerCase())) {
      return socket.emit('errorMessage', 'That name is already taken.');
    }
    const player = { id: token(), name: cleanName, score: 0, socket: socket.id, connected: true };
    room.players.push(player);
    socket.data.room = room.code;
    socket.data.player = player.id;
    socket.emit('joined', player.id);
    send(room);
  });

  socket.on('startGame', () => {
    const room = rooms.get(socket.data.host);
    if (room && room.host === socket.id && room.phase === 'lobby' && room.players.length >= 3) begin(room);
  });

  socket.on('submitAnswer', value => {
    const room = rooms.get(socket.data.room);
    const playerId = socket.data.player;
    if (!room || room.phase !== 'writing' || !room.players.some(player => player.id === playerId)) return;
    if (Object.hasOwn(room.answers, playerId)) return socket.emit('errorMessage', 'Your fake is already locked in.');
    const answer = String(value || '').trim().slice(0, 55);
    if (!answer) return socket.emit('errorMessage', 'Enter a fake answer first.');
    if (answer.toLowerCase() === room.q.answer.toLowerCase()) {
      return socket.emit('errorMessage', 'That is the truth! Make up a fake.');
    }
    room.answers[playerId] = answer;
    socket.emit('notice', 'Fake locked in. Waiting for everyone…');
    send(room);
    if (room.players.every(player => Object.hasOwn(room.answers, player.id))) board(room);
  });

  socket.on('vote', ({ answerId, decoyId } = {}) => {
    const room = rooms.get(socket.data.room);
    const playerId = socket.data.player;
    if (!room || room.phase !== 'voting') return;
    if (Object.hasOwn(room.votes, playerId)) return socket.emit('errorMessage', 'Your vote is already locked in.');
    const answer = room.board.find(item => item.id === answerId);
    if (!answer || answer.authors.includes(playerId)) return socket.emit('errorMessage', 'Choose an answer that is not your own fake.');
    room.votes[playerId] = answerId;
    if (decoyId && decoyId !== answerId && room.board.some(item => item.id === decoyId)) {
      room.flags[playerId] = decoyId;
    }
    socket.emit('notice', 'Vote locked in. Waiting for everyone…');
    send(room);
    if (room.players.every(player => Object.hasOwn(room.votes, player.id))) reveal(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room);
    if (room) {
      const player = room.players.find(item => item.id === socket.data.player);
      if (player) {
        player.connected = false;
        send(room);
      }
    }
  });
});

server.listen(PORT, () => console.log('SUS listening on ' + PORT));
