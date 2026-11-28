import { GameScene } from "../scenes/GameScene/index.js";
export function createRPGSceneClasses() {
    const definitions = window.RPGScenes || [];
    const keys = {};
    const classes = definitions.map((definition, index) => {
      const key = `RPGScene_${index}`;
      keys[definition.id] = key;
      return class extends GameScene {
        constructor() {
          super(key);
          this.sceneId = definition.id;
        }
      };
    });
    window.RPGSceneKeys = keys;
    window.RPGDebug?.info("Scene登録定義生成", { mappings: keys, count: classes.length });
    return classes.length ? classes : [GameScene];
}

