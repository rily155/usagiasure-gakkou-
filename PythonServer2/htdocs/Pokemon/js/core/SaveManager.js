/** PythonWebServer ゲーム別セーブAPI（スロット方式）、保存形式 v4。 */
import { gameContext } from './GameContext.js';

const API = '/api/games/pokemon/saves';
const SLOT_KEY = 'pokemon-save-slot-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const asArray = value => Array.isArray(value) ? clone(value) : [];
const validNumber = value => typeof value === 'number' && Number.isFinite(value);

export class SaveManager {
  static currentId = null; // スロット番号

  static newGame(name) {
    this.currentId = null;
    localStorage.removeItem(SLOT_KEY);
    gameContext.reset(name);
  }

  static snapshot(scene) {
    const gold = validNumber(gameContext.gold) ? gameContext.gold : 0;
    const variables = clone(gameContext.variables);
    // gold の正本は gameContext.gold。旧イベント変数との矛盾を防ぐ。
    variables.gold = gold;
    const player = {
      name: gameContext.playerName || '主人公',
      mapId: scene.currentMapId,
      x: scene.playerX,
      y: scene.playerY,
      facing: clone(scene.facing || { x: 0, y: 1 }),
      gold,
      playTimeSeconds: gameContext.getPlayTimeSeconds()
    };
    return {
      kind: 'pokemon-save', version: 4, savedAt: new Date().toISOString(),
      player,
      pokemon: { party: clone(gameContext.party), boxes: clone(gameContext.box) },
      inventory: clone(gameContext.inventory),
      pokedex: clone(gameContext.pokedex),
      progress: {
        badges: clone(gameContext.badges),
        flags: clone(gameContext.progress.flags),
        variables,
        defeatedTrainers: clone(gameContext.progress.defeatedTrainers),
        collectedItems: clone(gameContext.progress.collectedItems)
      },
      settings: clone(gameContext.settings),
      // 現在の main.js / GameScene の旧フラット参照を維持。
      playerName: player.name, mapId: player.mapId, x: player.x, y: player.y,
      facing: clone(player.facing), party: clone(gameContext.party),
      box: clone(gameContext.box), gold, badges: clone(gameContext.badges), variables
    };
  }

