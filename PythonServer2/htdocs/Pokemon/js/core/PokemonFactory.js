import { STAT_KEYS, NATURES, calculatePokemonStats } from './PokemonStats.js';

// マスターは必ずPythonWebServerの読み取り専用SQLite APIから取得する。
const API_ROOT = '/api/games/pokemon/master/query';
const cache = new Map();
const pick = (obj, ...keys) => keys.map(k => obj?.[k]).find(v => v !== undefined && v !== null);
const numeric = (obj, ...keys) => { const v = pick(obj, ...keys); return v === undefined ? NaN : Number(v); };
export async function masterRows(table, filters = {}) {
  const params = new URLSearchParams(Object.entries(filters).map(([k,v]) => [k,String(v)]));
  const url = `${API_ROOT}/${encodeURIComponent(table)}?${params}`;
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(async res => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`マスターAPI ${table}: ${body.error || `HTTP ${res.status}`}`);
      if (!Array.isArray(body.rows)) throw new Error(`マスターAPI ${table}: rows配列がありません`);
      return body.rows;
    }).catch(e => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}
// master.sqlite3 の実カラムに対応。存在しないカラムを試さない。
const ID_COLUMNS = Object.freeze({
  pokemon: 'id',
  pokemon_base_stats: 'pokemon_id',
  pokemon_species_details: 'pokemon_id',
  moves: 'id',
});

async function byPokemonId(table, id) {
  const column = ID_COLUMNS[table];
  if (!column) {
    throw new Error(`未対応のマスターテーブル: ${table}`);
  }
  const result = await masterRows(table, { [column]: id });
  if (result.length === 0) {
    throw new Error(`${table} にID ${id}のデータがありません`);
  }
  return result;
}
function iv() {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] % 32;
  }
  return Math.floor(Math.random() * 32);
}
async function experienceFor(growthRate, level) {
  // master.sqlite3: experience_groups(growth_rate, level, total_exp)
  const matches = await masterRows('experience_groups', {
    growth_rate: growthRate,
    level,
  });
  const found = matches.find(row => Number(row.level) === level);
  const value = numeric(found, 'total_exp');
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`経験値テーブルから成長タイプ${growthRate}・Lv.${level}を取得できません`);
  }
  return value;
}
export async function createPokemon(pokemonId, level = 5) {
  pokemonId = Number(pokemonId); level = Number(level);
  if (!Number.isInteger(pokemonId) || pokemonId < 1 || pokemonId > 251 || !Number.isInteger(level) || level < 1 || level > 100) {
    throw new Error('ポケモンIDまたはレベルが不正です');
  }
  const [pokemonRows, baseRows, detailRows, learnRows] = await Promise.all([
    byPokemonId('pokemon', pokemonId), byPokemonId('pokemon_base_stats', pokemonId),
    byPokemonId('pokemon_species_details', pokemonId), masterRows('pokemon_gen2_learnsets', { pokemon_id: pokemonId })
  ]);
  const species = pokemonRows[0], baseRow = baseRows[0], details = detailRows[0];
  const baseStats = {
    hp: numeric(baseRow,'hp','base_hp'), attack: numeric(baseRow,'attack','base_attack'),
    defense: numeric(baseRow,'defense','base_defense'),
    specialAttack: numeric(baseRow,'special_attack','specialAttack','sp_attack','base_special_attack'),
    specialDefense: numeric(baseRow,'special_defense','specialDefense','sp_defense','base_special_defense'),
    speed: numeric(baseRow,'speed','base_speed')
  };
  if (Object.values(baseStats).some(v => !Number.isInteger(v) || v < 1)) {
    throw new Error(`No.${pokemonId}の種族値カラムが想定と異なります。pokemon_base_statsを確認してください`);
  }
  const growthRate = pick(details,'growth_rate_id','growth_rate','experience_group_id','growth_group_id');
  if (growthRate === undefined) throw new Error('pokemon_species_detailsに成長タイプがありません');
  const experience = await experienceFor(growthRate, level);
  const nextLevelExperience = level === 100 ? 0 : (await experienceFor(growthRate, level + 1)) - experience;
  const ivs = Object.fromEntries(STAT_KEYS.map(key => [key, iv()]));
  const evs = Object.fromEntries(STAT_KEYS.map(key => [key, 0]));
  const nature = NATURES[Math.floor(Math.random() * NATURES.length)];
  const stats = calculatePokemonStats(baseStats, level, ivs, evs, nature, pokemonId);
  const learned = learnRows
    .filter(r => {
      const method = String(pick(r, 'learn_method', 'method') || '').toLowerCase();
      const learnLevel = Number(pick(r, 'learn_level', 'level'));
      const version = pick(r, 'game_version', 'version');
      return ['level-up', 'level', 'level_up'].includes(method) &&
        learnLevel <= level &&
        (version == null || String(version).toLowerCase() === 'crystal');
    })
    .sort((a, b) => Number(pick(a, 'learn_level', 'level')) - Number(pick(b, 'learn_level', 'level')));
  const unique = [];
  for (const row of learned) {
    const id = numeric(row,'move_id');
    if (!Number.isInteger(id)) continue;
    const index = unique.indexOf(id); if (index >= 0) unique.splice(index,1);
    unique.push(id);
  }
  const moveIds = unique.slice(-4);
  if (!moveIds.length) throw new Error(`No.${pokemonId}のLv.${level}で使える技がありません`);
  const moves = await Promise.all(moveIds.map(async id => {
    const move = (await byPokemonId('moves',id))[0];
    const pp = numeric(move,'pp','base_pp');
    if (!Number.isInteger(pp) || pp < 1) throw new Error(`技No.${id}のPPが不正です`);
    return { id, moveId:id, name:pick(move,'name_ja','name','identifier') || `技${id}`,
      pp, maxPp:pp, power:pick(move,'power'), accuracy:pick(move,'accuracy'),
      type:pick(move,'type','type_id'), category:pick(move,'category','damage_class') };
  }));
  const name = pick(species,'name_ja','name','identifier') || `No.${pokemonId}`;
  return {
    instanceId:globalThis.crypto?.randomUUID?.() || `pk_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    pokemonId,name,nickname:'',level,experience,nextLevelExperience,expProgress:level===100?1:0,growthRate,nature:nature[0],ivs,evs,baseStats,stats,
    hp:stats.hp,currentHp:stats.hp,maxHp:stats.hp,moves,status:null,heldItem:null,
    friendship:numeric(details,'base_happiness','base_friendship') || 70
  };
}
