const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 1. 画像の読み込み（エラーが起きてもゲームを止めない対策付き） ---
let imagesLoaded = { bg: false, player: false, platform: false, abyss: false, goal: false };

const imgBg = new Image();       imgBg.src = ;
const imgPlayer = new Image();   imgPlayer.src = ;
const imgPlatform = new Image(); imgPlatform.src = ;
const imgAbyss = new Image();    imgAbyss.src = ;
const imgGoalStar = new Image(); imgGoalStar.src = ; 
const imgWalk1 = new Image();   imgPlayer.src = ;
const imgWalk2 = new Image();   imgPlayer.src = "../images/ninnzinn.png";

// 画像が読み込めたらフラグを真（true）にする
imgBg.onload = () => imagesLoaded.bg = true;
imgPlayer.onload = () => imagesLoaded.player = true;
imgPlatform.onload = () => imagesLoaded.platform = true;
imgAbyss.onload = () => imagesLoaded.abyss = true;
imgGoalStar.onload = () => imagesLoaded.goal = true;
imgWalk1.onload = () => imagesLoaded.player1 = true;
imgWalk2.onload = () => imagesLoaded.player2 = true;

// --- 2. ゲームのデータ設定 ---
let player = { 
    x: 0, y: 0, w: 87.5, h: 100.5, 
    dy: 0, jump: -12, speed: 4, onGround: false 
};

let gravity = 0.6;
let scrollX = 0;
let score = 0;
let lives = 5;
let isGameClear = false;

// 足場の配置
let mapObjects = [
    { sx: 700, sy: 45, sw: 294, sh: 200, x: -50, y: 230, w: 294, h: 200 },
    { sx: 530, sy: 585, sw: 85, sh: 100, x: 330, y: 150, w: 85, h: 100 },
    { sx: 620, sy: 574, sw: 90, sh: 105, x: 500, y: 100, w: 90, h: 105 },
    { sx: 726, sy: 573, sw: 90, sh: 105, x: 700, y: 80, w: 90, h: 105 },
    { sx: 640, sy: 150, sw: 500, sh: 100,  x: 100, y: 100, w: 500, h: 100 },
    { sx: 100, sy: 900, sw: 280, sh: 100, x: 500, y: 500, w: 250, h: 120 },
    { sx: 0, sy: 0, sw: 0, sh: 0, x: 0, y: 0, w: 0, h: 0 },
    { sx: 0, sy: 0, sw: 0, sh: 0, x: 0, y: 0, w: 0, h: 0 },
    { sx: 0, sy: 0, sw: 0, sh: 0, x: 0, y: 0, w: 0, h: 0 },
];

// 🎯 星（ゴール）の位置
let goal = { x: 980, y: 220, w: 50, h: 50 };

let keys = {};

window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('click', () => { canvas.focus(); });

// --- 3. ゲームのメインループ ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    const keys = { right: false, left: false };

    window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") keys.right = true;
    if (e.key === "ArrowLeft") keys.left = true;
    });

    window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowRight") keys.right = false;
    if (e.key === "ArrowLeft") keys.left = false;
});

    player.dy += gravity;
    player.y += player.dy;
    player.onGround = false;

    // 足場との衝突判定
    mapObjects.forEach(obj => {
        if (player.x < obj.x + obj.w && player.x + player.w > obj.x &&
            player.y + player.h > obj.y && player.y + player.h < obj.y + obj.h + player.dy) {
            player.y = obj.y - player.h;
            player.dy = 0;
            player.onGround = true;
        }
    });

    if (player.x > canvas.width / 3) {
        scrollX = player.x - canvas.width / 3;
    }

    // 奈落判定
    if (player.y > canvas.height) {
        lives--;
        if (lives <= 0) {
            score = 0;
            lives = 5;
        }
        resetGame();
    }

    // 星との当たり判定
    if (player.x < goal.x + goal.w && player.x + player.w > goal.x &&
        player.y < goal.y + goal.h && player.y + player.h > goal.y) {
        isGameClear = true;
        score += 500;
    }
}

// --- 4. 画面の描画処理 ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ① 背景の描画（画像がなければピンク色のグラデーション）
    if (imagesLoaded.bg) {
        let bgX = -(scrollX * 0.3) % canvas.width; 
        ctx.drawImage(imgBg, bgX, 0, canvas.width, canvas.height);
        ctx.drawImage(imgBg, bgX + canvas.width, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#fff0f5";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    ctx.translate(-scrollX, 0);

    // ② 足場の描画（画像がなければミント色の四角）
    mapObjects.forEach(obj => {
        if (imagesLoaded.platform) {
            ctx.drawImage(imgPlatform, obj.sx, obj.sy, obj.sw, obj.sh, obj.x, obj.y, obj.w, obj.h);
        } else {
            ctx.fillStyle = "#afeeee";
            ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
        }
    });

    // ③ ⭐ ゴールの星の描画（画像がなければ黄色い丸）
    if (imagesLoaded.goal) {
        ctx.drawImage(imgGoalStar, goal.x, goal.y, goal.w, goal.h);
    } else {
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(goal.x + goal.w/2, goal.y + goal.h/2, goal.w/2, 0, Math.PI * 2);
        ctx.fill();
    }

    // ④ プレイヤーの描画（画像がなければ白い四角）
    if (imagesLoaded.player) {
        ctx.drawImage(imgPlayer, player.x, player.y, player.w, player.h);
    } else {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#ffb6c1";
        ctx.lineWidth = 3;
        ctx.fillRect(player.x, player.y, player.w, player.h);
        ctx.strokeRect(player.x, player.y, player.w, player.h);
    }

    ctx.restore();

    // ⑤ 奈落の描画（画像がなければ紺色の床）
    if (imagesLoaded.abyss) {
        ctx.drawImage(imgAbyss, 0, 320, canvas.width, 80);
    } else {
        ctx.fillStyle = "#191970";
        ctx.fillRect(0, 320, canvas.width, 80);
    }

    // ⑥ UI
    ctx.fillStyle = "#887a93";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(`SCORE: ${score}`, 20, 30);
    ctx.fillText(`LIVES: ${"❤️".repeat(lives)}`, 20, 55);

    // クリア画面
    if (isGameClear) {
        ctx.fillStyle = "rgba(255, 220, 235, 0.8)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#e096b7";
        ctx.font = "bold 40px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("CONGRATULATIONS!", canvas.width / 2, canvas.height / 2);
    }
}

function resetGame() {
    player.x = 60;
    player.y = 200;
    player.dy = 0;
    isGameClear = false;
}

window.resetGame = resetGame;

// 画像の読み込みを待たずに、すぐにゲームのループを開始する！
gameLoop();