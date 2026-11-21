/** 登録する機能をここで管理します。順番にsetup()を呼び出します。 */
import * as player from "./player/index.js";
import * as variables from "./variables/index.js";
import * as items from "./items/index.js";
import * as inventory from "./inventory/index.js";
import * as npc from "./npc/index.js";
import * as quests from "./quests/index.js";
import * as battle from "./battle/index.js";

export const features = { player, variables, items, inventory, npc, quests, battle };

export function setupFeatures(game) {
  for (const [name, feature] of Object.entries(features)) {
    if (typeof feature.setup !== "function") continue;
    try {
      feature.setup(game);
    } catch (error) {
      window.RPGDebug?.error(`機能「${name}」の初期化に失敗`, { message: error.message, stack: error.stack });
      console.error(`[features/${name}]`, error);
    }
  }
}

/** エディタの scriptId (例: npc.talkToVillageChief) を公開関数に解決する。 */
export function runFeatureScript(scriptId, game, event) {
  if (typeof scriptId !== "string" || !/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(scriptId)) {
    throw new Error(`不正なscriptIdです: ${String(scriptId)}`);
  }
  const [featureName, functionName] = scriptId.split(".");
  const feature = Object.prototype.hasOwnProperty.call(features, featureName) ? features[featureName] : null;
  if (!feature) throw new Error(`機能フォルダ「${featureName}」が登録されていません`);
  if (functionName === "setup") throw new Error("setupは起動時専用です。イベントから呼び出せません");
  const handler = Object.prototype.hasOwnProperty.call(feature, functionName) ? feature[functionName] : null;
  if (typeof handler !== "function") throw new Error(`関数「${scriptId}」がexportされていません`);
  return handler(game, event);
}
