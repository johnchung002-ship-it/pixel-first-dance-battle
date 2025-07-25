/* --------- CONFIG --------- */
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const LANE_KEYS = LANES; // 1:1 mapping
const CANVAS_W = 480;
const CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 48;
const LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 100;                  // adjust if you know exact BPM of your clip
const NOTES_PER_BEAT = 2;         // 8th notes
const BARS = 16;                  // total bars
const SONG_OFFSET = 0.5;          // seconds delay before first note hits line
const HIT_WINDOW_PERFECT = 0.08;  // +/- seconds
const HIT_WINDOW_GOOD = 0.15;
const ARROW_SPEED = 400;          // px/sec (visual speed)
const MAX_LEADERBOARD = 10;
/* -------------------------- */

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

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

let playing = false;
let startedAt = 0;         // when bgm actually started (for latency offset if needed)
let arrows = [];           // pattern
let active = [];           // not-yet-judged arrows
let score = 0;
let hits = 0;
let totalNotes = 0;
let combo = 0;
let raf = null;

/** Arrow object shape
 * {
 *   lane: number,
 *   t: number,         // exact hit time (song time)
 *   judged: false,
 *   result: null       // 'perfect'|'good'|'miss'
 * }
 */

function loadLeaderboard() {
  const data = JSON.parse(localStorage.getItem('leaderboard') || '[]');
  displayLeaderboard(data);
  return data;
}
function saveLeaderboard(data) {
  localStorage.setItem('leaderboard', JSON.stringify(data.slice(0, MAX_LEADERBOARD)));
  displayLeaderboard(data);
}
function displayLeaderboard(list) {
  leaderboardEl.innerHTML = list
    .map((e) => `<li>${e.initials}: ${e.score}</li>`)
    .join('');
}

function showModal() { scoreModal.classList.remove('hidden'); }
function hideModal() { scoreModal.classList.add('hidden'); }

function resetState() {
  score = 0;
  hits = 0;
  combo = 0;
  totalNotes = 0;
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

  bgm.currentTime = 0;
  bgm.play().then(() => {
    startedAt = performance.now() / 1000;
    loop();
  }).catch(() => {
    // If autoplay blocked, reveal a hint
    startBtn.classList.remove('hidden');
    playing = false;
  });
}

function endGame() {
  playing = false;
  cancelAnimationFrame(raf);
  bgm.pause();
  finalScoreEl.textContent = score;
  retryBtn.classList.remove('hidden');
  showModal();
}

function getSongTime() {
  // Use bgm.currentTime. If you want to tweak for latency you can adjust here.
  return bgm.currentTime;
}

function buildPattern() {
  const pattern = [];
  const beat = 60 / BPM;
  const noteStep = beat / NOTES_PER_BEAT;
  // Start at first hit time at SONG_OFFSET
  let time = SONG_OFFSET;
  const totalSteps = BARS * 4 * NOTES_PER_BEAT; // 4 beats per bar
  for (let i = 0; i < totalSteps; i++, time += noteStep) {
    // Simple generator: 70% chance to spawn an arrow on each subdivision
    if (Math.random() < 0.7) {
      const lane = Math.floor(Math.random() * LANES.length);
      pattern.push({ lane, t: time });
    }
  }
  totalNotes = pattern.length;
  return pattern;
}

function judgeHit(key) {
  const lane = LANE_KEYS.indexOf(key);
  if (lane === -1) return;

  const t = getSongTime();
  // find closest unjudged arrow in this lane
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

  // Only judge if it's within GOOD window AND hasn't passed greatly
  if (bestDiff <= HIT_WINDOW_PERFECT) {
    applyHit(best, 'perfect');
  } else if (bestDiff <= HIT_WINDOW_GOOD) {
    applyHit(best, 'good');
  }
}

function applyHit(arrow, result) {
  arrow.judged = true;
  arrow.result = result;
  if (result === 'perfect') {
    score += 300;
    combo++;
    hits++;
  } else if (result === 'good') {
    score += 100;
    combo++;
    hits++;
  }
  updateHUD();
}

function missOldArrows() {
  const t = getSongTime();
  for (const a of active) {
    if (!a.judged && t - a.t > HIT_WINDOW_GOOD) {
      // it's a miss
      a.judged = true;
      a.result = 'miss';
      combo = 0;
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

  // lanes
  for (let i = 0; i < LANES.length; i++) {
    const x = i * LANE_WIDTH;
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, 0, LANE_WIDTH, CANVAS_H);
    // lane labels at top
    ctx.fillStyle = '#555';
    ctx.font = '16px monospace';
    ctx.fillText(LANES[i].replace('Arrow', ''), x + LANE_WIDTH / 2 - 20, 24);
  }

  // hit line
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(0, HITLINE_Y);
  ctx.lineTo(CANVAS_W, HITLINE_Y);
  ctx.stroke();

  // draw arrows
  const t = getSongTime();

  // compute y from time: if t == arrow.t => y = HITLINE_Y
  // distance to hit line = (arrow.t - t) * ARROW_SPEED
  // So y = HITLINE_Y - distance
  for (const a of active) {
    if (a.judged) continue;
    const dt = a.t - t;
    const y = HITLINE_Y - dt * ARROW_SPEED;

    // draw only if on screen
    if (y < -ARROW_SIZE || y > CANVAS_H + ARROW_SIZE) continue;

    const x = a.lane * LANE_WIDTH + (LANE_WIDTH - ARROW_SIZE) / 2;

    ctx.fillStyle = '#0ff';
    ctx.strokeStyle = '#00cccc';
    ctx.lineWidth = 2;

    drawArrowSprite(ctx, x, y, ARROW_SIZE, a.lane);
  }
}

function drawArrowSprite(ctx, x, y, size, lane) {
  // Simple arrow using triangles
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);

  const directions = {
    0: Math.PI,         // Left
    1: Math.PI / 2,     // Down
    2: -Math.PI / 2,    // Up
    3: 0                // Right
  };
  ctx.rotate(directions[lane]);

  ctx.fillStyle = '#00ff9d';
  ctx.strokeStyle = '#006644';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-size * 0.4, -size * 0.2);
  ctx.lineTo(0, -size * 0.5);
  ctx.lineTo(size * 0.4, -size * 0.2);
  ctx.lineTo(size * 0.2, -size * 0.2);
  ctx.lineTo(size * 0.2, size * 0.5);
  ctx.lineTo(-size * 0.2, size * 0.5);
  ctx.lineTo(-size * 0.2, -size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function loop() {
  if (!playing) return;

  missOldArrows();
  draw();
  updateHUD();

  // End condition: all arrows judged & song mostly done
  const allJudged = active.every(a => a.judged);
  if (allJudged || bgm.ended) {
    endGame();
    return;
  }

  raf = requestAnimationFrame(loop);
}

/* ---- Events ---- */
document.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (!LANE_KEYS.includes(e.key)) return;
  judgeHit(e.key);
});

startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);

submitScoreBtn.addEventListener('click', () => {
  const initials = initialsInput.value.toUpperCase().trim();
  const list = loadLeaderboard();
  if (initials) {
    list.push({ initials, score });
    list.sort((a, b) => b.score - a.score);
    saveLeaderboard(list);
  }
  hideModal();
});
skipSubmitBtn.addEventListener('click', () => {
  hideModal();
});

// Load leaderboard on boot
loadLeaderboard();
