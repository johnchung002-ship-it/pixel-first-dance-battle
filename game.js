/***** CONFIG *****/
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight']; // matches column labels
const CANVAS_W = 480, CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 48;
const LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 140;                 // Level Up ~140 BPM
const NOTES_PER_BEAT = 2;        // 8th notes
const SONG_OFFSET = 0.3;         // tweak if needed
const SNIPPET_SECONDS = 30;      // your chorus snippet length

const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.15;

const ARROW_SPEED = 400;

// Lane-specific colors (Left, Down, Up, Right)
const LANE_COLORS = ['#ff4d4d', '#4d94ff', '#4dff88', '#ffd24d'];
/******************/

// Prevent arrow keys from scrolling the page
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

// lane flash timestamps (ms) for hit feedback
let laneHighlights = [0, 0, 0, 0];

// Feedback text for PERFECT/GOOD/MISS
let feedbackText = '';
let feedbackColor = '#fff';
let feedbackTime = 0;

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

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
      pattern.push({
        lane: Math.floor(Math.random() * LANES.length),
        t
      });
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
  hits++;
  feedbackTime = performance.now();

  laneHighlights[arrow.lane] = performance.now();
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

  // lanes + labels + highlight
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

  // hit line
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(0, HITLINE_Y);
  ctx.lineTo(CANVAS_W, HITLINE_Y);
  ctx.stroke();

  const t = getTime();
  for (const a of active) {
    if (a.judged) continue;
    const y = HITLINE_Y - (a.t - t) * ARROW_SPEED;
    if (y < -ARROW_SIZE || y > CANVAS_H + ARROW_SIZE) continue;
    const x = a.lane * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;
    drawArrowSprite(ctx, x, y, ARROW_SIZE, a.lane);
  }

  // Feedback text (PERFECT/GOOD/MISS)
  if (feedbackText && now - feedbackTime < 300) {
    ctx.fillStyle = feedbackColor;
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(feedbackText, CANVAS_W / 2, HITLINE_Y - 40);
  }

  // Combo pop
  if (combo > 0) {
    ctx.fillStyle = '#00ff9d';
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${combo} Combo`, CANVAS_W / 2, HITLINE_Y + 30);
  }
  ctx.textAlign = 'left'; // reset
}

/**
 * Draw each arrow with a fixed shape per lane (no rotation) so lanes match labels.
 * x, y are TOP-LEFT coords.
 */
function drawArrowSprite(ctx, x, y, size, lane) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = LANE_COLORS[lane];
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();

  switch (lane) {
    case 0: // Left
      ctx.moveTo(size, 0);
      ctx.lineTo(0, size * 0.5);
      ctx.lineTo(size, size);
      ctx.lineTo(size * 0.7, size);
      ctx.lineTo(size * 0.7, size * 0.65);
      ctx.lineTo(size * 0.3, size * 0.65);
      ctx.lineTo(size * 0.3, size * 0.35);
      ctx.lineTo(size * 0.7, size * 0.35);
      ctx.lineTo(size * 0.7, 0);
      ctx.closePath();
      break;

    case 1: // Down
      ctx.moveTo(0, 0);
      ctx.lineTo(size * 0.35, 0);
      ctx.lineTo(size * 0.35, size * 0.3);
      ctx.lineTo(size * 0.65, size * 0.3);
      ctx.lineTo(size * 0.65, 0);
      ctx.lineTo(size, 0);
      ctx.lineTo(size * 0.5, size);
      ctx.closePath();
      break;

    case 2: // Up
      ctx.moveTo(size * 0.5, 0);
      ctx.lineTo(size, size);
      ctx.lineTo(size * 0.65, size);
      ctx.lineTo(size * 0.65, size * 0.7);
      ctx.lineTo(size * 0.35, size * 0.7);
      ctx.lineTo(size * 0.35, size);
      ctx.lineTo(0, size);
      ctx.closePath();
      break;

    case 3: // Right
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size * 0.5);
      ctx.lineTo(0, size);
      ctx.lineTo(size * 0.3, size);
      ctx.lineTo(size * 0.3, size * 0.65);
      ctx.lineTo(size * 0.7, size * 0.65);
      ctx.lineTo(size * 0.7, size * 0.35);
      ctx.lineTo(size * 0.3, size * 0.35);
      ctx.lineTo(size * 0.3, 0);
      ctx.closePath();
      break;
  }

  ctx.fill();
  ctx.stroke();
  ctx.restore();
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

function showModal() {
  scoreModal.classList.remove('hidden');
}
function hideModal() {
  scoreModal.classList.add('hidden');
}
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
