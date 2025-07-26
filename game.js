/***** CONFIG *****/
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
let   CANVAS_W = 480, CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 64;
let   LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 140;
const NOTES_PER_BEAT = 2;
/** 2 seconds so arrows don't already appear mid‑screen **/
const SONG_OFFSET = 1.0;
const SNIPPET_SECONDS = 30;

// Defaults (Normal)
let HIT_WINDOW_PERFECT = 0.08;
let HIT_WINDOW_GOOD    = 0.15;
let ARROW_SPEED        = 350;

const BEAT_INTERVAL = 60 / BPM;
const LANE_COLORS = ['#ff4d4d', '#4d94ff', '#4dff88', '#ffd24d'];

const STORAGE_KEY = 'messageBoard';
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
const initialsInput = document.getElementById('initials');
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
arrowSprites.left.src  = "arrow_left.png";
arrowSprites.down.src  = "arrow_down.png";
arrowSprites.up.src    = "arrow_up.png";
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
    ARROW_SPEED        = 200;
    HIT_WINDOW_PERFECT = 0.12;
    HIT_WINDOW_GOOD    = 0.22;
  } else if (mode === 'hard') {
    ARROW_SPEED        = 480;
    HIT_WINDOW_PERFECT = 0.06;
    HIT_WINDOW_GOOD    = 0.12;
  } else {
    ARROW_SPEED        = 350;
    HIT_WINDOW_PERFECT = 0.08;
    HIT_WINDOW_GOOD    = 0.15;
  }
}

setDifficulty(difficultySelect ? difficultySelect.value : 'normal');

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
  receptorFlash  = [0, 0, 0, 0];
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

/* ---------------- Drawing & HUD ---------------- */
// (Draw functions remain unchanged for brevity...)

function updateHUD() {
  if (scoreEl) scoreEl.textContent = score;
  if (comboEl) comboEl.textContent = combo;
  const acc = totalNotes ? Math.round((hits / totalNotes) * 100) : 100;
  if (accuracyEl) accuracyEl.textContent = `${acc}%`;
}

/* ---------------- Message Board ---------------- */
function showModal() { scoreModal?.classList.remove('hidden'); }
function hideModal() { scoreModal?.classList.add('hidden'); }

function getBoard() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveBoard(board) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch (e) {
    console.error('Failed to save board:', e);
  }
}

function saveScore(event) {
  event?.preventDefault();

  let initials = (initialsInput?.value || '').trim();
  const message  = (guestMessageInput?.value || '').trim();

  if (!initials) {
    initials = '---';
  }

  const board = getBoard();
  board.push({
    initials,
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
  if (!messageBoardBody) return;

  messageBoardBody.innerHTML = board
    .map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(e.initials)}</td>
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

startBtn?.addEventListener('click', startGame);
retryBtn?.addEventListener('click', startGame);
submitScoreBtn?.addEventListener('click', (e) => saveScore(e));
skipSubmitBtn?.addEventListener('click', hideModal);

const scoreForm = scoreModal?.querySelector('form');
if (scoreForm) {
  scoreForm.addEventListener('submit', (e) => saveScore(e));
}

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

/* ---------------- Auto-scroll on load ---------------- */
window.addEventListener('load', () => {
  const controls = document.getElementById('mobile-controls');
  if (controls) {
    controls.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
