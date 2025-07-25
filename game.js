/* --------- CONFIG --------- */
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const CANVAS_W = 480;
const CANVAS_H = 640;

const HITLINE_Y = 520;
const ARROW_SIZE = 48;
const LANE_WIDTH = CANVAS_W / LANES.length;

const BPM = 100;                  
const NOTES_PER_BEAT = 2;         
const BARS = 16;                  
const SONG_OFFSET = 0.5;          
const HIT_WINDOW_PERFECT = 0.08;  
const HIT_WINDOW_GOOD = 0.15;
const ARROW_SPEED = 400;          
const MAX_LEADERBOARD = 10;
/* -------------------------- */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementBy
