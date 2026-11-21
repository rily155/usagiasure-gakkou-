# ポケモン経験値ツール
Python 3.9以上、標準ライブラリのみ。サーバ停止中にmaster.sqlite3のコピーを指定して実行してください。

```
python pokemon_experience.py --db master.sqlite3 sync
python pokemon_experience.py --db master.sqlite3 reward --enemy 25 --level 5
python pokemon_experience.py --db master.sqlite3 reward --enemy 25 --level 5 --trainer --participants 2
python pokemon_experience.py --db master.sqlite3 progress --pokemon 25 --exp 125 --gain 100
```

syncはPokéAPIから251匹の基礎経験値・成長タイプと6種類の成長曲線を取得して既存の2テーブルを更新します。事前バックアップを作り、全件取得に成功した後で一括更新します。現在のPokéAPI値を使用し、第2世代固有の経験値を保証しません。rewardは簡易旧世代風の計算（基礎経験値×敵レベル÷7、トレーナー1.5倍、参加数で等分）。progressは累積経験値からレベルと残り経験値を算出します。セーブやゲーム本体には書き込みません。
