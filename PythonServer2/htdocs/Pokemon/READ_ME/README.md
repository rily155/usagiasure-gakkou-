# Pokémon ブラウザRPG — 現行仕様 README

更新日: 2026-11-16

> この文書は、提供された `READ_ME` 資料群と直近の仕様変更を整理したものです。ゲーム本体およびサーバの最新ソース一式を今回検証したものではありません。実装の最終確認は実際のコード・API応答で行ってください。

## 1. 概要

- ブラウザで動作する、Phaser 3 ベースの見下ろし型RPG。
- RPGエディタで作成したマップ、キャラクター、イベント、Sceneを読み込む。
- `file://` ではなく PythonWebServer から HTTP 配信する。
- ゲームIDは `pokemon`。ゲーム公開ディレクトリは `htdocs/Pokemon/` を想定する（URLの大文字小文字に注意）。
- マスター情報は PythonWebServer の読み取り専用 SQLite API から取得する。旧 `pokemon_stats_master.json` は現行の能力値生成には使用しない。
- セーブはゲーム別の `saves.sqlite3` に、セーブ形式 v4 で保存する。

## 2. ディレクトリ構成（主要部分）

```text
PythonWebServer/
├── htdocs/
│   └── Pokemon/
│       ├── index.html
│       ├── data/RPGMapProject.json
│       ├── js/main.js
│       ├── js/core/
│       │   ├── GameContext.js
│       │   ├── SaveManager.js
│       │   ├── EventManager.js
│       │   ├── MapManager.js
│       │   ├── PlayerController.js
│       │   ├── PokemonStats.js
│       │   └── PokemonFactory.js
│       ├── js/scenes/
│       ├── js/features/
│       └── pokemon_menu/
└── data/
    └── games/
        └── pokemon/
            ├── master.sqlite3
            └── saves.sqlite3
```

上記は資料に記載された主要構成です。アセットや追加モジュールは省略しています。

## 3. 起動と配置

1. PythonWebServer でゲームID `pokemon` を登録し、マスターDBを `data/games/pokemon/master.sqlite3` に導入する。
2. PythonWebServer にマスター検索APIとゲーム別セーブCRUD APIが実装されていることを確認する。
3. ゲームを `htdocs/Pokemon/` に配置し、PythonWebServerを起動する。
4. `http://127.0.0.1:8000/Pokemon/` など、サーバが公開するURLからアクセスする。
5. 更新時はブラウザのキャッシュを無効化して再読み込みする。

`htdocs` の外側にSQLiteを配置し、DBファイル自体をHTTP公開しないでください。

## 4. マスターDBとAPI

マスター情報は次の読み取り専用APIから取得します。

```http
GET /api/games/pokemon/master/query/{table}?{column}={value}
```

実際のSQLite列名に一致する検索条件を指定してください。確認済みの検索例:

```http
GET /api/games/pokemon/master/query/pokemon?id=25
GET /api/games/pokemon/master/query/pokemon_base_stats?pokemon_id=25
GET /api/games/pokemon/master/query/pokemon_species_details?pokemon_id=25
GET /api/games/pokemon/master/query/pokemon_gen2_learnsets?pokemon_id=25
GET /api/games/pokemon/master/query/experience_groups?growth_rate=medium&level=5
GET /api/games/pokemon/master/query/moves?id=45
```

主要テーブル:

| テーブル | 用途 | 主な検索列 |
|---|---|---|
| `pokemon` | 図鑑番号・名前 | `id` |
| `pokemon_base_stats` | 6能力の種族値 | `pokemon_id` |
| `pokemon_species_details` | 成長タイプ・基本なつき度など | `pokemon_id` |
| `experience_groups` | 成長タイプ別・レベル別累積経験値（`total_exp`） | `growth_rate`, `level` |
| `pokemon_gen2_learnsets` | 第2世代の習得技 | `pokemon_id` |
| `moves` | 技名・PPなど | `id` |

**注意:** 旧汎用テーブルAPI `GET /api/games/pokemon/master/tables/{table}` は最大100行の取得で、ID検索には向きません。上記 `/master/query/` はサーバ側に追加実装されている必要があります。

## 5. ポケモン生成・能力値

`PokemonFactory.js` がAPIから種族値・成長タイプ・経験値・習得技・技データを取得し、`PokemonStats.js` が能力値を計算します。

- 初期ポケモン: ピカチュウ（25）、イーブイ（133）、ヒノアラシ（155）を選択する仕様。
- 初期レベル: 5。
- 個体値（IV）: 6能力それぞれ0〜31で生成。
- 努力値（EV）: 初期値0。
- 性格: 25種類から生成。能力値計算は第3世代以降の性格補正方式。
- HP・攻撃・防御・特攻・特防・素早さを生成。取得直後の現在HPは最大HPと同じ。
- 習得技: 第2世代クリスタル版のレベルアップ技を参照し、最大4つと現在PP・最大PPを保持。
- 経験値: `experience_groups` の成長タイプ・レベルに対応する累積値を使用。

