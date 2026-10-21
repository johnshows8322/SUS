const socket = io();
const app = document.getElementById('app');
const msg = document.getElementById('msg');
const join = document.getElementById('join');
let state = null, playerId = null, host = false, selected = null, decoy = null;

document.getElementById('create').onclick = () => { host = true; socket.emit('createRoom'); };
document.getElementById('showJoin').onclick = () => join.classList.toggle('hidden');
join.onsubmit = event => {
  event.preventDefault();
  socket.emit('joinRoom', {
    code: document.getElementById('code').value.trim().toUpperCase(),
    name: document.getElementById('name').value.trim()
  });
};

socket.on('created', roomCode => {
  app.innerHTML = '<h1>Room ready</h1><p>Players join on their phones with this code:</p><div class="code">' +
    esc(roomCode) + '</div><p>Keep this screen open as the host display.</p><div id="hoststate"></div>';
});
socket.on('joined', id => { playerId = id; msg.textContent = 'You joined! Keep this page open.'; });
socket.on('errorMessage', message => { msg.textContent = message; });
socket.on('notice', message => { msg.textContent = message; });

socket.on('state', next => {
  if (!state || next.round !== state.round || next.phase !== state.phase) {
    selected = null;
    decoy = null;
  }
  state = next;
  if (host) {
    renderHost(next);
    return;
  }
  renderPlayer(next);
});

function renderHost(s) {
  const el = document.getElementById('hoststate');
  if (!el) return;
  const playerRows = s.players.map(p =>
    '<div class="item">' + esc(p.name) + ' — ' + p.score + ' pts ' +
    (p.connected ? '' : '· disconnected') +
    (s.phase === 'writing' ? (p.answered ? ' · fake submitted' : ' · writing…') :
      s.phase === 'voting' ? (p.voted ? ' · voted' : ' · choosing…') : '') + '</div>'
  ).join('');
  el.innerHTML = '<h2>' + esc(phaseName(s.phase)) + (s.round ? ' · Round ' + s.round + '/7' : '') +
    '</h2><div class="players">' + playerRows + '</div>' +
    (s.phase === 'lobby' ? '<button id="start" ' + (s.players.length < 3 ? 'disabled' : '') +
      '>Start game (' + s.players.length + '/3 minimum)</button>' : '') +
    (s.question ? '<div class="question">' + esc(s.question.question) + '</div>' : '') +
    (s.phase === 'reveal' ? '<p>Truth: ' + esc(s.answers.find(a => a.truth)?.text || '') +
      ' · Decoy: ' + esc(s.answers.find(a => a.decoy)?.text || '') + '</p>' : '') +
    (s.phase === 'final' ? '<h2>Final scores</h2><ol>' +
      s.finalScores.map(p => '<li>' + esc(p.name) + ' — ' + p.score + '</li>').join('') + '</ol>' : '');
  const start = document.getElementById('start');
  if (start) start.onclick = () => socket.emit('startGame');
}

function renderPlayer(s) {
  if (!s.me) {
    app.innerHTML = '<h2>Waiting to join…</h2>';
    return;
  }
  let body = '<span class="pill">Room ' + esc(s.code) + ' · ' + esc(phaseName(s.phase)) +
    '</span><h2>Hello, ' + esc(s.me.name) + '!</h2><p>Score: ' + s.me.score + ' points</p>';

  if (s.phase === 'lobby') {
    body += '<p>Waiting for the host to start. Three or more players are needed.</p><div class="players">' +
      s.players.map(p => '<div class="item">' + esc(p.name) + '</div>').join('') + '</div>';
  }
  if (s.phase === 'writing') {
    body += '<p class="muted">' + esc(s.question.category) + ' · Round ' + s.round + ' of 7</p>' +
      '<section class="question-card"><div class="question-label">YOUR TRIVIA QUESTION</div><div class="question">' + esc(s.question.question) + '</div></section>' +
      (s.me.answered ? '<div class="item">✅ Your fake is locked in. Waiting for everyone…</div>' :
        '<form id="answer"><input id="fake" maxlength="55" placeholder="Invent a believable fake answer" required><button>Submit fake</button></form>');
  }
  if (s.phase === 'voting') {
    body += '<p class="muted">' + esc(s.question.category) + ' · Round ' + s.round + ' of 7</p>' +
      '<section class="question-card"><div class="question-label">SAME QUESTION — CHOOSE THE TRUE ANSWER</div><div class="question">' + esc(s.question.question) + '</div></section>' +
      '<p>Pick the real answer. Optionally flag one different answer as the Decoy.</p><div class="answers">' +
      s.answers.map(a => '<button data-vote="' + esc(a.id) + '" ' +
        ((a.own || s.me.voted) ? 'disabled' : '') + '>' + esc(a.text) +
        (a.own ? ' (your answer)' : '') + '</button>').join('') + '</div>' +
      '<p class="muted">Tap one answer for truth. Then tap a different answer if you want to flag the Decoy.</p>' +
      (s.me.voted ? '<div class="item">✅ Vote locked in. Waiting for everyone…</div>' :
        '<button id="sendvote" ' + (!selected ? 'disabled' : '') + '>Lock in vote</button>');
  }
  if (s.phase === 'reveal') {
    body += '<h2>Round reveal</h2><div class="answers">' +
      s.answers.map(a => '<div class="item">' + esc(a.text) + ' — ' +
        (a.truth ? '✅ TRUTH' : a.decoy ? '🕵️ DECOY' : 'Fake') +
        (a.authors?.length ? ' · written by ' + esc(a.authors.join(', ')) : '') + '</div>').join('') +
      '</div><p>Next round starts automatically.</p>';
  }
  if (s.phase === 'final') {
    body += '<h2>Final standings</h2><ol>' +
      s.finalScores.map(p => '<li>' + esc(p.name) + ' — ' + p.score + ' points</li>').join('') + '</ol>';
  }

  app.innerHTML = body;
  const form = document.getElementById('answer');
  if (form) form.onsubmit = event => {
    event.preventDefault();
    const input = document.getElementById('fake');
    if (!input.value.trim()) return;
    socket.emit('submitAnswer', input.value);
  };

  document.querySelectorAll('[data-vote]').forEach(button => {
    button.onclick = () => {
      if (s.me.voted || button.disabled) return;
      const id = button.dataset.vote;
      if (!selected) {
        selected = id;
      } else if (selected === id) {
        selected = null;
        if (decoy === id) decoy = null;
      } else if (decoy === id) {
        decoy = null;
      } else {
        decoy = id;
      }
      document.querySelectorAll('[data-vote]').forEach(item => {
        item.classList.toggle('selected', item.dataset.vote === selected || item.dataset.vote === decoy);
      });
      const voteButton = document.getElementById('sendvote');
      if (voteButton) voteButton.disabled = !selected;
    };
  });

  const voteButton = document.getElementById('sendvote');
  if (voteButton) voteButton.onclick = () => {
    if (!selected || s.me.voted) return;
    socket.emit('vote', { answerId: selected, decoyId: decoy && decoy !== selected ? decoy : null });
    voteButton.disabled = true;
    voteButton.textContent = 'Submitting…';
  };
}

function phaseName(phase) {
  return ({ lobby: 'Lobby', writing: 'Write a fake', voting: 'Vote for truth', reveal: 'Reveal', final: 'Game over' })[phase] || phase;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}
