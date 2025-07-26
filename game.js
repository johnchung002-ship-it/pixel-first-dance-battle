/***** CONFIG *****/
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
let CANVAS_W = 480, CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 64;
let LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 140;
const NOTES_PER_BEAT = 2;
const SONG_OFFSET = 4.0; // 3...2...1...DANCE countdown
const SNIPPET_SECONDS = 30;

const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.15;
const ARROW_SPEED = 400;

const LANE_COLORS = ['#ff4d4d', '#4d94ff', '#4dff88', '#ffd24d'];
const STORAGE_KEY = 'messageBoard';
const MAX_ROWS = 50;
/******************/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const bgm = document.getElementById('bgm');

const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const accuracyEl = document.getElementById('accuracy');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const difficultySelect = document.getElementById('difficultySelect');

const scoreModal = document.getElementById('scoreModal');
const finalScoreEl = document.getElementById('finalScore');
const submitScoreBtn = document.getElementById('submitScoreBtn');
const skipSubmitBtn = document.getElementById('skipSubmitBtn');
const guestNameInput = document.getElementById('guestName');
const guestMessageInput = document.getElementById('guestMessage');

const messageBoardBody = document.querySelector('#messageBoard tbody');

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
let receptorFlash  = [0, 0, 0, 0];
let feedbackText   = '';
let feedbackColor  = '#fff';
let feedbackTime   = 0;

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

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

/* ---------------- Core Game ---------------- */

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
  if (bestDiff <= HIT_WINDOW_PERFECT) applyHit(best, 'perfect');
  else if (bestDiff <= HIT_WINDOW_GOOD) applyHit(best, 'good');
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
  hits++;
  feedbackTime = performance.now();
  laneHighlights[arrow.lane] = performance.now();
  receptorFlash[arrow.lane]  = performance.now();
  updateHUD();
}

function missOldArrows() {
  const t = getTime();
  for (const a of active) {
    if (!a.judged && t - a.t > HIT_WINDOW_GOOD) {
      a.judged = true;
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

/* ---------------- Drawing ---------------- */

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const t = getTime();
  const now = performance.now();

  // Draw lanes
  for (let i = 0; i < LANES.length; i++) {
    const x = i * LANE_WIDTH;
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, 0, LANE_WIDTH, CANVAS_H);
  }

  // Draw hit line
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(0, HITLINE_Y);
  ctx.lineTo(CANVAS_W, HITLINE_Y);
  ctx.stroke();

  // Draw arrows
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

  // Countdown
  drawCountdownOverlay(t);
}

function drawCountdownOverlay(t) {
  if (t < SONG_OFFSET) {
    const remaining = Math.ceil(SONG_OFFSET - t);
    const text = remaining > 1 ? remaining : 'DANCE!';
    ctx.save();
    ctx.font = '36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 3);
    ctx.restore();
  }
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

/* ---------------- Message Board ---------------- */
function showModal() { scoreModal.classList.remove('hidden'); }
function hideModal() { scoreModal.classList.add('hidden'); }

function getBoard() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveBoard(board) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
}

function saveScore() {
  const name = guestNameInput.value.trim();
  const message = (guestMessageInput?.value || '').trim();

  const board = getBoard();
  board.push({
    name: name || 'Guest',
    score,
    message,
    ts: Date.now()
  });

  board.sort((a, b) => b.score - a.score || a.ts - b.ts);
  saveBoard(board.slice(0, MAX_ROWS));

  displayBoard();
  hideModal();
}

function displayBoard() {
  const board = getBoard();
  messageBoardBody.innerHTML = board
    .map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(e.name)}</td>
        <td>${e.score}</td>
        <td>${escapeHTML(e.message || '')}</td>
      </tr>
    `)
    .join('');
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

displayBoard();
