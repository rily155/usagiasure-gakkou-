# JavaScript学習用RPG（VS Code版）

## フォルダ構成

- `index.html` : ゲーム起動ページ
- `learner/walk.js` : 【学習者】歩行のJavaScript
- `learner/talk.js` : 【学習者】会話のJavaScript
- `core/game.js` : 【職員】ゲーム基盤（マップ・描画・入力・衝突判定）
- `core/style.css` : 【職員】画面デザイン

## 起動

VS Codeでこのフォルダを開き、ターミナルで `python -m http.server 8000` を実行。
ブラウザで `http://localhost:8000` を開きます。

学習者は `learner/` 内のファイルを編集し、保存後にブラウザで Ctrl+F5 を押します。

## 学習課題例

1. `walk.js` の `game.walk(direction);` をコメントアウトして動かなくする
2. `if (direction === "up") game.walk(direction);` に変えて上方向だけ歩く
3. `talk.js` の `game.say` の文章を変更する
4. `const name = "村人"; await game.say(name + "です");` で変数を使う

## 注意

セーブ機能、LocalStorage、コード入力エディタはありません。
学習者コードはブラウザ内で実行されるため、信頼できるローカル学習環境でのみ利用してください。

## プレイヤー画像

提供された `walk(4).png` を使用し、緑色背景を透過して `core/assets/player/` に方向別・3コマずつ配置しています。
上・右・下・左の順に各3コマです。歩行するたびに足踏みコマを切り替え、初期表示は中央コマです。
画像と描画処理は職員管理の `core/` 内に置き、学習者は引き続き `learner/walk.js` と `learner/talk.js` のみ編集します。
