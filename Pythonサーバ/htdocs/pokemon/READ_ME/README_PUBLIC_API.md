# 公開API・JavaScriptイベント（現行仕様）

更新日: 2026-11-24

## 設計
標準APIはゲームの `js/api/GameAPI.js` に実装。Editorのアセット画面でシーン単位の自由登録BGMとユーザー定義関数を管理します。プロジェクト形式v4は維持。Editorからゲーム用ZIPを出力し、既存のストレージ配置へ反映してください。

## 標準公開関数
`?` は省略可能な引数を示します（JavaScriptの実際の呼び出しには書きません）。

| 関数 | 説明 |
|---|---|
| `game.changeScene(sceneId, mapId?, x?, y?, direction?)` | 別シーンへ移動。mapId省略時は開始マップ。 |
| `game.changeMap(mapId, x?, y?, direction?)` | マップ移動。別シーンにも対応。 |
| `game.setPlayerPosition(x, y)` | 現在のマップ内で座標変更。 |
| `game.setPlayerDirection(direction)` | 向きを変更。up/down/left/right。 |
| `game.getCurrentScene()` | 現在のScene ID。 |
| `game.getCurrentMap()` | 現在のMap ID。 |
| `game.getPlayerPosition()` | x, y, direction を返す。 |
| `game.changeBGM(id)` | BGM切り替え。 |
| `game.pushBGM(id)` | 現在のBGMを保存して切り替え。 |
| `game.popBGM()` | 保存したBGMに戻す。 |
| `game.startBattle(pokemonId, level?, type?, bgmId?)` | 野生戦・トレーナー戦を開始。 |
| `game.setPlayerSpeed(speed)` | 移動速度を変更。 |
| `game.setVariable(name, value)` | 変数を保存。 |
| `game.getVariable(name)` | 変数を取得。 |
| `game.showMessage(message)` | 会話表示。 |
| `game.showChoices(message, options)` | 選択番号をPromiseで返す。 |
| `game.registerFunction(name, fn)` | JavaScriptから独自関数を登録。 |

## 移動の仕様
- IDはEditorのプロジェクトJSONの `scenes[].id` / `maps` のキーを使用。表示名やPhaser内部キーではありません。
- x,yは0始まりのタイル座標。両方省略すると移動先マップの開始地点。向きも省略時は開始地点の向き。
- 存在しないID、所属不一致、通行不可、座標不正、移動中・戦闘中・メニュー中はfalse。成功時true。別Sceneへのtrueは切替要求の受付を示し、切替完了ではありません。
- 座標変更は歩行イベント・エンカウントを発生させません。既存のカメラ追従とマップ移動時のBGM処理を利用します。
- 別Sceneへ移動した後は古いgameインスタンスで操作を続けず、移動先のイベントを使用してください。

```js
return game.changeScene("scene_2", "map_1", 5, 8, "down");
// または return game.changeMap("map_1");
```

## Editorで独自関数を登録
アセット → 自由登録BGM・公開関数 → 公開関数追加。例: `goPokemonCenter`、引数なし、本文:

```js
return game.changeMap("pokemon_center", 5, 8);
```

実際のマップIDに変更してください。イベント種類をJavaScript実行、機能フォルダをcustom、関数名をgoPokemonCenterに設定すると `custom.goPokemonCenter` が実行されます。直接呼び出す場合は `game.goPokemonCenter()`。イベントからは第1引数にイベント情報が渡ります。標準APIと同名の登録は禁止。Editor定義は所属Scene内で有効です。登録コードは信頼できるものだけ使用してください。本文は同期関数としてコンパイルされるため、非同期処理はPromiseを返すかasync関数を内部で呼び出します。

## BGM・バトル
シーン設定: bgm, battleBgm（野生）, trainerBattleBgm, wildVictoryBgm, trainerVictoryBgm, titleBgm。自由登録IDもchangeBGM / pushBGM / startBattleの第4引数で使用可能。野生・トレーナー戦開始時に戦闘曲、勝利時に対応する勝利曲、終了時にフィールド曲へ復帰。未設定の勝利曲は戦闘曲を継続。トレーナー戦は敵1匹の簡易実装。

```js
return game.startBattle(25, 10, "trainer", "bossBgm");
```

## 未公開機能
アイテム・所持金・回復・セーブ・フェード等の専用公開APIは今回追加していません。内部機能が存在しても公開APIとは区別します。
