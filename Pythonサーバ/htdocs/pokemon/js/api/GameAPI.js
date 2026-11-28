import {battleStore,resolveProfile} from "../core/BattleEvents.js";
/** 学習者が使う公開API。Phaserの内部実装を隠します。 */
import { audioManager } from "../core/AudioManager.js";
const registries = new WeakMap();
export class GameAPI {
  constructor(scene, context) {
    this.scene = scene; this.context = context;
    for (const [name, fn] of this.registry()) this.attachFunction(name, fn);
    const definitions = window.RPGScenesById?.[(scene.sceneId || scene.map?.sceneId || window.RPGDefaultSceneId)]?.publicFunctions || [];
    for (const def of definitions) {
      try {
        this.validateFunctionName(def.name);
        const params = def.params || [];
        if (!params.every(p => /^[A-Za-z_$][\w$]*$/.test(p) && p !== 'game') || new Set(params).size !== params.length) throw Error('引数が不正です');
        const fn = new Function('game', ...params, '"use strict";\n' + def.body);
        this.attachFunction(def.name, function (...args) { return fn(this, ...args); });
      } catch (e) { console.error('[公開関数]', def.name, e); }
    }
  }
  registry() {
    if (!registries.has(this.context)) registries.set(this.context, new Map());
    return registries.get(this.context);
  }
  validateFunctionName(name) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || name in this || ['then','__proto__','prototype'].includes(name)) throw Error('公開関数名が不正または重複: '+name);
  }
  attachFunction(name, fn) {
    this.validateFunctionName(name);
    Object.defineProperty(this, name, {value: fn.bind(this), enumerable:true});
  }
  registerFunction(name, fn) {
    if (typeof fn !== 'function') throw TypeError('関数が必要です');
    this.attachFunction(name, fn);
    this.registry().set(name, fn);
  }
  resolveBGM(key) {
    const scene = window.RPGScenesById?.[(this.scene.sceneId || this.scene.map?.sceneId || window.RPGDefaultSceneId)];
    if (key === 'bgm') return this.scene.map?.bgm?.mode && this.scene.map.bgm.mode !== 'inherit' ? this.scene.map.bgm : scene?.bgm;
    const custom = (scene?.customBgms || []).find(b => b.id === key);
    if (custom) return custom.bgm;
    if (['battleBgm','trainerBattleBgm','wildVictoryBgm','trainerVictoryBgm','titleBgm'].includes(key)) return scene?.[key];
    throw Error('不明なBGM設定: '+key);
  }
  changeBGM(key) {
    const config = this.resolveBGM(key);
    if (!config) return false;
    audioManager.changeBGM(config); return true;
  }
  pushBGM(key) {
    const config = this.resolveBGM(key);
    if (!config) return false;
    audioManager.pushBGM(config); return true;
  }
  popBGM() { audioManager.popBGM(); }
  startBattle(pokemonId, level=5, type='wild', bgmId=null) {
    if (pokemonId && typeof pokemonId === 'object') {
      const options=pokemonId; const enemies=options.enemies;
      if(!Array.isArray(enemies)||enemies.length!==1) throw Error('現在は敵1匹のみ対応');
      const profile=this.resolveBattleProfile(options.profileId||'wild',options.bgm);
      return this.scene.startBattle(enemies[0],{type:profile.battleType,profile});
    }
    if (!['wild','trainer'].includes(type)) throw new Error('不明な戦闘タイプ');
    return this.scene.startBattle({pokemonId,level},{type, bgm: bgmId ? this.resolveBGM(bgmId) : undefined});
  }
  registerBattleProfile(id,config) { if(typeof id!=='string'||!id||!['wild','trainer'].includes(config?.battleType))throw Error('Invalid profile'); battleStore(this.context).profiles.set(id,structuredClone(config)); }
  resolveBattleProfile(id, overrides) {
    const store = battleStore(this.context);
    const scene = window.RPGScenesById?.[this.scene.sceneId || this.scene.map?.sceneId || window.RPGDefaultSceneId];
    const profiles = new Map(store.profiles);
    for (const p of scene?.battleProfiles || []) if (!profiles.has(p.id)) profiles.set(p.id,p);
    return resolveProfile({profiles},id,overrides);
  }
  getBattleProfile(id) { return structuredClone(this.resolveBattleProfile(id)); }
  onBattleEvent(name,callback) { if(typeof callback!=='function')throw TypeError('callback');const listeners=battleStore(this.context).listeners;if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);return ()=>this.offBattleEvent(name,callback); }
  offBattleEvent(name,callback) { return battleStore(this.context).listeners.get(name)?.delete(callback)??false; }
  getBattleState() { const state=battleStore(this.context).active?.state;return state?structuredClone(state):null; }
  /** EditorのScene ID / Map IDを使用。座標は0始まりのタイル単位。 */
  changeScene(sceneId, mapId = null, x = null, y = null, direction = null) {
    const definition = window.RPGScenesById?.[sceneId];
    if (!definition) return false;
    const target = mapId ?? definition.currentMapId;
    if (this.scene.getMaps()[target]?.sceneId !== sceneId) return false;
    return this.changeMap(target, x, y, direction);
  }
  changeMap(mapId, x = null, y = null, direction = null) {
    const scene = this.scene;
    if (!scene.map || scene.mode !== 'field' || scene.moving || scene.transitioning) return false;
    const map = scene.getMaps()[mapId];
    if (!map) return false;
    if ((x == null) !== (y == null)) return false;
    x = x ?? map.start.x;
    y = y ?? map.start.y;
    direction = direction ?? map.start.direction;
    if (!['up','down','left','right'].includes(direction) || !map.isWalkable(x,y)) return false;
    return scene.changeMap(mapId,x,y,{direction});
  }
  setPlayerPosition(x, y) {
    const scene = this.scene;
    if (scene.mode !== 'field' || scene.moving || scene.transitioning || !scene.map?.isWalkable(x,y)) return false;
    scene.setPlayerTilePosition(x,y);
    return true;
  }
  setPlayerDirection(direction) {
    if (!['up','down','left','right'].includes(direction) || this.scene.mode !== 'field' || this.scene.moving || this.scene.transitioning) return false;
    this.scene.setFacing(direction);
    return true;
  }
  getCurrentScene() { return this.scene.map?.sceneId ?? this.scene.sceneId ?? null; }
  getCurrentMap() { return this.scene.currentMapId ?? null; }
  getPlayerPosition() {
    if (!this.scene.map) return null;
    const {playerX:x,playerY:y,facing} = this.scene;
    return {x,y,direction:facing.x<0?'left':facing.x>0?'right':facing.y<0?'up':'down'};
  }
  setPlayerSpeed(speed) {
    if (!Number.isFinite(speed) || speed <= 0) throw new RangeError("speed must be a positive finite number");
    this.scene.playerConfig = { ...this.scene.playerConfig, speed };
  }
  setVariable(name, value) {
    if (typeof name !== "string" || !name.trim()) throw new TypeError("variable name must be a non-empty string");
    this.context.variables[name] = value;
  }
  getVariable(name) { return this.context.variables[name]; }
  /** NPCなどのイベントから会話ウィンドウを表示する。 */
  showMessage(message) {
    if (typeof message !== "string") throw new TypeError("message must be a string");
    this.scene.showDialog(message);
  }
  /** 上下キーで選択、Space/Enterで確定。0始まりの選択番号を返す。 */
  showChoices(message, options) {
    if (typeof message !== "string") throw new TypeError("message must be a string");
    return this.scene.showChoices(message, options);
  }

}
