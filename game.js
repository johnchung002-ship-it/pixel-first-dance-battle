alert("game.js is loaded!");

const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const CANVAS_W = 480, CANVAS_H = 640;
const HITLINE_Y = 520, ARROW_SIZE = 48, LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 100;
const NOTES_PER_BEAT = 2;
const BARS = 16;
const SONG_OFFSET = 0.5;
const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.15;
const ARROW_SPEED = 400;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const bgm = document.getElementById('bgm');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const accuracyEl = document.getElementById('accuracy');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const scoreModal = document.getElementById('scoreModal');
const finalScoreEl = document.getElementById('finalScore');
const submitScoreBtn = document.getElementById('submitScoreBtn');
const skipSubmitBtn = document.getElementById('skipSubmitBtn');
const initialsInput = document.getElementById('initials');
const leaderboardEl = document.getElementById('leaderboard');

let playing = false, startTime = 0, arrows = [], active = [];
let score = 0, hits = 0, totalNotes = 0, combo = 0, raf = null;

function resetState() {
  score = hits = combo = 0;
  updateHUD();
  arrows = buildPattern();
  active = arrows.map(a => ({ ...a, judged: false, result: null }));
}

function startGame() {
  resetState();
  playing = true;
  retryBtn.classList.add('hidden');
  startBtn.classList.add('hidden');
  hideModal();

  startTime = performance.now() / 1000;
  if (bgm && bgm.src) {
    bgm.currentTime = 0;
    bgm.play().catch(() => console.warn("Autoplay blocked"));
  }
  loop();
}

function endGame() {
  playing = false;
  cancelAnimationFrame(raf);
  if (bgm) bgm.pause();
  finalScoreEl.textContent = score;
  retryBtn.classList.remove('hidden');
  showModal();
}

function buildPattern() {
  const pattern = [];
  const beat = 60 / BPM;
  const noteStep = beat / NOTES_PER_BEAT;
  let time = SONG_OFFSET;
  const totalSteps = BARS * 4 * NOTES_PER_BEAT;

  for (let i = 0; i < totalSteps; i++, time += noteStep) {
    if (Math.random() < 0.7) pattern.push({ lane: Math.floor(Math.random() * LANES.length), t: time });
  }
  totalNotes = pattern.length;
  return pattern;
}

function getTime() { return (performance.now() / 1000) - startTime; }

function judgeHit(key) {
  const lane = LANES.indexOf(key);
  if (lane === -1) return;

  const t = getTime();
  let best = null, bestDiff = Infinity;
  for (const a of active) {
    if (a.judged || a.lane !== lane) continue;
    const diff = Math.abs(a.t - t);
    if (diff < bestDiff) { best = a; bestDiff = diff; }
  }
  if (!best) return;

  if (bestDiff <= HIT_WINDOW_PERFECT) applyHit(best, 'perfect');
  else if (bestDiff <= HIT_WINDOW_GOOD) applyHit(best, 'good');
}

function applyHit(arrow, result) {
  arrow.judged = true;
  score += (result === 'perfect') ? 300 : 100;
  combo++; hits++;
  updateHUD();
}

function missOldArrows() {
  const t = getTime();
  for (const a of active) {
    if (!a.judged && t - a.t > HIT_WINDOW_GOOD) {
      a.judged = true; combo = 0;
    }
  }
}

function updateHUD() {
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  const acc = totalNotes ? Math.round((hits / totalNotes) * 100) : 100;
  accuracyEl.textContent = `${acc}%`;
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  for (let i = 0; i < LANES.length; i++) {
    const x = i * LANE_WIDTH;
    ctx.strokeStyle = '#333'; ctx.strokeRect(x, 0, LANE_WIDTH, CANVAS_H);
    ctx.fillStyle = '#555'; ctx.font = '16px monospace';
    ctx.fillText(LANES[i].replace('Arrow', ''), x + LANE_WIDTH / 2 - 20, 24);
  }
  ctx.strokeStyle = '#888'; ctx.beginPath();
  ctx.moveTo(0, HITLINE_Y); ctx.lineTo(CANVAS_W, HITLINE_Y); ctx.stroke();

  const t = getTime();
  for (const a of active) {
    if (a.judged) continue;
    const y = HITLINE_Y - (a.t - t) * ARROW_SPEED;
    if (y < -ARROW_SIZE || y > CANVAS_H + ARROW_SIZE) continue;
    const x = a.lane * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;
    drawArrowSprite(ctx, x, y, ARROW_SIZE, a.lane);
  }
}

function drawArrowSprite(ctx, x, y, size, lane) {
  ctx.save(); ctx.translate(x + size / 2, y + size / 2);
  const directions = {0: Math.PI, 1: Math.PI/2, 2: -Math.PI/2, 3: 0};
  ctx.rotate(directions[lane]);
  ctx.fillStyle = '#00ff9d'; ctx.strokeStyle = '#006644';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size * 0.4, -size * 0.2);
  ctx.lineTo(0, -size * 0.5);
  ctx.lineTo(size * 0.4, -size * 0.2);
  ctx.lineTo(size * 0.2, -size * 0.2);
  ctx.lineTo(size * 0.2, size * 0.5);
  ctx.lineTo(-size * 0.2, size * 0.5);
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

function loop() {
  if (!playing) return;
  missOldArrows(); draw(); updateHUD();
  if (active.every(a => a.judged)) { endGame(); return; }
  raf = requestAnimationFrame(loop);
}

/* Events */
document.addEventListener('keydown', (e) => { if (playing) judgeHit(e.key); });
startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);
submitScoreBtn.addEventListener('click', saveScore);
skipSubmitBtn.addEventListener('click', hideModal);

function showModal() { scoreModal.classList.remove('hidden'); }
function hideModal() { scoreModal.classList.add('hidden'); }
function saveScore() {
  const initials = initialsInput.value.toUpperCase().trim();
  const leaderboard = JSON.parse(localStorage.getItem('leaderboard') || '[]');
  if (initials) leaderboard.push({ initials, score });
  leaderboard.sort((a, b) => b.score - a.score);
  localStorage.setItem('leaderboard', JSON.stringify(leaderboard.slice(0, 10)));
  displayLeaderboard(leaderboard);
  hideModal();
}
function displayLeaderboard(data) {
  leaderboardEl.innerHTML = data.map(e => `<li>${e.initials}: ${e.score}</li>`).join('');
}
displayLeaderboard(JSON.parse(localStorage.getItem('leaderboard') || '[]'));
