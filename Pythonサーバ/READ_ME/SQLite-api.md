# PythonWebServer SQLite API仕様書（ゲーム別DB管理対応）

更新日：2026-11-15  
対象：`PythonWebServer_game_sqlite_extension.zip` 内の `server.py` / `game_manager.py` / `database.py` と、旧資料 `SQLite-api(2).md`。

> **実装範囲の注意**：ゲーム登録・削除・SQLiteインポート・バックアップは現在 **Tkinter GUIから操作**します。HTTP APIとしては未実装です。ゲーム別マスターDBは読み取り専用、ゲーム別セーブDBは専用CRUD APIで書き込み可能です。既存の `/api/records` は従来どおり利用できますが、ゲーム別DBではなく共通DBを使用します。

## 1. 構成と保存先

```text
PythonWebServer/
├── PythonWebServer.exe  （または app.py）
├── htdocs/
│   ├── pokemon/
│   │   └── index.html
│   └── save-test.html
└── data/
    ├── database.sqlite3           ← 従来の records API 用・共通DB
    ├── games.json                 ← ゲーム登録情報
    ├── games/
    │   └── pokemon/
    │       ├── master.sqlite3     ← マスターデータ
    │       └── saves.sqlite3      ← セーブ用（ゲーム別CRUD対応）
    ├── backups/
    │   └── pokemon/              ← DBバックアップ
    └── deleted_games/            ← 登録解除したゲームのDB退避先
```

DBは `htdocs` の外に置きます。exe起動時はexeのあるフォルダが基準です。`master.sqlite3` と `saves.sqlite3` はゲーム登録時に空のSQLiteとして作成されます。ゲームIDは英字で始まる英数字、`_`、`-`、最大64文字です。

## 2. HTTP API一覧（セーブCRUD追加版）

| メソッド | パス | 説明 | DB |
|---|---|---|---|
| GET | `/api/health` | 稼働確認 | なし |
| GET | `/api/games` | 登録済みゲーム一覧 | `games.json` |
| GET | `/api/games/{game_id}` | ゲーム登録情報 | `games.json` |
| GET | `/api/games/{game_id}/master/tables` | マスターDBのテーブル名一覧 | ゲーム別 master |
| GET | `/api/games/{game_id}/saves/tables` | セーブDBのテーブル名一覧 | ゲーム別 saves |
| GET | `/api/games/{game_id}/master/tables/{table}` | 指定テーブルの行データ（最大100件） | ゲーム別 master |
| GET | `/api/games/{game_id}/saves/tables/{table}` | 指定テーブルの行データ（最大100件） | ゲーム別 saves |
| GET | `/api/games/{game_id}/saves` | ゲーム別セーブ一覧（最大1000件） | ゲーム別 saves |
| GET | `/api/games/{game_id}/saves/{slot}` | 指定スロットのセーブ取得 | ゲーム別 saves |
| POST | `/api/games/{game_id}/saves` | 新規スロット作成 | ゲーム別 saves |
| PUT | `/api/games/{game_id}/saves/{slot}` | スロット上書き | ゲーム別 saves |
| DELETE | `/api/games/{game_id}/saves/{slot}` | スロット削除 | ゲーム別 saves |
| GET | `/api/records` | 共通レコード一覧（最大1000件） | 共通DB |
| GET | `/api/records/{id}` | 共通レコード1件取得 | 共通DB |
| POST | `/api/records` | 共通レコード新規作成 | 共通DB |
| PUT | `/api/records/{id}` | 共通レコード全体置換 | 共通DB |
| DELETE | `/api/records/{id}` | 共通レコード削除 | 共通DB |

`{game_id}` と `{table}` はURLの一部です。テーブル一覧・取得の対象DB種別は `master` / `saves` のみです。行取得の上限は現状100件固定で、ページングや検索条件のHTTP指定はありません。

### 2.1 稼働確認

```http
GET /api/health
```

```json
{"status":"ok"}
```

### 2.2 ゲーム一覧・ゲーム詳細

```http
GET /api/games
GET /api/games/pokemon
```

登録済みゲームが `pokemon` の場合の**例**：

```json
{"games":[{"id":"pokemon","name":"ポケモン","site":"pokemon"}]}
```

詳細の例：

