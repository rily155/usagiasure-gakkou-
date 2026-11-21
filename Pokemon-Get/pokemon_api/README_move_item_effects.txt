PokéAPI 技・アイテム効果データインポーター
========================================
Python 3.9以降 / 外部ライブラリ不要

1. import_move_item_effects.py を Pokemon-Get に置く
2. database_imported_current.sqlite3 があることを確認
3. 実行:
   python import_move_item_effects.py --db "database_imported_current.sqlite3"

出力: database_imported_current_effects.sqlite3
元のSQLiteは変更しません。出力が既にある場合は上書きせず停止します。
再実行する場合は --output "別のファイル名.sqlite3" を指定してください。

追加・更新テーブル:
- move_effects: 技ID、効果ID、状態異常、発生確率、能力変化、英語効果説明など
- current_items: 現行PokéAPIアイテムID、名称、カテゴリ、価格など
- item_effects: 現行アイテムID、英語効果説明

重要:
* 技の効果説明とメタデータを保存するだけです。戦闘処理の実装は別途必要です。
* アイテムIDは現行PokéAPIのIDで、gen2_itemsのIDとは別体系です。
* アイテム効果は説明文ベースです。HP回復量や使用対象を完全に構造化したものではありません。
* PokeAPIに説明がないアイテムは説明が空欄になります。
* move_effects/item_effectsに既にデータがある場合は安全のため中断します。
* キャッシュを更新したい場合: --refresh

確認SQL:
SELECT 'move_effects' AS table_name, COUNT(*) AS total FROM move_effects
UNION ALL SELECT 'current_items', COUNT(*) FROM current_items
UNION ALL SELECT 'item_effects', COUNT(*) FROM item_effects;

SELECT m.move_id, m.effect_id, m.ailment, m.ailment_chance,
       m.stat_changes_json, m.short_effect_en
FROM move_effects m WHERE m.move_id IN (14, 33, 85, 86, 92);
