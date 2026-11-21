async function capture() {
    if (!items.ball) { message('ボールが ない！'); return; }
    const t = epoch;
    hide();
    let probability;
    try {
        const rate = embedded ? await CaptureRules.rate(opponent.pokemonId) : 255;
        probability = CaptureRules.probability({rate, maxHp: opponent.maxHp, hp: enemyHP, status: opponent.status});
    } catch (error) {
        if (t !== epoch) return;
        busy = false;
        bag();
        message('捕獲データの取得に失敗しました。\n' + error.message);
        return;
    }
    if (t !== epoch) return;
    items.ball--;
    const caught = Math.random() < probability;
    const outcome = { caught, shakes: caught ? 3 : Math.floor(Math.random() * 3) };
    const completed = await CaptureAnimation.play(outcome, t, () => epoch, message, opponent.name);
    if (!completed) return;
    if (caught) {
        $('enemy').style.opacity = 0;
        result = 'caught';
        end(`やったー！ ${opponent.name}を\nつかまえた！`);
    } else if (await pause('あっ！ ボールから でてしまった！', t)) {
        await counter(t);
    }
}
