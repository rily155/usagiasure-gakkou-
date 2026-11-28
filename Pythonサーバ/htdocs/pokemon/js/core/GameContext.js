/** シーン間で共有する冒険データ。主人公にHPは存在しない。 */
export class GameContext {
  constructor() { this.reset('主人公'); }

  reset(name = '主人公') {
    this.playerName = name;
    this.variables = Object.create(null);
    this.party = [];
    this.box = [];
    this.inventory = [];
    this.gold = 0;
    this.badges = [];
    this.pokedex = { seen: [], caught: [] };
    this.progress = {
      flags: Object.create(null),
      defeatedTrainers: [],
      collectedItems: []
    };
    this.settings = { textSpeed: 'normal', battleAnimations: true };
    this.playTimeSeconds = 0;
    this.sessionStartedAt = Date.now();
  }

  getPlayTimeSeconds() {
    return Math.max(0, Math.floor(this.playTimeSeconds +
      (Date.now() - this.sessionStartedAt) / 1000));
  }

  setPlayTimeSeconds(seconds = 0) {
    this.playTimeSeconds = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
    this.sessionStartedAt = Date.now();
  }
}

export const gameContext = new GameContext();
