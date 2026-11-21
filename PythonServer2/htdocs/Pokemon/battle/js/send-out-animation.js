/* 味方ポケモンを出す際の投球演出。CSSの段階的な補間ではなく、
 * 二次曲線上の多数の座標を計算して滑らかな放物線を作る。 */
const SendOutAnimation = (() => {
    const ball = document.getElementById('ball');
    let active = null;
    let trainerAnimation = null;
    const trainer = document.getElementById('trainer');

    function reset() {
        if (active) active.cancel();
        active = null;
        if (trainerAnimation) trainerAnimation.cancel();
        trainerAnimation = null;
        trainer.style.transform = '';
        trainer.style.opacity = '';
        ball.hidden = true;
        ball.style.transform = '';
    }

    function startTrainerExit() {
        // トレーナーが先に左へ移動・フェードアウトを開始する。
        if (trainerAnimation) trainerAnimation.cancel();
        trainerAnimation = trainer.animate([
            { transform: 'translateX(0)', opacity: 1, offset: 0 },
            { transform: 'translateX(-5cqw)', opacity: .75, offset: .35 },
            { transform: 'translateX(-18cqw)', opacity: 0, offset: 1 }
        ], { duration: 500, easing: 'ease-in', fill: 'forwards' });
    }

    async function throwBall(token, getEpoch) {
        if (token !== getEpoch()) return false;
        ball.hidden = false;
        const frames = [];
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            // xは一定速度で進み、yは放物線。負のyが画面上方向。
            const x = 24 * t; // 開始10%、到達34%。前回より軌道全体をさらに左へ6cqw移動
            const y = -(44 * t * (1 - t) + 2 * t);
            const angle = 1080 * t; // 回転速度を2倍（3回転）
            frames.push({
                offset: t,
                transform: `translate(${x.toFixed(4)}cqw, ${y.toFixed(4)}cqw) rotate(${angle.toFixed(2)}deg)`
            });
        }

        const animation = ball.animate(frames, {
            duration: 850,
            easing: 'linear',
            fill: 'forwards'
        });
        active = animation;
        try {
            await animation.finished;
        } catch (_) {
            return false;
        }
        if (token !== getEpoch() || active !== animation) return false;
        // 最終姿勢を維持する必要がないため、非表示にしてアニメーションを解除。
        ball.hidden = true;
        trainer.hidden = true;
        if (trainerAnimation) trainerAnimation.cancel();
        trainerAnimation = null;
        trainer.style.transform = '';
        trainer.style.opacity = '';
        animation.cancel();
        active = null;
        ball.style.transform = '';
        return true;
    }

    return { reset, startTrainerExit, throwBall };
})();