  static async request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`API応答がJSONではありません (HTTP ${response.status})`); }
    if (!response.ok) {
      throw new Error(`API HTTP ${response.status}: ${result.error || result.message || '処理に失敗しました'}`);
    }
    return result;
  }

  static slotOf(row) {
    const slot = Number(row?.slot ?? row?.slot_id ?? row?.data?.slot);
    return Number.isSafeInteger(slot) && slot > 0 ? slot : null;
  }

  static payloadOf(row) {
    if (row?.data && typeof row.data === 'object' && !Array.isArray(row.data)) return row.data;
    return row;
  }

  static supported(data) {
    return (data?.kind === 'pokemon-save' && data.version === 4) ||
      (data?.kind === 'retrorpg-save' && data.version === 3);
  }

  static normalize(data) {
    if (!this.supported(data)) throw new Error('対応していないセーブデータ形式です');
    if (data.version === 3) {
      const gold = validNumber(data.gold) ? data.gold :
        (validNumber(data.variables?.gold) ? data.variables.gold : 0);
      const variables = clone(asObject(data.variables));
      variables.gold = gold;
      const player = {
        name: data.playerName || '主人公', mapId: data.mapId,
        x: data.x, y: data.y, facing: clone(data.facing || { x: 0, y: 1 }),
        gold, playTimeSeconds: 0
      };
      return {
        kind: 'pokemon-save', version: 4, savedAt: data.savedAt,
        player, pokemon: { party: asArray(data.party), boxes: asArray(data.box) },
        inventory: asArray(data.inventory),
        pokedex: { seen: [], caught: [] },
        progress: { badges: asArray(data.badges), flags: {}, variables,
          defeatedTrainers: [], collectedItems: [] },
        settings: { textSpeed: 'normal', battleAnimations: true },
        playerName: player.name, mapId: player.mapId, x: player.x, y: player.y,
        facing: clone(player.facing), party: asArray(data.party), box: asArray(data.box),
        gold, badges: asArray(data.badges), variables
      };
    }
    const result = clone(data);
    const player = asObject(result.player);
    result.playerName = player.name ?? result.playerName ?? '主人公';
    result.mapId = player.mapId ?? result.mapId;
    result.x = player.x ?? result.x;
    result.y = player.y ?? result.y;
    result.facing = clone(player.facing ?? result.facing ?? { x: 0, y: 1 });
    result.party = asArray(result.pokemon?.party ?? result.party);
    result.box = asArray(result.pokemon?.boxes ?? result.box);
    result.gold = validNumber(player.gold) ? player.gold : (validNumber(result.gold) ? result.gold : 0);
    result.badges = asArray(result.progress?.badges ?? result.badges);
    result.variables = clone(asObject(result.progress?.variables ?? result.variables));
    result.variables.gold = result.gold;
    return result;
  }

  static async list() {
    const result = await this.request(API);
    const rows = Array.isArray(result) ? result : (result.saves || result.records || result.items || result.data || []);
    if (!Array.isArray(rows)) throw new Error('セーブ一覧のAPI形式が不正です');
    return rows.map(row => ({ id: this.slotOf(row), data: this.payloadOf(row) }))
      .filter(row => row.id !== null && this.supported(row.data))
      .map(row => ({ id: row.id, data: this.normalize(row.data) }))
      .sort((a, b) => new Date(b.data.savedAt || 0) - new Date(a.data.savedAt || 0));
  }

  static async save(scene) {
    const data = this.snapshot(scene);
    const rows = await this.list();
    let slot = this.currentId;
    if (!slot) {
      const occupied = new Set(rows.map(row => row.id));
      slot = 1;
      while (occupied.has(slot)) slot++;
    }
    const existing = rows.some(row => row.id === slot);
    const record = await this.request(existing ? `${API}/${slot}` : API, {
      method: existing ? 'PUT' : 'POST',
      body: JSON.stringify({ ...data, slot })
    });
    this.currentId = slot;
    localStorage.setItem(SLOT_KEY, String(slot));
    return record;
  }

  static async load(id) {
    const slot = Number(id);
    if (!Number.isSafeInteger(slot) || slot <= 0) throw new Error('無効なセーブスロットです');
    const record = await this.request(`${API}/${slot}`);
    const data = this.normalize(this.payloadOf(record));
    this.currentId = slot;
    localStorage.setItem(SLOT_KEY, String(slot));
    gameContext.playerName = data.playerName;
    return data;
  }

  static restoreVariables(data) {
    const save = this.normalize(data);
    gameContext.reset(save.playerName);
    Object.assign(gameContext.variables, save.variables);
    gameContext.party = asArray(save.party);
    gameContext.box = asArray(save.box);
    gameContext.inventory = asArray(save.inventory);
    gameContext.gold = save.gold;
    gameContext.badges = asArray(save.badges);
    gameContext.variables.gold = gameContext.gold;
    gameContext.pokedex = {
      seen: asArray(save.pokedex?.seen), caught: asArray(save.pokedex?.caught)
    };
    gameContext.progress = {
      flags: Object.assign(Object.create(null), asObject(save.progress?.flags)),
      defeatedTrainers: asArray(save.progress?.defeatedTrainers),
      collectedItems: asArray(save.progress?.collectedItems)
    };
    gameContext.settings = {
      textSpeed: save.settings?.textSpeed ?? 'normal',
      battleAnimations: save.settings?.battleAnimations !== false
    };
    gameContext.setPlayTimeSeconds(save.player?.playTimeSeconds ?? 0);
  }
}
