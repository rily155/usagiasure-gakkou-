import { loadRPGEditorProject } from "./core/MapData.js";
import { createRPGSceneClasses } from "./core/SceneRegistry.js";
(function () {
  "use strict";

  const startButton = document.getElementById("start-button");
  const startScreen = document.getElementById("start-screen");
  const error = document.getElementById("error");
  let game = null;

  function showError(message) {
    error.hidden = false;
    error.textContent = message;
  }

  if (typeof Phaser === "undefined") {
    showError("lib/phaser.min.js を読み込めませんでした。");
    return;
  }

  if (typeof loadRPGEditorProject !== "function" || typeof createRPGSceneClasses !== "function") {
    showError("ゲームのJavaScriptファイルが不足しています。");
    return;
  }

  async function loadProjectFromServer() {
    const response = await fetch("./data/RPGMapProject.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: data/RPGMapProject.json`);
    const project = await response.json();
    loadRPGEditorProject(project);
    window.RPGDebug?.info("プロジェクト読込完了", {version:project.version, scenes:window.RPGScenes?.map(s=>({id:s.id,map:s.currentMapId})), mapCount:Object.keys(window.RPGMaps||{}).length});
    document.getElementById("project-status").textContent = "data/RPGMapProject.json を読み込みました";
  }

  let projectReady = false;
  startButton.disabled = true;
  loadProjectFromServer().then(() => {
    projectReady = true;
    startButton.disabled = false;
  }).catch(e => {
    showError("プロジェクト読込エラー: " + e.message);
    console.error(e);
  });

  const picker=document.getElementById("project-file");
  picker.addEventListener("change",async()=>{
    const file=picker.files?.[0];if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      if (data.version >= 3 && Object.values(data.maps || {}).some(m => m.imagePath)) {
        throw new Error("画像パス形式のJSONは、対応するassetsフォルダと一緒にサーバーへ配置してください。data/RPGMapProject.json を更新してページを再読み込みしてください。");
      }
      loadRPGEditorProject(data);
      projectReady = true;
      startButton.disabled = false;
      document.getElementById("project-status").textContent=`${file.name} を読み込みました`;
      error.hidden=true;
      if(game){game.destroy(true);game=null;startScreen.style.display="";}
    }catch(e){showError("JSON読込エラー: "+e.message);}
  });
  startButton.addEventListener("click", () => {
    if (game || !projectReady) return;
    try {
      window.RPGDebug?.info("ゲーム起動要求", {sceneKeys:window.RPGScenes?.map(s=>s.id)});
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: "gameCanvas",
        width: 320,
        height: 288,
        backgroundColor: "#91bd66",
        pixelArt: true,
        roundPixels: true,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: createRPGSceneClasses()
      });
      window.RPGDebugGame = game;
      game.events.once(Phaser.Core.Events.READY, () => {
        const registered = Object.keys(game.scene.keys);
        const expected = window.RPGSceneKeys || {};
        const missing = Object.entries(expected).filter(([, key]) => !registered.includes(key));
        window.RPGDebug?.info("Phaser Scene登録結果", { registered, expected });
        if (missing.length) window.RPGDebug?.error("Scene登録不足", { missing });
      });
      game.events.on(Phaser.Core.Events.STEP, () => { if (!game.__rpgFirstStepLogged) {game.__rpgFirstStepLogged=true; window.RPGDebug?.info("Phaser初回STEP完了");} });
      startScreen.style.display = "none";
    } catch (e) {
      game = null;
      showError("起動エラー: " + e.message);
      console.error(e);
    }
  });
})();