import { GameAPI } from "../../api/GameAPI.js";
import { gameContext } from "../../core/GameContext.js";
import { setupFeatures } from "../../features/index.js";
import { MapManager } from "../../core/MapManager.js";
import { LayerManager } from "../../core/LayerManager.js";
import { PlayerController } from "../../core/PlayerController.js";
import { EventManager } from "../../core/EventManager.js";
import { CollisionManager } from "../../core/CollisionManager.js";


class GameScene extends Phaser.Scene {
    constructor(sceneKey = "GameScene") {
      super({ key: sceneKey });

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
      this.choiceState = null;
      this.entryData = null;
    }

    init(data) {
      this.entryData = data || {};
      window.RPGDebug?.info("Scene.init", {scene:this.sys.settings.key, sceneId:this.sceneId, entry:this.entryData});
    }

    // ==========================================
    // マップデータ取得
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

      // RPGエディタで登録されたNPCごとのスプライトシートを読み込む。
      for (const npcCharacter of (window.RPGCharacters || [])) {
        if (npcCharacter.type !== "npc") continue;
        const path = npcCharacter.spritePath || npcCharacter.spriteData;
        if (!path) {
          console.warn("[GameScene] NPC画像未設定:", npcCharacter.name);
          continue;
        }
        const key = `editor_npc_${npcCharacter.id}`;
        if (this.textures.exists(key)) continue;
        this.load.spritesheet(key, path, {
          frameWidth: Number(npcCharacter.frameWidth) || 32,
          frameHeight: Number(npcCharacter.frameHeight) || 32,
          margin: Number(npcCharacter.marginX) || 0,
          spacing: Number(npcCharacter.spacingX) || 0
        });
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
      window.RPGDebug?.info("Scene.create開始", {scene:this.sys.settings.key, sceneId:this.sceneId, entry:this.entryData});
      this.mode = "field";
      this.moving = false;
      this.transitioning = false;

      this.playerHP = Number.isFinite(this.entryData?.playerHP) ? this.entryData.playerHP : 30;
      this.playerMaxHP = Number.isFinite(this.entryData?.playerMaxHP) ? this.entryData.playerMaxHP : 30;

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

      // 学習者の機能をScene作成時に反映する。状態は全Sceneで共有。
      setupFeatures(new GameAPI(this, gameContext));

      const sceneId = this.sceneId || window.RPGDefaultSceneId;
      const preferredMapId = this.entryData?.mapId;
      const defaultMapId = preferredMapId && this.getMaps()[preferredMapId]?.sceneId === sceneId
        ? preferredMapId
        : (window.RPGScenesById?.[sceneId]?.currentMapId || this.getDefaultMapId());

      if (!defaultMapId) {
        throw new Error(
          "開始マップが見つかりません。"
        );
      }

      const map = this.getMaps()[defaultMapId];

      window.RPGDebug?.info("Scene初期マップ決定", {sceneId, defaultMapId, preferredMapId, start:map.start});
      this.changeMap(
        defaultMapId,
        Number.isInteger(this.entryData?.x) ? this.entryData.x : map.start.x,
        Number.isInteger(this.entryData?.y) ? this.entryData.y : map.start.y,
        { initial: true, direction: this.entryData?.direction || map.start.direction }
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

    clearNPCs() {
      for (const sprite of this.npcSprites) {
        sprite.destroy();
      }

      this.npcSprites = [];
    }

    createNPCs() {
      this.clearNPCs();

      const npcs = this.map.npcs || [];
      const characters = window.RPGCharacters || [];
      for (const npc of npcs) {
        const character = characters.find(c => c.id === npc.characterId);
        const textureKey = character ? `editor_npc_${character.id}` : null;
        const pos = this.tileToWorld(Number(npc.x), Number(npc.y));
        let sprite;

        if (textureKey && this.textures.exists(textureKey)) {
          const columns = Math.max(1, Number(character.columns) || 3);
          const rows = character.directionRows || {};
          const direction = npc.direction || "down";
          const row = Number(rows[direction] ?? {up: 0, right: 1, down: 2, left: 3}[direction] ?? 2);
          const idle = Math.max(0, Math.min(columns - 1, Number(character.idleFrame) || 0));
          const frame = Math.max(0, row) * columns + idle;
          sprite = this.add.sprite(pos.x, pos.y, textureKey, frame);
          sprite.setOrigin(Number(character.anchorX ?? 0.5), Number(character.anchorY ?? 1));
          sprite.setScale(Number(character.scale) || 1);
          this.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
        } else {
          // 旧形式のNPCとの互換性を維持する。
          window.RPGDebug?.warn("NPC画像を取得できません", {npcId:npc.id, characterId:npc.characterId, textureKey});
          sprite = this.add.image(pos.x, pos.y, "npc");
          sprite.setOrigin(0.5, 0.5);
        }
        sprite.setData("npc", npc);
        sprite.setDepth(1000 + sprite.y * 0.01 + 0.0005);
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
      window.RPGDebug?.info("changeMap開始", {fromScene:this.sceneId, fromMap:this.currentMapId, toMap:mapId, x,y, options, moving:this.moving, transitioning:this.transitioning});
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

      const currentSceneId = this.sceneId || window.RPGDefaultSceneId;
      if (!options.initial && nextMap.sceneId !== currentSceneId) {
        const sceneKey = window.RPGSceneKeys?.[nextMap.sceneId];
        if (!sceneKey || !this.scene.manager.keys[sceneKey]) {
          window.RPGDebug?.error("移動先Sceneの登録照合に失敗", {
            targetSceneId: nextMap.sceneId, targetMapId: mapId,
            mappedSceneKey: sceneKey || null,
            registeredKeys: Object.keys(this.scene.manager.keys),
            projectSceneIds: (window.RPGScenes || []).map(scene => scene.id)
          });
          this.showDialog("移動先Sceneが登録されていません。\n詳細はデバッグログを確認してください。");
          return false;
        }
        if (!nextMap.isWalkable(x, y)) {
          this.showDialog("移動先に進めません。");
          return false;
        }
        window.RPGDebug?.info("別Sceneへの移動要求", {fromScene:this.sys.settings.key, toScene:sceneKey, targetSceneId:nextMap.sceneId, mapId,x,y, direction:options.direction});
        this.scene.start(sceneKey, {
          mapId, x, y, direction: options.direction,
          playerHP: this.playerHP, playerMaxHP: this.playerMaxHP
        });
        window.RPGDebug?.info("scene.start呼び出し完了", {toScene:sceneKey});
        return true;
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

      window.RPGDebug?.info("マップ配置開始", {scene:this.sys.settings.key, mapId,x,y});
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
      this.setFacing(options.direction);
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
        .setDepth(10000)
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

      // 選択肢は会話ウィンドウの上側に表示する。
      this.choicePanel = this.add.container(0, 0).setVisible(false);
      this.choiceBackground = this.add.rectangle(0, 0, 1, 1, 0xf7f2dc)
        .setOrigin(0, 0).setStrokeStyle(2, 0x313b48);
      this.choiceText = this.add.text(0, 0, "", {
        fontFamily: "sans-serif", fontSize: "13px", color: "#26303a",
        lineSpacing: 8
      });
      this.choicePanel.add([this.choiceBackground, this.choiceText]);
      this.dialog.add([bg, this.dialogText, this.choicePanel]);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (this.choiceState) this.finishChoice(-1);
      });
    }

    showDialog(message) {
      if (this.choiceState) this.finishChoice(-1);
      this.mode = "dialog";

      this.dialogText.setText(
        message + "\n\n▼ Space / Enter"
      );

      this.dialog.setVisible(true);
    }

    closeDialog() {
      if (this.choiceState) this.finishChoice(-1);
      this.dialog.setVisible(false);
      this.mode = "field";
    }

    /** 選択結果（0から始まる番号）をPromiseで返す。キャンセル時は-1。 */
    showChoices(message, options) {
      if (this.choiceState) return Promise.reject(new Error("選択肢は既に表示中です"));
      if (!Array.isArray(options) || options.length < 2 || options.length > 8 ||
          options.some(option => typeof option !== "string" || !option.trim())) {
        return Promise.reject(new TypeError("optionsは2～8個の空でない文字列にしてください"));
      }
      return new Promise(resolve => {
        this.choiceState = { options, selected: 0, resolve };
        this.mode = "choice";
        this.dialogText.setText(String(message));
        this.dialog.setVisible(true);
        this.renderChoices();
      });
    }

    renderChoices() {
      if (!this.choiceState) return;
      const { options, selected } = this.choiceState;
      const width = Math.min(180, this.scale.width - 20);
      const height = options.length * 24 + 16;
      const x = this.scale.width - width - 8;
      const y = Math.max(5, this.scale.height - 88 - height);
      this.choicePanel.setPosition(x, y).setVisible(true);
      this.choiceBackground.setSize(width, height);
      this.choiceText.setPosition(12, 8).setText(
        options.map((option, index) => `${index === selected ? "▶" : "  "} ${option}`).join("\n")
      );
    }

    finishChoice(index) {
      const state = this.choiceState;
      if (!state) return;
      this.choiceState = null;
      this.choicePanel.setVisible(false);
      this.dialog.setVisible(false);
      this.mode = "field";
      state.resolve(index);
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

      // 選択肢表示中：移動キーは選択操作に使う。
      if (this.mode === "choice") {
        const up = Phaser.Input.Keyboard.JustDown(this.keys.up) ||
          Phaser.Input.Keyboard.JustDown(this.keys.arrowUp);
        const down = Phaser.Input.Keyboard.JustDown(this.keys.down) ||
          Phaser.Input.Keyboard.JustDown(this.keys.arrowDown);
        if (up || down) {
          const state = this.choiceState;
          if (state) {
            state.selected = (state.selected + (down ? 1 : -1) + state.options.length) % state.options.length;
            this.renderChoices();
          }
        }
        if (action && this.choiceState) this.finishChoice(this.choiceState.selected);
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

Object.assign(GameScene.prototype, MapManager, LayerManager, PlayerController, EventManager, CollisionManager);

export { GameScene };
