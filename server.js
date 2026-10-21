const express=require('express');
const http=require('http');
const crypto=require('crypto');
const {Server}=require('socket.io');
const QUESTIONS=require('./questions.json');
const app=express(),server=http.createServer(app),io=new Server(server);
const rooms=new Map(),PORT=process.env.PORT||3000;
app.use(express.static('public'));
app.get('/health',(_q,s)=>s.json({ok:true,rooms:rooms.size}));
function token(){return crypto.randomBytes(8).toString('hex')}
function code(){let c;do{c=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('')}while(rooms.has(c));return c}
function pub(r,who){return {code:r.code,phase:r.phase,round:r.round,players:r.players.map(p=>({id:p.id,name:p.name,score:p.score,connected:p.connected})),question:r.q?{category:r.q.category,question:r.q.question}:null,answers:['voting','reveal','final'].includes(r.phase)?r.board.map(a=>({id:a.id,text:a.text,truth:['reveal','final'].includes(r.phase)?a.truth:undefined,decoy:['reveal','final'].includes(r.phase)?a.decoy:undefined,authors:['reveal','final'].includes(r.phase)?a.authors.map(id=>r.players.find(p=>p.id===id)?.name||'Player'):undefined,own:a.authors.includes(who)})):[],me:r.players.find(p=>p.id===who)||null,finalScores:r.finalScores}}
function send(r){if(r.host)io.to(r.host).emit('state',pub(r,null));for(const p of r.players)if(p.socket)io.to(p.socket).emit('state',pub(r,p.id))}
function timer(r,ms,fn){clearTimeout(r.timer);r.timer=setTimeout(fn,ms)}
function begin(r){if(r.round>=7){r.phase='final';r.finalScores=[...r.players].sort((a,b)=>b.score-a.score).map((p,i)=>({...p,rank:i+1}));send(r);return}r.round++;r.q=QUESTIONS[(Math.random()*QUESTIONS.length)|0];r.answers={};r.votes={};r.flags={};r.phase='writing';send(r);timer(r,45000,()=>board(r))}
function board(r){const map=new Map();for(const [id,text] of Object.entries(r.answers)){const k=text.trim().toLowerCase();if(!map.has(k))map.set(k,{id:token(),text,authors:[],truth:false,decoy:false});map.get(k).authors.push(id)}r.board=[...map.values(),{id:token(),text:r.q.answer,authors:[],truth:true,decoy:false},{id:token(),text:r.q.decoy,authors:[],truth:false,decoy:true}].sort(()=>Math.random()-.5);r.phase='voting';send(r);timer(r,30000,()=>reveal(r))}
function reveal(r){for(const [pid,aid] of Object.entries(r.votes)){const a=r.board.find(x=>x.id===aid),p=r.players.find(x=>x.id===pid);if(!a||!p)continue;if(a.truth)p.score+=r.round===7?2000:1000;if(!a.truth&&!a.decoy&&!a.authors.includes(pid))a.authors.forEach(id=>{const author=r.players.find(x=>x.id===id);if(author)author.score+=r.round===7?1000:500})}for(const [pid,aid] of Object.entries(r.flags)){if(r.board.find(a=>a.id===aid)?.decoy){const p=r.players.find(x=>x.id===pid);if(p)p.score+=r.round===7?500:250}}r.phase='reveal';send(r);timer(r,7000,()=>begin(r))}
io.on('connection',s=>{
s.on('createRoom',()=>{const c=code(),r={code:c,host:s.id,players:[],phase:'lobby',round:0};rooms.set(c,r);s.data.host=c;s.emit('created',c);send(r)});
s.on('joinRoom',({code:c,name})=>{const r=rooms.get(String(c||'').toUpperCase()),n=String(name||'').trim().slice(0,18);if(!r)return s.emit('errorMessage','Room code not found.');if(!n)return s.emit('errorMessage','Enter your name.');if(r.players.length>=8)return s.emit('errorMessage','Room is full.');if(r.players.some(p=>p.name.toLowerCase()===n.toLowerCase()))return s.emit('errorMessage','That name is already taken.');const p={id:token(),name:n,score:0,socket:s.id,connected:true};r.players.push(p);s.data.room=r.code;s.data.player=p.id;s.emit('joined',p.id);send(r)});
s.on('startGame',()=>{const r=rooms.get(s.data.host);if(r&&r.host===s.id&&r.phase==='lobby'&&r.players.length>=3)begin(r)});
s.on('submitAnswer',text=>{const r=rooms.get(s.data.room);if(!r||r.phase!=='writing'||!r.players.some(p=>p.id===s.data.player))return;const a=String(text||'').trim().slice(0,55);if(!a)return;if(a.toLowerCase()===r.q.answer.toLowerCase())return s.emit('errorMessage','That is the truth! Make up a fake.');r.answers[s.data.player]=a;s.emit('notice','Answer submitted!');send(r);if(r.players.every(p=>r.answers[p.id]))board(r)});
s.on('vote',({answerId,decoyId})=>{const r=rooms.get(s.data.room);if(!r||r.phase!=='voting')return;const a=r.board.find(x=>x.id===answerId);if(!a||a.authors.includes(s.data.player))return;r.votes[s.data.player]=answerId;if(decoyId)r.flags[s.data.player]=decoyId;s.emit('notice','Vote locked in.');send(r);if(r.players.every(p=>r.votes[p.id]))reveal(r)});
s.on('disconnect',()=>{const r=rooms.get(s.data.room);if(r){const p=r.players.find(p=>p.id===s.data.player);if(p){p.connected=false;send(r)}}});
});
server.listen(PORT,()=>console.log('SUS listening on '+PORT));
