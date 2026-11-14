// Shared Phaser GameScene behaviors, extracted without changing their logic.
export const MapManager = {
getMaps() {
      if (window.RPGMaps &&
          Object.keys(window.RPGMaps).length > 0) {
        return window.RPGMaps;
      }

      // 旧MapData.jsとの互換性
      if (window.RPGMapData) {
        return {
          town: window.RPGMapData
        };
      }

      return {};
    },

getDefaultMapId() {
      const maps = this.getMaps();

      const requested = window.RPGDefaultMapId;

      if (requested && maps[requested]) {
        return requested;
      }

      return Object.keys(maps)[0] || null;
    },

getMapImagePath(mapId) {
      const map = this.getMaps()[mapId];
      return map?.imagePath || (typeof map?.imageData === "string" ? map.imageData : null);
    },

getMapTextureKey(mapId) {
      return `rpg_map_${mapId}`;
    },

getLayerTextureKey(mapId, layerIndex) {
      return `rpg_layer_${mapId}_${layerIndex}`;
    },

    // 背景 < 下層 < 中層（キャラクターを含むYソート） < 上層。
    // 旧形式のband未設定レイヤーは下層に配置する。

tileToWorld(x, y) {
      return {
        x: (this.map.gridOffsetX || 0) + (x + 0.5) * this.tileSize,
        y: (this.map.gridOffsetY || 0) + (y + 0.5) * (this.map.TILE_HEIGHT || this.tileSize)
      };
    }
};
