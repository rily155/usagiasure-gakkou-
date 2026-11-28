// フィールド側で確定した経験値・レベルを、バトル画面に反映する。
// 計算・保存はゲーム本体側が担当し、ここでは表示のみ行う。
(function () {
  if (!embedded) return;
  let animating = false;
  const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
  const animate = (from, to, ms) => new Promise(resolve => {
    const begin = performance.now();
    function step(now) {
      const t = Math.min(1, (now - begin) / ms);
      hero.expProgress = from + (to - from) * t;
      document.querySelector('.exp').style.setProperty('--exp-progress', `${clamp(hero.expProgress) * 100}%`);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
  window.addEventListener('message', async event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'exp-reward' || animating) return;
    animating = true;
    const updated = Array.isArray(event.data.party) ? event.data.party : [];
    const previous = hero;
    const target = updated.find(p => p.instanceId === previous?.instanceId);
    try {
      if (target) {
        const oldLevel = Number(previous.level) || 1;
        const newLevel = Number(target.level) || oldLevel;
        const from = clamp(previous.expProgress);
        const to = clamp(target.expProgress);
        $('menu').hidden = true;
        busy = true;
        message(`${previous.name}は\nけいけんちを もらった！`);
        if (newLevel > oldLevel) {
          await animate(from, 1, 700);
          for (let lv = oldLevel + 1; lv <= newLevel; lv++) {
            previous.level = lv;
            previous.expProgress = 0;
            refresh();
            message(`${previous.name}は\nLv.${lv}に あがった！`);
            await wait(550);
            if (lv < newLevel) await animate(0, 1, 350);
          }
          await animate(0, to, 600);
        } else {
          await animate(from, to, 950);
        }
        previous.level = newLevel;
        previous.experience = target.experience;
        previous.nextLevelExperience = target.nextLevelExperience;
        previous.expProgress = to;
        refresh();
        await wait(250);
      }
    } catch (error) {
      console.error('[ExperienceAnimation]', error);
    } finally {
      parent.postMessage({type:'exp-animation-done'}, location.origin);
    }
  });
})();
