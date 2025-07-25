/***** CONFIG *****/
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const CANVAS_W = 480, CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 70; // Slightly larger to match sprite proportions
const LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 140;
const NOTES_PER_BEAT = 2;
const SONG_OFFSET = 0.3;
const SNIPPET_SECONDS = 30;

const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.15;

const ARROW_SPEED = 400;
const BEAT_INTERVAL = 60 / BPM;
/******************/

// Prevent arrow keys from scrolling
window.addEventListener(
  "keydown",
  function (e) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
  },
  { passive: false }
);

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

let playing = false;
let startTime = 0;
let arrows = [];
let active = [];
let score = 0;
let hits = 0;
let totalNotes = 0;
let combo = 0;
let raf = null;

let laneHighlights = [0, 0, 0, 0];
let receptorFlash = [0, 0, 0, 0];
let feedbackText = '';
let feedbackColor = '#fff';
let feedbackTime = 0;
let comboAnimStart = 0;

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

/* --- Load Arrow Sprites --- */
const arrowSprites = {
  left: new Image(),
  down: new Image(),
  up: new Image(),
  right: new Image(),
};

arrowSprites.left.src = "arrow_left.png";
arrowSprites.down.src = "arrow_down.png";
arrowSprites.up.src = "arrow_up.png";
arrowSprites.right.src = "arrow_right.png";

/* ---------------- Core ---------------- */

function resetState() {
  score = 0;
  hits = 0;
  combo = 0;
  updateHUD();
  arrows = buildPatternForSnippet();
  active = arrows.map(a => ({ ...a, judged: false, result: null }));
  totalNotes = arrows.length;
  laneHighlights = [0, 0, 0, 0];
  receptorFlash = [0, 0, 0, 0];
}

