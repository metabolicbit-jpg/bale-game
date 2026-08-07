// ============================================
//  سایه‌پرش — نسخه ۱ (نهایی)
//  سایه = آخرین اجرای تو؛ بهش نخور!
// ============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const GRAVITY = 0.45;
const JUMP_FORCE = -7.5;
const PIPE_WIDTH = 60;
const PIPE_GAP = 185;
const PIPE_SPEED = 2.5;
const PIPE_SPAWN_RATE = 110;

const API_URL = 'https://aged-river-6500bale-game-server.metabolicbit.workers.dev';
const USER_ID = new URLSearchParams(window.location.search).get('user') || '';

let bird, pipes, score, gameRunning, frameCount, animId;
let particles = [];
let shake = 0;
let runSamples = [];
let ghost = null;
let deathReason = '';
let currentSeed = 0;
let rng = Math.random;

let bestScore = parseInt(localStorage.getItem('shadowBest') || '0');

const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('scoreDisplay');
const finalScoreEl = document.getElementById('finalScore');
const coinsEarnedEl = document.getElementById('coinsEarned');
const bestScoreEl = document.getElementById('bestScore');
const deathReasonEl = document.getElementById('deathReason');

bestScoreEl.textContent = toPersianNum(bestScore);

// ---------- RNG با بذر ثابت: لوله‌های یکسان برای تو و سایه ----------
function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ---------- بارگذاری سایه (آخرین اجرای تو) ----------
function loadGhost() {
    try {
        const raw = localStorage.getItem('shadowLast');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
}

function haptic(type) {
    if (window.BaleWebApp && window.BaleWebApp.HapticFeedback) {
        if (type === 'error') window.BaleWebApp.HapticFeedback.notificationOccurred('error');
        else window.BaleWebApp.HapticFeedback.impactOccurred(type);
    }
}

class Bird {
    constructor() {
        this.x = canvas.width * 0.25;
        this.y = canvas.height / 2;
        this.width = 35;
        this.height = 30;
        this.velocity = 0;
        this.rotation = 0;
        this.flapFrame = 0;
    }

    jump() {
        this.velocity = JUMP_FORCE;
        this.flapFrame = 8;
        haptic('light');
        spawnParticles(this.x, this.y + 15, '#a78bfa', 5);
    }

    update() {
        this.velocity += GRAVITY;
        this.y += this.velocity;
        this.flapFrame = Math.max(0, this.flapFrame - 1);

        if (this.velocity < 0) this.rotation = -25;
        else this.rotation = Math.min(this.velocity * 3, 70);

        if (this.y < 0) { this.y = 0; this.velocity = 0; }
        if (this.y + this.height > canvas.height) {
            this.y = canvas.height - this.height;
            return true;
        }
        return false;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        ctx.rotate(this.rotation * Math.PI / 180);

        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.width/2, this.height/2, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(8, -5, 7, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(10, -5, 3.5, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = '#FF6347';
        ctx.beginPath();
        ctx.moveTo(this.width/2 - 5, 0);
        ctx.lineTo(this.width/2 + 10, 3);
        ctx.lineTo(this.width/2 - 5, 7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#FFA500';
        const wingY = this.flapFrame > 0 ? -12 : 3;
        ctx.beginPath();
        ctx.ellipse(-5, wingY, 12, 7, -0.3, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
    }
}

class Pipe {
    constructor() {
        this.x = canvas.width;
        this.gapY = rng() * (canvas.height - PIPE_GAP - 120) + 60;
        this.scored = false;
    }

    update() { this.x -= PIPE_SPEED; }

    draw() {
        const g = ctx.createLinearGradient(this.x, 0, this.x + PIPE_WIDTH, 0);
        g.addColorStop(0, '#7c3aed');
        g.addColorStop(0.5, '#6d28d9');
        g.addColorStop(1, '#4c1d95');

        ctx.fillStyle = g;
        ctx.fillRect(this.x, 0, PIPE_WIDTH, this.gapY);
        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(this.x - 4, this.gapY - 25, PIPE_WIDTH + 8, 25);

        const bottomY = this.gapY + PIPE_GAP;
        ctx.fillStyle = g;
        ctx.fillRect(this.x, bottomY, PIPE_WIDTH, canvas.height - bottomY);
        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(this.x - 4, bottomY, PIPE_WIDTH + 8, 25);
    }

    collidesWith(b) {
        const bx = b.x + 5, by = b.y + 5;
        const bw = b.width - 10, bh = b.height - 10;
        return (
            bx + bw > this.x &&
            bx < this.x + PIPE_WIDTH &&
            (by < this.gapY || by + bh > this.gapY + PIPE_GAP)
        );
    }
}

// ---------- ذرات (جلوه‌های بصری) ----------
function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
        particles.push({ x: x, y: y, vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6, life: 30, color: color });
    }
}

function drawParticles() {
    particles.forEach(function(p) {
        p.x += p.vx; p.y += p.vy; p.life--;
        ctx.globalAlpha = Math.max(0, p.life / 30);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1;
    particles = particles.filter(function(p) { return p.life > 0; });
}

// ---------- پس‌زمینه شب بنفش ----------
let stars = [];
function initStars() {
    stars = [];
    for (let i = 0; i < 40; i++) {
        stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.7, r: Math.random() * 1.8 + 0.5 });
    }
}
initStars();

function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#0f0a1e');
    g.addColorStop(0.6, '#2d1b4e');
    g.addColorStop(1, '#4c1d95');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    stars.forEach(function(s) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
        ctx.fill();
    });
}

let groundOffset = 0;
function drawGround() {
    const groundH = 60;
    const groundY = canvas.height - groundH;

    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, groundY, canvas.width, groundH);

    ctx.fillStyle = '#5b21b6';
    ctx.fillRect(0, groundY, canvas.width, 15);

    ctx.strokeStyle = '#4c1d95';
    ctx.lineWidth = 2;
    groundOffset = (groundOffset + PIPE_SPEED) % 30;
    for (let x = -groundOffset; x < canvas.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, groundY + 5);
        ctx.lineTo(x + 15, groundY + 15);
        ctx.stroke();
    }
}

