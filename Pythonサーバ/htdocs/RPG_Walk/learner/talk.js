// 【学習者が編集】村人に話しかけると呼ばれます。
// await game.say("文章") でメッセージを表示します。
window.learnerTalk = async function (game) {
  await game.say("こんにちは！");
  await game.say("JavaScriptの勉強を始めよう！");
};
