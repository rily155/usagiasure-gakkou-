/* Phaser 3.90: 元のステージ座標・素材・ルールを引き継ぐ */
const ASSET_BASE_URL = new URL('../', document.currentScript.src).href;
const WORLD_WIDTH = 1700;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLATFORMS = [
  {x:0,y:375,w:150,h:75,part:12},
  {x:300,y:300,w:75,h:75,part:17},
  {x:400,y:175,w:100,h:50,part:6},
  {x:550,y:370,w:200,h:50,part:7},
  {x:600,y:150,w:180,h:50,part:19},
  {x:800,y:370,w:150,h:50,part:7},
  {x:960,y:290,w:130,h:50,part:6},
  {x:1110,y:220,w:130,h:50,part:19},
  {x:1260,y:150,w:130,h:50,part:6},
  {x:1420,y:100,w:150,h:50,part:7}
];
const CARROTS = [
  {x:210,y:340,w:30,h:30},{x:320,y:260,w:30,h:30},
  {x:850,y:330,w:30,h:30},{x:1010,y:250,w:30,h:30},
  {x:1170,y:180,w:30,h:30},{x:1470,y:60,w:30,h:30}
];
class GameScene extends Phaser.Scene {
  constructor(){ super({key:'GameScene'}); }
  preload(){
    // ローカル file:/// でも動作するよう、埋め込みData URLを読み込みます。
    this.load.on('loaderror', (file) => {
      console.error('[画像読み込み失敗]', file.key, file.src?.slice(0, 100));
      const el = document.getElementById('asset-error');
      if (el) { el.hidden = false; el.textContent = `画像の読み込みに失敗: ${file.key}`; }
    });
    for (const [key, dataUrl] of Object.entries(GAME_ASSETS)) {
      this.load.image(key, dataUrl);
    }
  }
  create(){
    this.playing=false;
    this.ended=false;
    this.life=5;
    this.maxLife=5;
    this.animTime=0;
    this.idleTime=0;
    this.blinkTime=0;
    this.blinking=false;
    this.nextBlink=Phaser.Math.FloatBetween(5,9);
    this.cameras.main.setBounds(0,0,WORLD_WIDTH,GAME_HEIGHT);
    this.physics.world.setBounds(0,0,WORLD_WIDTH,GAME_HEIGHT+1000);
    for(let x=0;x<WORLD_WIDTH;x+=GAME_WIDTH){
      this.add.image(x,0,'background').setOrigin(0,0).setDisplaySize(GAME_WIDTH,GAME_HEIGHT).setDepth(-10);
      // 奈落画像は元コード同様、プレイヤーより前面に表示
      this.add.image(x,GAME_HEIGHT-200,'pit').setOrigin(0,0).setDisplaySize(GAME_WIDTH,200).setDepth(20);
    }
    this.platforms=this.physics.add.staticGroup();
    for(const p of PLATFORMS){
      const obj=this.platforms.create(p.x,p.y,'part'+p.part).setOrigin(0,0).setDisplaySize(p.w,p.h).setDepth(1);
      obj.refreshBody();
      // 元ゲームと同様に足場は上面からのみ着地。側面・下面は通過可能
      obj.body.checkCollision.left=false;
      obj.body.checkCollision.right=false;
      obj.body.checkCollision.down=false;
    }
    this.carrots=this.physics.add.staticGroup();
    for(const c of CARROTS){
      const obj=this.carrots.create(c.x,c.y,'carrot').setOrigin(0,0).setDisplaySize(c.w,c.h).setDepth(3);
      obj.refreshBody();
    }
    this.goal=this.physics.add.staticImage(1480,25,'part24').setOrigin(0,0).setDisplaySize(75,75).setDepth(3);
    this.goal.refreshBody();
    this.player=this.physics.add.sprite(80,300,'rabbitIdle1').setOrigin(0,0).setDisplaySize(33,54).setDepth(5);
    this.player.body.setSize(33,54);
    this.player.body.setCollideWorldBounds(false);
    this.player.body.setGravityY(1600);
    this.player.body.setMaxVelocity(260,1000);
    this.physics.add.collider(this.player,this.platforms);
    this.physics.add.overlap(this.player,this.carrots,(_,carrot)=>{
      carrot.disableBody(true,true);
      this.life=Math.min(this.maxLife,this.life+1);
      this.updateLife();
    });
    this.physics.add.overlap(this.player,this.goal,()=>{
      if(!this.playing||this.ended)return;
      this.ended=true;
      this.playing=false;
      this.player.body.enable=false;
      document.getElementById('clear-screen').style.display='flex';
    });
    this.cursors=this.input.keyboard.createCursorKeys();
    this.keys=this.input.keyboard.addKeys('A,D,W');
    this.input.keyboard.addCapture(['SPACE','UP','LEFT','RIGHT']);
    this.cameras.main.startFollow(this.player,false,1,1);
    this.hud=this.add.text(25,23,'',{fontFamily:'sans-serif',fontSize:'16px',fontStyle:'bold',color:'#ffffff',backgroundColor:'#00000099',padding:{x:10,y:10}}).setScrollFactor(0).setDepth(100).setVisible(false);
    this.updateLife();
    this.physics.pause();
    this.player.setVisible(false);
  }
  update(_time,delta){
    if(!this.playing||this.ended)return;
    const dt=Math.min(delta/1000,1/30);
    const left=this.cursors.left.isDown||this.keys.A.isDown;
    const right=this.cursors.right.isDown||this.keys.D.isDown;
    const jump=this.cursors.space.isDown||this.cursors.up.isDown||this.keys.W.isDown;
    this.player.setVelocityX(left&&!right?-260:right&&!left?260:0);
    if(left&&!right)this.player.setFlipX(true);
    if(right&&!left)this.player.setFlipX(false);
    if(jump&&this.player.body.blocked.down){this.player.setVelocityY(-650);this.animTime=0;}
    if(this.player.x<0){this.player.x=0;this.player.setVelocityX(0);}
    if(this.player.x+33>WORLD_WIDTH){this.player.x=WORLD_WIDTH-33;this.player.setVelocityX(0);}
    const grounded=this.player.body.blocked.down;
    if(!grounded){
      const t=Phaser.Math.Clamp(this.player.body.velocity.y/650,-1,1);
      const frames=['rabbitIdle1','rabbitWalk1','rabbitWalk2','rabbitIdle2'];
      const index=Math.round((t+1)*0.5*(frames.length-1));
      this.setRabbitTexture(frames[index]);
      this.animTime+=dt;
    } else if(Math.abs(this.player.body.velocity.x)>1){
      this.blinking=false;this.idleTime=0;this.animTime+=dt;
      this.setRabbitTexture(Math.floor(this.animTime*8)%2===0?'rabbitWalk1':'rabbitWalk2');
    } else {
      this.animTime=0;
      if(!this.blinking){
        this.idleTime+=dt;
        if(this.idleTime>=this.nextBlink){this.blinking=true;this.blinkTime=0;}
      } else {
        this.blinkTime+=dt;
        if(this.blinkTime>=1){this.blinking=false;this.idleTime=0;this.nextBlink=Phaser.Math.FloatBetween(5,9);}
      }
      this.setRabbitTexture(this.blinking?'rabbitIdle2':'rabbitIdle1');
    }
    // すべてのウサギ画像を同じ33x54に統一してあるため、
    // フレーム切替時に表示サイズや物理ボディが変動しない。
    if(this.player.y>GAME_HEIGHT){
      this.life--;
      this.updateLife();
      if(this.life<=0){
        this.ended=true;this.playing=false;this.physics.pause();
        document.getElementById('gameover-screen').style.display='flex';
      }else this.respawn();
    }
  }
  setRabbitTexture(key){
    // 同じ画像へのsetTexture連続呼び出しを避ける
    if (this.player.texture.key !== key) this.player.setTexture(key);
  }
  respawn(){
    this.player.body.reset(80,300);
    this.player.setVelocity(0,0);
    this.setRabbitTexture('rabbitIdle1');
    this.player.setVisible(true);
  }
  updateLife(){
    if(this.hud)this.hud.setText(`ライフ: ${'❤️'.repeat(this.life)}${'🖤'.repeat(this.maxLife-this.life)}`);
  }
  startPlay(){
    this.ended=false;this.playing=true;
    this.life=5;this.updateLife();
    this.animTime=0;this.idleTime=0;this.blinking=false;
    this.nextBlink=Phaser.Math.FloatBetween(5,9);
    this.carrots.getChildren().forEach(c=>c.enableBody(false,c.x,c.y,true,true));
    this.player.body.enable=true;
    this.respawn();
    this.hud.setVisible(true);
    this.physics.resume();
  }
  stopToMenu(){
    this.playing=false;this.ended=false;
    this.physics.pause();
    this.hud.setVisible(false);
    this.player.setVisible(false);
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0,0);
    document.getElementById('clear-screen').style.display='none';
    document.getElementById('gameover-screen').style.display='none';
    document.getElementById('start-ready-screen').style.display='flex';
  }
}