function startGame() {
  resetState();
  playing = true;
  retryBtn.classList.add('hidden');
  startBtn.classList.add('hidden');
  hideModal();
  startTime = performance.now() / 1000;
  if (bgm) {
    bgm.currentTime = 0;
    bgm.play().catch(err => console.warn('Music blocked:', err));
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

function buildPatternForSnippet() {
  const pattern = [];
  const beat = 60 / BPM;
  const noteStep = beat / NOTES_PER_BEAT;
  const endTime = SONG_OFFSET + SNIPPET_SECONDS;
  for (let t = SONG_OFFSET; t <= endTime; t += noteStep) {
    if (Math.random() < 0.75) {
      pattern.push({ lane: Math.floor(Math.random() * LANES.length), t });
    }
  }
  return pattern;
}

function getTime() {
  return (performance.now() / 1000) - startTime;
}

function judgeHit(key) {
  const lane = LANES.indexOf(key);
  if (lane === -1) return;

  const t = getTime();
  let best = null;
  let bestDiff = Infinity;

  for (const a of active) {
    if (a.judged || a.lane !== lane) continue;
    const diff = Math.abs(a.t - t);
    if (diff < bestDiff) {
      best = a;
      bestDiff = diff;
    }
  }

  if (!best) return;

  if (bestDiff <= HIT_WINDOW_PERFECT) {
    applyHit(best, 'perfect');
  } else if (bestDiff <= HIT_WINDOW_GOOD) {
    applyHit(best, 'good');
  }
}

function applyHit(arrow, result) {
  arrow.judged = true;
  if (result === 'perfect') {
    score += 300;
    feedbackText = 'PERFECT!';
    feedbackColor = '#4dff88';
  } else {
    score += 100;
    feedbackText = 'GOOD!';
    feedbackColor = '#ffd24d';
  }
  combo++;
  comboAnimStart = performance.now();
  hits++;
  feedbackTime = performance.now();
  laneHighlights[arrow.lane] = performance.now();
  receptorFlash[arrow.lane] = performance.now();
  updateHUD();
}

function missOldArrows() {
  const t = getTime();
  for (const a of active) {
    if (!a.judged && t - a.t > HIT_WINDOW_GOOD) {
      a.judged = true;
      a.result = 'miss';
      combo = 0;
      feedbackText = 'MISS!';
      feedbackColor = '#ff4d4d';
      feedbackTime = performance.now();
    }
  }
}

function updateHUD() {
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  const acc = totalNotes ? Math.round((hits / totalNotes) * 100) : 100;
  accuracyEl.textContent = `${acc}%`;
}

/* ---------------- Draw ---------------- */

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const now = performance.now();
  for (let i = 0; i < LANES.length; i++) {
    const x = i * LANE_WIDTH;
    if (now - laneHighlights[i] < 150) {
      ctx.fillStyle = 'rgba(0,255,150,0.2)';
      ctx.fillRect(x, 0, LANE_WIDTH, CANVAS_H);
    }
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, 0, LANE_WIDTH, CANVAS_H);

    ctx.fillStyle = '#555';
    ctx.font = '16px "Press Start 2P", monospace';
    const label = LANES[i].replace('Arrow', '');
    ctx.fillText(label, x + (LANE_WIDTH / 2) - ctx.measureText(label).width / 2, 24);
  }

  // Hit line
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(0, HITLINE_Y);
  ctx.lineTo(CANVAS_W, HITLINE_Y);
  ctx.stroke();

  // Receptors
  for (let i = 0; i < LANES.length; i++) {
    drawReceptor(ctx, i);
  }

  // Falling arrows
  const t = getTime();
  for (const a of active) {
    if (a.judged) continue;
    const y = HITLINE_Y - (a.t - t) * ARROW_SPEED;
    if (y < -ARROW_SIZE || y > CANVAS_H + ARROW_SIZE) continue;
    const x = a.lane * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;
    drawArrowSprite(ctx, x, y, ARROW_SIZE, a.lane);
  }

  // Feedback text
  if (feedbackText && now - feedbackTime < 300) {
    ctx.fillStyle = feedbackColor;
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(feedbackText, CANVAS_W / 2, HITLINE_Y - 40);
  }

  // Combo text with beat pulse
  if (combo > 0) {
    const beatTime = ((getTime() - SONG_OFFSET) % BEAT_INTERVAL) / BEAT_INTERVAL;
    const beatScale = 1 + 0.08 * Math.sin(beatTime * Math.PI * 2);
    const beatGlow = 12 + 8 * (1 + Math.sin(beatTime * Math.PI * 2)) / 2;

    ctx.save();
    ctx.translate(CANVAS_W / 2, HITLINE_Y + 60);
    ctx.scale(beatScale, beatScale);
    ctx.globalAlpha = 1;

    ctx.shadowColor = '#00ff9d';
    ctx.shadowBlur = beatGlow;

    ctx.fillStyle = '#00ff9d';
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${combo} Combo`, 0, 0);

    ctx.restore();
  }

  ctx.textAlign = 'left';
}

function drawReceptor(ctx, lane) {
  const flashDuration = 150;
  const age = performance.now() - receptorFlash[lane];
  const alpha = age < flashDuration ? 1 : 0.85;

  const x = lane * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;
  const y = HITLINE_Y - ARROW_SIZE / 2;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Beat pulse effect
  const beatTime = ((getTime() - SONG_OFFSET) % BEAT_INTERVAL) / BEAT_INTERVAL;
  const pulseScale = 1 + 0.05 * Math.sin(beatTime * Math.PI * 2);
  ctx.translate(x + ARROW_SIZE / 2, y + ARROW_SIZE / 2);
  ctx.scale(pulseScale, pulseScale);
  ctx.translate(-ARROW_SIZE / 2, -ARROW_SIZE / 2);

  drawArrowSprite(ctx, 0, 0, ARROW_SIZE, lane);
  ctx.restore();
}

function drawArrowSprite(ctx, x, y, size, lane) {
  const names = ['left', 'down', 'up', 'right'];
  const img = arrowSprites[names[lane]];
  ctx.drawImage(img, x, y, size, size);
}

/* ---------------- Loop ---------------- */
function loop() {
  if (!playing) return;
  missOldArrows();
  draw();
  updateHUD();
  const t = getTime();
  const endTime = SONG_OFFSET + SNIPPET_SECONDS + 0.5;
  if (active.every(a => a.judged) || t > endTime) {
    endGame();
    return;
  }
  raf = requestAnimationFrame(loop);
}

/* ---------------- Leaderboard ---------------- */
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

/* ---------------- Events ---------------- */
document.addEventListener('keydown', (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    if (playing) judgeHit(e.key);
  }
});

startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);
submitScoreBtn.addEventListener('click', saveScore);
skipSubmitBtn.addEventListener('click', hideModal);
