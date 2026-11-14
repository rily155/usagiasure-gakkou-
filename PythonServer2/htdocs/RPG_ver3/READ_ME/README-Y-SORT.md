# RPGゲーム本体の描画順（Yソート）

背景画像（最背面）→ lower（下層）→ middle（中層、キャラクターを含む）→ upper（上層）の順で描画します。

- `band`: `lower` / `middle` / `upper`。未指定は旧データ互換のため `lower`。
- `x`, `y`: レイヤー画像の左上位置（マップ上のピクセル座標）。
- `footY`: 画像上端から接地点までのピクセル距離。未指定は画像の表示高さ。
- `order`: 同じ描画層での手動順序。未指定は配列位置。中層ではYが同じ場合の順序に使用。
- `visible`, `opacity`: 従来どおり表示切替・透明度に対応。

中層レイヤーの接地Y = y + footY。プレイヤーとNPCは移動中も毎フレーム足元のYに応じて描画順を更新します。

例:
```json
{"layers":[
  {"id":"shadow","imagePath":"assets/map/shadow.png","band":"lower","order":0,"x":0,"y":0},
  {"id":"tree","imagePath":"assets/map/tree.png","band":"middle","order":1,"x":100,"y":40,"footY":90},
  {"id":"roof","imagePath":"assets/map/roof.png","band":"upper","order":2,"x":0,"y":0}
]}
```

背の高い草の下半身隠しは上層の透過PNGを使ってください。草むらタイル `G` 自体は画像マスクを生成しません。

ゲーム用JSONと画像はエディタから同時に出力し、`data/` と `assets/` を同じRetroRPGルートに配置してください。
