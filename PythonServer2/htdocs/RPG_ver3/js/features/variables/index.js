/** 学習2: 変数と計算。Scene間移動でも値が保持されます。 */
export function setup(game) {
  // 初回だけ初期化する（マップ移動時に所持金をリセットしない）
  if (game.getVariable("gold") === undefined) {
    const initialGold = 100;
    game.setVariable("gold", initialGold);
  }
}