HP計算式（第3世代以降の一般式）:

```text
最大HP = floor((2×種族値 + IV + floor(EV/4)) × Lv / 100) + Lv + 10
```

その他の能力値:

```text
能力値 = floor((floor((2×種族値 + IV + floor(EV/4)) × Lv / 100) + 5) × 性格補正)
```

初期ポケモン選択は専用UIからゲーム側へ結果を通知し、取得後は手持ちへ追加します。選択済みフラグによって一度きりのイベントにします。

## 6. セーブ・ロード（v4）

保存先: `data/games/pokemon/saves.sqlite3` のゲーム別セーブ。

```http
GET    /api/games/pokemon/saves
GET    /api/games/pokemon/saves/{slot}
POST   /api/games/pokemon/saves
PUT    /api/games/pokemon/saves/{slot}
DELETE /api/games/pokemon/saves/{slot}
```

主なセーブ項目:

- `kind: pokemon-save`、`version: 4`
- `player`: 主人公名、マップ、座標、向き、所持金、プレイ時間
- `pokemon.party` / `pokemon.boxes`: 個体情報（現在HP、最大HP、IV、EV、性格、技、PPなど）
- `pokedex.seen` / `pokedex.caught`
- `progress.badges` / `progress.flags` / `progress.variables` / `progress.defeatedTrainers` / `progress.collectedItems`
- `settings.textSpeed` / `settings.battleAnimations`

操作はゲームメニューの「レポート」で保存し、タイトルの「つづきから」でロードする方式。**旧 `/api/records`、F5保存、v3以前のセーブ互換性を現行仕様として扱わないでください。**

APIのPUTはJSON全体の置換です。保存前に `saves.sqlite3` をバックアップしてください。

## 7. エディタ・Scene・イベント

- エディタの `scenes` / `currentSceneId` / `maps[].sceneId` を利用してPhaser Sceneを構成。
- マップ移動イベントでは同一Scene内のマップ切替と、別Sceneへの切替を扱う。
- `data/RPGMapProject.json` と参照画像をゲーム側へ配置する。
- イベントは決定キー・接触等のトリガーに対応。`scriptId` による登録済みJavaScript関数呼び出しの説明は旧資料に存在するが、最新の接続状況はコードで確認すること。
- スターター選択などの専用イベントは `customEventId` による実装を利用する。

## 8. レイヤーと当たり判定

- 描画層は `lower` / `middle` / `upper`。`middle` は接地点Yに応じたYソートを利用する。
- レイヤーの接地点は `y + footY`。同じ描画層では `order` も使用する。
- マップの当たり判定とプレイヤー・NPCの足元位置をエディタのタイル基準と一致させる修正履歴がある。
- 画像やマップの座標オフセット、通行不可タイルの設定はエディタデータと照合する。

## 9. UI

- Escでメニューを開き、「ポケモン」から手持ち（最大6匹）を確認する。
- ポケモン画像は `pokemon_menu/sprites/` の全国図鑑番号に対応する画像を利用する構成。
- 手持ち画面には名前、レベル、HPなどを表示する。

## 10. トラブルシューティング

### `PokemonFactory.js` で400 Bad Request

存在しない列を指定していないか確認します。`pokemon` と `moves` は `id`、種族値と種族詳細は `pokemon_id`、経験値は `growth_rate` と `level` を使用します。HPが表示されても、失敗した検索を別列でリトライする古いコードが残っている場合があります。

### `missing ) after argument list`

`PokemonFactory.js` の構文エラーです。サーバが配信している実ファイルを確認し、開発環境で `node --check PokemonFactory.js` を実行してください。キャッシュと配置先も確認します。

### HPが `0 / 0`

ポケモン生成時のマスター取得・能力値計算と、既存セーブの個体データを確認してください。旧形式の取得済み個体を自動修復するとは限りません。

### `favicon.ico` 404

サイトアイコンが未配置の警告で、ポケモン生成やAPI検索エラーとは別問題です。

## 11. 注意事項

- マスター検索APIの追加・変更をPythonWebServerのEXEに反映する場合は、サーバEXEの再ビルドが必要です。ゲームJSのみの修正では通常不要です。
- APIには認証がない構成のため、信頼できるLAN・ローカル環境での利用を前提としてください。
- ゲームの最新ソースと実サーバの動作を今回のREADME整理だけで保証するものではありません。
- 旧資料の個別パッチ説明は履歴として扱い、現行の導入手順と混同しないでください。
