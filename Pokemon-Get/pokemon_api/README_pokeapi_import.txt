ポケモン251匹：PokéAPIの現行マスターデータ取り込み

1. import_pokemon_master_from_pokeapi.py と pokemon_gen2_extended_rebuilt.sqlite3 を同じフォルダに置く
2. PowerShell で実行：
   python import_pokemon_master_from_pokeapi.py --db "pokemon_gen2_extended_rebuilt.sqlite3"
3. pokemon_gen2_extended_rebuilt_imported.sqlite3 が生成される（元DBは変更しない）
4. CSVは pokeapi_csv_cache にキャッシュされる。2回目以降は再ダウンロード不要。

対象：pokemon_base_stats, pokemon_types, pokemon_species_details, pokemon_egg_groups, experience_groups
注意：PokéAPIの現行データをそのまま取得。第2世代当時と異なるタイプ（フェアリー等）や種族値、経験値、なつき度が含まれる可能性があります。
ゲームの第2世代仕様に合わせる場合は、歴史データに置き換えてください。
通信環境が必要。CSV取得失敗時は元DBを変更しません。
