/** Sceneをまたいで共有するゲーム状態。 */
export class GameContext {
  constructor() { this.variables = Object.create(null); }
}
export const gameContext = new GameContext();
