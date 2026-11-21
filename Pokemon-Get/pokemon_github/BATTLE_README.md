# 第2世代戦闘データ
Pokemon-Get のルートで実行する。

```powershell
python pokemon_github/import_battle_rules.py --db master.sqlite3 --dry-run
python pokemon_github/import_battle_rules.py --db master.sqlite3
```

取得済み Git の HEAD を git show で参照。既存行は保護し、追加のみ行う。技の優先度は原典値と通常技を0にした値を保存。命中率・追加効果率はASM表記値（実際の内部判定そのものではない）。状態異常の名称・分類は手動定義、フラグは原典確認。持ち物は既存 gen2_items の属性値を転記し、source_commit は既存DB由来を示す。実際の発動処理や急所確率、状態異常のダメージ・継続ターンの完全な解析は未実装。技の威力0は変化技とは限らない。本登録前にバックアップ。既存行を更新する機能はない。
