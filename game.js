
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const bgm = document.getElementById('bgm');
const arrows = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
let currentArrow = '';
let score = 0;
let playing = false;

function drawArrow(key) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '48px monospace';
  ctx.fillStyle = '#0f0';
  ctx.fillText(key.replace('Arrow', ''), 220, 140);
}

function randomArrow() {
  return arrows[Math.floor(Math.random() * arrows.length)];
}

function startGame() {
  score = 0;
  playing = true;
  bgm.currentTime = 0;
  bgm.play();
  nextArrow();
}

function nextArrow() {
  if (!playing) return;
  currentArrow = randomArrow();
  drawArrow(currentArrow);
}

document.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.key === currentArrow) {
    score++;
    nextArrow();
  } else {
    playing = false;
    bgm.pause();
    showScoreboard();
  }
});

function showScoreboard() {
  document.getElementById('scoreboard').classList.remove('hidden');
}

function submitScore() {
  const initials = document.getElementById('initials').value.toUpperCase();
  if (!initials) return;
  const leaderboard = JSON.parse(localStorage.getItem('leaderboard') || '[]');
  leaderboard.push({ initials, score });
  leaderboard.sort((a, b) => b.score - a.score);
  localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
  displayLeaderboard(leaderboard);
  document.getElementById('scoreboard').classList.add('hidden');
}

function displayLeaderboard(data) {
  const board = document.getElementById('leaderboard');
  board.innerHTML = '<h2>🏆 Leaderboard</h2><ol>' +
    data.map(entry => `<li>${entry.initials}: ${entry.score}</li>`).join('') +
    '</ol>';
}

window.onload = startGame;
