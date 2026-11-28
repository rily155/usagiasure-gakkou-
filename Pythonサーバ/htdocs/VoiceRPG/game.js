
(() => {
  "use strict";

  // ==========================================
  // 設定
  // ==========================================

  const TILE = 32;
  const VIEW_WIDTH = 640;
  const VIEW_HEIGHT = 448;
  const PLAYER_PATH = "assets/player/walk.png";
  const MAP_JSON_PATH = "RPGMapProject.json";

  const DIRECTIONS = {
    down:  [0, 1],
    left:  [-1, 0],
    right: [1, 0],
    up:    [0, -1]
  };

  // 3列×4行の画像を想定
  const ANIM_ROWS = {
    up: 0,
    right: 1,
    down: 2,
    left: 3
  };

  const FALLBACK_MAP = [
    "####################",
    "#..................#",
    "#...TT.............#",
    "#...TT......TT.....#",
    "#...........TT.....#",
    "#..................#",
    "#......####........#",
    "#......#..#........#",
    "#......####........#",
    "#..................#",
    "#..TT..............#",
    "#..TT..............#",
    "#..................#",
    "####################"
  ];

  const $ = id => document.getElementById(id);

  let sceneRef = null;
  let project = null;

  // ==========================================
  // マップデータ
  // ==========================================

  function getMap(id) {
    return project?.maps?.[id] || null;
  }

  function getMapIds() {
    return Object.keys(project?.maps || {});
  }

  function getMapCells(map) {
    if (!map) return FALLBACK_MAP.map(r => r.split(""));

    if (Array.isArray(map.cells) && map.cells.length) {
      return map.cells.map(row =>
        Array.isArray(row) ? row : String(row).split("")
      );
    }

    if (Array.isArray(map.tiles)) {
      const result = [];
      for (let y = 0; y < map.height; y++) {
        result.push(
          map.tiles.slice(
            y * map.width,
            (y + 1) * map.width
          )
        );
      }
      return result;
    }

    return FALLBACK_MAP.map(r => r.split(""));
  }

  function findWalkable(cells, preferredX, preferredY) {
    const height = cells.length;
    const width = Math.max(...cells.map(r => r.length));

    const isOpen = (x, y) =>
      y >= 0 && y < height &&
      x >= 0 && x < (cells[y]?.length || 0) &&
      cells[y][x] === ".";

    if (isOpen(preferredX, preferredY)) {
      return { x: preferredX, y: preferredY };
    }

    let best = null;
    let distance = Infinity;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isOpen(x, y)) continue;

        const d =
          Math.abs(x - preferredX) +
          Math.abs(y - preferredY);

        if (d < distance) {
          distance = d;
          best = { x, y };
        }
      }
    }

    return best || { x: 0, y: 0 };
  }

  // ==========================================
  // RPG Scene
  // ==========================================

  class RPGScene extends Phaser.Scene {
    constructor() {
      super("RPGScene");
    }

    init() {
      this.player = { x: 3, y: 5, dir: "down" };
      this.npc = { x: 10, y: 5 };
      this.chest = { x: 15, y: 10, opened: false };
      this.busy = false;
      this.dialog = null;
      this.dialogTimer = null;
      this.moveQueue = [];
      this.currentMapId = null;
      this.mapCells = FALLBACK_MAP.map(r => r.split(""));
      this.mapWidth = 20;
      this.mapHeight = 14;
      this.mapObjects = [];
      this.spriteReady = false;
      this.mapLayerImages = [];
      this.transitioning = false;
    }

    preload() {
      this.load.image("player-original", PLAYER_PATH);

      this.load.on("loaderror", file => {
        console.error("画像読み込み失敗:", file.src);
      });
    }

    create() {
      sceneRef = this;

      this.cameras.main.setBackgroundColor("#69b85b");

      this.preparePlayerTexture();
      this.createAnimations();

      this.mapContainer = this.add.container(0, 0);
      this.mapContainer.setDepth(0);

      this.objectContainer = this.add.container(0, 0);
      this.objectContainer.setDepth(5);

      this.drawPlayer();

      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys(
        "W,A,S,D,SPACE,ENTER,ESC"
      );

      this.input.keyboard.on("keydown", event => {
        if (
          event.code.startsWith("Arrow") ||
          event.code === "Space"
        ) {
          event.preventDefault();
        }
      });

      this.input.keyboard.on("keydown-SPACE", () => {
        this.interact();
      });

      this.input.keyboard.on("keydown-ENTER", () => {
        this.closeDialog();
      });

      this.input.keyboard.on("keydown-ESC", () => {
        this.closeDialog();
      });

      this.time.addEvent({
        delay: 145,
        loop: true,
        callback: () => this.updateMovement()
      });

      this.cameras.main.setViewport(
        0, 0, VIEW_WIDTH, VIEW_HEIGHT
      );

      this.cameras.main.startFollow(
        this.playerSprite,
        true,
        0.15,
        0.15
      );

      const initialId =
        project?.currentMapId &&
        getMap(project.currentMapId)
          ? project.currentMapId
          : getMapIds()[0];

      this.loadMap(initialId || null);

      this.showMessage(
        "ようこそ！ 音声またはキーボードで移動できます。",
        2500
      );
    }

    // ========================================
    // プレイヤー画像の生成
    // ========================================

    preparePlayerTexture() {
      const original =
        this.textures.get("player-original");

      if (
        !original ||
        original.key === "__MISSING"
      ) {
        console.warn("プレイヤー画像がありません");
        this.createFallbackPlayer();
        return;
      }

      const source = original.getSourceImage();

      const cols = 3;
      const rows = 4;

      const frameW = Math.floor(source.width / cols);
      const frameH = Math.floor(source.height / rows);

      if (frameW < 1 || frameH < 1) {
        this.createFallbackPlayer();
        return;
      }

      // 余剰ピクセルは右端・下端で切り捨て
      const canvas = document.createElement("canvas");
      canvas.width = frameW * cols;
      canvas.height = frameH * rows;

      const ctx = canvas.getContext("2d", {
        willReadFrequently: true
      });

      ctx.drawImage(source, 0, 0);

      const imageData = ctx.getImageData(
        0, 0, canvas.width, canvas.height
      );

      const data = imageData.data;

      // 明るい緑色の背景を簡易透過
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (
          g > 170 &&
          r < 130 &&
          b < 130 &&
          g > r * 1.5 &&
          g > b * 1.5
        ) {
          data[i + 3] = 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      this.textures.addSpriteSheet(
        "player",
        canvas,
        {
          frameWidth: frameW,
          frameHeight: frameH,
          endFrame: 11
        }
      );

      const texture = this.textures.get("player");
      const frames = texture.getFrameNames()
        .filter(name => name !== "__BASE");

      console.log("元画像:", source.width, source.height);
      console.log("フレーム:", frameW, frameH);
      console.log("利用可能なフレーム:", frames);

      this.spriteReady = frames.length === 12;

      if (!this.spriteReady) {
        console.warn(
          "12フレーム生成できませんでした",
          frames
        );
      }
    }

    createFallbackPlayer() {
      const g = this.make.graphics({
        x: 0,
        y: 0
      });

      g.fillStyle(0x3276d3);
      g.fillRect(6, 12, 20, 18);
      g.fillStyle(0xffd4a3);
      g.fillCircle(16, 10, 9);
      g.fillStyle(0x493021);
      g.fillRect(6, 1, 20, 6);
      g.generateTexture("player-fallback", 32, 32);
      g.destroy();

      this.spriteReady = false;
    }

    createAnimations() {
      if (!this.spriteReady) return;

      const texture = this.textures.get("player");

      for (const [dir, row] of
        Object.entries(ANIM_ROWS)) {

        const frames = [
          row * 3,
          row * 3 + 1,
          row * 3 + 2
        ].filter(frame => texture.has(String(frame)));

        if (!frames.length) continue;

        this.anims.create({
          key: "walk-" + dir,
          frames: frames.map(frame => ({
            key: "player",
            frame
          })),
          frameRate: 8,
          repeat: -1
        });
      }
    }

    drawPlayer() {
      const key = this.spriteReady
        ? "player"
        : "player-fallback";

      this.playerSprite = this.add.sprite(
        0, 0, key,
        this.spriteReady ? 1 : 0
      );

      this.playerSprite.setDepth(20);
      this.playerSprite.setOrigin(0.5, 0.75);
      this.playerSprite.setDisplaySize(36, 36);
    }

    setIdleFrame(dir) {
      if (!this.playerSprite) return;

      this.playerSprite.anims.stop();

      if (this.spriteReady) {
        const row = ANIM_ROWS[dir] ?? 0;
        const frame = row * 3 + 1;

        if (
          this.textures.get("player").has(String(frame))
        ) {
          this.playerSprite.setFrame(frame);
        }
      }
    }

    // ========================================
    // マップ読み込み
    // ========================================

    loadMap(mapId, spawn = null) {
      this.closeDialog();
      this.moveQueue = [];
      this.busy = false;

      this.tweens.killTweensOf(this.playerSprite);

      this.mapContainer.removeAll(true);
      this.objectContainer.removeAll(true);

      this.currentMapId = mapId;

      const map = getMap(mapId);

      this.mapCells = getMapCells(map);
      this.mapHeight = this.mapCells.length;
      this.mapWidth = Math.max(
        ...this.mapCells.map(r => r.length)
      );

      this.mapData = map;

      const preferredX = spawn?.x ?? 3;
      const preferredY = spawn?.y ?? 5;

      const start = findWalkable(
        this.mapCells,
        preferredX,
        preferredY
      );

      this.player.x = start.x;
      this.player.y = start.y;
      this.player.dir = spawn?.dir || "down";

      this.drawMap();
      this.drawObjects();

      this.playerSprite.setPosition(
        this.player.x * TILE + TILE / 2,
        this.player.y * TILE + TILE / 2
      );

      this.setIdleFrame(this.player.dir);

      this.cameras.main.setBounds(
        0, 0,
        this.mapWidth * TILE,
        this.mapHeight * TILE
      );

      $("mapStatus").textContent =
        "現在のマップ：" +
        (map?.name || "サンプルマップ");

      if (mapId && $("mapSelect").value !== mapId) {
        $("mapSelect").value = mapId;
      }

      this.loadMapLayers(map);
    }

    drawMap() {
      const g = this.add.graphics();
      this.mapContainer.add(g);

      for (let y = 0; y < this.mapHeight; y++) {
        for (let x = 0; x < this.mapWidth; x++) {
          const cell = this.mapCells[y]?.[x] || "#";
          const px = x * TILE;
          const py = y * TILE;

          g.fillStyle(
            (x + y) % 2 === 0
              ? 0x80c86a
              : 0x78c362
          );
          g.fillRect(px, py, TILE, TILE);

          if (cell === "#") {
            g.fillStyle(0x6d7887);
            g.fillRect(px, py, TILE, TILE);
            g.fillStyle(0x8995a5);
            g.fillRect(px + 2, py + 2, 28, 6);
          } else if (cell === "T") {
            g.fillStyle(0x79513b);
            g.fillRect(px + 12, py + 15, 8, 15);
            g.fillStyle(0x245b37);
            g.fillCircle(px + 16, py + 13, 13);
            g.fillStyle(0x368a49);
            g.fillCircle(px + 13, py + 10, 9);
          }
        }
      }
    }

    // JSONに指定されたマップ画像を重ねる
    loadMapLayers(map) {
      if (!map) return;

      const layers = [];

      if (map.imagePath) {
        layers.push({
          imagePath: map.imagePath,
          x: 0,
          y: 0,
          opacity: 1,
          band: "background",
          imageWidth: map.imageWidth,
          imageHeight: map.imageHeight
        });
      }

      if (Array.isArray(map.layers)) {
        layers.push(...map.layers.filter(
          layer => layer.visible !== false
        ));
      }

      const mapId = this.currentMapId;

      layers.forEach((layer, index) => {
        if (!layer.imagePath) return;

        const key = "map-layer-" +
          mapId + "-" + index;

        const drawLayer = () => {
          if (this.currentMapId !== mapId) return;
          if (!this.textures.exists(key)) return;

          const img = this.add.image(
            (layer.x || 0) * (TILE / 16),
            (layer.y || 0) * (TILE / 16),
            key
          );

          img.setOrigin(0);
          img.setAlpha(layer.opacity ?? 1);

          // JSONの画像座標は16px基準
          img.setScale(TILE / 16);

          // 現段階では背景・中景の簡易表示
          if (layer.band === "foreground") {
            img.setDepth(25);
          } else {
            img.setDepth(1);
          }

          this.mapContainer.add(img);
        };

        if (this.textures.exists(key)) {
          drawLayer();
          return;
        }

        this.load.image(key, layer.imagePath);
        this.load.once(
          "filecomplete-image-" + key,
          drawLayer
        );

        this.load.start();
      });
    }

    // ========================================
    // NPC・宝箱
    // ========================================

    drawObjects() {
      // サンプルマップの場合のみ配置
      if (this.mapData) return;

      const nx = this.npc.x * TILE + 16;
      const ny = this.npc.y * TILE + 16;

      this.objectContainer.add(
        this.add.rectangle(
          nx, ny + 6, 20, 17, 0x9b4bd2
        )
      );

      this.objectContainer.add(
        this.add.circle(
          nx, ny - 6, 9, 0xffd4a3
        )
      );

      const cx = this.chest.x * TILE + 16;
      const cy = this.chest.y * TILE + 16;

      this.chestBody = this.add.rectangle(
        cx, cy, 26, 21, 0x96551f
      );
      this.chestBody.setStrokeStyle(3, 0x53300e);
      this.objectContainer.add(this.chestBody);
    }

    // ========================================
    // 移動
    // ========================================

    updateMovement() {
      if (this.busy || this.dialog || this.transitioning) {
        return;
      }

      if (this.moveQueue.length) {
        this.move(this.moveQueue.shift());
        return;
      }

      let dir = null;

      if (this.cursors.left.isDown || this.keys.A.isDown) {
        dir = "left";
      } else if (
        this.cursors.right.isDown || this.keys.D.isDown
      ) {
        dir = "right";
      } else if (
        this.cursors.up.isDown || this.keys.W.isDown
      ) {
        dir = "up";
      } else if (
        this.cursors.down.isDown || this.keys.S.isDown
      ) {
        dir = "down";
      }

      if (dir) this.move(dir);
    }

    canMove(x, y) {
      if (
        y < 0 || y >= this.mapHeight ||
        x < 0 || x >= this.mapWidth
      ) return false;

      if (this.mapCells[y]?.[x] !== ".") {
        return false;
      }

      if (!this.mapData) {
        if (x === this.npc.x && y === this.npc.y) {
          return false;
        }
        if (x === this.chest.x && y === this.chest.y) {
          return false;
        }
      }

      return true;
    }

    move(dir) {
      const delta = DIRECTIONS[dir];
      if (!delta || this.busy) return;

      this.player.dir = dir;

      const nx = this.player.x + delta[0];
      const ny = this.player.y + delta[1];

      if (!this.canMove(nx, ny)) {
        this.setIdleFrame(dir);
        return;
      }

      this.busy = true;

      const animation = "walk-" + dir;

      if (
        this.spriteReady &&
        this.anims.exists(animation)
      ) {
        this.playerSprite.play(animation, true);
      }

      this.tweens.add({
        targets: this.playerSprite,
        x: nx * TILE + TILE / 2,
        y: ny * TILE + TILE / 2,
        duration: 125,
        onComplete: () => {
          this.player.x = nx;
          this.player.y = ny;
          this.busy = false;
          this.setIdleFrame(dir);
          this.checkTouchEvents();
        }
      });
    }

    voiceMove(dir, steps = 1) {
      this.closeDialog();

      const count = Phaser.Math.Clamp(
        Math.floor(Number(steps) || 1),
        1,
        10
      );

      this.moveQueue = Array(count).fill(dir);
    }

    // ========================================
    // マップイベント
    // ========================================

    checkTouchEvents() {
      const events = this.mapData?.events || [];

      for (const event of events) {
        if (
          event.trigger !== "player_touch" &&
          event.trigger !== "leave_map"
        ) continue;

        const x = event.x ?? -1;
        const y = event.y ?? -1;
        const w = event.width ?? 1;
        const h = event.height ?? 1;

        if (
          this.player.x < x ||
          this.player.x >= x + w ||
          this.player.y < y ||
          this.player.y >= y + h
        ) continue;

        if (
          event.type === "transfer" &&
          getMap(event.targetMapId)
        ) {
          this.transitioning = true;

          const destination = event.targetMapId;
          const spawn = {
            x: event.targetX ?? 3,
            y: event.targetY ?? 5,
            dir: event.direction || "down"
          };

          this.time.delayedCall(180, () => {
            this.loadMap(destination, spawn);
            this.transitioning = false;
          });
          return;
        }

        if (event.text) {
          this.showMessage(event.text);
          return;
        }
      }
    }

    // ========================================
    // 会話・調査
    // ========================================

    interact() {
      if (this.dialog) {
        this.closeDialog();
        return;
      }

      const [dx, dy] = DIRECTIONS[this.player.dir];
      const tx = this.player.x + dx;
      const ty = this.player.y + dy;

      if (this.mapData) {
        const event = (this.mapData.events || []).find(e =>
          e.x === tx &&
          e.y === ty &&
          e.trigger !== "player_touch" &&
          e.trigger !== "leave_map"
        );

        if (event) {
          if (event.text) {
            this.showMessage(event.text);
          } else {
            this.showMessage(
              event.name || "イベントを調べた。"
            );
          }
          return;
        }

        this.showMessage("目の前には何もない。", 1200);
        return;
      }

      if (tx === this.npc.x && ty === this.npc.y) {
        this.showMessage(
          "村人：こんにちは！ 声で操作できるんだね。"
        );
      } else if (
        tx === this.chest.x &&
        ty === this.chest.y
      ) {
        if (!this.chest.opened) {
          this.chest.opened = true;
          this.chestBody.setFillStyle(0x6b4926);
          this.showMessage(
            "宝箱を開けた！ 金貨を10枚手に入れた！"
          );
        } else {
          this.showMessage("宝箱は空っぽだ。");
        }
      } else {
        this.showMessage(
          "目の前には何もない。",
          1200
        );
      }
    }

    // ========================================
    // メッセージ
    // ========================================

    showMessage(message, duration = 0) {
      this.closeDialog();

      const camera = this.cameras.main;

      const box = this.add.container(
        12,
        VIEW_HEIGHT - 94
      );

      box.setScrollFactor(0);
      box.setDepth(1000);

      const bg = this.add.rectangle(
        0, 0,
        VIEW_WIDTH - 24,
        80,
        0x152238,
        0.96
      );
      bg.setOrigin(0);
      bg.setStrokeStyle(2, 0xffffff);

      const text = this.add.text(
        14, 12, String(message), {
          fontFamily: "sans-serif",
          fontSize: "17px",
          color: "#ffffff",
          wordWrap: {
            width: VIEW_WIDTH - 65
          }
        }
      );

      box.add([bg, text]);
      this.dialog = box;

      if (duration > 0) {
        this.dialogTimer = this.time.delayedCall(
          duration,
          () => {
            if (this.dialog === box) {
              this.closeDialog();
            }
          }
        );
      }
    }

    closeDialog() {
      if (this.dialogTimer) {
        this.dialogTimer.remove();
        this.dialogTimer = null;
      }

      if (this.dialog) {
        this.dialog.destroy();
        this.dialog = null;
      }
    }
  }

  // ==========================================
  // プロジェクトJSON読み込み
  // ==========================================

  async function loadProject() {
    try {
      const response = await fetch(MAP_JSON_PATH, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();

      if (!data.maps || typeof data.maps !== "object") {
        throw new Error("mapsがありません");
      }

      project = data;

      $("mapSelect").innerHTML = "";

      for (const [id, map] of Object.entries(data.maps)) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = map.name || id;
        $("mapSelect").appendChild(option);
      }

      $("mapStatus").textContent =
        "マップJSON読み込み成功";

    } catch (error) {
      console.warn("マップJSON:", error.message);
      project = null;
      $("mapSelect").innerHTML =
        '<option value="">サンプルマップ</option>';

      $("mapStatus").textContent =
        "サンプルマップで起動します";
    }
  }

  // ==========================================
  // マイク管理
  // ==========================================

  const micSelect = $("micSelect");
  const micRefresh = $("micRefresh");
  const micTest = $("micTest");
  const micTestStop = $("micTestStop");
  const micLevel = $("micLevel");
  const micDeviceStatus = $("micDeviceStatus");

  let micStream = null;
  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let meterFrame = null;
  let micRequestId = 0;

  async function loadMicrophones() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      micDeviceStatus.textContent =
        "マイク一覧取得に非対応です";
      return;
    }

    try {
      const previous = micSelect.value;
      const devices =
        await navigator.mediaDevices.enumerateDevices();

      const microphones = devices.filter(
        d => d.kind === "audioinput"
      );

      micSelect.innerHTML = "";

      microphones.forEach((device, i) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent =
          device.label || `マイク ${i + 1}`;
        micSelect.appendChild(option);
      });

      if (microphones.some(d => d.deviceId === previous)) {
        micSelect.value = previous;
      }

      micDeviceStatus.textContent =
        microphones.length + "個のマイクを検出";

    } catch (error) {
      micDeviceStatus.textContent =
        "一覧取得エラー：" + error.message;
    }
  }

  async function startMicTest() {
    stopMicTest();

    const requestId = micRequestId;
    const deviceId = micSelect.value;

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(deviceId
              ? { deviceId: { exact: deviceId } }
              : {}),
            echoCancellation: true,
            noiseSuppression: true
          }
        });

      if (requestId !== micRequestId) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      micStream = stream;

      audioContext = new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

      sourceNode =
        audioContext.createMediaStreamSource(stream);

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;

      sourceNode.connect(analyser);
      await audioContext.resume();

      micTest.disabled = true;
      micTestStop.disabled = false;

      micDeviceStatus.textContent =
        "入力テスト中：" +
        micSelect.selectedOptions[0]?.textContent;

      updateMeter();

    } catch (error) {
      micDeviceStatus.textContent =
        "マイク接続エラー：" + error.message;
      stopMicTest();
    }
  }

  function updateMeter() {
    if (!analyser) return;

    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);

    let sum = 0;

    for (const value of buffer) {
      const n = (value - 128) / 128;
      sum += n * n;
    }

    const rms = Math.sqrt(sum / buffer.length);
    const percent = Math.min(100, rms * 500);

    micLevel.style.width = percent + "%";

    meterFrame = requestAnimationFrame(updateMeter);
  }

  function stopMicTest() {
    micRequestId++;

    if (meterFrame !== null) {
      cancelAnimationFrame(meterFrame);
      meterFrame = null;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }

    analyser = null;

    if (audioContext) {
      audioContext.close().catch(console.error);
      audioContext = null;
    }

    micLevel.style.width = "0%";
    micTest.disabled = false;
    micTestStop.disabled = true;
  }

  micRefresh.onclick = async () => {
    // 権限がない場合は取得を試みる
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });
      await loadMicrophones();
      stream.getTracks().forEach(t => t.stop());
    } catch (error) {
      micDeviceStatus.textContent =
        "マイク権限エラー：" + error.message;
    }
  };

  micTest.onclick = startMicTest;
  micTestStop.onclick = stopMicTest;

  micSelect.onchange = () => {
    if (micStream) startMicTest();
  };

  navigator.mediaDevices?.addEventListener(
    "devicechange",
    loadMicrophones
  );

  // ==========================================
  // Web Speech API
  // ==========================================

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  const startButton = $("micStart");
  const stopButton = $("micStop");
  const status = $("status");
  const recognized = $("recognized");
  const lastCommand = $("lastCommand");

  let recognition = null;
  let listening = false;
  let recognitionActive = false;
  let restartTimer = null;
  let restartAllowed = true;

  function normalizeText(text) {
    return text
      .replace(/[。、！？!?\s]/g, "")
      .replace(/[０-９]/g, ch =>
        String(ch.charCodeAt(0) - 0xff10)
      );
  }

  function handleCommand(rawText) {
    if (!sceneRef) return;

    const text = normalizeText(rawText);

    const aliases = [
      { words: ["上", "うえ"], dir: "up" },
      { words: ["下", "した"], dir: "down" },
      { words: ["左", "ひだり"], dir: "left" },
      { words: ["右", "みぎ"], dir: "right" }
    ];

    if (
      text.includes("閉じる") ||
      text.includes("キャンセル")
    ) {
      sceneRef.closeDialog();
      lastCommand.textContent = "閉じる";
      return;
    }

    if (
      text.includes("話す") ||
      text.includes("調べる") ||
      text.includes("決定")
    ) {
      sceneRef.interact();
      lastCommand.textContent = "会話・調査";
      return;
    }

    const direction = aliases.find(item =>
      item.words.some(word => text.includes(word))
    );

    if (direction) {
      const match = text.match(/(\d+)歩/);
      const steps = match ? Number(match[1]) : 1;

      sceneRef.voiceMove(direction.dir, steps);

      lastCommand.textContent =
        direction.dir + " × " + steps;
    }
  }

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();

    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognitionActive = true;
      status.textContent = "🎤 音声認識中";
      startButton.disabled = true;
      stopButton.disabled = false;
    };

    recognition.onaudiostart = () => {
      status.textContent = "🎤 音声入力開始";
    };

    recognition.onspeechstart = () => {
      status.textContent = "🗣 音声を検出しました";
    };

    recognition.onresult = event => {
      let finalText = "";
      let interimText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalText += text;
          handleCommand(text);
        } else {
          interimText += text;
        }
      }

      recognized.textContent =
        (finalText || interimText || "認識中...") +
        (interimText ? "（認識途中）" : "");

      status.textContent = "🎤 音声認識中";
    };

    recognition.onerror = event => {
      status.textContent =
        "音声認識エラー：" + event.error;

      if (
        ["not-allowed", "service-not-allowed",
         "audio-capture", "network"].includes(event.error)
      ) {
        listening = false;
        restartAllowed = false;
      }
    };

    recognition.onend = () => {
      recognitionActive = false;

      if (listening && restartAllowed) {
        status.textContent = "音声認識を再接続中...";

        restartTimer = setTimeout(() => {
          restartTimer = null;

          if (!listening || recognitionActive) return;

          try {
            recognition.start();
          } catch (error) {
            listening = false;
            status.textContent =
              "再接続エラー：" + error.message;
            startButton.disabled = false;
            stopButton.disabled = true;
          }
        }, 700);

      } else {
        startButton.disabled = false;
        stopButton.disabled = true;

        if (!status.textContent.includes("エラー")) {
          status.textContent = "音声認識：停止中";
        }
      }
    };

    startButton.onclick = () => {
      if (recognitionActive || restartTimer) return;

      listening = true;
      restartAllowed = true;

      try {
        recognition.start();
      } catch (error) {
        listening = false;
        status.textContent =
          "開始エラー：" + error.message;
      }
    };

    stopButton.onclick = () => {
      listening = false;
      restartAllowed = false;

      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }

      if (recognitionActive) {
        recognition.stop();
      }

      status.textContent = "音声認識：停止中";
      startButton.disabled = false;
      stopButton.disabled = true;
    };

  } else {
    status.textContent =
      "このブラウザは音声認識に対応していません";
    startButton.disabled = true;
  }

  // ==========================================
  // ゲーム起動
  // ==========================================

  async function main() {
    await loadProject();

    new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: "#69b85b",

      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },

      scene: [RPGScene]
    });

    $("mapSelect").addEventListener("change", event => {
      if (sceneRef) {
        sceneRef.loadMap(event.target.value || null);
      }
    });

    await loadMicrophones();
  }

  main().catch(error => {
    console.error("ゲーム起動エラー:", error);
    $("mapStatus").textContent =
      "ゲーム起動エラー：" + error.message;
  });

})();