```json
{"id":"pokemon","name":"ポケモン","site":"pokemon"}
```

`name` と `site` はGUIで登録した値に依存します。

### 2.3 テーブル一覧

```http
GET /api/games/pokemon/master/tables
```

レスポンス例（既存ポケモンDBをインポート済みの場合）：

```json
{"tables":["current_items","current_moves","pokemon"]}
```

上記は形式例であり、実際にはインポートしたDB内の全ユーザーテーブル名が返ります。

### 2.4 テーブルデータ取得

```http
GET /api/games/pokemon/master/tables/current_moves
```

レスポンス形式：

```json
{"rows":[{"id":1,"identifier":"pound"}]}
```

上記の行は**形式例**です。実際のカラム名・内容はSQLiteのテーブル定義に従います。行順の指定はなく、SQLに `ORDER BY` がないため順序は保証されません。最大100行です。

## 3. JavaScriptからゲーム別マスターを読む

```js
async function getGameTables(gameId, kind = 'master') {
  const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/${kind}/tables`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()).tables;
}

async function getGameRows(gameId, table, kind = 'master') {
  const url = `/api/games/${encodeURIComponent(gameId)}/${kind}/tables/${encodeURIComponent(table)}`;
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body.rows;
}

console.log(await getGameTables('pokemon'));
console.log(await getGameRows('pokemon', 'current_moves'));
```

**重要**：技マスターのように919件あるテーブルでも、このAPIで取得できるのは先頭から最大100行です。ポケモンIDや技IDで検索する専用API、`limit` / `offset`、ページング等は**今後の拡張が必要**です。

## 4. ゲーム登録・SQLite管理（GUI機能）

| GUI操作 | 現在の動作 |
|---|---|
| ゲーム登録 | `data/games.json` に登録し、`data/games/{game_id}/master.sqlite3` と `saves.sqlite3` を作成 |
| ゲーム登録解除 | 登録情報を消し、DBフォルダを `data/deleted_games/` に退避（`htdocs` は削除しない） |
| 既存SQLiteのインポート | 指定ゲームの master または saves に取り込み。取り込み前に対象DBをバックアップ |
| バックアップ | `data/backups/{game_id}/` にSQLiteのバックアップを作成 |
| テーブル確認 | 選択したDBのテーブル一覧や行を確認 |

これらの操作は **`POST /api/games` 等では呼び出せません**。HTTPで登録・インポート・バックアップを行うAPIは現状ありません。

### ポケモンDBの導入例

1. GUIでゲームID `pokemon` を登録。
2. DB種別 `master` を選択。
3. 既存の `database_imported_current_effects.sqlite3` をインポート。
4. ブラウザで `/api/games/pokemon/master/tables` を確認。
5. 必要なテーブルを `/api/games/pokemon/master/tables/{table}` で読み取り。

## 5. 従来の共通 records API（引き続き利用可能）

既存資料のRPGセーブ例は、現在も**共通DB `data/database.sqlite3`** に対して利用できます。ただしゲーム別の `saves.sqlite3` には保存されません。

### 新規保存

```js
const saveData = {
  gameId: 'pokemon',
  slot: 1,
  playerName: 'ゆうしゃ',
  mapId: 'town_01',
  x: 8, y: 12, hp: 75, gold: 350
};
const response = await fetch('/api/records', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(saveData)
});
if (!response.ok) throw new Error(`保存失敗: ${response.status}`);
const saved = await response.json();
console.log('DB ID:', saved.id);
```

### 読み込み・上書き・削除

```js
const record = await (await fetch(`/api/records/${saved.id}`)).json();
console.log(record.data);

