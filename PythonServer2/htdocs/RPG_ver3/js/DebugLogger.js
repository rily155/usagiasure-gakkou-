(function () {
  "use strict";
  const entries = [];
  const panel = document.getElementById("debug-log");
  const status = document.getElementById("debug-status");
  let lastWarning = "";
  function write(level, message, details) {
    const time = new Date().toLocaleTimeString("ja-JP", {hour12:false});
    const line = `[${time}] [${level}] ${message}`;
    const entry = details === undefined ? line : `${line} ${safe(details)}`;
    entries.push(entry);
    if (entries.length > 500) entries.shift();
    if (panel) { panel.textContent = entries.join("\n"); panel.scrollTop = panel.scrollHeight; }
    if (level === "ERROR" || level === "WARN") {
      if (status) status.textContent = line;
    }
    const method = level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log";
    console[method](line, ...(details === undefined ? [] : [details]));
  }
  function safe(value) { try { return JSON.stringify(value); } catch (_) { return String(value); } }
  window.RPGDebug = {
    info: (m,d) => write("INFO",m,d),
    warn: (m,d) => write("WARN",m,d),
    error: (m,d) => write("ERROR",m,d),
    dump: () => entries.join("\n")
  };
  window.addEventListener("error", e => write("ERROR", "JavaScriptエラー", {message:e.message, file:e.filename, line:e.lineno, column:e.colno, stack:e.error?.stack}));
  window.addEventListener("unhandledrejection", e => write("ERROR", "未処理Promiseエラー", {reason:String(e.reason), stack:e.reason?.stack}));
  document.getElementById("debug-copy")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(entries.join("\n")); }
    catch (_) { const t=document.createElement("textarea"); t.value=entries.join("\n"); document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
  });
  document.getElementById("debug-clear")?.addEventListener("click", () => {entries.length=0; if(panel)panel.textContent=""; if(status)status.textContent="ログをクリアしました";});
  window.setInterval(() => {
    const game=window.RPGDebugGame;
    if (!game || !game.scene) return;
    const active=game.scene.getScenes(true);
    const all=game.scene.getScenes(false);
    if (!active.length) {
      const signature="no-active-scene";
      if (lastWarning !== signature) write("WARN", "実行中のSceneがありません", {registered:all.map(s=>s.sys.settings.key)});
      lastWarning=signature; return;
    }
    // ES ModulesではGameSceneがwindowに公開されないため、Sceneキーで判定する。
    // instanceof の右辺が undefined になると監視処理が毎回例外を投げる。
    const scene=active.find(s=>/^RPGScene_\d+$/.test(s?.sys?.settings?.key || ""))
      || active.find(s=>s?.currentMapId && s?.sceneId)
      || active[0];
    const state={scene:scene.sys.settings.key, sceneId:scene.sceneId, mapId:scene.currentMapId, x:scene.playerX,y:scene.playerY, moving:scene.moving,transitioning:scene.transitioning, mode:scene.mode, hasPlayer:!!scene.player, hasKeys:!!scene.keys};
    const signature=state.transitioning ? `transitioning:${state.scene}:${state.mapId}` : !state.hasKeys || !state.hasPlayer ? `not-ready:${state.scene}` : "";
    if (signature && signature !== lastWarning) write("WARN", "Scene状態を確認してください", state);
    lastWarning=signature;
  }, 2000);
  write("INFO", "デバッグロガーを起動しました");
})();
