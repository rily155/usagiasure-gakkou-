const CaptureAnimation = (() => {
    const ball = document.getElementById('captureBall');
    const enemy = document.getElementById('enemy');
    let current = null;
    function reset(){ if(current) current.cancel(); current=null; ball.hidden=true; ball.style.opacity='1'; enemy.style.opacity='1'; }
    async function play(outcome, token, epoch, message, name){
        const valid=()=>token===epoch();
        const delay=ms=>new Promise(r=>setTimeout(r,ms));
        async function motion(frames,ms){
            const a=ball.animate(frames,{duration:ms,easing:'ease-in-out'}); current=a;
            try{await a.finished;}catch{return false;}
            if(current===a) current=null;
            return valid();
        }
        message('モンスターボールを なげた！'); ball.hidden=false;
        if(!await motion([{transform:'translate(-43cqw, 18cqw)'},{transform:'translate(-20cqw,-19cqw) rotate(180deg)',offset:.5},{transform:'translate(0,-9cqw) rotate(360deg)'}],700))return false;
        enemy.style.opacity='0';
        if(!await motion([{transform:'translateY(-9cqw)'},{transform:'translateY(0)'}],350))return false;
        await delay(400); if(!valid())return false;
        for(let i=0;i<outcome.shakes;i++){
            // 左に傾く → 中央 → 右に傾く → 中央。
            // 左右の振り幅と時間を対称にし、毎回中央へ戻す。
            if(!await motion([
                {transform:'rotate(0deg)',offset:0},
                {transform:'rotate(-28deg)',offset:0.25},
                {transform:'rotate(0deg)',offset:0.5},
                {transform:'rotate(28deg)',offset:0.75},
                {transform:'rotate(0deg)',offset:1}
            ],600))return false;
            await delay(400); if(!valid())return false;
        }
        if(outcome.caught){message('カチッ！'); await delay(550); return valid();}
        ball.hidden=true; enemy.style.opacity='1'; return valid();
    }
    return {reset,play};
})();
