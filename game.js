/***** FIREBASE IMPORTS *****/
import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/***** SONG SETUP *****/
const SONGS = [
  { title: "Apt (Easy)", file: "apt_easy.mp3", bpm: 140, snippet: 30, cover: "apt2cover.png" },
  { title: "Butter (Medium)", file: "butter_snippet.mp3", bpm: 120, snippet: 30, cover: "cover2.png" },
  { title: "Level Up (Hard)", file: "Ciara-Level-Up-15_7s-to-49_7s.mp3", bpm: 160, snippet: 30, cover: "cover3.png" }
];

let currentSongIndex = 0;

/***** CONFIG *****/
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
let CANVAS_W = 480, CANVAS_H = 640;
const HITLINE_Y = 520;
const ARROW_SIZE = 64;
let LANE_WIDTH = CANVAS_W / LANES.length;

let BPM = SONGS[currentSongIndex].bpm;
const NOTES_PER_BEAT = 2;
const SONG_OFFSET = 1.0;
let SNIPPET_SECONDS = SONGS[currentSongIndex].snippet;

let HIT_WINDOW_PERFECT = 0.08;
let HIT_WINDOW_GOOD = 0.15;
let ARROW_SPEED = 350;

let BEAT_INTERVAL = 60 / BPM;
const LANE_COLORS = ['#ff4d4d', '#4d94ff', '#4dff88', '#ffd24d'];

/******************/
/* ---------------- Audio ---------------- */
const bgm = document.getElementById('bgm');
function setCurrentSong(index) {
  currentSongIndex = index;
  BPM = SONGS[index].bpm;
  SNIPPET_SECONDS = SONGS[index].snippet;
  BEAT_INTERVAL = 60 / BPM;
  bgm.src = SONGS[index].file;
  bgm.load();
  console.log("Selected song:", SONGS[index].title);
}
export { setCurrentSong };

/* ---------------- Canvas ---------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas?.getContext('2d');

/* ---------------- HUD Elements ---------------- */
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const accuracyEl = document.getElementById('accuracy');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');

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
let lastGameEnd = 0;

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

/* ---------------- Responsive Canvas ---------------- */
function resizeCanvasIfNeeded() {
  if (!canvas) return;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  LANE_WIDTH = CANVAS_W / LANES.length;
}
resizeCanvasIfNeeded();

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
  if (performance.now() - lastGameEnd < 300) return;

  resetState();
  playing = true;
  retryBtn?.classList.add('hidden');
  startBtn?.classList.add('hidden');
  hideModal();

  startTime = performance.now() / 1000;
  showDanceUntil = performance.now() + 500;

  bgm.currentTime = 0;
  bgm.play().catch(err => console.warn('Music blocked:', err));
  loop();
}

function endGame() {
  playing = false;
  lastGameEnd = performance.now();
  cancelAnimationFrame(raf);
  bgm.pause();
  finalScoreEl.textContent = score;
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
  if (lane === -1 || !playing) return;

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
  score += (result === 'perfect' ? 300 : 100);
  feedbackText = result.toUpperCase() + '!';
  feedbackColor = (result === 'perfect' ? '#4dff88' : '#ffd24d');
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
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  const acc = totalNotes ? Math.round((hits / totalNotes) * 100) : 100;
  accuracyEl.textContent = `${acc}%`;
}

