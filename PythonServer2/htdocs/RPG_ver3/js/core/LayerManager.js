// Shared Phaser GameScene behaviors, extracted without changing their logic.
export const LayerManager = {
getLayerBand(layer) {
      return ["lower", "middle", "upper"].includes(layer.band)
        ? layer.band : "lower";
    },

getLayerOrder(layer, index) {
      const value = Number(layer.order);
      return layer.order != null && Number.isFinite(value) ? value : index;
    },

getLayerFootY(layer, image) {
      const explicit = Number(layer.footY);
      const height = Number(layer.imageHeight);
      const actualHeight = Number.isFinite(height) && height > 0
        ? height : image.height;
      return (Number(layer.y) || 0) +
        (layer.footY != null && Number.isFinite(explicit) ? explicit : actualHeight);
    },

    // Phaser depthは小さい値から先に描画する。
    // 中層のYが同値なら画像の一覧順で描画する。

getLayerDepth(layer, index, image) {
      const band = this.getLayerBand(layer);
      const order = this.getLayerOrder(layer, index);
      if (band === "lower") return 100 + order * 0.000001 + index * 0.000000001;
      if (band === "upper") return 3000 + order * 0.000001 + index * 0.000000001;
      return 1000 + this.getLayerFootY(layer, image) * 0.01 +
        order * 0.000001 + index * 0.000000001;
    },

refreshCharacterDepths() {
      // キャラクターの配置座標は足元基準（originY=anchorY）。
      // プレイヤーは中層画像と同じ足元Yで比較する。
      if (this.player?.active) {
        this.player.setDepth(1000 + this.player.y * 0.01 + 0.0005);
      }
      for (const sprite of this.npcSprites || []) {
        if (sprite.active) sprite.setDepth(1000 + sprite.y * 0.01 + 0.0005);
      }
    },

    // ==========================================
    // HTTP配信されたPNG画像を読み込む
    // ==========================================

drawMap() {
      for (const image of this.mapLayerImages || []) image.destroy();
      this.mapLayerImages = [];
      if (this.mapImage) {
        this.mapImage.destroy();
        this.mapImage = null;
      }

      const textureKey =
        this.getMapTextureKey(this.currentMapId);

      if (!this.textures.exists(textureKey)) {
        console.error(
          `[GameScene] 画像がありません: ${textureKey}`
        );

        this.mapImage = this.add.rectangle(
          0,
          0,
          this.mapWidth,
          this.mapHeight,
          0x91bd66
        ).setOrigin(0, 0).setDepth(0);

        return;
      }

      this.mapImage = this.add.image(
        0,
        0,
        textureKey
      );

      this.mapImage.setOrigin(0, 0);
      this.mapImage.setDepth(0);

      // マップエディターのタイル座標と
      // 画像のピクセル座標を一致させる
      // RPG Editorの画像は元のピクセル寸法を維持する（グリッドサイズに引き伸ばさない）。
      this.mapImage.setDisplaySize(Number(this.map.imageWidth)||this.mapWidth,Number(this.map.imageHeight)||this.mapHeight);

      this.textures.get(textureKey).setFilter(
        Phaser.Textures.FilterMode.NEAREST
      );

      this.drawMapLayers();
    },

drawMapLayers() {
      for (const [index, layer] of (this.map.layers || []).entries()) {
        if (layer.visible === false) continue;
        const key = this.getLayerTextureKey(this.currentMapId, index);
        if (!this.textures.exists(key)) {
          console.warn(`[GameScene] レイヤー画像を読み込めません: ${key}`);
          continue;
        }
        const image = this.add.image(Number(layer.x) || 0, Number(layer.y) || 0, key);
        image.setOrigin(0, 0);
        image.setDepth(this.getLayerDepth(layer, index, image));
        const opacity = Number(layer.opacity);
        image.setAlpha(Number.isFinite(opacity) ? Phaser.Math.Clamp(opacity, 0, 1) : 1);
        const width = Number(layer.imageWidth);
        const height = Number(layer.imageHeight);
        if (width > 0 && height > 0) image.setDisplaySize(width, height);
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.mapLayerImages.push(image);
      }
    }

    // ==========================================
    // NPC
    // ==========================================
};
