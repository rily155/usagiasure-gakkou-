// マップエディタの encounterRegions に基づく歩行時の抽選。
export function rollEncounter(map, x, y, state, random = Math.random) {
  const region = (map.encounterRegions || []).find(r =>
    x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  if (!region) { state.region = null; state.steps = 0; return null; }
  if (state.region !== region) { state.region = region; state.steps = 0; }
  if (state.steps < Math.max(0, Number(region.safeSteps) || 0)) {
    state.steps++; return null;
  }
  const rate = Math.max(0, Math.min(1, Number(region.rate) || 0));
  if (random() >= rate) return null;
  const monsters = (region.monsters || []).filter(m =>
    Number.isInteger(Number(m.pokemonId)) && Number(m.pokemonId) >= 1 && Number(m.pokemonId) <= 251 && Number.isFinite(Number(m.weight)) && Number(m.weight) > 0);
  const total = monsters.reduce((sum, m) => sum + Number(m.weight), 0);
  if (!total) return null;
  let ticket = random() * total;
  const monster = monsters.find(m => (ticket -= Number(m.weight)) < 0) || monsters.at(-1);
  const levelOf = n => Math.max(1, Math.min(100, Math.floor(Number(n) || 1)));
  const min = levelOf(monster.minLevel), max = Math.max(min, levelOf(monster.maxLevel));
  state.steps = 0;
  return { pokemonId: Number(monster.pokemonId), level: min + Math.floor(random() * (max - min + 1)) };
}