// ---------- رسم سایه ----------
function drawShadow(y) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(bird.x + bird.width/2, y + bird.height/2);
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#6d28d9';
    ctx.beginPath();
    ctx.ellipse(0, 0, bird.width/2, bird.height/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ede9fe';
    ctx.beginPath();
    ctx.arc(8, -5, 5, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
}

// ---------- ارسال امتیاز به سرور ----------
async function submitScore(finalScore) {
    if (!USER_ID) return;
    try {
        const res = await fetch(API_URL + '/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: USER_ID, game: 'shadow', score: finalScore })
        });
        const data = await res.json();
        if (data.ok) {
            coinsEarnedEl.textContent = toPersianNum(data.coins) + ' (موجودی: ' + toPersianNum(data.balance) + ')';
        }
    } catch (e) {
        console.log('offline submit');
    }
}

function startGame() {
    const last = loadGhost();
    if (last && last.seed) {
        currentSeed = last.seed;
        ghost = last.samples || null;
    } else {
        currentSeed = (Math.random() * 1e9) | 0;
        ghost = null;
    }
    rng = mulberry32(currentSeed);

    bird = new Bird();
    pipes = [];
    particles = [];
    score = 0;
    frameCount = 0;
    shake = 0;
    runSamples = [];
    gameRunning = true;
    initStars();

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    scoreDisplay.textContent = '۰';

    if (animId) cancelAnimationFrame(animId);
    gameLoop();
}

function gameLoop() {
    if (!gameRunning) return;

    frameCount++;
    runSamples.push(Math.round(bird.y));

    ctx.save();
    if (shake > 0) { shake--; ctx.translate((Math.random()-0.5)*10, (Math.random()-0.5)*10); }

    drawSky();
    pipes.forEach(function(p) { p.draw(); });
    drawGround();

    const ghostY = (ghost && frameCount <= ghost.length) ? ghost[frameCount - 1] : null;
    if (ghostY !== null) drawShadow(ghostY);

    drawParticles();
    bird.draw();
    ctx.restore();

    const hitGround = bird.update();

    if (frameCount % PIPE_SPAWN_RATE === 0) pipes.push(new Pipe());

    pipes.forEach(function(pipe) {
        pipe.update();
        if (!pipe.scored && pipe.x + PIPE_WIDTH < bird.x) {
            pipe.scored = true;
            score++;
            scoreDisplay.textContent = toPersianNum(score);
            spawnParticles(bird.x + 20, bird.y, '#fbbf24', 10);
        }
        if (pipe.collidesWith(bird)) { deathReason = 'به لوله خوردی!'; gameOver(); }
    });

    pipes = pipes.filter(function(p) { return p.x > -PIPE_WIDTH - 10; });

    if (ghostY !== null && Math.abs(bird.y - ghostY) < 20) {
        deathReason = 'به سایهٔ خودت خوردی! 👤';
        gameOver();
    }

    if (hitGround) { deathReason = 'به زمین خوردی!'; gameOver(); return; }

    animId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    if (!gameRunning) return;
    gameRunning = false;
    cancelAnimationFrame(animId);
    haptic('error');
    spawnParticles(bird.x + 15, bird.y + 15, '#ef4444', 20);

    // ذخیره این اجرا به‌عنوان سایهٔ اجرای بعدی
    try {
        localStorage.setItem('shadowLast', JSON.stringify({ seed: currentSeed, samples: runSamples, score: score }));
    } catch (e) {}

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('shadowBest', bestScore.toString());
    }

    const coins = Math.max(5, Math.floor(score / 2));
    submitScore(score);

    deathReasonEl.textContent = deathReason || 'باختی!';
    finalScoreEl.textContent = toPersianNum(score);
    coinsEarnedEl.textContent = toPersianNum(coins);
    gameOverScreen.classList.remove('hidden');
    hud.classList.add('hidden');
}

function handleInput(e) {
    e.preventDefault();
    if (gameRunning && bird) bird.jump();
}

// ---------- اتصال امن دکمه‌ها (حل دائمی مشکل دکمه شروع) ----------
function bindUI() {
    canvas.addEventListener('touchstart', handleInput);
    canvas.addEventListener('mousedown', handleInput);
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space') handleInput(e);
    });

    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('retryBtn').addEventListener('click', startGame);
    document.getElementById('menuBtn').addEventListener('click', function() {
        gameOverScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
        bestScoreEl.textContent = toPersianNum(bestScore);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
} else {
    bindUI();
}

function toPersianNum(num) {
    const p = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return num.toString().replace(/\d/g, function(d) { return p[d]; });
}

if (window.BaleWebApp) {
    window.BaleWebApp.ready();
    window.BaleWebApp.expand();
}