RetroRPG (HTTP配信版)

1. PythonWebServer/htdocs/RetroRPG にフォルダごと配置。
2. PythonWebServerを起動し http://127.0.0.1:8000/RetroRPG/ にアクセス。
3. エディタのゲーム用ZIPを展開し、data/ と assets/ をRetroRPG直下に上書き配置。
4. ブラウザを再読み込み。

読み込み元: data/RPGMapProject.json
マップ画像: JSONの maps[*].imagePath
プレイヤー画像: JSONの characters[*].spritePath

注意: JSON単体のファイル選択では画像ファイルを一緒に読み込めません。
編集用の旧Base64 JSONのみファイル選択が可能です。
