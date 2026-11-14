# 機能別JavaScript学習フレームワーク

## 編集する場所
`js/features/` 内の各 `index.js` を編集してください。最初は `player/index.js` の `speed` を変えて、ゲーム内の移動速度を確認します。

- `player/` : 移動速度など
- `variables/` : 所持金・フラグなど
- `items/` : アイテム処理（ひな形）
- `inventory/` : 所持品処理（ひな形）
- `npc/` : NPC処理（ひな形）
- `quests/` : クエスト処理（ひな形）
- `battle/` : 戦闘カスタマイズ（ひな形）

## 動作する機能
`GameScene.create()` が `setupFeatures(new GameAPI(...))` を実行します。`player` の速度設定と `variables` の所持金初期化は実際に呼び出されます。ゲーム変数はScene間で共有されます。

## 未実装の範囲
NPCイベントの `scriptId` から任意の関数を呼び出す機構、アイテム・所持品・クエストのUI連携、戦闘カスタマイズは**まだ接続していません**。既存のマップ、イベント、戦闘ロジックは変更していません。

## 起動
HTTPサーバー経由で `index.html` を開きます（`file://` ではES Modulesが動きません）。変更が反映されないときはハードリロードしてください。

## 編集不要
`js/core/`、`js/scenes/` はゲームエンジン本体です。`js/api/GameAPI.js` は学習者向け公開APIです。