await fetch(`/api/records/${saved.id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({...record.data, hp: 50})
});

await fetch(`/api/records/${saved.id}`, {method: 'DELETE'});
```

- POST/PUTはJSONオブジェクトまたは配列、`Content-Type: application/json`、本文1MB以下。
- POSTのたびに新規レコードが作られます。`slot` とDBの `id` は別です。
- PUTは差分ではなくJSON全体の置換です。
- `gameId` をJSONに含めてもDB自体は分離されません。

## 6. エラーと制限

| 状況 | HTTP応答 |
|---|---|
| 不正なゲームID、未登録ゲーム、存在しないテーブル | 400（`{"error":"..."}`） |
| 存在しないAPIパス、レコードID | 404 |
| 不正なJSON本文、本文サイズ・Content-Type不正 | 400 |
| SQLite例外 | 500（`{"error":"データベースエラー"}`） |

- ゲーム別APIは**読み取り専用**。ゲームごとのセーブCRUD APIは未実装。
- テーブル取得は最大100件、検索・ソート・ページングなし。
- `GET /api/games/{game_id}` は登録情報を返すだけで、DB内容は返しません。
- 認証はなし。既定の待ち受け `0.0.0.0` はLAN内の他端末からアクセス可能な場合があります。ローカル学習のみなら `127.0.0.1` での待ち受けを推奨します。
- SQLiteのファイルを直接HTTP公開しないため、DBは `htdocs` 外に配置します。

## 7. 次に追加すると便利なAPI（**未実装・設計案**）

```http
GET    /api/games/pokemon/master/tables/current_moves?limit=100&offset=100
GET    /api/games/pokemon/pokemon/25
GET    /api/games/pokemon/moves/85
GET    /api/games/pokemon/saves
POST   /api/games/pokemon/saves
GET    /api/games/pokemon/saves/1
PUT    /api/games/pokemon/saves/1
DELETE /api/games/pokemon/saves/1
```

これらは**現行のサーバで呼び出しても動作しません**。必要に応じて `server.py` とDB管理層を拡張してください。

---

### 変更履歴

- 旧資料 `SQLite-api(2).md`：共通 `records` APIのみを説明。
- 本版：ゲーム一覧、ゲーム詳細、ゲーム別SQLiteテーブル閲覧、GUI管理機能、共通 `records` APIとの違い、未実装機能を追記。


## ゲーム別セーブCRUD API（新規実装）

保存先は `data/games/{game_id}/saves.sqlite3` の `game_saves` テーブルです。`slot` は1以上の整数でゲームごとに一意です。`id` はDB内部の自動採番で、APIのURLには使いません。`data` はJSONオブジェクトまたは配列です。本文上限は1MBです。

### 新規保存

```http
POST /api/games/pokemon/saves
Content-Type: application/json

{"slot":1,"playerName":"主人公","mapId":"town_01","x":8,"y":12,"hp":100}
```

HTTP 201、レスポンス例：

```json
{"id":1,"slot":1,"data":{"slot":1,"playerName":"主人公","mapId":"town_01","x":8,"y":12,"hp":100},"created_at":"2026-11-15T00:00:00.000Z","updated_at":"2026-11-15T00:00:00.000Z"}
```

同じスロットにPOSTするとHTTP 409です。

### 読込・一覧

```http
GET /api/games/pokemon/saves/1
GET /api/games/pokemon/saves
```

一覧レスポンスは `{ "saves": [ ... ] }` です。存在しないスロットはHTTP 404です。

### 上書き・削除

```http
PUT /api/games/pokemon/saves/1
Content-Type: application/json

{"playerName":"主人公","mapId":"castle","hp":75}
```

PUTは差分更新ではなくJSON全体の置換です。URLのスロット番号を使うため本文の `slot` は必須ではありません。

```http
DELETE /api/games/pokemon/saves/1
```

削除成功時は `{ "deleted": true, "slot": 1 }` が返ります。

### JavaScript例

```js
const root = '/api/games/pokemon/saves';
const json = { 'Content-Type': 'application/json' };

async function api(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

// 新規セーブ
await api(root, {method:'POST', headers:json, body:JSON.stringify({slot:1, hp:100, mapId:'town'})});
// ロード
const saved = await api(`${root}/1`);
console.log(saved.data);
// 上書き
await api(`${root}/1`, {method:'PUT', headers:json, body:JSON.stringify({hp:75, mapId:'castle'})});
// 削除
await api(`${root}/1`, {method:'DELETE'});
```

### エラーと制約

- 400: ゲームID不正、未登録ゲーム、JSON形式不正、スロット番号不正
- 404: スロットなし、URL不一致
- 409: 新規POSTでスロット重複
- 500: SQLite処理エラー
- 認証なし。学習用の信頼できるローカル環境で使用してください。
- `master.sqlite3` に対する書き込みAPIはありません。
- 旧 `/api/records` は従来どおり共通DBを使用します。
