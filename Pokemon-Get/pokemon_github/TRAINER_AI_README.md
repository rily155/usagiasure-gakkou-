# トレーナーAI（Crystal）
プロジェクト直下で実行。追加ライブラリ不要。既存のGitリポジトリを使用。

```powershell
python pokemon_github/import_trainer_ai.py --db master.sqlite3 --dry-run
python pokemon_github/import_trainer_ai.py --db master.sqlite3
```

原典: constants/trainer_constants.asm, data/trainers/attributes.asm。
trainer_ai_profiles は職業単位の設定、trainer_ai_flags は検索用の個別フラグ、trainer_ai_items は戦闘中にトレーナーが使用する道具（ポケモンの持ち物とは別）。NO_AI は move_flags に残し、個別フラグには登録しない。NO_ITEM は空欄。アイテムの重複スロットは保持する。既存の空の trainers.ai_profile に職業コードを設定。既存の手動設定は保持する。再実行ではこの3テーブルの原典由来設定を更新する。

```sql
SELECT t.id,t.name_ja,p.* FROM trainers t JOIN trainer_ai_profiles p ON p.class_code=t.ai_profile WHERE t.game_version='crystal';
```

AIの実行アルゴリズム自体は未実装。原典 engine/battle/ai/move.asm は技のスコアを評価して低いものを選び、items.asm は交代・道具の条件を処理する。フラグを固定確率に置き換えないこと。バトルタワー等の例外も別途実装が必要。