/* ---------------- Draw ---------------- */
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const now = performance.now();
  const t = getTime();

  // Draw receptor arrows
  for (let i = 0; i < LANES.length; i++) {
    const x = i * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;
    const flash = (now - receptorFlash[i]) < 100 ? 1 : 0;
    ctx.globalAlpha = flash ? 1 : 0.6;
    ctx.fillStyle = LANE_COLORS[i];
    ctx.fillRect(i * LANE_WIDTH, HITLINE_Y - 4, LANE_WIDTH, 8);
    ctx.globalAlpha = 1;

    const spr = [arrowSprites.left, arrowSprites.down, arrowSprites.up, arrowSprites.right][i];
    if (spr.complete) {
      ctx.drawImage(spr, x, HITLINE_Y - ARROW_SIZE - 10, ARROW_SIZE, ARROW_SIZE);
    }
  }

  // --- Hit Flashes ---
  const flashDuration = 150; // milliseconds
  for (const flash of hitFlashes) {
    const elapsed = performance.now() - flash.start;
    if (elapsed > flashDuration) continue;

    const alpha = 1 - elapsed / flashDuration;
    const x = flash.lane * LANE_WIDTH;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = LANE_COLORS[flash.lane];
    ctx.fillRect(x, HITLINE_Y - 40, LANE_WIDTH, 80);
    ctx.globalAlpha = 1;
  }

  // Draw falling arrows
  for (const a of active) {
    if (a.judged) continue;
    const timeToHit = a.t - t;
    const y = HITLINE_Y - timeToHit * ARROW_SPEED;
    if (y < -ARROW_SIZE || y > canvas.height + ARROW_SIZE) continue;

    const x = a.lane * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;
    const spr = [arrowSprites.left, arrowSprites.down, arrowSprites.up, arrowSprites.right][a.lane];
    const diff = Math.abs(timeToHit);
    ctx.globalAlpha = diff <= HIT_WINDOW_PERFECT ? 1 : diff <= HIT_WINDOW_GOOD ? 0.85 : 0.7;
    ctx.drawImage(spr, x, y - ARROW_SIZE / 2, ARROW_SIZE, ARROW_SIZE);
  }

  // Feedback text with pulse
  if ((now - feedbackTime) < 600 && feedbackText) {
    const pulse = 1 + 0.2 * Math.sin((now - feedbackTime) / 50); // pulsing scale
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(pulse, pulse);
    ctx.font = "32px 'Press Start 2P', monospace"; // pixel font
    ctx.fillStyle = feedbackColor;
    ctx.textAlign = "center";
    ctx.fillText(feedbackText, 0, 0);
    ctx.restore();
  }

  // Combo count with slight scale effect
  if (combo > 1) {
    const life = (now - comboAnimStart) / 300;
    const scale = Math.max(1, 1.2 - life * 0.2);
    ctx.save();
    ctx.translate(canvas.width - 80, 80);
    ctx.scale(scale, scale);
    ctx.font = "18px 'Press Start 2P', monospace";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(`${combo}x`, 0, 0);
    ctx.restore();
  }
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
function showModal() { scoreModal?.classList.remove('hidden'); }
function hideModal() { scoreModal?.classList.add('hidden'); }

const scoresCollection = collection(db, "scores");
async function saveScore(event) {
  event?.preventDefault();
  let initials = (guestNameInput?.value || '---').trim();
  const message = (guestMessageInput?.value || '').trim();

  try {
    await addDoc(scoresCollection, {
      initials: initials || '---',
      score,
      message,
      ts: Date.now()
    });
    await displayBoard();
    hideModal();
  } catch (err) {
    console.error("Error saving score:", err);
  }
}

async function displayBoard() {
  if (!messageBoardBody) return;
  try {
    const q = query(scoresCollection, orderBy("score", "desc"));
    const snapshot = await getDocs(q);
    const rows = [];
    let rank = 1;
    snapshot.forEach(doc => {
      const data = doc.data();
      rows.push(`
        <tr>
          <td>${rank++}</td>
          <td>${escapeHTML(data.initials)}</td>
          <td>${data.score}</td>
          <td>${escapeHTML(data.message || '')}</td>
        </tr>
      `);
    });
    messageBoardBody.innerHTML = rows.join('');
  } catch (err) {
    console.error("Error fetching scores:", err);
  }
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ---------------- Events ---------------- */
document.addEventListener('keydown', (e) => {
  const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  if (arrows.includes(e.key)) {
    e.preventDefault();            // <-- stops the page from scrolling
    if (playing) judgeHit(e.key);
  }
}, { passive: false });

startBtn?.addEventListener('click', startGame);
retryBtn?.addEventListener('click', startGame);
submitScoreBtn?.addEventListener('click', (e) => saveScore(e));
skipSubmitBtn?.addEventListener('click', hideModal);

document.querySelectorAll('#mobile-controls button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    if (playing) judgeHit(key);
  });
});

bgm?.addEventListener('ended', () => {
  if (playing) endGame();
});

setCurrentSong(currentSongIndex);
displayBoard();
