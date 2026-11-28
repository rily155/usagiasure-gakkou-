/** 第3世代以降の能力値計算（性格補正あり）。 */
export const STAT_KEYS = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'];
export const NATURES = [
  ['がんばりや',null,null],['さみしがり','attack','defense'],['ゆうかん','attack','speed'],['いじっぱり','attack','specialAttack'],['やんちゃ','attack','specialDefense'],
  ['ずぶとい','defense','attack'],['すなお',null,null],['のんき','defense','speed'],['わんぱく','defense','specialAttack'],['のうてんき','defense','specialDefense'],
  ['おくびょう','speed','attack'],['せっかち','speed','defense'],['まじめ',null,null],['ようき','speed','specialAttack'],['むじゃき','speed','specialDefense'],
  ['ひかえめ','specialAttack','attack'],['おっとり','specialAttack','defense'],['れいせい','specialAttack','speed'],['てれや',null,null],['うっかりや','specialAttack','specialDefense'],
  ['おだやか','specialDefense','attack'],['おとなしい','specialDefense','defense'],['なまいき','specialDefense','speed'],['しんちょう','specialDefense','specialAttack'],['きまぐれ',null,null]
];
export function calculatePokemonStats(base, level, ivs, evs, nature = NATURES[0], pokemonId = null) {
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new Error('レベルは1〜100で指定してください');
  const [, up, down] = nature;
  const result = {};
  for (const key of STAT_KEYS) {
    const b = Number(base[key]), iv = Number(ivs[key]), ev = Number(evs[key]);
    if (!Number.isInteger(b) || b < 1 || !Number.isInteger(iv) || iv < 0 || iv > 31 || !Number.isInteger(ev) || ev < 0 || ev > 252) {
      throw new Error(`能力値計算に必要なデータが不正です: ${key}`);
    }
    const core = Math.floor((2 * b + iv + Math.floor(ev / 4)) * level / 100);
    result[key] = key === 'hp' ? (Number(pokemonId) === 292 ? 1 : core + level + 10)
      : Math.floor((core + 5) * (key === up ? 1.1 : key === down ? 0.9 : 1));
  }
  return result;
}
