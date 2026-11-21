/** 学習者が使う公開API。Phaserの内部実装を隠します。 */
export class GameAPI {
  constructor(scene, context) { this.scene = scene; this.context = context; }
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
