import {BattleEvents,battleStore,resolveProfile} from "../../core/BattleEvents.js";
import { resolveEditorAssetPath } from "../../core/EditorStorage.js";
import { masterRows as growthMasterRows } from "../../core/PokemonFactory.js";
import { applyGrowth } from "../../core/PokemonGrowth.js";
import { prepareTypes } from "../../core/BattleTypes.js";
import { prepareBattleRewards, applyVictoryExperience, experienceProgress } from "../../core/BattleReward.js";
import { audioManager } from "../../core/AudioManager.js";
import { createPokemon } from "../../core/PokemonFactory.js";
import { SaveManager } from "../../core/SaveManager.js";
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
      const initialSave = window.RPGInitialSave;
      // 起動時の先頭Sceneだけがセーブ情報を受け取る。
      this.entryData = initialSave || data || {};
      if (initialSave) window.RPGInitialSave = null;
      window.RPGDebug?.info("Scene.init", {scene:this.sys.settings.key, sceneId:this.sceneId, entry:this.entryData});
    }

    // ==========================================
    // マップデータ取得
    // ==========================================

    preload() {
      const maps = this.getMaps();
      const ids = Object.keys(maps);

      if (ids.length === 0) {
        throw new Error("マップデータがありません。/storage/games/pokemon/editor/data/RPGMapProject.json を確認してください。");
      }

      const character = (window.RPGCharacters || []).find(
        c => c.type === "player" && (c.spritePath || c.spriteData)
      );
      this.playerConfig = character || null;
      if (character) {
        this.load.spritesheet("editor_player", resolveEditorAssetPath(character.spritePath || character.spriteData), {
          frameWidth: Number(character.frameWidth) || 32,
          frameHeight: Number(character.frameHeight) || 30,
          margin: Number(character.marginX) || 0,
          spacing: Number(character.spacingX) || 0
        });
      } else {
        this.load.image("editor_player", "/storage/games/pokemon/editor/assets/player/walk.png");
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
        this.load.spritesheet(key, resolveEditorAssetPath(path), {
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
          if (!this.textures.exists(key)) this.load.image(key, resolveEditorAssetPath(path));
        }
        const imagePath = this.getMapImagePath(mapId);
        if (!imagePath) {
          throw new Error(`マップ「${mapId}」のimagePathがありません。`);
        }
        const textureKey = this.getMapTextureKey(mapId);
        if (!this.textures.exists(textureKey)) {
          this.load.image(textureKey, resolveEditorAssetPath(imagePath));
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


      this.facing = this.entryData?.facing || { x: 0, y: 1 };

      this.npcSprites = [];
      this.mapImage = null;
      this.mapLayerImages = [];
      this.battleUI = null;

      this.makeTextures();
      this.createPlayer();
      this.createCamera();
      this.createInput();
      this.createDialog();
      this.createGameMenu();

      // 学習者の機能をScene作成時に反映する。状態は全Sceneで共有。


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
      const facing = this.entryData?.facing;
      const savedDirection = facing && typeof facing === 'object'
        ? (facing.x < 0 ? 'left' : facing.x > 0 ? 'right' : facing.y < 0 ? 'up' : 'down')
        : (typeof facing === 'string' ? facing : null);
      const loaded = this.changeMap(
        defaultMapId,
        Number.isInteger(this.entryData?.x) ? this.entryData.x : map.start.x,
        Number.isInteger(this.entryData?.y) ? this.entryData.y : map.start.y,
        { initial: true, fromSave: this.entryData?.fromSave === true,
          direction: savedDirection || this.entryData?.direction || map.start.direction }
      );
      if (!loaded) console.error('[GameScene] 初期マップの配置に失敗', this.entryData);
      else setupFeatures(new GameAPI(this, gameContext));
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
          sprite.setOrigin(0.5, 1);
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
          // ポケモンの状態は gameContext でシーン間共有
        });
        window.RPGDebug?.info("scene.start呼び出し完了", {toScene:sceneKey});
        return true;
      }

      // セーブ地点が後から障害物になった場合でも、マップ内なら保存位置を復元する。
      // 通常のマップ移動では従来どおり通行判定を維持する。
      const savedPositionInBounds = options.initial && options.fromSave &&
        Number.isInteger(x) && Number.isInteger(y) &&
        x >= 0 && y >= 0 && x < nextMap.WIDTH && y < nextMap.HEIGHT;
      if (!nextMap.isWalkable(x, y) && !savedPositionInBounds) {
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

      if (savedPositionInBounds && !nextMap.isWalkable(x, y)) {
        console.warn('[GameScene] 保存位置は現在通行不可ですが復元します', { mapId, x, y });
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
      audioManager.field(nextMap);
      this.encounterState = { region: null, steps: 0 };

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
        enter: "ENTER",
        menu: "ESC"
      });

      this.input.keyboard.on("keydown", event => {
        if ([
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "Escape"
        ].includes(event.code)) {
          event.preventDefault();
        }
      });
    }

    // 画面右側に表示するフィールドメニュー（レポートでのみ保存）。
    createGameMenu() {
      this.menuItems = ["ずかん", "ポケモン", "バッグ", "主人公", "レポート", "せってい", "とじる"];
      this.menuDescriptions = [
        "ポケモンずかんを ひらきます。", "てもちの ポケモンを かくにんします。",
        "もちものを かくにんします。", "しゅじんこうの じょうほうを みます。",
        "ぼうけんの きろくを SQLiteに ほぞんします。", "ゲームの せっていを ひらきます。",
        "メニューを とじます。"
      ];
      this.menuIndex = 0;
      this.menuState = "main";
      const w = this.scale.width, h = this.scale.height;
      this.gameMenu = this.add.container(0, 0).setScrollFactor(0).setDepth(20000).setVisible(false);
      const panel = this.add.rectangle(w - 7, 7, 127, 211, 0xe0dedb).setOrigin(1, 0)
        .setStrokeStyle(4, 0x424452);
      this.menuText = this.add.text(w - 126, 14, "", {
        fontFamily: "monospace", fontSize: "15px", color: "#33343d", lineSpacing: 9
      });
      const info = this.add.rectangle(w / 2, h - 35, w - 10, 65, 0x28638b)
        .setStrokeStyle(3, 0xb0b7c3);
      this.menuInfo = this.add.text(13, h - 59, "", {
        fontFamily: "monospace", fontSize: "12px", color: "#ffffff", wordWrap: { width: w - 28 }
      });
      this.gameMenu.add([panel, this.menuText, info, this.menuInfo]);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.gameMenu?.destroy();
        this.gameMenu = null;
      });
    }

    openGameMenu() {
      if (this.mode !== "field" || this.moving || this.transitioning) return;
      this.mode = "menu";
      this.menuState = "main";
      this.menuIndex = 0;
      this.gameMenu.setVisible(true);
      this.renderGameMenu();
    }

    closeGameMenu() {
      if (this.mode !== "menu") return;
      this.gameMenu.setVisible(false);
      this.mode = "field";
      this.menuState = "main";
    }

    renderGameMenu() {
      if (this.menuState === "confirm") {
        this.menuText.setText(" レポート\n\n" + ["はい", "いいえ"].map((v,i) =>
          `${this.menuIndex === i ? "▶" : " "} ${v}`).join("\n"));
        this.menuInfo.setText("ぼうけんの きろくを\nほぞん しますか？");
      } else if (this.menuState === "saving") {
        this.menuText.setText(" レポート\n\n ほぞんちゅう…");
        this.menuInfo.setText("SQLiteに きろくしています。\nしばらく おまちください。");
      } else {
        this.menuText.setText(this.menuItems.map((v,i) =>
          `${this.menuIndex === i ? "▶" : " "} ${v}`).join("\n"));
        this.menuInfo.setText(this.menuDescriptions[this.menuIndex]);
      }
    }

    async chooseGameMenu() {
      if (this.menuState === "saving") return;
      if (this.menuState === "confirm") {
        if (this.menuIndex === 1) {
          this.menuState = "main"; this.menuIndex = 4; this.renderGameMenu(); return;
        }
        this.menuState = "saving";
        this.renderGameMenu();
        try {
          await SaveManager.save(this);
          this.closeGameMenu();
          this.showDialog("ぼうけんの きろくを\nSQLiteに ほぞんしました！");
        } catch (error) {
          console.error("セーブ失敗", error);
          this.closeGameMenu();
          this.showDialog("セーブに しっぱいしました。\n" + error.message);
        }
        return;
      }
      const item = this.menuItems[this.menuIndex];
      if (item === "とじる") { this.closeGameMenu(); return; }
      if (item === "レポート") {
        this.menuState = "confirm"; this.menuIndex = 1; this.renderGameMenu(); return;
      }
      if (item === "バッグ") { this.openItemBag(); return; }
      if (item === "ポケモン") {
        this.openPokemonParty();
        return;
      }
      this.closeGameMenu();
      if (item === "主人公") {
        this.showDialog(`${gameContext.playerName || "主人公"}\nおこづかい ${gameContext.gold}円\nマップ: ${this.map?.name || this.currentMapId}`);
      } else {
        this.showDialog(`${item}は まだ じゅんびちゅうです。`);
      }
    }

    // フィールドのEscメニューからバッグを閲覧。データはGameContext、表示はAPI。
    openItemBag() {
      if (this.bagOverlay) return;
      this.gameMenu.setVisible(false); this.mode = 'bag';
      const host=document.getElementById('game-container')||document.body;
      const oldPosition=host.style.position;
      if(getComputedStyle(host).position==='static')host.style.position='relative';
      const overlay=document.createElement('div');
      overlay.style.cssText='position:absolute;inset:0;z-index:99999;background:#101b2b';
      const frame=document.createElement('iframe');frame.src='./bag/index.html?mode=field';
      frame.title='バッグ';frame.style.cssText='width:100%;height:100%;border:0';
      overlay.append(frame);host.append(overlay);this.bagOverlay=overlay;
      const close=()=>{if(this.bagOverlay!==overlay)return;window.removeEventListener('message',onMessage);overlay.remove();this.bagOverlay=null;host.style.position=oldPosition;this.mode='menu';this.gameMenu?.setVisible(true);this.renderGameMenu();this.input.keyboard?.resetKeys()};
      const onMessage=e=>{if(e.source!==frame.contentWindow||e.origin!==location.origin)return;
        if(e.data?.type==='bag-ready')frame.contentWindow.postMessage({type:'bag-data',inventory:gameContext.inventory,party:gameContext.party},location.origin);
        if(e.data?.type==='bag-close')close();};
      window.addEventListener('message',onMessage);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{window.removeEventListener('message',onMessage);overlay.remove();this.bagOverlay=null;host.style.position=oldPosition});
      frame.addEventListener('load',()=>frame.contentWindow?.focus());
    }

    // 手持ち画面。データの正本はGameContextで、表示HTMLは閲覧専用。
    openPokemonParty() {
      if (this.partyOverlay) return;
      this.gameMenu.setVisible(false);
      this.mode = "party";
      const host = document.getElementById("game-container") || document.body;
      const previousPosition = host.style.position;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      const overlay = document.createElement("div");
      overlay.className = "pokemon-party-overlay";
      Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "99999", background: "#101b2b",
        display: "flex", flexDirection: "column", width: "100vw", height: "100dvh"
      });
      const frame = document.createElement("iframe");
      frame.title = "手持ちポケモン";
      frame.src = "./pokemon_menu/index.html";
      frame.style.cssText = "width:100%;height:100%;min-height:0;border:0;flex:1";
      overlay.appendChild(frame);
      host.appendChild(overlay);
      this.partyOverlay = overlay;
      const close = () => {
        if (this.partyOverlay !== overlay) return;
        window.removeEventListener("message", onMessage);
        overlay.remove();
        this.partyOverlay = null;
        host.style.position = previousPosition;
        this.mode = "menu";
        this.gameMenu?.setVisible(true);
        this.renderGameMenu();
        this.input.keyboard?.resetKeys();
      };
      const onMessage = event => {
        if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
        if (event.data?.type === "pokemon-party-ready") {
          frame.contentWindow.postMessage({ type: "pokemon-party-data", party: gameContext.party }, window.location.origin);
        } else if (event.data?.type === "pokemon-party-rename") {
          const { instanceId, nickname } = event.data;
          if (typeof instanceId !== "string" || typeof nickname !== "string") return;
          const value = nickname.trim();
          if (Array.from(value).length > 12 || /[\u0000-\u001f\u007f]/.test(value)) return;
          const p = gameContext.party.find(p => p.instanceId === instanceId);
          if (!p) return;
          p.nickname = value;
          frame.contentWindow?.postMessage({ type: "pokemon-party-renamed", instanceId, nickname: value }, window.location.origin);
        } else if (event.data?.type === "pokemon-party-reordered") {
          const next = event.data.party;
          if (!Array.isArray(next) || next.length !== gameContext.party.length) return;
          // ゲーム側の個体データを正本として、instanceIdの並び順だけを受け取る。
          const originals = gameContext.party;
          const ids = next.map(p => p?.instanceId);
          if (ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) return;
          const lookup = new Map(originals.map(p => [p.instanceId, p]));
          if (lookup.size !== originals.length || ids.some(id => !lookup.has(id))) return;
          gameContext.party = ids.map(id => lookup.get(id));
          frame.contentWindow?.postMessage({ type: "pokemon-party-data", party: gameContext.party }, window.location.origin);
        } else if (event.data?.type === "pokemon-party-close") close();
      };
      window.addEventListener("message", onMessage);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        window.removeEventListener("message", onMessage);
        overlay.remove();
        this.partyOverlay = null;
        host.style.position = previousPosition;
      });
      frame.addEventListener("load", () => frame.contentWindow?.focus());
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
      if (this.rewardMessages?.length) { this.showDialog(this.rewardMessages.shift()); return; }
      if (this.choiceState) this.finishChoice(-1);
      this.dialog.setVisible(false);
      this.mode = "field";
      this.finishVictoryBgm?.();
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

      const menuPressed = Phaser.Input.Keyboard.JustDown(this.keys.menu);
      if (this.mode === "party") return;
      if (this.mode === "menu") {
        if (this.menuState === "saving") return;
        if (menuPressed) {
          if (this.menuState === "confirm") {
            this.menuState = "main"; this.menuIndex = 4; this.renderGameMenu();
          } else this.closeGameMenu();
          return;
        }
        const up = Phaser.Input.Keyboard.JustDown(this.keys.up) || Phaser.Input.Keyboard.JustDown(this.keys.arrowUp);
        const down = Phaser.Input.Keyboard.JustDown(this.keys.down) || Phaser.Input.Keyboard.JustDown(this.keys.arrowDown);
        if (up || down) {
          const count = this.menuState === "confirm" ? 2 : this.menuItems.length;
          this.menuIndex = (this.menuIndex + (down ? 1 : -1) + count) % count;
          this.renderGameMenu();
        }
        if (action) void this.chooseGameMenu();
        return;
      }
      if (menuPressed && this.mode === "field") {
        this.openGameMenu();
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

      // HTMLのポケモン選択画面表示中はフィールド操作を停止。
      if (this.mode === "starter_selection") return;

      // 会話中
      if (this.mode === "dialog") {
        if (action) {
          this.closeDialog();
        }
        return;
      }

      // 戦闘中
      if (this.mode === "battle") {
        // iframe が戦闘の入力を処理する。
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

    async startBattle(monster = null, options = {}) {
      if (this.mode !== "field") return;
      if (!gameContext.party.some(p => Number(p.hp) > 0)) {
        this.showDialog('たたかえる ポケモンが いません。'); return;
      }
      this.mode = "battle";
      const battleType = options.type === 'trainer' ? 'trainer' : 'wild';
      const music = window.RPGScenesById?.[this.map.sceneId] || {};
      const profile=options.profile ?? resolveProfile(battleStore(gameContext),battleType);
      const events=new BattleEvents(battleStore(gameContext),profile,id=>music.customBgms?.find(b=>b.id===id)?.bgm ?? music[id] ?? (id==='trainerBattleBgm'?music.battleBgm:null));
      events.emit('encounter');
      if(options.bgm)audioManager.changeBGM(options.bgm);
      let restored = false, victoryStarted = false;
      const restoreBgm = () => {
        if (restored) return;
        restored = true;
        events.emit("battleEnd");
        this.finishVictoryBgm = null;
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, restoreBgm);
      };
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, restoreBgm);
      const victoryBgm = () => {
        if (victoryStarted) return;
        victoryStarted = true;
        events.emit('victory');
      };
      const host = document.getElementById("game-container");
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:absolute;inset:0;z-index:99999;background:#20272c";
      overlay.textContent = "バトルを じゅんびしています…";
      host.appendChild(overlay);
      const frame = document.createElement("iframe");
      frame.title = "ポケモンバトル";
      frame.style.cssText = "width:100%;height:100%;border:0;display:block";
      let closed = false, enemy, timer, rewards, typeData, processed = false;
      let rewardAnimationTimer = null;
      const keyboard = this.input.keyboard;
      if (keyboard) { keyboard.resetKeys(); keyboard.enabled = false; }
      const cleanup = (keepMusic = false) => {
        if (closed) return;
        closed = true; clearTimeout(timer); clearTimeout(rewardAnimationTimer);
        if (keepMusic !== true) restoreBgm();
        window.removeEventListener("message", onMessage);
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
        overlay.remove();
        if (keyboard) { keyboard.enabled = true; keyboard.resetKeys(); }
      };
      const finish = (message) => {
        const keepMusic = victoryStarted && Boolean(message || this.rewardMessages?.length);
        cleanup(keepMusic);
        this.mode = "field";
        if (keepMusic) this.finishVictoryBgm = restoreBgm;
        if (message) this.showDialog(message);
        else if (this.rewardMessages?.length) this.showDialog(this.rewardMessages.shift());
      };
      const aliases = {potion:['potion','キズぐすり'],ball:['poke-ball','pokeball','モンスターボール']};
      const itemRows = key => gameContext.inventory.filter(i => aliases[key].includes(String(i.itemId)));
      const counts = () => Object.fromEntries(Object.keys(aliases).map(k => [k,itemRows(k).reduce((n,i)=>n+Math.max(0,Number(i.quantity)||0),0)]));
      const consume = (key, amount) => { for (const i of itemRows(key)) { const n=Math.min(amount,Number(i.quantity)||0); i.quantity-=n; amount-=n; } };
      const onMessage = async event => {
        if (closed || event.source !== frame.contentWindow || event.origin !== location.origin) return;
        const data = event.data;
        if(data?.type==='battle-event' && !processed){
          const allowed=['intro','battleStart','hpChanged','enemyFainted','captureStart','captureFailed','captureSuccess','defeat','escapeSuccess','playerSwitch'];
          if(allowed.includes(data.name)){if(data.name==='hpChanged')events.hp(data.detail||{});else events.emit(data.name,data.detail||{});}
        } else if (data?.type === 'battle-victory') {
          if (!processed) victoryBgm();
        } else if (data?.type === 'exp-animation-done') {
          if (!processed || !rewardAnimationTimer) return;
          clearTimeout(rewardAnimationTimer); rewardAnimationTimer = null;
          finish(this.pendingExpMessage || '');
        } else if (data?.type === 'battle-ready') {
          clearTimeout(timer);
          frame.contentWindow.postMessage({type:'battle-init',battleType,party:gameContext.party,enemy,typeData,items:counts(),inventory:gameContext.inventory},location.origin);
          if (!gameContext.pokedex.seen.includes(enemy.pokemonId)) gameContext.pokedex.seen.push(enemy.pokemonId);
        } else if (data?.type === 'battle-finish') {
          if (processed) return;
          processed = true;
          for (const p of gameContext.party) {
            const next = data.party?.find(q=>q.instanceId===p.instanceId);
            if (!next) continue;
            if (Number.isFinite(next.current)) p.hp=p.currentHp=Math.max(0,Math.min(p.maxHp,Math.floor(next.current)));
            p.moves.forEach((m,i)=>{const pp=next.moves?.[i]?.[2]; if(Number.isFinite(pp)) m.pp=Math.max(0,Math.min(m.maxPp ?? m.pp,Math.floor(pp)));});
          }
          if(Array.isArray(data.bagSpent) && data.bagSpent.length) {
            for(const id of data.bagSpent) {const row=gameContext.inventory.find(i=>String(i.itemId)===String(id)&&Number(i.quantity)>0);if(row)row.quantity--;}
          }
          const before=counts();
          if(!data.bagManaged) for(const k of Object.keys(aliases)) if(Number.isFinite(data.items?.[k])) consume(k,Math.max(0,Math.min(before[k],before[k]-Math.floor(data.items[k]))));
          if(data.result==='caught') {
            enemy.hp=enemy.currentHp=Math.max(1,Math.min(enemy.maxHp,Number(data.enemyHP)||1));
            (gameContext.party.length<6?gameContext.party:gameContext.box).push(enemy);
            if(!gameContext.pokedex.caught.includes(enemy.pokemonId)) gameContext.pokedex.caught.push(enemy.pokemonId);
          }
          if (data.result === 'win' && data.enemyHP === 0) {
            victoryBgm();
            events.emit('experienceGain');
            let messages;
            try {
              const staged = structuredClone(gameContext.party);
              messages = applyVictoryExperience(staged, Array.isArray(data.participants)?data.participants:[], enemy, rewards);
              messages.push(...await applyGrowth(staged, gameContext.party, Array.isArray(data.participants)?data.participants:[], enemy, rewards));
              if(closed) return;
              if(staged.some((p,i)=>p.level>gameContext.party[i].level))events.emit('levelUp');
              staged.forEach((p,i) => { const evolved=p.pokemonId!==gameContext.party[i].pokemonId; Object.assign(gameContext.party[i],p); if(evolved){for(const k of ["seen","caught"])if(!gameContext.pokedex[k].includes(p.pokemonId))gameContext.pokedex[k].push(p.pokemonId);}});
            } catch (error) {
              console.error("[BattleReward]", error);
              finish("育成結果の反映に失敗しました。\n" + error.message);
              return;
            }
            this.rewardMessages = messages.slice(1);
            this.pendingExpMessage = messages[0] || '';
            // バトル画面で経験値ゲージをアニメーションしてからフィールドに戻す。
            // iframeが応答しない場合もゲーム進行を止めない。
            const updated = gameContext.party.map(p => ({
              instanceId:p.instanceId, level:p.level, experience:p.experience,
              expProgress:p.expProgress, nextLevelExperience:p.nextLevelExperience
            }));
            rewardAnimationTimer = setTimeout(() => {
              rewardAnimationTimer = null;
              if (!closed) finish(this.pendingExpMessage);
            }, 12000);
            frame.contentWindow?.postMessage({type:'exp-reward',party:updated},location.origin);
          } else finish();
        }
      };
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      try {
        enemy = await createPokemon(Number(monster?.pokemonId || 19), Number(monster?.level || 3));
        rewards = await prepareBattleRewards(enemy, gameContext.party);
        typeData = await prepareTypes(gameContext.party,enemy);
        rewards.evYield=(await growthMasterRows("pokemon_ev_yields",{pokemon_id:enemy.pokemonId}))[0];
        const values = ["hp","attack","defense","special_attack","special_defense","speed"].map(k=>rewards.evYield?.[k]);
        if(values.some(v=>!Number.isInteger(v)||v<0||v>3)||values.reduce((a,b)=>a+b,0)<1||values.reduce((a,b)=>a+b,0)>3) throw new Error("努力値マスターが不足または不正です");
        if(closed) return;
        for (const p of gameContext.party) Object.assign(p, experienceProgress(p,rewards.curves.get(p.growthRate)));
        window.addEventListener('message',onMessage);
        frame.src='./battle/index.html?embedded=1';
        frame.addEventListener('load',()=>frame.contentWindow?.focus());
        overlay.replaceChildren(frame);
        timer=setTimeout(()=>finish('バトル画面を 読み込めませんでした。'),15000);
      } catch(error) { console.error('[Encounter] バトル開始失敗', error); if(!closed) finish('バトルの じゅんびに しっぱいしました。\n'+error.message); }
    }

  }

Object.assign(GameScene.prototype, MapManager, LayerManager, PlayerController, EventManager, CollisionManager);

export { GameScene };
