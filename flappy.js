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
const PIPE_GAP = 170;
const PIPE_SPEED = 2.5;
const PIPE_SPAWN_RATE = 110;

let bird, pipes, score, gameRunning, frameCount, animId;
let bestScore = parseInt(localStorage.getItem('flappyBest') || '0');

const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('scoreDisplay');
const finalScoreEl = document.getElementById('finalScore');
const coinsEarnedEl = document.getElementById('coinsEarned');
const bestScoreEl = document.getElementById('bestScore');

bestScoreEl.textContent = toPersianNum(bestScore);

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
        if (window.BaleWebApp && window.BaleWebApp.HapticFeedback) {
            window.BaleWebApp.HapticFeedback.impactOccurred('light');
        }
    }

    update() {
        this.velocity += GRAVITY;
        this.y += this.velocity;
        this.flapFrame = Math.max(0, this.flapFrame - 1);

        if (this.velocity < 0) {
            this.rotation = -25;
        } else {
            this.rotation = Math.min(this.velocity * 3, 70);
        }

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
        this.gapY = Math.random() * (canvas.height - PIPE_GAP - 120) + 60;
        this.scored = false;
    }

    update() { this.x -= PIPE_SPEED; }

    draw() {
        const g = ctx.createLinearGradient(this.x, 0, this.x + PIPE_WIDTH, 0);
        g.addColorStop(0, '#2ecc71');
        g.addColorStop(0.5, '#27ae60');
        g.addColorStop(1, '#1e8449');

        ctx.fillStyle = g;
        ctx.fillRect(this.x, 0, PIPE_WIDTH, this.gapY);
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(this.x - 4, this.gapY - 25, PIPE_WIDTH + 8, 25);

        const bottomY = this.gapY + PIPE_GAP;
        ctx.fillStyle = g;
        ctx.fillRect(this.x, bottomY, PIPE_WIDTH, canvas.height - bottomY);
        ctx.fillStyle = '#27ae60';
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

let clouds = [];
function initClouds() {
    clouds = [];
    for (let i = 0; i < 5; i++) {
        clouds.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height * 0.4,
            w: 60 + Math.random() * 80,
            speed: 0.3 + Math.random() * 0.5
        });
    }
}

function drawClouds() {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    clouds.forEach(c => {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w, c.w * 0.4, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x + c.w*0.4, c.y - c.w*0.15, c.w*0.6, c.w*0.3, 0, 0, Math.PI*2);
        ctx.fill();
        c.x -= c.speed;
        if (c.x < -c.w * 2) c.x = canvas.width + c.w;
    });
}

let groundOffset = 0;
function drawGround() {
    const groundH = 60;
    const groundY = canvas.height - groundH;

    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, groundY, canvas.width, groundH);

    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, groundY, canvas.width, 15);

    ctx.strokeStyle = '#1a6b1a';
    ctx.lineWidth = 2;
    groundOffset = (groundOffset + PIPE_SPEED) % 30;
    for (let x = -groundOffset; x < canvas.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, groundY + 5);
        ctx.lineTo(x + 15, groundY + 15);
        ctx.stroke();
    }
}

function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#4A90D9');
    g.addColorStop(0.6, '#87CEEB');
    g.addColorStop(1, '#B0E0E6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function startGame() {
    bird = new Bird();
    pipes = [];
    score = 0;
    frameCount = 0;
    gameRunning = true;
    initClouds();

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

    drawSky();
    drawClouds();
    pipes.forEach(p => p.draw());
    drawGround();
    bird.draw();

    const hitGround = bird.update();

    if (frameCount % PIPE_SPAWN_RATE === 0) {
        pipes.push(new Pipe());
    }

    pipes.forEach(pipe => {
        pipe.update();
        if (!pipe.scored && pipe.x + PIPE_WIDTH < bird.x) {
            pipe.scored = true;
            score++;
            scoreDisplay.textContent = toPersianNum(score);
        }
        if (pipe.collidesWith(bird)) gameOver();
    });

    pipes = pipes.filter(p => p.x > -PIPE_WIDTH - 10);

    if (hitGround) { gameOver(); return; }

    animId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animId);

    if (window.BaleWebApp && window.BaleWebApp.HapticFeedback) {
        window.BaleWebApp.HapticFeedback.notificationOccurred('error');
    }

    const coins = Math.max(5, Math.floor(score / 2));

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('flappyBest', bestScore.toString());
    }

    console.log('Score: ' + score + ' | Coins: ' + coins);

    finalScoreEl.textContent = toPersianNum(score);
    coinsEarnedEl.textContent = toPersianNum(coins);
    gameOverScreen.classList.remove('hidden');
    hud.classList.add('hidden');
}

function handleInput(e) {
    e.preventDefault();
    if (gameRunning && bird) bird.jump();
}

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

function toPersianNum(num) {
    const p = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return num.toString().replace(/\d/g, function(d) { return p[d]; });
}

if (window.BaleWebApp) {
    window.BaleWebApp.ready();
    window.BaleWebApp.expand();
}