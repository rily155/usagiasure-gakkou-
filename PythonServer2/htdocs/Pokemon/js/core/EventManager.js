import { runFeatureScript } from "../features/index.js";
import { GameAPI } from "../api/GameAPI.js";
import { gameContext } from "./GameContext.js";
import { createPokemon } from "./PokemonFactory.js";

// Shared Phaser GameScene behaviors, extracted without changing their logic.
export const EventManager = {
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
    },

    // ==========================================
    // イベント実行
    // ==========================================

executeEvent(event) {
      if (!event) return false;

      // 特殊イベント：完了済み・前段階未完了・フラグ条件を先に判定する。
      if (event.category === "special") {
        const flags = gameContext.progress?.flags || {};
        if (event.completionFlag && flags[event.completionFlag]) return false;
        const group = String(event.eventGroup || "");
        const order = Number(event.eventOrder) || 1;
        if (group) {
          const previous = Object.values(window.RPGMaps || {}).flatMap(map => map.events || [])
            .filter(other => other.category === "special" && other.eventGroup === group &&
              (Number(other.eventOrder) || 1) < order);
          if (previous.some(other => !other.completionFlag || !flags[other.completionFlag])) return false;
        }
        if (event.conditionType === "flag" && event.conditionFlag) {
          if (Boolean(flags[event.conditionFlag]) !== Boolean(event.conditionValue)) return false;
        }
      }
      if (event.type === "custom_event") {
        if (event.customEventId === "starter_selection") return this.openStarterSelection(event);
        this.showDialog?.(`未対応の専用イベント: ${event.customEventId || "未設定"}`);
        return false;
      }

      if (event.type === "script") {
        const scriptId = event.scriptId;
        try {
          const api = new GameAPI(this, gameContext);
          const result = runFeatureScript(scriptId, api, event);
          // Promiseを返す学習コードの未処理エラーもログへ記録する。
          if (result && typeof result.then === "function") {
            Promise.resolve(result).catch(error => {
              window.RPGDebug?.error("スクリプト実行エラー", { scriptId, message: error.message, stack: error.stack });
              console.error(`[script:${scriptId}]`, error);
            });
          }
          window.RPGDebug?.info("JavaScriptイベント実行", { scriptId, eventId: event.id });
          return true;
        } catch (error) {
          window.RPGDebug?.error("スクリプト実行エラー", { scriptId, message: error.message, stack: error.stack });
          console.error(`[script:${scriptId}]`, error);
          this.showDialog?.(`JavaScriptイベントの実行に失敗しました: ${scriptId || "未設定"}`);
          return false;
        }
      }

      if (event.type === "give_item" || event.type === "give_pokemon") {
        const flag = String(event.flagId || `reward:${this.currentMapId}:${event.id}`);
        gameContext.progress ||= { flags: Object.create(null), defeatedTrainers: [], collectedItems: [] };
        gameContext.progress.flags ||= Object.create(null);
        if (event.once !== false && gameContext.progress.flags[flag]) {
          this.showDialog?.("もう うけとっています。");
          return true;
        }
        const give = async () => {
          if (event.type === "give_item") {
            const itemId = String(event.itemId || "").trim();
            const quantity = Number(event.quantity);
            if (!itemId || !Number.isSafeInteger(quantity) || quantity < 1) {
              this.showDialog?.("アイテムの設定が不正です。"); return;
            }
            gameContext.inventory ||= [];
            const found = gameContext.inventory.find(item => item && String(item.itemId) === itemId);
            if (found) found.quantity = (Number(found.quantity) || 0) + quantity;
            else gameContext.inventory.push({ itemId, quantity });
            gameContext.progress.collectedItems ||= [];
            if (!gameContext.progress.collectedItems.includes(flag)) gameContext.progress.collectedItems.push(flag);
            if (event.once !== false) gameContext.progress.flags[flag] = true;
            this.showDialog?.(event.text || `${itemId}を ${quantity}こ てにいれた！`);
          } else {
            const pokemonId = Number(event.pokemonId), level = Number(event.level);
            if (!Number.isSafeInteger(pokemonId) || pokemonId < 1 || pokemonId > 251 || !Number.isSafeInteger(level) || level < 1 || level > 100) {
              this.showDialog?.("ポケモンの設定が不正です。"); return;
            }
            gameContext.party ||= [];
            if (gameContext.party.length >= 6) {
              this.showDialog?.("てもちが いっぱいです。あずけてから きてください。"); return;
            }
            let pokemon;
            try {
              pokemon = await createPokemon(pokemonId, level);
            } catch (error) {
              console.error('ポケモン生成失敗', error);
              this.showDialog?.(`ポケモンの生成に失敗しました: ${error.message}`);
              return;
            }
            gameContext.party.push(pokemon);
            gameContext.pokedex ||= { seen: [], caught: [] };
            for (const key of ["seen", "caught"]) {
              gameContext.pokedex[key] ||= [];
              if (!gameContext.pokedex[key].includes(pokemonId)) gameContext.pokedex[key].push(pokemonId);
            }
            if (event.once !== false) gameContext.progress.flags[flag] = true;
            this.showDialog?.(event.text || `No.${String(pokemonId).padStart(3, "0")}の ポケモンを てにいれた！`);
          }
        };
        if (event.confirm !== false) {
          this.showChoices("うけとりますか？", ["はい", "いいえ"]).then(index => { if (index === 0) give(); }).catch(error => console.error("取得イベント", error));
        } else give();
        return true;
      }

      if (event.type === "message") {
        this.showDialog(event.text || "……");
        return true;
      }
      if (event.type === "switch") {
        window.RPGSwitches ||= {};
        if (event.switchId) window.RPGSwitches[event.switchId] = true;
        return true;
      }
      if (event.type === "transfer") {
        const destination = event.destination;
        window.RPGDebug?.info("移動イベント発火", {scene:this.sceneId, map:this.currentMapId, eventId:event.id, eventName:event.name, trigger:event.trigger, destination});

        if (!destination || !destination.mapId) {
          this.showDialog("移動先マップが未設定です。RPG Editorで設定してください。");
          console.error(
            "[GameScene] 移動先が設定されていません",
            event
          );
          return false;
        }

        const targetMap = this.getMaps()[destination.mapId];
        if (!targetMap) {
          this.showDialog("移動先マップが見つかりません。");
          return false;
        }
        let x = destination.x, y = destination.y;
        if (event.trigger === "leave_map" && event.destinationMode !== "coordinates") {
          const edge = event.targetEdge || "left";
          const along = (edge === "up" || edge === "down") ? this.playerX : this.playerY;
          const pos = event.preservePosition === false ? 0 : along;
          x = edge === "left" ? 0 : edge === "right" ? targetMap.WIDTH - 1 : Math.min(targetMap.WIDTH - 1, pos);
          y = edge === "up" ? 0 : edge === "down" ? targetMap.HEIGHT - 1 : Math.min(targetMap.HEIGHT - 1, pos);
        }
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          this.showDialog("移動先の座標が未設定です。");
          return false;
        }
        window.RPGDebug?.info("移動先座標確定", {mapId:destination.mapId,x,y, targetScene:this.getMaps()[destination.mapId]?.sceneId});
        return this.changeMap(destination.mapId, x, y,
          { direction: event.direction || destination.direction });
      }

      console.warn(
        "[GameScene] 未対応のイベント種類",
        event.type
      );

      return false;
    },

    /** HTML製の選択画面を開き、受け取り成功時だけ進行フラグを確定する。 */
    openStarterSelection(event) {
      if (this.mode !== "field" || this.starterOverlay) return false;
      const flags = gameContext.progress?.flags || {};
      if (flags.starter_selected || (gameContext.party || []).length > 0) return false;
      const container = document.querySelector("#game-container");
      if (!container) return false;
      const overlay = document.createElement("div");
      overlay.className = "starter-selection-overlay";
      const iframe = document.createElement("iframe");
      iframe.title = "最初のポケモンを選ぶ";
      iframe.src = "./ball_select/index.html";
      iframe.setAttribute("allow", "autoplay");
      overlay.appendChild(iframe);
      container.appendChild(overlay);
      this.starterOverlay = overlay;
      this.mode = "starter_selection";
      const close = () => {
        window.removeEventListener("message", receive);
        overlay.remove();
        this.starterOverlay = null;
        this.mode = "field";
        this.input.keyboard.resetKeys();
      };
      let receiving = false;
      const receive = async (message) => {
        if (message.origin !== window.location.origin || message.source !== iframe.contentWindow) return;
        const data = message.data;
        if (!data || data.type !== "pokemon-starter-selected" || receiving) return;
        const names = {25:"ピカチュウ",133:"イーブイ",155:"ヒノアラシ"};
        const pokemonId = Number(data.pokemonId);
        if (!Object.hasOwn(names, pokemonId)) return;
        if ((gameContext.party || []).length > 0 || gameContext.progress?.flags?.starter_selected) {
          close(); return;
        }
        receiving = true;
        try {
          // マスターを読み込んで個体値・努力値・性格・HP・初期技を生成する。
          const pokemon = await createPokemon(pokemonId, 5);
          if ((gameContext.party || []).length > 0 || gameContext.progress?.flags?.starter_selected) return;
          gameContext.party.push(pokemon);
          gameContext.pokedex ||= {seen:[],caught:[]};
          for (const key of ["seen","caught"]) {
            gameContext.pokedex[key] ||= [];
            if (!gameContext.pokedex[key].includes(pokemonId)) gameContext.pokedex[key].push(pokemonId);
          }
          gameContext.progress ||= {flags:{},defeatedTrainers:[],collectedItems:[]};
          gameContext.progress.flags ||= {};
          gameContext.progress.flags[event.completionFlag || "starter_selected"] = true;
          gameContext.progress.flags.starter_selected = true;
          gameContext.variables ||= {};
          gameContext.variables.starter_pokemon_id = pokemonId;
          close();
          this.drawMap();
          this.showDialog(`${names[pokemonId]}を てにいれた！\nHP ${pokemon.hp}/${pokemon.maxHp}  レポートで セーブしてください。`);
        } catch (error) {
          console.error('最初のポケモン生成失敗', error);
          // 失敗時は取得済みフラグを立てず、画面を維持する。
          this.showDialog?.(`ポケモンの生成に失敗しました: ${error.message}`);
        } finally {
          receiving = false;
        }
      };
      window.addEventListener("message", receive);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
      iframe.addEventListener("load", () => iframe.contentWindow?.focus(), {once:true});
      return true;
    },

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
    },

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
    },

    // ==========================================
    // キー入力
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
    },

    // ==========================================
    // 4方向移動
    // ==========================================

checkLeaveMapEvent(dx, dy) {
      const edge = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
      const along = (edge === "left" || edge === "right") ? this.playerY : this.playerX;
      const event = (this.map.events || []).find(e => {
        if (e.trigger !== "leave_map" || e.edge !== edge) return false;
        if (e.exitMode === "coordinates") {
          return this.playerX >= e.x && this.playerX < e.x + (Number(e.width) || 1)
            && this.playerY >= e.y && this.playerY < e.y + (Number(e.height) || 1);
        }
        return along >= Number(e.start ?? 0) && along <= Number(e.end ?? 0);
      });
      return event ? this.executeEvent(event) : false;
    }

    // ==========================================
    // タイル単位移動
    // ==========================================
};
