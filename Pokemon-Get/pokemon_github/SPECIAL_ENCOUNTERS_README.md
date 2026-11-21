# 特殊エンカウント取得（クリスタル）
Python 3.9以上、Git、取得済み pokecrystal が必要。追加パッケージ不要。

```powershell
python pokemon_github/import_special_encounters.py --db master.sqlite3 --dry-run
python pokemon_github/import_special_encounters.py --db master.sqlite3
```
`--repo` で別のリポジトリを指定可能。既存の通常遭遇テーブルは変更しない。同一コミット・同一データの再実行は重複なし。異なるデータやコミットでは停止する。本登録時のみSQLiteバックアップ作成。

- gen2_fish_groups: 釣りグループと食いつき閾値式
- gen2_fish_slots: 釣り竿・時間別の累積閾値式（個別確率ではない）。dayは朝も含む。any行と該当時間の行を合わせて使用する。式は原典のまま。乱数変換はゲーム側の実装が必要。
- gen2_fish_maps: 原典マップ名・グループ。水のないマップも含み、釣り可能性自体を保証しない。
- gen2_tree_slots: ずつきのcommon/rare、いわくだき。weight_percentは遭遇後の選択重み。木のセット選択、遭遇率、マップ対応は未実装。
- gen2_swarm_rates / gen2_swarm_slots: 草むら大量発生時の遭遇率とスロット。発生条件、釣りの大量発生切替は未実装。
- gen2_fixed_encounter_candidates: マップスクリプトの数値レベル付きloadwildmon宣言候補。実行条件や再戦可否、間接指定は未解析。
- gen2_special_import_metadata: 取得元コミット。

徘徊ポケモンの移動・解放条件、固定遭遇の完全な抽出、虫取り大会は今後対応。原典は英語版。実際のクローン全件実行は未検証。解析エラー時は登録されない。
