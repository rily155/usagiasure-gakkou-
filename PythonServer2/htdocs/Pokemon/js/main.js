import { audioManager } from "./core/AudioManager.js";
import { SaveManager } from "./core/SaveManager.js";
import { loadRPGEditorProject } from "./core/MapData.js";
import { createRPGSceneClasses } from "./core/SceneRegistry.js";
(function () {
  "use strict";

  const startButton = document.getElementById("start-button");
  const titleMenu = document.getElementById("title-menu");
  const namePanel = document.getElementById("name-panel");
  const savePanel = document.getElementById("save-panel");
  const saveList = document.getElementById("save-list");
  const nameInput = document.getElementById("player-name");
  const newGameButton = document.getElementById("new-game-button");
  const chooseSaveButton = document.getElementById("choose-save-button");
  let pendingSave = null;
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

  for(const event of ["pointerdown","keydown"]) document.addEventListener(event,()=>audioManager.unlock());
  function titleBGM(){audioManager.changeBGM(window.RPGScenesById?.[window.RPGDefaultSceneId]?.titleBgm);}
  let projectReady = false;
  newGameButton.disabled = true;
  chooseSaveButton.disabled = true;
  loadProjectFromServer().then(() => {
    titleBGM();
    projectReady = true;
    newGameButton.disabled = false;
    chooseSaveButton.disabled = false;
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
      newGameButton.disabled = false;
    chooseSaveButton.disabled = false;
      document.getElementById("project-status").textContent=`${file.name} を読み込みました`;
      error.hidden=true;
      if(game){game.destroy(true);game=null;startScreen.style.display="";}
      titleBGM();
    }catch(e){showError("JSON読込エラー: "+e.message);}
  });
  function showPanel(panel) {
    titleMenu.hidden = panel !== 'title';
    namePanel.hidden = panel !== 'name';
    savePanel.hidden = panel !== 'save';
    error.hidden = true;
  }
  document.querySelectorAll('.back-title').forEach(button => button.addEventListener('click',()=>showPanel('title')));
  newGameButton.addEventListener('click',()=>{showPanel('name');nameInput.focus();});
  namePanel.addEventListener('submit',event=>{
    event.preventDefault();
    const name=nameInput.value.trim();
    if(!name){showError('主人公の名前を入力してください');return;}
    SaveManager.newGame(name);
    pendingSave=null;
    startButton.click();
  });
  async function showSaves() {
    showPanel('save');
    saveList.replaceChildren();
    saveList.textContent='セーブデータを取得中…';
    try {
      const saves=await SaveManager.list();
      saveList.replaceChildren();
      if(!saves.length){saveList.textContent='セーブデータはまだありません。';return;}
      for(const {id,data} of saves) {
        const button=document.createElement('button');
        button.type='button';button.className='save-entry';
        const name=document.createElement('strong');name.textContent=data.playerName||'主人公';
        const detail=document.createElement('small');
        const when=data.savedAt ? new Date(data.savedAt).toLocaleString('ja-JP') : '日時不明';
        detail.textContent=`保存ID: ${id} / ${when} / マップ: ${data.mapId||'不明'} / 所持金: ${data.gold??0} / 手持ち: ${data.party?.length??0}匹 `;
        button.append(name,detail);
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try {
            const save=await SaveManager.load(id);
            if(!window.RPGMaps?.[save.mapId]) throw new Error('セーブ先のマップが存在しません');
            pendingSave=save;
            SaveManager.restoreVariables(save);
            startButton.click();
          }catch(e){pendingSave=null;showError('ロード失敗: '+e.message);button.disabled=false;}
        });
        saveList.append(button);
      }
    }catch(e){saveList.textContent='一覧を取得できませんでした。';showError('セーブ一覧取得エラー: '+e.message);}
  }
  chooseSaveButton.addEventListener('click',showSaves);
  document.getElementById('refresh-saves').addEventListener('click',showSaves);
  startButton.addEventListener("click", () => {
    if (game || !projectReady || (!pendingSave && !nameInput.value.trim())) return;
    try {
      window.RPGDebug?.info("ゲーム起動要求", {sceneKeys:window.RPGScenes?.map(s=>s.id)});
      // Phaserはコンストラクタ内で最初のSceneを起動する場合がある。
      // READY後のscene.startでは遅いため、保存先Sceneを先頭に並べて起動データを渡す。
      const sceneClasses = createRPGSceneClasses();
      const save = pendingSave;
      if (save) {
        const map = window.RPGMaps?.[save.mapId];
        const sceneKey = window.RPGSceneKeys?.[map?.sceneId];
        const targetIndex = (window.RPGScenes || []).findIndex(definition => definition.id === map.sceneId);
        if (targetIndex < 0) throw new Error(`セーブ先Sceneが見つかりません: ${save.mapId}`);
        sceneClasses.unshift(sceneClasses.splice(targetIndex, 1)[0]);
        window.RPGInitialSave = {
          mapId: save.mapId, x: save.x, y: save.y,
          facing: save.facing, fromSave: true
        };
      } else {
        window.RPGInitialSave = null;
      }
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
        scene: sceneClasses
      });
      window.RPGDebugGame = game;
      pendingSave = null;
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
      window.RPGInitialSave = null;
      showError("起動エラー: " + e.message);
      console.error(e);
    }
  });
})();