
(function () {
  "use strict";

  class GameScene extends Phaser.Scene {
    constructor() {
      super({ key: "GameScene" });

      this.map = null;
      this.currentMapId = null;

      this.tileSize = 16;
      this.mapWidth = 0;
      this.mapHeight = 0;

      this.mode = "field";
      this.moving = false;
      this.transitioning = false;

      this.facing = { x: 0, y: 1 };

      this.playerX = 0;
      this.playerY = 0;

      this.playerHP = 30;
      this.playerMaxHP = 30;

      this.enemyHP = 0;
      this.enemyMaxHP = 0;

      this.battleUI = null;
      this.mapImage = null;
      this.mapLayerImages = [];
      this.npcSprites = [];
      this.dialog = null;
    }

    // ==========================================
    // マップデータ取得
    // ==========================================

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
    }

    getDefaultMapId() {
      const maps = this.getMaps();

      const requested = window.RPGDefaultMapId;

      if (requested && maps[requested]) {
        return requested;
      }

      return Object.keys(maps)[0] || null;
    }

    getMapImagePath(mapId) {
      const map = this.getMaps()[mapId];
      return map?.imagePath || (typeof map?.imageData === "string" ? map.imageData : null);
    }

    getMapTextureKey(mapId) {
      return `rpg_map_${mapId}`;
    }

    getLayerTextureKey(mapId, layerIndex) {
      return `rpg_layer_${mapId}_${layerIndex}`;
    }

    // 背景 < 下層 < 中層（キャラクターを含むYソート） < 上層。
    // 旧形式のband未設定レイヤーは下層に配置する。
    getLayerBand(layer) {
      return ["lower", "middle", "upper"].includes(layer.band)
        ? layer.band : "lower";
    }

    getLayerOrder(layer, index) {
      const value = Number(layer.order);
      return layer.order != null && Number.isFinite(value) ? value : index;
    }

    getLayerFootY(layer, image) {
      const explicit = Number(layer.footY);
      const height = Number(layer.imageHeight);
      const actualHeight = Number.isFinite(height) && height > 0
        ? height : image.height;
      return (Number(layer.y) || 0) +
        (layer.footY != null && Number.isFinite(explicit) ? explicit : actualHeight);
    }

    // Phaser depthは小さい値から先に描画する。
    // 中層のYが同値なら画像の一覧順で描画する。
    getLayerDepth(layer, index, image) {
      const band = this.getLayerBand(layer);
      const order = this.getLayerOrder(layer, index);
      if (band === "lower") return 100 + order * 0.000001 + index * 0.000000001;
      if (band === "upper") return 3000 + order * 0.000001 + index * 0.000000001;
      return 1000 + this.getLayerFootY(layer, image) * 0.01 +
        order * 0.000001 + index * 0.000000001;
    }

    refreshCharacterDepths() {
      // キャラクターの配置座標は足元基準（originY=anchorY）。
      // プレイヤーは中層画像と同じ足元Yで比較する。
      if (this.player?.active) {
        this.player.setDepth(1000 + this.player.y * 0.01 + 0.0005);
      }
      for (const sprite of this.npcSprites || []) {
        if (sprite.active) sprite.setDepth(1000 + sprite.y * 0.01 + 0.0005);
      }
    }

    // ==========================================
    // HTTP配信されたPNG画像を読み込む
    // ==========================================

    preload() {
      const maps = this.getMaps();
      const ids = Object.keys(maps);

      if (ids.length === 0) {
        throw new Error("マップデータがありません。data/RPGMapProject.json を確認してください。");
      }

      const character = (window.RPGCharacters || []).find(
        c => c.type === "player" && (c.spritePath || c.spriteData)
      );
      this.playerConfig = character || null;
      if (character) {
        this.load.spritesheet("editor_player", character.spritePath || character.spriteData, {
          frameWidth: Number(character.frameWidth) || 32,
          frameHeight: Number(character.frameHeight) || 30,
          margin: Number(character.marginX) || 0,
          spacing: Number(character.spacingX) || 0
        });
      } else {
        this.load.image("editor_player", "./assets/player/walk.png");
      }

      for (const mapId of ids) {
        const map = maps[mapId];
        for (const [index, layer] of (map.layers || []).entries()) {
          const path = layer.imagePath || layer.imageData;
          if (!path) {
            console.warn(`[GameScene] ${mapId} のレイヤー ${index} に画像がありません`);
            continue;
          }
          const key = this.getLayerTextureKey(mapId, index);
          if (!this.textures.exists(key)) this.load.image(key, path);
        }
        const imagePath = this.getMapImagePath(mapId);
        if (!imagePath) {
          throw new Error(`マップ「${mapId}」のimagePathがありません。`);
        }
        const textureKey = this.getMapTextureKey(mapId);
        if (!this.textures.exists(textureKey)) {
          this.load.image(textureKey, imagePath);
        }
      }

      this.load.on("loaderror", file => {
        console.error("[GameScene] 画像の読み込みに失敗:", file.src);
      });
    }

    // ==========================================
    // ==========================================
    // 初期化
    // ==========================================

    create() {
      this.mode = "field";
      this.moving = false;
      this.transitioning = false;

      this.playerHP = 30;
      this.playerMaxHP = 30;

      this.facing = { x: 0, y: 1 };

      this.npcSprites = [];
      this.mapImage = null;
      this.mapLayerImages = [];
      this.battleUI = null;

      this.makeTextures();
      this.createPlayer();
      this.createCamera();
      this.createInput();
      this.createDialog();

      const defaultMapId = this.getDefaultMapId();

      if (!defaultMapId) {
        throw new Error(
          "開始マップが見つかりません。"
        );
      }

      const map = this.getMaps()[defaultMapId];

      this.changeMap(
        defaultMapId,
        map.start.x,
        map.start.y,
        { initial: true }
      );
    }

    // ==========================================
    // キャラクター画像生成
    // ==========================================

    makeTextures() {
      const g = this.make.graphics({
        x: 0,
        y: 0
      });

      const make = (name, draw) => {
        if (this.textures.exists(name)) {
          return;
        }

        g.clear();
        draw(g);
        g.generateTexture(name, 16, 16);
      };

      // 主人公
      make("hero", g => {
        g.fillStyle(0x000000);
        g.fillRect(5, 1, 6, 2);

        g.fillStyle(0x5c453b);
        g.fillRect(3, 3, 10, 4);

        g.fillStyle(0xf4c7a3);
        g.fillRect(4, 6, 8, 4);

        g.fillStyle(0x24374d);
        g.fillRect(3, 10, 10, 4);

        g.fillStyle(0x2a2531);
        g.fillRect(3, 14, 4, 2);
        g.fillRect(9, 14, 4, 2);

        g.fillStyle(0xffffff);
        g.fillRect(6, 7, 1, 1);
        g.fillRect(10, 7, 1, 1);
      });

      // NPC
      make("npc", g => {
        g.fillStyle(0x6c4b39);
        g.fillRect(4, 2, 8, 4);

        g.fillStyle(0xf3c49d);
        g.fillRect(4, 6, 8, 4);

        g.fillStyle(0x9d65ae);
        g.fillRect(3, 10, 10, 4);

        g.fillStyle(0x443c4c);
        g.fillRect(4, 14, 3, 2);
        g.fillRect(9, 14, 3, 2);
      });

      g.destroy();
    }

    // ==========================================
    // プレイヤー
    // ==========================================

    createPlayer() {
      this.player = this.playerConfig ? this.add.sprite(0,0,"editor_player") : this.add.image(0,0,"editor_player");
      this.player.setDepth(1000);
      if(this.playerConfig){
        this.player.setOrigin(Number(this.playerConfig.anchorX??0.5),Number(this.playerConfig.anchorY??1));
        this.player.setScale(Number(this.playerConfig.scale)||1);
        this.setPlayerFrame("down",true);
      } else {this.player.setDisplaySize(16,24);}

    }

    setPlayerTilePosition(x, y) {
      this.playerX = x;
      this.playerY = y;

      const px =
        x * this.tileSize + this.tileSize / 2;

      const py =
        y * (this.map.TILE_HEIGHT||this.tileSize) + (this.map.TILE_HEIGHT||this.tileSize) / 2;

      this.player.setPosition(px, py);
      this.refreshCharacterDepths();
    }

    setPlayerFrame(direction,idle){
      if(!this.playerConfig||!this.player?.setFrame)return;
      const c=this.playerConfig;
      const row=Number(c.directionRows?.[direction]??({up:0,right:1,down:2,left:3})[direction]);
      const columns=Number(c.columns)||3;
      const frame=idle?Number(c.idleFrame??0):(Math.floor(this.time.now/(1000/(Number(c.frameRate)||6)))%columns);
      const index=row*columns+Math.min(columns-1,frame);
      if(this.textures.get("editor_player").has(index))this.player.setFrame(index);
    }

    // ==========================================
    // カメラ
    // ==========================================

    createCamera() {
      const camera = this.cameras.main;

      camera.startFollow(
        this.player,
        true,
        1,
        1
      );

      camera.setRoundPixels(true);
    }

    updateCameraBounds() {
      const camera = this.cameras.main;

      camera.setBounds(
        0,
        0,
        this.mapWidth,
        this.mapHeight
      );

      camera.centerOn(
        this.player.x,
        this.player.y
      );
    }

    // ==========================================
    // 背景画像
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
    }

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

    clearNPCs() {
      for (const sprite of this.npcSprites) {
        sprite.destroy();
      }

      this.npcSprites = [];
    }

    createNPCs() {
      this.clearNPCs();

      const npcs = this.map.npcs || [];

      for (const npc of npcs) {
        const sprite = this.add.image(
          npc.x * this.tileSize + this.tileSize / 2,
          npc.y * (this.map.TILE_HEIGHT||this.tileSize) + (this.map.TILE_HEIGHT||this.tileSize) / 2,
          "npc"
        );

        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(1000);

        this.npcSprites.push(sprite);
      }
    }

    // ==========================================
    // マップ切り替え
    // ==========================================

    changeMap(
      mapId,
      x,
      y,
      options = {}
    ) {
      const maps = this.getMaps();
      const nextMap = maps[mapId];

      if (!nextMap) {
        console.error(
          `[GameScene] 移動先マップが存在しません: ${mapId}`
        );

        if (!options.initial) {
          this.showDialog(
            "移動先のマップが見つかりません。"
          );
        }

        return false;
      }

      if (!nextMap.isWalkable(x, y)) {
        console.error(
          `[GameScene] 移動先が通行不可です: ${mapId} (${x}, ${y})`
        );

        if (!options.initial) {
          this.showDialog(
            "移動先に進めません。"
          );
        }

        return false;
      }

      const textureKey =
        this.getMapTextureKey(mapId);

      if (!this.textures.exists(textureKey)) {
        console.error(
          `[GameScene] 移動先画像がありません: ${mapId}`
        );

        if (!options.initial) {
          this.showDialog(
            "移動先の画像がありません。"
          );
        }

        return false;
      }

      this.transitioning = true;
      this.moving = false;

      this.tweens.killTweensOf(this.player);

      // 旧マップのNPCを破棄
      this.clearNPCs();

      this.currentMapId = mapId;
      this.map = nextMap;

      this.tileSize = this.map.TILE_SIZE || 16;

      this.mapWidth =
        this.map.WIDTH * this.tileSize;

      this.mapHeight =
        this.map.HEIGHT * (this.map.TILE_HEIGHT||this.tileSize);

      // 背景を変更
      this.drawMap();

      // NPCを配置
      this.createNPCs();

      // プレイヤーを移動先へ配置
      this.setPlayerTilePosition(x, y);
      this.setPlayerFrame("down",true);
      this.refreshCharacterDepths();

      // カメラの範囲を変更
      this.updateCameraBounds();

      this.mode = "field";
      this.transitioning = false;

      console.log(
        "[GameScene] マップ移動完了",
        {
          mapId,
          x,
          y,
          tileSize: this.tileSize
        }
      );

      return true;
    }

    // ==========================================
    // イベント取得
    // ==========================================

    getEventAt(x, y, trigger) {
      if (!this.map) return null;

      // 新MapData.jsの関数を優先
      if (typeof this.map.getEvent === "function") {
        return this.map.getEvent(
          x,
          y,
          trigger
        );
      }

      // 配列形式にも対応
      return (this.map.events || []).find(
        event =>
          event.x === x &&
          event.y === y &&
          event.trigger === trigger
      ) || null;
    }

    // ==========================================
    // イベント実行
    // ==========================================

    executeEvent(event) {
      if (!event) return false;

      if (event.type === "transfer") {
        const destination = event.destination;

        if (!destination || !destination.mapId) {
          this.showDialog("移動先マップが未設定です。RPG Editorで設定してください。");
          console.error(
            "[GameScene] 移動先が設定されていません",
            event
          );
          return false;
        }

        return this.changeMap(
          destination.mapId,
          destination.x,
          destination.y
        );
      }

      console.warn(
        "[GameScene] 未対応のイベント種類",
        event.type
      );

      return false;
    }

    // ==========================================
    // 踏んだときのイベント
    // ==========================================

    checkStepEvent() {
      const event = this.getEventAt(
        this.playerX,
        this.playerY,
        "step"
      );

      if (!event) return false;

      return this.executeEvent(event);
    }

    // ==========================================
    // 調べるイベント
    // ==========================================

    checkActionEvent() {
      // まず目の前のマスを確認
      const targetX =
        this.playerX + this.facing.x;

      const targetY =
        this.playerY + this.facing.y;

      let event = this.getEventAt(
        targetX,
        targetY,
        "action"
      );

      // 足元にもイベントがあれば発動
      if (!event) {
        event = this.getEventAt(
          this.playerX,
          this.playerY,
          "action"
        );
      }

      if (!event) return false;

      this.executeEvent(event);
      return true;
    }

    // ==========================================
    // キー入力
    // ==========================================

    createInput() {
      this.keys = this.input.keyboard.addKeys({
        up: "W",
        down: "S",
        left: "A",
        right: "D",

        arrowUp: "UP",
        arrowDown: "DOWN",
        arrowLeft: "LEFT",
        arrowRight: "RIGHT",

        action: "SPACE",
        enter: "ENTER"
      });

      this.input.keyboard.on("keydown", event => {
        if ([
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space"
        ].includes(event.code)) {
          event.preventDefault();
        }
      });
    }

    // ==========================================
    // 会話ウィンドウ
    // ==========================================

    createDialog() {
      const gameWidth = this.scale.width;
      const gameHeight = this.scale.height;

      this.dialog = this.add.container(0, 0)
        .setScrollFactor(0)
        .setDepth(100)
        .setVisible(false);

      const boxHeight = 78;
      const boxY = gameHeight - boxHeight / 2 - 5;

      const bg = this.add.rectangle(
        gameWidth / 2,
        boxY,
        gameWidth - 10,
        boxHeight,
        0xf7f2dc
      );

      bg.setStrokeStyle(
        3,
        0x313b48
      );

      this.dialogText = this.add.text(
        17,
        gameHeight - boxHeight - 1,
        "",
        {
          fontFamily: "sans-serif",
          fontSize: "12px",
          color: "#26303a",
          wordWrap: {
            width: gameWidth - 38
          }
        }
      );

      this.dialog.add([
        bg,
        this.dialogText
      ]);
    }

    showDialog(message) {
      this.mode = "dialog";

      this.dialogText.setText(
        message + "\n\n▼ Space / Enter"
      );

      this.dialog.setVisible(true);
    }

    closeDialog() {
      this.dialog.setVisible(false);
      this.mode = "field";
    }

    // ==========================================
    // 毎フレーム処理
    // ==========================================

    update() {
      this.refreshCharacterDepths();
      if (!this.keys || !this.map) return;

      const action =
        Phaser.Input.Keyboard.JustDown(
          this.keys.action
        ) ||
        Phaser.Input.Keyboard.JustDown(
          this.keys.enter
        );

      if (this.transitioning) {
        return;
      }

      // 会話中
      if (this.mode === "dialog") {
        if (action) {
          this.closeDialog();
        }
        return;
      }

      // 戦闘中
      if (this.mode === "battle") {
        if (action) {
          this.battleAction();
        }
        return;
      }

      if (this.moving) {
        return;
      }

      // Space / Enterで調べる
      if (action) {
        // イベントを優先
        if (this.checkActionEvent()) {
          return;
        }

        // NPCとの会話
        if (this.talkToNPC()) {
          return;
        }
      }

      this.handleMovement();
    }

    // ==========================================
    // NPCとの会話
    // ==========================================

    talkToNPC() {
      const targetX =
        this.playerX + this.facing.x;

      const targetY =
        this.playerY + this.facing.y;

      const npc = (this.map.npcs || []).find(
        npc =>
          npc.x === targetX &&
          npc.y === targetY
      );

      if (!npc) return false;

      this.showDialog(npc.message);
      return true;
    }

    // ==========================================
    // 4方向移動
    // ==========================================

    handleMovement() {
      let dx = 0;
      let dy = 0;

      const k = this.keys;

      if (k.left.isDown || k.arrowLeft.isDown) {
        dx = -1;
      } else if (
        k.right.isDown ||
        k.arrowRight.isDown
      ) {
        dx = 1;
      } else if (
        k.up.isDown ||
        k.arrowUp.isDown
      ) {
        dy = -1;
      } else if (
        k.down.isDown ||
        k.arrowDown.isDown
      ) {
        dy = 1;
      }

      if (dx === 0 && dy === 0) {
        return;
      }

      this.facing = { x: dx, y: dy };
      this.setPlayerFrame(dx<0?"left":dx>0?"right":dy<0?"up":"down",true);

      const nextX = this.playerX + dx;
      const nextY = this.playerY + dy;

      if (!this.map.isWalkable(nextX, nextY)) {
        return;
      }

      this.movePlayer(nextX, nextY);
    }

    // ==========================================
    // タイル単位移動
    // ==========================================

    movePlayer(nextX, nextY) {
      this.moving = true;
      const direction=this.facing.x<0?"left":this.facing.x>0?"right":this.facing.y<0?"up":"down";
      this.setPlayerFrame(direction,false);

      const targetX =
        nextX * this.tileSize +
        this.tileSize / 2;

      const targetY =
        nextY * (this.map.TILE_HEIGHT||this.tileSize) +
        (this.map.TILE_HEIGHT||this.tileSize) / 2;

      this.tweens.add({
        targets: this.player,

        x: targetX,
        y: targetY,

        duration: 220,
        ease: "Linear",
        onUpdate:()=>{
          this.setPlayerFrame(direction,false);
          this.refreshCharacterDepths();
        },

        onComplete: () => {
          this.playerX = nextX;
          this.playerY = nextY;

          this.moving = false;
          this.setPlayerFrame(direction,true);

          // 1. マップ移動イベントを優先
          if (this.checkStepEvent()) {
            return;
          }

          // イベント失敗時に戦闘を起こさない
          if (this.mode !== "field") {
            return;
          }

          // 2. 草むらでのランダム戦闘
          if (
            this.map.isGrass(nextX, nextY) &&
            Math.random() < 0.12
          ) {
            this.startBattle();
          }
        }
      });
    }

    // ==========================================
    // 戦闘開始
    // ==========================================

    startBattle() {
      if (this.mode !== "field") return;

      this.mode = "battle";

      this.enemyHP = 20;
      this.enemyMaxHP = 20;

      const gameWidth = this.scale.width;
      const gameHeight = this.scale.height;

      this.battleUI = this.add.container(0, 0)
        .setScrollFactor(0)
        .setDepth(200);

      const bg = this.add.rectangle(
        gameWidth / 2,
        gameHeight / 2,
        gameWidth,
        gameHeight,
        0xe8e8d0
      );

      const enemy = this.add.circle(
        gameWidth * 0.7,
        gameHeight * 0.32,
        25,
        0x76a75b
      );

      const eye1 = this.add.circle(
        gameWidth * 0.7 - 10,
        gameHeight * 0.32 - 6,
        3,
        0x202020
      );

      const eye2 = this.add.circle(
        gameWidth * 0.7 + 10,
        gameHeight * 0.32 - 6,
        3,
        0x202020
      );

      this.enemyText = this.add.text(
        20,
        20,
        "",
        {
          color: "#202020",
          fontSize: "14px"
        }
      );

      this.battleText = this.add.text(
        15,
        gameHeight - 72,
        "野生のモンスターが現れた！\nSpace：こうげき",
        {
          color: "#202020",
          fontSize: "13px",
          lineSpacing: 8
        }
      );

      this.battleUI.add([
        bg,
        enemy,
        eye1,
        eye2,
        this.enemyText,
        this.battleText
      ]);

      this.updateBattleText();
    }

    // ==========================================
    // 戦闘情報更新
    // ==========================================

    updateBattleText() {
      this.enemyText.setText(
        `モンスター HP ${Math.max(0, this.enemyHP)}/${this.enemyMaxHP}\n` +
        `あなた HP ${Math.max(0, this.playerHP)}/${this.playerMaxHP}`
      );
    }

    // ==========================================
    // 攻撃
    // ==========================================

    battleAction() {
      this.enemyHP -= Phaser.Math.Between(6, 10);

      if (this.enemyHP <= 0) {
        this.finishBattle(
          "モンスターに勝利した！"
        );
        return;
      }

      this.playerHP -= Phaser.Math.Between(2, 5);

      if (this.playerHP <= 0) {
        this.playerHP = this.playerMaxHP;

        // 現在のマップの開始地点へ戻す
        this.setPlayerTilePosition(
          this.map.start.x,
          this.map.start.y
        );

        this.updateCameraBounds();

        this.finishBattle(
          "負けてしまった！\n開始地点に戻って回復した。"
        );

        return;
      }

      this.updateBattleText();

      this.battleText.setText(
        "こうげきした！\n" +
        "相手も反撃してきた！\n" +
        "Space：こうげき"
      );
    }

    // ==========================================
    // 戦闘終了
    // ==========================================

    finishBattle(message) {
      if (this.battleUI) {
        this.battleUI.destroy();
        this.battleUI = null;
      }

      this.mode = "field";

      this.showDialog(message);
    }
  }

  window.GameScene = GameScene;
})();
