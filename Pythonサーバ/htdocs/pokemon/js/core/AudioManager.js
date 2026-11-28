// Single parent audio channel, shared across all Phaser scenes and battle iframe.
export class AudioManager {
 constructor(){this.audio=null;this.config=null;this.timer=null;this.stack=[];this.unlocked=false;}
 unlock(){this.unlocked=true;if(this.audio&&this.audio.paused)this.audio.play().catch(e=>console.warn('[BGM]',e));}
 stop(){clearInterval(this.timer);if(this.audio){this.audio.pause();this.audio=null;}this.config=null;}
 changeBGM(config,position=0){
  const source=config?.mode==='custom'&&(config.data||config.file);
  if(!source){this.stop();return;}
  const volume=Math.max(0,Math.min(1,Number(config.volume??0.6)));
  if(this.audio&&this.config?.source===source){this.audio.loop=config.loop!==false;clearInterval(this.timer);this.audio.volume=volume;return;}
  this.stop();const a=new Audio(source);this.audio=a;this.config={...config,source};a.loop=config.loop!==false;
  const ms=Math.max(0,Math.min(5000,Number(config.fadeMs??500)));a.volume=ms?0:volume;
  if(position)a.addEventListener('loadedmetadata',()=>{if(this.audio===a)a.currentTime=Math.min(position,a.duration||position);},{once:true});
  if(this.unlocked)a.play().catch(e=>console.warn('[BGM]',e));
  if(ms){const start=Date.now();this.timer=setInterval(()=>{if(this.audio!==a)return;const p=Math.min(1,(Date.now()-start)/ms);a.volume=volume*p;if(p===1)clearInterval(this.timer);},30);}
 }
 field(map){this.stack=[];const scene=window.RPGScenesById?.[map.sceneId];this.changeBGM(!map.bgm||map.bgm.mode==='inherit'?scene?.bgm:map.bgm);}
 pushBGM(config){this.stack.push({config:this.config,position:this.audio?.currentTime||0});if(config)this.changeBGM(config);}
 popBGM(){const previous=this.stack.pop();if(previous)this.changeBGM(previous.config,previous.position);}
}
export const audioManager=new AudioManager();
