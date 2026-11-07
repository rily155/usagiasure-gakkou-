/* HTMLのボタンから呼ぶ公開関数。ゲーム処理はjs/GameScene.jsに分離。 */
let phaserGame;
if (typeof Phaser === 'undefined') {
  document.getElementById('gameCanvas').textContent = 'Phaserを読み込めません。lib/phaser.min.jsを配置するか、インターネットに接続してください。';
  console.error('Phaser 3 is missing. Download phaser.min.js into lib/.');
} else {
  phaserGame = new Phaser.Game({
    type: Phaser.AUTO, parent:'gameCanvas', width:800, height:600,
    backgroundColor:'#dbeafe',
    physics:{default:'arcade',arcade:{gravity:{y:0},debug:false}},
    scene:[GameScene]
  });
}
function scene(){return phaserGame?.scene.getScene('GameScene');}
function startGame(){
  if(!scene()||!scene().sys.isActive())return;
  document.getElementById('start-ready-screen').style.display='none';
  scene().startPlay();
}
function retryGame(){
  document.getElementById('gameover-screen').style.display='none';
  scene()?.startPlay();
}
function restartGame(){scene()?.stopToMenu();}
