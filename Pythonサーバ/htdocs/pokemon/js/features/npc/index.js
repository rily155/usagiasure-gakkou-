/** NPCイベントの学習用コード。RPGエディタのscriptIdに対応します。 */
export function setup(game) {
  // 起動時に必要なNPCの初期設定があればここに書きます。
}

export async function talkToVillageChief(game, event) {
  const answer = await game.showChoices(
    "これから冒険に出かけるのかい？",
    ["はい", "いいえ"]
  );

  if (answer === 0) {
    game.showMessage("気をつけて行くんじゃぞ！");
  } else if (answer === 1) {
    game.showMessage("準備ができたらまたおいで。");
  }
}
