RPG Editorのデータを利用するオフラインRPG

1. RetroRPG/index.htmlをブラウザで開いてください（サーバー不要）。
2. 同梱データで遊ぶ場合は「ゲームスタート！」をクリックします。
3. RPG Editorで新しく保存したJSONを使う場合は、上部のファイル選択からJSONを読み込み、「ゲームスタート！」をクリックします。
4. 毎回同梱データとして起動したい場合は、JSONの内容を `window.RPG_EDITOR_PROJECT = <JSONの内容>;` 形式で js/project-data.js に書き出してください。JSONをjs/RPGMapProject.jsonにコピーするだけではブラウザのfile://環境で自動読込できません。

注意: embedded-assets.js は不要です。マップ画像・キャラクター画像はJSONのimageData/spriteDataを使用します。
イベントのtargetMapId/targetX/targetYが設定されている必要があります。
