# PythonWebServer の SQLite 保存機能：RPGセーブデータで学ぶ

この資料は、添付された `PythonWebServer/server.py` と `database.py` の**実際の実装**に基づいています。PHPや追加のデータベースサーバーは不要です。

## 1. 全体の仕組み

```text
ブラウザ（RPG / JavaScript）
   │ fetch() で JSON を送信・取得
   ▼
PythonWebServer/server.py  ← HTTP API
   │
   ▼
database.py  ← SQLite を読み書き
   │
   ▼
data/database.sqlite3  ← 保存ファイル
```

ゲーム側が `fetch()` でHTTPリクエストを送り、PythonがSQLiteに記録します。ブラウザを閉じても、DBファイルを削除しなければ保存データは残ります。

## 2. セーブデータの例

例えば、次のようなJavaScriptオブジェクトを丸ごと保存できます。

```js
const saveData = {
  slot: 1,
  playerName: 'ゆうしゃ',
  mapId: 'town_01',
  x: 8,
  y: 12,
  hp: 75,
  maxHp: 100,
  gold: 350,
  inventory: ['やくそう', 'どうのつるぎ'],
  flags: { metVillageChief: true }
};
```

`database.py` は `records` テーブルを自動作成します。主な列は `id`（自動採番）、`data`（JSON文字列）、`created_at`、`updated_at` です。`slot` や `hp` は独立したDB列ではなく、`data` の中に入ります。

**重要：** `slot: 1` と SQLiteの `id: 1` は別物です。新規保存のたびに `id` が増えます。同じスロットを上書きしたい場合は、保存時に返された **DBの `id`** を保持して `PUT` します。

## 3. API一覧

| 操作 | HTTP | URL | 動作 |
|---|---|---|---|
| 動作確認 | GET | `/api/health` | `{ "status": "ok" }` を返す |
| 一覧 | GET | `/api/records` | 新しいID順、最大1000件 |
| 1件取得 | GET | `/api/records/1` | ID=1の保存データを返す |
| 新規保存 | POST | `/api/records` | JSONを新しい行として保存 |
| 上書き | PUT | `/api/records/1` | ID=1のJSON全体を置換 |
| 削除 | DELETE | `/api/records/1` | ID=1を削除 |

POST/PUTのリクエスト本文はJSONの**オブジェクトまたは配列**にしてください。`Content-Type: application/json` が必須で、本文サイズの上限は1MBです。

## 4. JavaScriptから保存する

### 新規セーブ（POST）

```js
async function createSave(saveData) {
  const response = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saveData)
  });
  if (!response.ok) throw new Error(`保存失敗: ${response.status}`);
  return await response.json();
}

const saved = await createSave({
  slot: 1, playerName: 'ゆうしゃ', mapId: 'town_01',
  x: 8, y: 12, hp: 75, gold: 350
});
console.log('保存ID:', saved.id);
```

返却例（日時は実行時に変わります）：

```json
{
  "id": 1,
  "data": { "slot": 1, "playerName": "ゆうしゃ", "mapId": "town_01", "x": 8, "y": 12, "hp": 75, "gold": 350 },
  "created_at": "2026-11-14T05:00:00.000Z",
  "updated_at": "2026-11-14T05:00:00.000Z"
}
```

### 読み込み（GET）

```js
async function loadSave(id) {
  const response = await fetch(`/api/records/${id}`);
  if (!response.ok) throw new Error(`読込失敗: ${response.status}`);
  const record = await response.json();
  return record.data; // 実際のゲーム状態は data の中
}

const gameState = await loadSave(1);
console.log(gameState.mapId, gameState.x, gameState.y);
```

### 上書きセーブ（PUT）

```js
async function overwriteSave(id, newSaveData) {
  const response = await fetch(`/api/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newSaveData)
  });
  if (!response.ok) throw new Error(`上書き失敗: ${response.status}`);
  return await response.json();
}

