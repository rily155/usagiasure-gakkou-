/** バトルの独自ルールを作る場所。既存の戦闘はGameScene側で動作します。 */
export function setup(game) {
  // 例: ダメージ計算を作る（ゲームへの接続は今後）
}

// EditorのJavaScriptイベントから呼び出せるサンプル（敵1匹）。
export function wildBattle(game) { return game.startBattle(19, 5, 'wild'); }
export function trainerBattle(game) { return game.startBattle(19, 5, 'trainer'); }
