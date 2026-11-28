const CaptureRules = (() => {
    const cache = new Map();
    async function rate(id) {
        if (!Number.isInteger(Number(id)) || Number(id) < 1) throw new Error('不正なポケモンID');
        const key = Number(id);
        if (!cache.has(key)) {
            cache.set(key, (async () => {
                const res = await fetch(`/api/games/pokemon/master/query/pokemon_species_details?pokemon_id=${key}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const body = await res.json();
                const row = body.rows?.find(r => Number(r.pokemon_id) === key);
                const value = Number(row?.capture_rate);
                if (!Number.isInteger(value) || value < 1 || value > 255) throw new Error('捕獲率がありません');
                return value;
            })().catch(error => { cache.delete(key); throw error; }));
        }
        return cache.get(key);
    }
    function probability({rate, maxHp, hp, ball = 1, status}) {
        if (![rate,maxHp,hp,ball].every(Number.isFinite) || rate < 1 || rate > 255 || maxHp <= 0 || hp <= 0 || hp > maxHp || ball <= 0) throw new Error('捕獲条件が不正です');
        const code = String(status?.code ?? status ?? '').toLowerCase();
        const multiplier = ['sleep','slp','freeze','frz','frozen','ねむり','こおり'].includes(code) ? 2.5 : ['paralysis','par','paralyzed','poison','psn','toxic','burn','brn','まひ','どく','もうどく','やけど'].includes(code) ? 1.5 : 1;
        return Math.min(1, (3 * maxHp - 2 * hp) * rate * ball * multiplier / (3 * maxHp * 255));
    }
    return Object.freeze({rate, probability});
})();
