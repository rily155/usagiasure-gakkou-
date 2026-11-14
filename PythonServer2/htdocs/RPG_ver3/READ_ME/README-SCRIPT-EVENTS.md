# RPGエディタ「JavaScript実行」イベント対応

## エディタでの設定

1. イベントを配置し、種類を「JavaScript実行」にします。
2. 起動条件を「決定キー」などから選びます。
3. 機能フォルダを `npc`、関数名を `talkToVillageChief` に設定します。
4. ゲーム用JSONをエクスポートして `data/RPGMapProject.json` を更新します。
5. ブラウザを再読み込みし、NPCやイベントに向かって決定キーを押します。

イベントJSON例:

```json
{ "type": "script", "trigger": "action", "scriptId": "npc.talkToVillageChief" }
```

ゲーム本体は `js/features/index.js` の登録済みモジュールから、`scriptId` に一致する `export function` を探して呼び出します。`setup` は起動時専用でイベントからは呼べません。

```js
// js/features/npc/index.js
export function talkToVillageChief(game, event) {
  game.showMessage("村長：こんにちは！");
}
```

`game` は `GameAPI` インスタンスで、`getVariable`、`setVariable`、`setPlayerSpeed`、`showMessage` を利用できます。`event` はエディタで設定したイベント情報です。

## 注意

- 既存の transfer / message / switch イベントとScene間移動のコードは変更していません。
- 新しい機能フォルダを追加した場合は `js/features/index.js` にimportと登録が必要です。
- 未登録のIDや関数名の間違いはデバッグログに表示されます。
- 非同期関数のPromiseエラーは記録しますが、ゲーム進行を待機する制御は未実装です。
- このZIPはゲーム本体です。React製エディタは含みません。
- 構文チェックは実施していますが、ブラウザでの操作テストは未実施です。
