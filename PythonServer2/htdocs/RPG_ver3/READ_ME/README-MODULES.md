# Modular RetroRPG (stage 1 + initial stage 2)

- `index.html` loads Phaser and DebugLogger as classic scripts, and `js/main.js` as an ES module.
- `js/core/MapData.js` and `SceneRegistry.js` load the editor JSON and dynamically register each Phaser Scene.
- `js/scenes/GameScene/index.js` keeps the existing game lifecycle and battle/dialog/input logic.
- Map, layer, player, and event methods were extracted verbatim to `js/core/` and attached to GameScene.prototype.
- `js/api/StudentGameAPI.js` and `js/lessons/` are scaffolds only: lesson execution is **not enabled** yet.
- `TitleScene`, `BattleScene`, `MenuScene` are not registered; the existing built-in battle is unchanged.
- Serve via HTTP, not file://. Verify transfers, layers, collisions, dialogue and battles in a browser.
