/***** IMPORT FIREBASE *****/
import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/***** CONFIG *****/
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
let CANVAS_W = 480, CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 64;
let LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 140;
const NOTES_PER_BEAT = 2;
const SONG_OFFSET = 1.0;
const SNIPPET_SECONDS = 30;

let HIT_WINDOW_PERFECT = 0.08;
let HIT_WINDOW_GOOD = 0.15;
let ARROW_SPEED = 350;

const BEAT_INTERVAL = 60 / BPM;
const LANE_COLORS = ['#ff4d4d', '#4d94ff', '#4dff88', '#ffd24d'];

const MAX_ROWS = 50;
/******************/

/* Prevent arrow keys / space from scrolling the page */
window.addEventListener("keydown", function (e) {
  const isTypingElement =
    document.activeElement &&
    (document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagname === 'TEXTAREA' ||
      document.activeElement.isContentEditable);

  if (!isTypingElement &&
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
}, { passive: false });

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
let receptorFlash = [0, 0, 0, 0];
let feedbackText = '';
let feedbackColor = '#fff';
let feedbackTime = 0;
let comboAnimStart = 0;
let hitFlashes = [];

let showDanceUntil = 0;

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

/* Responsive Canvas */
function resizeCanvasIfNeeded() {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  LANE_WIDTH = CANVAS_W / LANES.length;
}
resizeCanvasIfNeeded();

/* Difficulty */
function setDifficulty(mode) {
  if (mode === 'easy') {
    ARROW_SPEED = 200;
    HIT_WINDOW_PERFECT = 0.12;
    HIT_WINDOW_GOOD = 0.22;
  } else if (mode === 'hard') {
    ARROW_SPEED = 480;
    HIT_WINDOW_PERFECT = 0.06;
    HIT_WINDOW_GOOD = 0.12;
  } else {
    ARROW_SPEED = 350;
    HIT_WINDOW_PERFECT = 0.08;
    HIT_WINDOW_GOOD = 0.15;
  }
}
setDifficulty(difficultySelect ? difficultySelect.value : 'normal');

function lockDifficultySelect() {
  if (difficultySelect) {
    difficultySelect.setAttribute('tabindex', '-1');
    difficultySelect.blur();
  }
}
function unlockDifficultySelect() {
  if (difficultySelect) difficultySelect.removeAttribute('tabindex');
}

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
  hitFlashes = [];
  feedbackText = '';
}

function startGame() {
  resetState();
  lockDifficultySelect();
  playing = true;
  retryBtn?.classList.add('hidden');
  startBtn?.classList.add('hidden');
  hideModal();

  startTime = performance.now() / 1000;
  showDanceUntil = performance.now() + 500;

  if (bgm) {
    bgm.currentTime = 0;
    bgm.play().catch(err => console.warn('Music blocked:', err));
  }
  loop();
}

function endGame() {
  playing = false;
  unlockDifficultySelect();
  cancelAnimationFrame(raf);
  if (bgm) bgm.pause();
  if (finalScoreEl) finalScoreEl.textContent = score;
  retryBtn?.classList.remove('hidden');
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
  comboAnimStart = performance.now();
  hits++;
  feedbackTime = performance.now();
  laneHighlights[arrow.lane] = performance.now();
  receptorFlash[arrow.lane] = performance.now();
  hitFlashes.push({ lane: arrow.lane, start: performance.now() });
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
  if (scoreEl) scoreEl.textContent = score;
  if (comboEl) comboEl.textContent = combo;
  const acc = totalNotes ? Math.round((hits / totalNotes) * 100) : 100;
  if (accuracyEl) accuracyEl.textContent = `${acc}%`;
}

/* ---------------- Draw ---------------- */
function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const now = performance.now();

  const beatTime = ((getTime() - SONG_OFFSET) % BEAT_INTERVAL) / BEAT_INTERVAL;
  const pulse = 0.25 + 0.15 * Math.sin(beatTime * Math.PI * 2);
  ctx.fillStyle = `rgba(255, 105, 180, ${pulse * 0.2})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

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

  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(0, HITLINE_Y);
  ctx.lineTo(CANVAS_W, HITLINE_Y);
  ctx.stroke();

  for (let i = 0; i < LANES.length; i++) drawReceptor(ctx, i);

  const t = getTime();
  for (const a of active) {
    if (a.judged) continue;
    const y = HITLINE_Y - (a.t - t) * ARROW_SPEED;
    if (y < -ARROW_SIZE || y > CANVAS_H + ARROW_SIZE) continue;
    const x = a.lane * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;
    drawArrowSprite(ctx, x, y, ARROW_SIZE, a.lane);
  }

  drawHitFlashes();

  if (feedbackText && now - feedbackTime < 300) {
    ctx.fillStyle = feedbackColor;
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(feedbackText, CANVAS_W / 2, HITLINE_Y - 40);
  }

  if (combo > 0) {
    const beatScale = 1 + 0.08 * Math.sin(beatTime * Math.PI * 2);
    const beatGlow = 12 + 8 * (1 + Math.sin(beatTime * Math.PI * 2)) / 2;
    ctx.save();
    ctx.translate(CANVAS_W / 2, HITLINE_Y + 60);
    ctx.scale(beatScale, beatScale);
    ctx.shadowColor = '#00ff9d';
    ctx.shadowBlur = beatGlow;
    ctx.fillStyle = '#00ff9d';
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${combo} Combo`, 0, 0);
    ctx.restore();
  }

  drawCountdownOverlay(t, now);
  ctx.textAlign = 'left';
}

/* Countdown overlay, drawReceptor, drawHitFlashes, drawArrowSprite are unchanged... */

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
async function saveScore(event) {
  event?.preventDefault();
  let name = (guestNameInput?.value || '').trim() || '---';
  const message = (guestMessageInput?.value || '').trim();

  try {
    await addDoc(collection(db, "leaderboard"), {
      name,
      score,
      message,
      ts: Date.now()
    });
    await displayBoard();
  } catch (e) {
    console.error("Error saving score: ", e);
  }
  hideModal();
}

async function displayBoard() {
  if (!messageBoardBody) return;
  const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(MAX_ROWS));
  const querySnapshot = await getDocs(q);
  let rows = [];
  let rank = 1;
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    rows.push(`
      <tr>
        <td>${rank++}</td>
        <td>${escapeHTML(data.name)}</td>
        <td>${data.score}</td>
        <td>${escapeHTML(data.message || '')}</td>
      </tr>
    `);
  });
  messageBoardBody.innerHTML = rows.join('');
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

startBtn?.addEventListener('click', startGame);
retryBtn?.addEventListener('click', startGame);
submitScoreBtn?.addEventListener('click', (e) => saveScore(e));
skipSubmitBtn?.addEventListener('click', hideModal);

if (difficultySelect) {
  difficultySelect.addEventListener('change', (e) => {
    setDifficulty(e.target.value);
  });
}

document.querySelectorAll('#mobile-controls button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    if (playing) judgeHit(key);
  });
});

displayBoard();

window.addEventListener('load', () => {
  const controls = document.getElementById('mobile-controls');
  if (controls) controls.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
