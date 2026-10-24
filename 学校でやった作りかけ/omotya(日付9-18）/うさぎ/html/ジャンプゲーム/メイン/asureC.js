const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- 画像の読み込み設定 ---
const imgUsagiHokou1 = new Image(); imgUsagiHokou1.src = "images/usagi_hokou1.png";
const imgUsagiHokou2 = new Image(); imgUsagiHokou2.src = "images/usagi_hokou2.png";
const imgUsagiTaiki1 = new Image(); imgUsagiTaiki1.src = "images/usagi_taiki1.png";
const imgUsagiTaiki2 = new Image(); imgUsagiTaiki2.src = "images/usagi_taiki2.png";
const imgAshiba      = new Image(); imgAshiba.src = "images/asiba.png";
const imgHoshi       = new Image(); imgHoshi.src = "images/go-ru.png";
const imgHaikei      = new Image(); imgHaikei.src = "images/haikei.png";
const imgNaraku      = new Image(); imgNaraku.src = "images/naraku.png";
const imgNinnzinn    = new Image(); imgNinnzinn.src = "images/ninnzinn.png";

// --- 初期画面・説明ページの制御 ---
let currentGuidePage = 1;

function updateGuidePageDisplay() {
    document.querySelectorAll('.guide-page').forEach((page, index) => {
        if (index + 1 === currentGuidePage) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });
    document.querySelectorAll('.dot').forEach((dot, index) => {
        if (index + 1 === currentGuidePage) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function nextPage() {
    if (currentGuidePage < 3) {
        currentGuidePage++;
        updateGuidePageDisplay();
    }
}

function prevPage() {
    if (currentGuidePage > 1) {
        currentGuidePage--;
        updateGuidePageDisplay();
    }
}

function closeGuide() {
    document.getElementById("guide-popup").style.display = "none";
    document.getElementById("start-ready-screen").style.display = "flex";
}

function openGuide() {
    document.getElementById("start-ready-screen").style.display = "none";
    document.getElementById("guide-popup").style.display = "flex";
    currentGuidePage = 1;
    updateGuidePageDisplay();
}

// --- ゲーム内の状態管理 ---
let isPlaying = false;
const keys = { ArrowLeft: false, ArrowRight: false, Space: false };

// --- プレイヤー（うさぎ）システム（デルタタイム制御対応） ---
const player = {
    x: 8, y: 300, width: 33, height: 54,
    vx: 0, vy: 0, 
    speed: 260,       // 1秒あたりの移動ピクセル数 (px/秒)
    jumpForce: -650,  // ジャンプ初速 (px/秒)
    gravity: 1600,    // 重力加速度 (px/秒²)
    isGrounded: false, life: 5, maxLife: 5,
    facing: "right",
    
    // アニメーション制御（秒単位の経過時間で管理）
    animTime: 0,
    isBlinking: false, blinkDuration: 1.0, blinkTimer: 0,
    idleTimer: 0, nextBlinkInterval: 0,

    init() {
        this.x = 80; this.y = 300; this.vx = 0; this.vy = 0;
        this.life = 5; this.isBlinking = false; this.idleTimer = 0;
        this.isGrounded = false; this.animTime = 0;
        this.setNextBlink();
    },
    setNextBlink() {
        // 5〜9秒の間でランダムに設定
        this.nextBlinkInterval = Math.random() * (9 - 5) + 5;
    },
    update(dt) {
        // 横移動の速度計算 (px/秒)
        if (keys.ArrowLeft) { this.vx = -this.speed; this.facing = "left"; }
        else if (keys.ArrowRight) { this.vx = this.speed; this.facing = "right"; }
        else { this.vx = 0; }

        // ジャンプ
        if (keys.Space && this.isGrounded) { 
            this.vy = this.jumpForce; 
            this.isGrounded = false; 
            this.animTime = 0;
        }

        // デルタタイム（dt）をかけて位置と速度を更新
        this.vy += this.gravity * dt;
        this.x += this.vx * dt; 
        this.y += this.vy * dt;

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;

        // アニメーション時間の更新
        if (this.isGrounded) {
            if (this.vx !== 0) {
                this.isBlinking = false; this.idleTimer = 0;
                this.animTime += dt;
            } else {
                this.animTime = 0;
                if (!this.isBlinking) {
                    this.idleTimer += dt;
                    if (this.idleTimer >= this.nextBlinkInterval) {
                        this.isBlinking = true; this.blinkTimer = 0;
                    }
                } else {
                    this.blinkTimer += dt;
                    if (this.blinkTimer >= this.blinkDuration) {
                        this.isBlinking = false; this.idleTimer = 0; this.setNextBlink();
                    }
                }
            }
        } else {
            this.animTime += dt;
        }
    },
    draw() {
        let currentImg = imgUsagiTaiki1;

        if (!this.isGrounded) {
            // ネコ（main.js）のジャンプアニメーション手法を参考にした動的フレーム選択
            const t = Math.max(-1, Math.min(1, this.vy / Math.abs(this.jumpForce)));
            const jumpFrames = [imgUsagiTaiki1, imgUsagiHokou1, imgUsagiHokou2, imgUsagiTaiki2];
            const frameIndex = Math.max(0, Math.min(jumpFrames.length - 1, Math.round((t + 1) * 0.5 * (jumpFrames.length - 1))));
            currentImg = jumpFrames[frameIndex];
        } else if (this.vx !== 0) {
            // 歩行アニメーション（約0.13秒ごとに画像を切り替え）
            const walkFrame = Math.floor(this.animTime * 8) % 2;
            currentImg = walkFrame === 0 ? imgUsagiHokou1 : imgUsagiHokou2;
        } else {
            currentImg = this.isBlinking ? imgUsagiTaiki2 : imgUsagiTaiki1;
        }

        ctx.save();
        if (this.facing === "left") {
            ctx.translate(this.x + this.width, this.y); ctx.scale(-1, 1);
            ctx.drawImage(currentImg, 0, 0, this.width, this.height);
        } else {
            ctx.drawImage(currentImg, this.x, this.y, this.width, this.height);
        }
        ctx.restore();
    }
};

// --- ゲーム管理の変数と関数 ---
let isGameover = false;

function showGameover() {
    isGameover = true;
    document.getElementById("gameover-screen").style.display = "flex";
}

function retryGame() {
    isGameover = false;
    document.getElementById("gameover-screen").style.display = "none";
    player.init();
}

// --- 足場データ ---
const platforms = [
    { x:   0, y:  10, w: 200, h:  40, sx:   0, sy:   0, sw: 200, sh:  40 }, 
    { x: -50, y: 375, w: 200, h:  50, sx: 600, sy: 165, sw: 400, sh: 100 },
    { x: 300, y: 300, w:  45, h:  75, sx: 720, sy: 574, sw:  90, sh: 150 },
    { x: 400, y: 175, w: 47.5, h: 50, sx: 520, sy: 586, sw:  95, sh: 100 },
    { x:  50, y: 150, w: 100, h: 150, sx: 620, sy: 574, sw: 100, sh: 150 },
    { x:   0, y: 150, w: 180, h: 100, sx: 700, sy:  46, sw: 180, sh: 100 }
];

// --- にんじんデータ ---
let carrots = [
    { x: 210, y: 340, w: 30, h: 30, active: true },
    { x: 320, y: 260, w: 30, h: 30, active: true },
    { x:  80, y:  90, w: 30, h: 30, active: true }
];

// --- ゴール（星）データ ---
const goalStar = { x: 300, y: 25, w: 75, h: 75 };

function checkCollision(rect1, rect2) {
    const insetX = 8;
    const insetTop = 8;
    const insetBottom = 4;
    const px = rect1.x + insetX;
    const py = rect1.y + insetTop;
    const pw = rect1.width - insetX * 2;
    const ph = rect1.height - insetTop - insetBottom;
    return px < rect2.x + rect2.w && px + pw > rect2.x &&
           py < rect2.y + rect2.h && py + ph > rect2.y;
}

function startGame() {
    document.getElementById("start-ready-screen").style.display = "none";
    isPlaying = true;
    player.init();
    carrots.forEach(c => c.active = true);
}

function restartGame() {
    document.getElementById("clear-screen").style.display = "none";
    document.getElementById("start-ready-screen").style.display = "flex";
    player.init();
    carrots.forEach(c => c.active = true);
}

// --- メインループ（デルタタイム計算の導入） ---
let previousTime = 0;

function gameLoop(timestamp) {
    // 前フレームからの経過時間（秒）を算出（極端な負荷による破綻を防ぐため最大1/30秒に制限）
    const dt = Math.min((timestamp - previousTime) / 1000 || 0, 1 / 30);
    previousTime = timestamp;

    if (isPlaying && !isGameover) {
        const oldBottom = player.y + player.height;
        player.update(dt);

        player.isGrounded = false;
        if (player.vy >= 0) {
            for (const pf of platforms) {
                const hitLeft = player.x + 8;
                const hitRight = player.x + player.width - 8;
                const overlapsHorizontally = hitRight > pf.x && hitLeft < pf.x + pf.w;
                const crossedTop = oldBottom <= pf.y + 8 && player.y + player.height >= pf.y;
                if (overlapsHorizontally && crossedTop) {
                    player.y = pf.y - player.height;
                    player.vy = 0;
                    player.isGrounded = true;
                    break;
                }
            }
        }

        // にんじん取得判定
        carrots.forEach(c => {
            if (c.active && checkCollision(player, c)) {
                c.active = false;
                if (player.life < player.maxLife) player.life++;
            }
        });

        // ゴール判定
        if (checkCollision(player, { x: goalStar.x, y: goalStar.y, w: goalStar.w, h: goalStar.h })) {
            isPlaying = false;
            document.getElementById("clear-screen").style.display = "flex";
        }

        // 落下判定＆ゲームオーバー処理
        if (player.y > canvas.height) {
            player.life--;
            if (player.life <= 0) {
                player.life = 0;
                isPlaying = false;
                showGameover();
            } else {
                player.x = 80; player.y = 300; player.vy = 0;
            }
        }
    }

    // 描画
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgHaikei, 0, 0, canvas.width, canvas.height);

    platforms.forEach(pf => {
        ctx.drawImage(imgAshiba, pf.sx, pf.sy, pf.sw, pf.sh, pf.x, pf.y, pf.w, pf.h);
    });

    carrots.forEach(c => {
        if (c.active) ctx.drawImage(imgNinnzinn, c.x, c.y, c.w, c.h);
    });

    ctx.drawImage(imgHoshi, goalStar.x, goalStar.y, goalStar.w, goalStar.h);

    if (isPlaying || isGameover) player.draw();

    ctx.drawImage(imgNaraku, 0, canvas.height - 200, canvas.width, 200);

    // UI表示
    if (isPlaying) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; ctx.fillRect(15, 15, 160, 40);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 16px sans-serif";
        ctx.fillText(`ライフ: ${"❤️".repeat(player.life)}${"🖤".repeat(player.maxLife - player.life)}`, 25, 41);
    }

    requestAnimationFrame(gameLoop);
}

// キー入力制御
window.addEventListener("keydown", e => {
    if (e.code === "ArrowLeft")  keys.ArrowLeft = true;
    if (e.code === "ArrowRight") keys.ArrowRight = true;
    if (e.code === "Space") { keys.Space = true; e.preventDefault(); }
});
window.addEventListener("keyup", e => {
    if (e.code === "ArrowLeft")  keys.ArrowLeft = false;
    if (e.code === "ArrowRight") keys.ArrowRight = false;
    if (e.code === "Space")      keys.Space = false;
});

// 開始
requestAnimationFrame(gameLoop);