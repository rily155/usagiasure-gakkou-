# pokecrystal データ取得ツール
Python 3 標準ライブラリのみ。PowerShellで実行。

- 一覧のみ: `python fetch.py --prefix data/ --list-only`
- トレーナー取得: `python fetch.py`
- 種族値など: `python fetch.py --prefix data/pokemon/ --out pokemon_output`
- 複数指定: `python fetch.py --prefix data/wild/ --prefix data/moves/`
- 固定版: `python fetch.py --ref <commit SHA>`

raw/ に原本、manifest.json / manifest.csv にファイル一覧、source.sqlite3 の source_files に原本のバイト列とメタデータを格納。再実行時に一覧とDBのテーブルを置き換える。raw の古いファイルは削除しない。既存ゲームDBは変更しない。ASMの意味解析やマスターテーブルへの変換は未実装。GitHubへの接続が必要。公開データの利用・再配布には権利関係を確認すること。
