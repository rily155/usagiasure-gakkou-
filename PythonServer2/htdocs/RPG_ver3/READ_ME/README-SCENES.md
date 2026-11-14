# RPG Editor Scene対応

- エディタのversion 4形式（scenes / currentSceneId / maps[].sceneId）に対応。
- エディタで作成したSceneごとにPhaser Sceneを動的登録し、移動イベントのtargetMapIdから移動先Sceneを判定します。
- 同じScene内の移動は既存のマップ切替、別Sceneへの移動はPhaser Scene切替です。
- Scene移動時にプレイヤーHPと向きを引き継ぎます。
- マップ画像・レイヤー・イベント・NPCは移動先マップの内容に切り替わります。
- マップ外へ出るイベント（leave_map）と、移動先座標指定・端指定に対応。
- 古いversion 3 JSONは仮想scene_1に所属させる互換処理を用意しています。
- エディタのゲーム用ZIPを出力し、ZIP内のdata/とassets/をRetroRPGへ上書きしてください。
- 注意: エディタにあるSceneごとのアセットライブラリという独立した実行時データ形式は確認できず、現時点では各マップ・キャラクターが参照する画像を使用します。
- ブラウザでの実動作は未検証です。
