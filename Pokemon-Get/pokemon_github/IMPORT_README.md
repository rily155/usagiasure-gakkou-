# GitHub データ登録
既存の Pokemon-Get に pokemon_github フォルダを重ねてコピーする。fetch.py は変更しない。
ルートで `python pokemon_github/import_all.py --db master.sqlite3 --dry-run` を実行。
成功後 `python pokemon_github/import_all.py --db master.sqlite3` を実行。
Git が必要。初回 clone、以降は同じローカルコミットを利用。--repo で別の clone を指定可能。
既存データを削除しない。関連テーブルが一部だけ登録済みの場合は停止。
対象は Crystal のトレーナー、草むら・水上、通常ショップ。釣り・特殊出現、状態異常、図鑑、NPC配置は未対応。
トレーナー名は原典英語で既存 name_ja に暫定保存。職業の日本語は一部のみ、未翻訳は NULL。
野生の weight はスロットの標準百分率、rate_percent は原典の遭遇率。賞金は最後の手持ちレベル×基礎賞金。
GitHub への実接続・全原典の解析は未検証。dry-run で確認すること。
