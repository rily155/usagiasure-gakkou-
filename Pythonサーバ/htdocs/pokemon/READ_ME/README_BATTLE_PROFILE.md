# バトルイベント API

従来の startBattle(id, level, type, bgmId) は維持。新形式は敵1匹のみ対応。

```js
game.registerBattleProfile('gym', {
  battleType: 'trainer',
  bgm: { encounter: 'gymIntroBgm', battleStart: 'gymBgm',
    playerLowHp: 'lowHpBgm', playerHpRecovered: '@previous',
    victory: 'gymVictoryBgm', defeat: 'defeatBgm', battleEnd: '@field' }
});
const off = game.onBattleEvent('hpChanged', event => console.log(event));
game.startBattle({profileId:'gym', enemies:[{pokemonId:95,level:14}]});
// 不要になったら off();
```

BGM ID はシーンの customBgms または標準設定。未登録の音源は継続。@continue は継続、@stop は停止、@previous は一時変更前、@field は戦闘前へ復帰。プロファイルは実行時登録（保存データには含まれない）。イベント購読は解除するまで有効。getBattleProfile(id), getBattleState(), offBattleEvent(name, callback) も利用可能。

実装イベント: encounter, intro, battleStart, hpChanged, playerLowHp, playerHpRecovered, playerSwitch, enemyFainted, captureStart, captureFailed, captureSuccess, victory, defeat, escapeSuccess, experienceGain, levelUp, battleEnd。HP低下は20%以下かつ生存時。勝敗確定後はHPイベントを無視。複数敵、SE、進化イベント、Editor専用UIは未実装。
