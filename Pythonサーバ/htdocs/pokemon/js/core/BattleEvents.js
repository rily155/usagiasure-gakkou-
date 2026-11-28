import {audioManager} from './AudioManager.js';
const stores=new WeakMap();
export function battleStore(context){if(!stores.has(context))stores.set(context,{profiles:new Map(),listeners:new Map(),active:null});return stores.get(context);}
export function resolveProfile(store,id,overrides={}){
 const custom=store.profiles.get(id); if(!custom&&!['wild','trainer'].includes(id))throw Error('Unknown battle profile: '+id);
 const type=custom?.battleType??id; if(!['wild','trainer'].includes(type))throw Error('Invalid battleType');
 return {...custom,id,battleType:type,bgm:{encounter:type==='trainer'?'trainerBattleBgm':'battleBgm',victory:type==='trainer'?'trainerVictoryBgm':'wildVictoryBgm',playerHpRecovered:'@previous',captureFailed:'@previous',battleEnd:'@field',...custom?.bgm,...overrides}};
}
export class BattleEvents {
 constructor(store,profile,resolve){this.store=store;this.profile=profile;this.resolve=resolve;this.state={profileId:profile.id,phase:'active'};this.field=this.snapshot();this.previous=null;this.low=false;store.active=this;}
 snapshot(){return {config:audioManager.config,position:audioManager.audio?.currentTime||0};}
 restore(s){if(s)audioManager.changeBGM(s.config,s.position);}
 emit(name,detail={}){
  if(this.state.phase==='ended')return;
  const terminal=['victory','defeat','captureSuccess','escapeSuccess'];
  if(this.state.phase==='result'&&!['experienceGain','levelUp','battleEnd'].includes(name))return;
  if(terminal.includes(name))this.state.phase='result';
  this.state={...this.state,...detail,event:name};
  const id=this.profile.bgm[name];
  if(id==='@field')this.restore(this.field);else if(id==='@previous'){this.restore(this.previous);this.previous=null;}else if(id==='@stop')audioManager.stop();else if(id&&id!=='@continue'){
   try{const config=this.resolve(id);if(config?.mode==='custom'){if(['playerLowHp','captureStart'].includes(name))this.previous=this.snapshot();audioManager.changeBGM(config);}}catch(e){console.warn('[BattleBGM]',id,e);}
  }
  for(const fn of [...(this.store.listeners.get(name)||[])]){try{Promise.resolve(fn({...this.state})).catch(e=>console.error('[BattleEvent]',e));}catch(e){console.error('[BattleEvent]',e);}}
  if(name==='battleEnd'){this.state.phase='ended';if(this.store.active===this)this.store.active=null;}
 }
 hp(detail){this.emit('hpChanged',detail);if(detail.side==='player'){const low=detail.hpRate>0&&detail.hpRate<=0.2;if(low!==this.low){this.low=low;this.emit(low?'playerLowHp':'playerHpRecovered',detail);}}}
}
