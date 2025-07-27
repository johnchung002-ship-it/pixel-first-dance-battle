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
  {
    title: "Apt",
    file: "Ciara-Level-Up-15_7s-to-49_7s.mp3",
    bpm: 140,
    snippet: 30,
    cover: "cover1.png"
  },
  {
    title: "Butter",
    file: "test-tone.mp3",
    bpm: 120,
    snippet: 30,
    cover: "cover2.png"
  },
  {
    title: "Level Up",
    file: "Ciara-Level-Up-15_7s-to-49_7s.mp3",
    bpm: 160,
    snippet: 30,
    cover: "cover3.png"
  }
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
const MAX_ROWS = 50;
/******************/

/* ---------------- Audio ---------------- */
const bgm = document.getElementById('bgm');
function setCurrentSong(index) {
  currentSongIndex = index;
  BPM = SONGS[index].bpm;
  SNIPPET_SECONDS = SONGS[index].snippet;
  BEAT_INTERVAL = 60 / BPM;
  bgm.src = SONGS[index].file;
  console.log("Selected song:", SONGS[index].title);
}

/* ---------------- Canvas ---------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
let showDanceUntil = 0; // Countdown state

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
  cancelAnimationFrame(raf);
  bgm.pause();
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
  if (scoreEl) scoreEl.textContent = score;
  if (comboEl) comboEl.textContent = combo;
  const acc = totalNotes ? Math.round((hits / totalNotes) * 100) : 100;
  if (accuracyEl) accuracyEl.textContent = `${acc}%`;
}

/* ---------------- Draw ---------------- */
// (Draw function remains unchanged)

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
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    if (playing) judgeHit(e.key);
  }
});

startBtn?.addEventListener('click', startGame);
retryBtn?.addEventListener('click', startGame);
submitScoreBtn?.addEventListener('click', (e) => saveScore(e));
skipSubmitBtn?.addEventListener('click', hideModal);

// Mobile button controls
document.querySelectorAll('#mobile-controls button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    if (playing) judgeHit(key);
  });
});

// Initial board render
displayBoard();