await overwriteSave(1, {
  slot: 1, playerName: 'ゆうしゃ', mapId: 'castle_02',
  x: 3, y: 5, hp: 90, gold: 600
});
```

**注意：** PUTは差分更新ではありません。送信したオブジェクトで `data` 全体を置き換えるため、持ち物やイベントフラグも残したければ一緒に送信してください。

### 削除（DELETE）

```js
async function deleteSave(id) {
  const response = await fetch(`/api/records/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`削除失敗: ${response.status}`);
  return await response.json();
}

await deleteSave(1);
```

## 5. そのまま動かせるサンプルHTML

次の内容を `PythonWebServer/htdocs/save-test.html` に保存します。PythonWebServerを起動して `http://localhost:80/save-test.html` を開いてください（ポートを変更している場合は読み替えます）。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>RPGセーブデータ体験</title>
  <style>
    body { font-family: sans-serif; max-width: 650px; margin: 30px auto; padding: 0 16px; }
    label { display: block; margin: 10px 0; }
    button { margin: 6px 4px 6px 0; padding: 8px 12px; }
    pre { padding: 12px; background: #eee; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>RPG セーブデータ体験</h1>
  <p>「新規セーブ」後、表示されたDB IDで読込・上書き・削除できます。</p>
  <label>DB ID <input id="id" type="number" min="1" placeholder="新規保存時に自動入力"></label>
  <label>名前 <input id="name" value="ゆうしゃ"></label>
  <label>マップ <input id="map" value="town_01"></label>
  <label>X <input id="x" type="number" value="8"></label>
  <label>Y <input id="y" type="number" value="12"></label>
  <label>HP <input id="hp" type="number" value="75"></label>
  <label>所持金 <input id="gold" type="number" value="350"></label>
  <div>
    <button onclick="createSave()">新規セーブ</button>
    <button onclick="loadSave()">ロード</button>
    <button onclick="updateSave()">上書き</button>
    <button onclick="removeSave()">削除</button>
    <button onclick="listSaves()">一覧表示</button>
  </div>
  <pre id="result">ここに結果が表示されます</pre>
  <script>
    const el = id => document.getElementById(id);
    const show = value => el('result').textContent = JSON.stringify(value, null, 2);
    const getId = () => {
      const id = Number(el('id').value);
      if (!Number.isSafeInteger(id) || id <= 0) throw Error('有効なDB IDを入力してください');
      return id;
    };
    const gameData = () => ({
      slot: 1, playerName: el('name').value, mapId: el('map').value,
      x: Number(el('x').value), y: Number(el('y').value),
      hp: Number(el('hp').value), gold: Number(el('gold').value),
      inventory: ['やくそう'], flags: { metVillageChief: false }
    });
    async function request(url, options) {
      try {
        const res = await fetch(url, options);
        const data = await res.json();
        if (!res.ok) throw Error(data.error || `HTTP ${res.status}`);
        show(data);
        return data;
      } catch (e) { show({ error: e.message }); return null; }
    }
    const jsonOptions = (method, data) => ({
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    async function createSave() {
      const result = await request('/api/records', jsonOptions('POST', gameData()));
      if (result) el('id').value = result.id;
    }
    async function loadSave() {
      try {
        const result = await request(`/api/records/${getId()}`);
        if (!result) return;
        const d = result.data;
        el('name').value = d.playerName ?? '';
        el('map').value = d.mapId ?? '';
        for (const k of ['x', 'y', 'hp', 'gold']) el(k).value = d[k] ?? 0;
      } catch (e) { show({ error: e.message }); }
    }
    async function updateSave() {
      try { await request(`/api/records/${getId()}`, jsonOptions('PUT', gameData())); }
      catch (e) { show({ error: e.message }); }
    }
    async function removeSave() {
      try { await request(`/api/records/${getId()}`, { method: 'DELETE' }); }
      catch (e) { show({ error: e.message }); }
    }
    async function listSaves() { await request('/api/records'); }
  </script>
</body>
</html>
```

### 試す順番

1. `新規セーブ` を押す → SQLiteに1件作成され、DB IDが表示される。
2. HPを「20」に変える → `上書き` を押す。
3. HPを「75」に戻してから `ロード` を押す → 保存済みの「20」に戻る。
4. `一覧表示` を押す → 保存済みレコードを確認できる。
5. `削除` を押す → そのDB IDのレコードを削除する。

※ この簡易サンプルは上書き時に持ち物・フラグを固定値で再送信します。実ゲームでは全状態をゲームオブジェクトから組み立ててください。

## 6. データベースはどこにある？

添付コードでは `LocalWebServer.start()` が `self.root.parent / "data" / "database.sqlite3"` を使用します。通常の `htdocs` 構成なら以下のようになります。

```text
PythonWebServer/
├── app.py
├── server.py
├── database.py
├── htdocs/
│   └── save-test.html
└── data/
    └── database.sqlite3  ← 自動生成
```

SQLiteはファイル形式のデータベースです。サーバー停止後もこのファイルにデータが残ります。バックアップはサーバーを停止してからDBファイルをコピーするのが簡単です。

## 7. よくある疑問

**Q. 同じスロットに何度もPOSTすると？** そのたびに別のDB IDで新規レコードが増えます。上書きはPUTを使います。

**Q. DB IDが分からなくなったら？** `GET /api/records` で一覧取得できます。ただし最大1000件で、スロット検索専用APIはありません。ゲーム固有の識別情報を `data` に含め、必要ならサーバー側に専用APIを追加してください。

**Q. どのゲームのデータか区別できる？** 既存APIにはゲーム別の区分やユーザー認証がありません。例えば `gameId: 'retro-rpg'` を `data` に入れることはできますが、アクセス制限にはなりません。

**Q. プレイヤーのマップ座標だけ変更できる？** 既存PUTはJSON全体の置換です。現在のデータを取得し、座標を変更してから全体をPUTしてください。

**Q. 別のPCから使える？** サーバーがLANアドレスで待ち受けていてファイアウォールが許可していれば可能です。ブラウザから同じサーバーのHTMLを開くと相対パス `/api/records` が使えます。

## 8. セキュリティ上の重要事項

添付されたAPIには**認証機能がありません**。既定のホスト設定 `0.0.0.0` で起動すると、接続可能なLAN内の端末からセーブデータを取得・変更・削除できます。インターネットへそのまま公開しないでください。ローカル専用なら `127.0.0.1` で待ち受ける構成が安全です。公開する場合は認証、HTTPS、アクセス制限、入力検証などが必要です。

---

**まとめ：** RPGの「セーブ」は `POST`、 「ロード」は `GET`、 「同じセーブの更新」は `PUT`、 「削除」は `DELETE`。これらを `fetch()` で呼ぶだけで、既存のPythonWebServerとSQLiteを利用できます。
