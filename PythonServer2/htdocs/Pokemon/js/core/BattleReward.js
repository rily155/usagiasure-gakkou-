import { calculatePokemonStats, NATURES } from './PokemonStats.js';
import { masterRows } from './PokemonFactory.js';

// 現行の基礎経験値と旧世代風の簡易計算を組み合わせる。
export async function prepareBattleRewards(enemy, party) {
  const details = (await masterRows('pokemon_species_details', {pokemon_id: enemy.pokemonId}))[0];
  const base = Number(details?.base_experience);
  if (!Number.isInteger(base) || base <= 0) throw new Error('基礎経験値が取得できません');
  const curves = new Map();
  await Promise.all([...new Set(party.map(p => p.growthRate))].map(async growth => {
    const rows = await masterRows('experience_groups', {growth_rate:growth});
    const curve = new Map(rows.map(r=>[Number(r.level),Number(r.total_exp)]));
    // APIの取得件数制限にも対応する。
    for(let lv=1;lv<=100;lv++) {
      if(!curve.has(lv)) {
        const row=(await masterRows('experience_groups',{growth_rate:growth,level:lv}))[0];
        if(!row) throw new Error(`経験値テーブル不足: ${growth} Lv.${lv}`);
        curve.set(lv,Number(row.total_exp));
      }
      const exp=curve.get(lv);
      if(!Number.isInteger(exp)||exp<0||(lv>1&&exp<curve.get(lv-1))) throw new Error('経験値テーブルが不正です');
    }
    curves.set(growth,curve);
  }));
  return {base,curves};
}
export function experienceProgress(p, curve) {
  const start=curve.get(p.level), next=p.level===100?start:curve.get(p.level+1);
  return {nextLevelExperience:Math.max(0,next-p.experience), expProgress:p.level===100?1:Math.max(0,Math.min(1,(p.experience-start)/(next-start||1)))};
}
// 生存している参加者だけに等分。現行の個体値・努力値・性格を維持する。
export function applyVictoryExperience(party, participants, enemy, rewards) {
  const ids=new Set(participants);
  const eligible=party.filter(p=>ids.has(p.instanceId)&&p.hp>0);
  if(!eligible.length) return [];
  const share=Math.floor(rewards.base*enemy.level/7/eligible.length);
  const messages=[];
  for(const p of eligible) {
    const curve=rewards.curves.get(p.growthRate), oldLevel=p.level;
    const oldExp=Number(p.experience);
    if (!Number.isInteger(oldExp) || oldExp < 0) throw new Error(`経験値が不正です: ${p.name}`);
    p.experience=Math.min(curve.get(100),oldExp+share);
    while(p.level<100&&p.experience>=curve.get(p.level+1)) p.level++;
    if(p.level!==oldLevel) {
      const stats=calculatePokemonStats(p.baseStats,p.level,p.ivs,p.evs,NATURES.find(n=>n[0]===p.nature)||NATURES[0],p.pokemonId);
      p.hp=p.currentHp=Math.min(stats.hp,p.hp+stats.hp-p.maxHp);
      p.maxHp=stats.hp; p.stats=stats;
    }
    Object.assign(p,experienceProgress(p,curve));
    const name=p.nickname||p.name;
    messages.push(p.experience>oldExp?`${name}は\n${p.experience-oldExp}の けいけんちを もらった！`:`${name}の けいけんちは\nこれいじょう ふえなかった！`);
    if(p.level>oldLevel) messages.push(`${name}は\nLv.${p.level}に あがった！`);
  }
  return messages;
}
