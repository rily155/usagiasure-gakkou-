画像の読み込みについて

・既存の images/ フォルダは変更していません。
・js/GameScene.js から見た ../images/ を基準に読み込むよう修正しました。
・読み込み失敗時は赤いメッセージとF12 Consoleに失敗URLを表示します。
・index.htmlを直接ダブルクリック（file://）するとブラウザの制限で読み込みに失敗する場合があります。
・Node.jsは不要です。Pythonがあれば「python -m http.server 8000」、またはVS Code Live Server、Xserver等のHTTPサーバーから開いてください。
・Phaser本体は lib/phaser.min.js に同梱済みです。
