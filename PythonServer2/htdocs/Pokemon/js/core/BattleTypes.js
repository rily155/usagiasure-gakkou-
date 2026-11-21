import {masterRows} from './PokemonFactory.js';
const names=['normal','fighting','fire','ice','electric','flying','grass','ground','poison','bug','dark','water','psychic','dragon','rock','ghost','fairy','steel'];
const ja=['ノーマル','かくとう','ほのお','こおり','でんき','ひこう','くさ','じめん','どく','むし','あく','みず','エスパー','ドラゴン','いわ','ゴースト','フェアリー','はがね'];
export const typeCode=t=>names[ja.indexOf(t)]||t;
export async function prepareTypes(party,enemy){
 const types={}, chart={};
 await Promise.all([...party,enemy].map(async p=>{types[p.pokemonId]=(await masterRows('pokemon_types',{pokemon_id:p.pokemonId})).map(r=>r.type);if(!types[p.pokemonId].length)throw Error('タイプ未登録');}));
 await Promise.all(names.map(async t=>{const rows=await masterRows('type_effectiveness',{attack_type:t});chart[t]=Object.fromEntries(rows.map(r=>[r.defense_type,Number(r.multiplier)]));if(names.some(k=>!Number.isFinite(chart[t][k])))throw Error('タイプ相性未登録: '+t);}));
 return {types,chart};
}
