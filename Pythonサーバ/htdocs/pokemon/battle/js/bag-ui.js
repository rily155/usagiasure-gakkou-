'use strict';
const BattleBag = (() => {
 const categories=[{id:'ball',label:'ボール',icon:'monster-ball.png'},{id:'heal',label:'かいふく',icon:'item.png'},{id:'key',label:'たいせつ',icon:'keyitem.png'}];
 const known={
 'poke-ball':['モンスターボール','ball','野生のポケモンを捕まえるボール。'],
 'great-ball':['スーパーボール','ball','少し捕まえやすいボール。'],
 'ultra-ball':['ハイパーボール','ball','捕まえやすい高性能なボール。'],
 'master-ball':['マスターボール','ball','必ず捕まえられる特別なボール。'],
 'potion':['キズぐすり','heal','HPを20回復する。',20],
 'super-potion':['いいキズぐすり','heal','HPを50回復する。',50],
 'hyper-potion':['すごいキズぐすり','heal','HPを200回復する。',200],
 'max-potion':['まんたんのくすり','heal','HPを全回復する。',9999],
 'full-restore':['かいふくのくすり','heal','HPを全回復する。',9999],
 'antidote':['どくけし','heal','どく状態を回復する。'],
 'revive':['げんきのかけら','heal','ひんしのポケモンを回復する。']};
 let inventory=[],metadata=new Map(),category=0,selected=0,open=false,loading=false;
 const keyOf=id=>String(id??'').trim().toLowerCase().replace(/_/g,'-');
 function initialize(rows){inventory=(Array.isArray(rows)?rows:[]).filter(x=>x&&Number(x.quantity)>0).map(x=>({itemId:String(x.itemId),quantity:Number(x.quantity)}));metadata.clear();category=0;selected=0;open=false;$('battleBag').hidden=true;}
 function normalize(row,id){const identifier=keyOf(row?.identifier||id);const local=known[identifier];const rawCategory=String(row?.category||row?.category_identifier||row?.category_name||'').toLowerCase();const kind=local?.[1]||(/ball/.test(rawCategory)?'ball':/(healing|medicine|status|revival)/.test(rawCategory)?'heal':'key');
 const image=String(row?.image_path||'');const filename=image.split(/[\\/]/).pop();const icon=filename&&/^[a-z0-9_.-]+\.png$/i.test(filename)?filename:identifier+'.png';
 return {name:row?.name_ja||row?.name_japanese||row?.name||local?.[0]||identifier,desc:row?.description_ja||row?.description_en||row?.effect_ja||row?.effect_en||row?.effect||row?.description||local?.[2]||'アイテムの説明はありません。',kind,icon:`/storage/games/pokemon/battle/assets/items/${icon}`,heal:local?.[3]||0};}
 async function getMeta(id){const key=keyOf(id);if(metadata.has(key))return metadata.get(key);const fallback=normalize(null,key);metadata.set(key,fallback);try{const res=await fetch(`/api/games/pokemon/master/query/items?identifier=${encodeURIComponent(key)}`);if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();const rows=Array.isArray(data)?data:Array.isArray(data.rows)?data.rows:Array.isArray(data.data)?data.data:Array.isArray(data.data?.rows)?data.data.rows:Array.isArray(data.items)?data.items:[];const row=rows.find(r=>keyOf(r.identifier)===key||String(r.item_id)===key||String(r.id)===key);if(row)metadata.set(key,normalize(row,key));}catch(e){console.warn('[BattleBag] item metadata unavailable:',key,e.message)}return metadata.get(key)}
 function entries(){return inventory.map(row=>({...row,...(metadata.get(keyOf(row.itemId))||normalize(null,row.itemId))})).filter(x=>x.kind===categories[category].id&&x.quantity>0)}
 function current(){return entries()[selected]}
 function render(){const list=entries();if(selected>=list.length)selected=Math.max(0,list.length-1);$('bagPack').src='/storage/games/pokemon/battle/assets/bag/'+categories[category].icon;
 $('bagTabs').replaceChildren();categories.forEach((c,i)=>{const b=document.createElement('button');b.textContent=c.label;b.className=i===category?'active':'';b.onclick=()=>{category=i;selected=0;render()};$('bagTabs').append(b)});
 $('bagRows').replaceChildren();list.forEach((x,i)=>{const b=document.createElement('button');b.className=i===selected?'active':'';const name=document.createElement('span');name.textContent=x.name;const count=document.createElement('span');count.textContent='×'+x.quantity;b.append(name,count);b.onclick=()=>{selected=i;render()};$('bagRows').append(b)});
 const x=list[selected];$('bagName').textContent=x?.name||'アイテムなし';$('bagDescription').textContent=x?.desc||'';$('bagQuantity').textContent=x?'×'+x.quantity:'';$('bagSelectedIcon').hidden=!x;if(x){$('bagSelectedIcon').src=x.icon;$('bagSelectedIcon').onerror=()=>{$('bagSelectedIcon').hidden=true};}$('bagUse').disabled=!x||x.kind==='key';}
 async function show(){open=true;busy=true;screen='bag';$('menu').hidden=true;$('moveDetails').hidden=true;$('battleBag').hidden=false;$('bagStatus').textContent='';render();if(!loading){loading=true;await Promise.all(inventory.map(x=>getMeta(x.itemId)));loading=false;if(open)render()}}
 function close(){open=false;$('battleBag').hidden=true;command()}
 function decrement(id){const row=inventory.find(x=>keyOf(x.itemId)===keyOf(id));if(!row||row.quantity<=0)return false;row.quantity--;return true}
 function hasBall(id){return inventory.some(x=>keyOf(x.itemId)===keyOf(id)&&x.quantity>0)}
 function consumeBall(id){if(decrement(id)){if(keyOf(id)==='poke-ball')items.ball=Math.max(0,(items.ball||0)-1)}else if(keyOf(id)==='poke-ball'&&items.ball>0)items.ball--;}
 function use(){const x=current();if(!x)return;if(x.kind==='key')return;if(x.kind==='ball'){
  if(!hasBall(x.itemId))return;$('battleBag').hidden=true;open=false;capture(keyOf(x.itemId));return;
 }
 if(!x.heal){$('bagStatus').textContent='このアイテムの戦闘中の効果は未実装です。';return}
 const targets=party.filter(p=>p.current>0&&p.current<p.hp);if(!targets.length){$('bagStatus').textContent='回復できるポケモンがいません。';return}
 const chosen=targets.length===1?targets[0]:targets[Number(window.prompt('回復するポケモンの番号を入力してください：\n'+targets.map((p,i)=>`${i+1}. ${p.name} HP ${p.current}/${p.hp}`).join('\n'),'1'))-1];if(!chosen)return;
 if(!decrement(x.itemId))return;chosen.current=Math.min(chosen.hp,chosen.current+x.heal);if(keyOf(x.itemId)==='potion')items.potion=Math.max(0,(items.potion||0)-1);
 refresh();$('battleBag').hidden=true;open=false;const token=epoch;hide();pause(`${chosen.name}の HPが かいふくした！`,token).then(ok=>{if(ok)counter(token)});
 }
 function key(k){if(k==='x'||k==='escape'){close();return}if(k==='arrowleft'||k==='arrowright'){category=(category+(k==='arrowleft'?-1:1)+3)%3;selected=0;render();return}const n=entries().length;if(k==='arrowup'&&n)selected=(selected+n-1)%n;if(k==='arrowdown'&&n)selected=(selected+1)%n;if(k==='z'||k==='enter'||k===' ')use();render()}
 function getInventory(){return inventory.map(x=>({itemId:x.itemId,quantity:x.quantity}))}
 document.getElementById('bagUse').onclick=use;document.getElementById('bagBack').onclick=close;
 return Object.freeze({initialize,open:show,isOpen:()=>open,key,hasBall,consumeBall,getInventory});
})();
