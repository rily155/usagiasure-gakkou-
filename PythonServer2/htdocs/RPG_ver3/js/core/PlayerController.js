// Shared Phaser GameScene behaviors, extracted without changing their logic.
export const PlayerController = {
createPlayer() {
      this.player = this.playerConfig ? this.add.sprite(0,0,"editor_player") : this.add.image(0,0,"editor_player");
      this.player.setDepth(1000);
      if(this.playerConfig){
        this.player.setOrigin(Number(this.playerConfig.anchorX??0.5),Number(this.playerConfig.anchorY??1));
        this.player.setScale(Number(this.playerConfig.scale)||1);
        this.setPlayerFrame("down",true);
      } else {this.player.setDisplaySize(16,24);}

    },

setFacing(direction) {
      const vectors = { up: {x:0,y:-1}, down: {x:0,y:1}, left: {x:-1,y:0}, right: {x:1,y:0} };
      if (vectors[direction]) this.facing = vectors[direction];
      this.setPlayerFrame(this.facing.x < 0 ? "left" : this.facing.x > 0 ? "right" : this.facing.y < 0 ? "up" : "down", true);
    },

setPlayerTilePosition(x, y) {
      this.playerX = x;
      this.playerY = y;

      const point = this.tileToWorld(x, y);
      this.player.setPosition(point.x, point.y);
      this.refreshCharacterDepths();
    },

setPlayerFrame(direction,idle){
      if(!this.playerConfig||!this.player?.setFrame)return;
      const c=this.playerConfig;
      const row=Number(c.directionRows?.[direction]??({up:0,right:1,down:2,left:3})[direction]);
      const columns=Number(c.columns)||3;
      const frame=idle?Number(c.idleFrame??0):(Math.floor(this.time.now/(1000/(Number(c.frameRate)||6)))%columns);
      const index=row*columns+Math.min(columns-1,frame);
      if(this.textures.get("editor_player").has(index))this.player.setFrame(index);
    },

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
    },

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
    },

    // ==========================================
    // 背景画像
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
        if (nextX < 0 || nextY < 0 || nextX >= this.map.WIDTH || nextY >= this.map.HEIGHT) {
          this.checkLeaveMapEvent(dx, dy);
        }
        return;
      }

      this.movePlayer(nextX, nextY);
    },

movePlayer(nextX, nextY) {
      this.moving = true;
      const direction=this.facing.x<0?"left":this.facing.x>0?"right":this.facing.y<0?"up":"down";
      this.setPlayerFrame(direction,false);

      const point = this.tileToWorld(nextX, nextY);
      const targetX = point.x, targetY = point.y;
      const speed = Number(this.playerConfig?.speed);
      const duration = speed > 0 && Number.isFinite(speed)
        ? Math.hypot(targetX - this.player.x, targetY - this.player.y) / speed * 1000 : 220;

      this.tweens.add({
        targets: this.player,

        x: targetX,
        y: targetY,

        duration,
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
};
