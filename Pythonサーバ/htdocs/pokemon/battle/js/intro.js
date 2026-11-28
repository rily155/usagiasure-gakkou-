const TRAINER_FRAME_COUNT = 5;
        const TRAINER_FRAME_MS = 100;
        function setTrainerFrame(frame) {
            const index = Math.max(0, Math.min(TRAINER_FRAME_COUNT - 1, frame));
            $('trainer').style.backgroundPosition = `${index / (TRAINER_FRAME_COUNT - 1) * 100}% 0`;
        }
        async function start() {
            const t = ++epoch;
            busy = true;
            screen = 'intro';
            $('menu').hidden = true; $('moveDetails').hidden = true; $('game').classList.remove('is-move-select'); CaptureAnimation.reset();
            for (const id of ['mine', 'enemy']) {
                $(id).classList.remove('hit', 'lunge');
                $(id).style.opacity = 1;
            }
            const ids = [Number($('choice').value), ...Object.keys(species).map(Number).filter(i => i !== Number($('choice').value))];
            party = ids.map(id => ({ id, ...species[id], current: species[id].hp, moves: species[id].moves.map(m => [...m]) }));
            if (embedded) {
                if (!initial) return;
                opponent = initial.enemy;
                party = initial.party.map(p => ({ instanceId:p.instanceId, id:p.pokemonId, name:p.nickname||p.name, level:p.level, stats:p.stats, expProgress:p.expProgress, experience:p.experience, nextLevelExperience:p.nextLevelExperience, hp:p.maxHp, current:p.hp, moves:(p.moves||[]).map(m=>[m.name, Number(m.power)>0?Math.max(1,Math.round(Number(m.power)/8)):0, Number(m.pp), m, Number(m.maxPp ?? m.max_pp ?? m.pp)]) }));
            }
            hero = party.find(p => p.current > 0);
            if (!hero) return;
            active = party.indexOf(hero);
            participants = new Set([hero.instanceId]);
            enemyHP = opponent.maxHp;
            weak = 0;
            result = 'run';
            items = embedded ? {...initial.items} : {potion:2, ball:5};
            if(window.BattleBag)BattleBag.reset();
            SendOutAnimation.reset();
            lastHp={};
            battleEvent("intro");
            refresh();
            $('mine').hidden = true;
            $('myStatus').hidden = true;
            $('trainer').hidden = false;
            setTrainerFrame(0);
            $('ball').hidden = true;
            $('spark').hidden = true;
            $('sendoutGlow').hidden = true;
            if (!await pause((initial?.battleType === 'trainer' ? `トレーナーが ${opponent.name}を\nくりだした！` : `やせいの ${opponent.name}が\nとびだしてきた！`), t)) return;
            SendOutAnimation.startTrainerExit();
            await wait(120);
            if (t !== epoch) return;
            for (let i = 1; i < TRAINER_FRAME_COUNT; i++) {
                setTrainerFrame(i);
                await wait(TRAINER_FRAME_MS);
                if (t !== epoch) return;
            }
            const throwPromise = SendOutAnimation.throwBall(t, () => epoch);
            await wait(800);
            if (t !== epoch) return;
            message(`ゆけっ！ ${hero.name}！`);
            const glow = $('sendoutGlow');
            glow.hidden = false;
            glow.style.animation = 'none';
            void glow.offsetWidth;
            glow.style.animation = '';
            $('spark').hidden = false;
            await wait(130);
            if (t !== epoch) return;
            $('mine').hidden = false;
            $('myStatus').hidden = false;
            if (!await throwPromise) return;
            $('trainer').hidden = true;
            await wait(390);
            if (t !== epoch) return;
            $('spark').hidden = true;
            glow.hidden = true;
            battleEvent("battleStart");
            command();
        }
