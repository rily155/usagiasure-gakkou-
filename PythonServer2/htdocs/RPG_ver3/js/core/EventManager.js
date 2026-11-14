import { runFeatureScript } from "../features/index.js";
import { GameAPI } from "../api/GameAPI.js";
import { gameContext } from "./GameContext.js";

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
