// 【学習者が編集】方向キーが押されたときに呼ばれます。
// direction: "up", "down", "left", "right"
// game.walk(方向) で1マス進みます。
window.learnerWalk = function (direction, game) {
  game.walk(direction);
};
