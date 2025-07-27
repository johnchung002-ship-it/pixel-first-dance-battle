/***** FIREBASE IMPORTS *****/
import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/***** SONGS *****/
export const SONGS = [
  { title: "Apt (Easy)",      file: "apt_easy.mp3",                      bpm: 140, snippet: 30, cover: "apt2cover.png" },
  { title: "Butter (Medium)", file: "butter_snippet.mp3",                bpm: 120, snippet: 30, cover: "cover2.png" },
  { title: "Level Up (Hard)", file: "Ciara-Level-Up-15_7s-to-49_7s.mp3", bpm: 160, snippet: 32, cover: "cover3.png" }
];

let currentSongIndex = 0;

/***** AUDIO *****/
const bgm = document.getElementById('bgm');

export function setCurrentSong(index) {
  currentSongIndex = index;
  const song = SONGS[index];

  // Update globals
  BPM = song.bpm;
  SNIPPET_SECONDS = song.snippet;
  BEAT_INTERVAL = 60 / BPM;

  bgm.src = song.file;
  bgm.load();
  console.log('Selected song:', song.title);
}

/***** CONFIG *****/
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
let CANVAS_W = 480, CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 64;
let LANE_WIDTH = CANVAS_W / LANES.length;

let BPM = 140;
const NOTES_PER_BEAT = 2;
const SONG_OFFSET = 1.0;
let SNIPPET_SECONDS = 30;

let HIT_WINDOW_PERFECT = 0.08;
let HIT_WINDOW_GOOD = 0.15;
let ARROW_SPEED = 350;

let BEAT_INTERVAL = 60 / BPM;
const LANE_COLORS = ['#ff4d4d', '#4d94ff', '#4dff88', '#ffd24d'];
const MAX_ROWS = 50;
/******************/

// Prevent arrow keys / space from scrolling the page **unless typing in inputs**
window.addEventListener(
  "keydown",
  function (e) {
    const isTypingElement =
      document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA' ||
       document.activeElement.isContentEditable);

    if (!isTypingElement &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
  },
  { passive: false }
);

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

// Countdown state
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

/* ---------------- Responsive Canvas ---------------- */
function resizeCanvasIfNeeded() {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  LANE_WIDTH = CANVAS_W / LANES.length;
}
resizeCanvasIfNeeded();

/* ---------------- Difficulty ---------------- */
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

/* --- Prevent dropdown stealing focus during gameplay --- */
function lockDifficultySelect() {
  if (difficultySelect) {
    difficultySelect.setAttribute('tabindex', '-1');
    difficultySelect.blur();
    difficultySelect.addEventListener('keydown', blockWhilePlaying);
  }
}
function unlockDifficultySelect() {
  if (difficultySelect) {
    difficultySelect.removeAttribute('tabindex');
    difficultySelect.removeEventListener('keydown', blockWhilePlaying);
  }
}
function blockWhilePlaying(e) {
  if (playing) e.preventDefault();
}

/* ---------------- Core ---------------- */
function resetState() {
  score = 0;
  hits = 0;
  combo = 0;
  updateHUD();
  arrows = buildPatternForSnippet();
  console.log('Arrows generated:', arrows); // DEBUG
  active = arrows.map(a => ({ ...a, judged: false, result: null }));
  totalNotes = arrows.length;
  laneHighlights = [0, 0, 0, 0];
  receptorFlash = [0, 0, 0, 0];
  hitFlashes = [];
  feedbackText = '';
}

function startGame() {
  console.log('Start button clicked'); // DEBUG
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

// Mobile button controls
document.querySelectorAll('#mobile-controls button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    if (playing) judgeHit(key);
  });
});

// Initial board render
displayBoard();
