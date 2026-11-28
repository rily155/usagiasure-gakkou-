// 【職員管理】ゲーム基盤。学習者は learner/ のみ編集します。
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const TILE = 32, WIDTH = 16, HEIGHT = 12;
  const npc = { x: 7, y: 5 };
  const obstacles = new Set();
  for (let x = 1; x <= 4; x++) for (let y = 1; y <= 3; y++) obstacles.add(`${x},${y}`);
  for (let x = 11; x <= 14; x++) for (let y = 1; y <= 3; y++) obstacles.add(`${x},${y}`);
  const sprites = {};
  for (const direction of ['up','right','down','left']) {
    sprites[direction] = [0,1,2].map(frame => {
      const image = new Image();
      image.src = `core/assets/player/${direction}_${frame}.png`;
      image.onload = () => { if (player) draw(); };
      return image;
    });
  }
  let player, dialogOpen = false, busy = false, queue = [], resolveCurrent = null, generation = 0;
  const directions = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
  function tile(x,y,color) { ctx.fillStyle=color;ctx.fillRect(x*TILE,y*TILE,TILE,TILE); }
  function person(x,y,shirt,hair) {
    const px=x*TILE,py=y*TILE;
    ctx.fillStyle='#493c30';ctx.fillRect(px+8,py+23,7,7);ctx.fillRect(px+18,py+23,7,7);
    ctx.fillStyle=shirt;ctx.fillRect(px+7,py+13,19,12);
    ctx.fillStyle='#f2c698';ctx.fillRect(px+9,py+5,15,12);
    ctx.fillStyle=hair;ctx.fillRect(px+8,py+3,17,6);
    ctx.fillStyle='#272727';ctx.fillRect(px+12,py+12,2,2);ctx.fillRect(px+20,py+12,2,2);
  }
  function draw() {
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      tile(x,y,(x+y)%2?'#9ec783':'#a8ce8b');
      if((x*7+y*11)%17===0){ctx.fillStyle='#6eab64';ctx.fillRect(x*TILE+6,y*TILE+7,3,5);}
    }
    for(let x=1;x<=4;x++)for(let y=1;y<=3;y++)tile(x,y,'#c49b70');
    for(let x=11;x<=14;x++)for(let y=1;y<=3;y++)tile(x,y,'#c49b70');
    ctx.fillStyle='#b64d4d';ctx.beginPath();ctx.moveTo(24,32);ctx.lineTo(96,-1);ctx.lineTo(160,32);ctx.fill();
    ctx.beginPath();ctx.moveTo(344,32);ctx.lineTo(416,-1);ctx.lineTo(480,32);ctx.fill();
    ctx.fillStyle='#5b4434';ctx.fillRect(77,87,26,41);ctx.fillRect(393,87,26,41);
    person(npc.x,npc.y,'#a65740','#4e3728');
    const sprite = sprites[player.dir]?.[player.frame ?? 1];
    if (sprite?.complete && sprite.naturalWidth) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, player.x*TILE, player.y*TILE-2, TILE, TILE);
    } else {
      person(player.x,player.y,'#3d76c1','#293a5a');
    }
    ctx.fillStyle='#fff';ctx.font='13px sans-serif';ctx.fillText('村人',npc.x*TILE+1,npc.y*TILE-6);
    $('state').textContent=`位置: (${player.x}, ${player.y})\n向き: ${player.dir}\n会話中: ${dialogOpen?'はい':'いいえ'}`;
  }
  function blocked(x,y){return x<0||y<0||x>=WIDTH||y>=HEIGHT||obstacles.has(`${x},${y}`)||(x===npc.x&&y===npc.y);}
  const game = Object.freeze({
    walk(direction){
      const d=directions[direction];if(!d)throw new Error('方向は up / down / left / right です');
      player.dir=direction;const x=player.x+d[0],y=player.y+d[1];
      if(!blocked(x,y)){player.x=x;player.y=y;player.frame=player.frame===0?2:0;}else{player.frame=1;}draw();
    },
    say(message){
      return new Promise(resolve=>{queue.push({message:String(message),resolve});if(!dialogOpen)showNext();});
    }
  });
  function executeWalk(direction){
    if(dialogOpen||busy)return;
    player.dir=direction;
    try {if(typeof window.learnerWalk!=='function')throw new Error('learner/walk.js に learnerWalk がありません');
      window.learnerWalk(direction,game);draw();$('output').textContent='歩行コードを実行しました。';
    }catch(e){$('output').textContent='歩行エラー: '+e.message;}
  }
  function showNext(){
    if(!queue.length){dialogOpen=false;$('dialog').classList.remove('visible');draw();return;}
    const item=queue.shift();$('dialog').textContent=item.message;
    const small=document.createElement('small');small.textContent='Space / Enter / 話す で次へ';$('dialog').append(small);
    $('dialog').classList.add('visible');dialogOpen=true;resolveCurrent=item.resolve;draw();
  }
  function nextMessage(){if(resolveCurrent){const done=resolveCurrent;resolveCurrent=null;done();}showNext();}
  function closeDialog(){queue.forEach(item=>item.resolve());queue=[];if(resolveCurrent){resolveCurrent();resolveCurrent=null;}
    dialogOpen=false;$('dialog').classList.remove('visible');draw();}
  async function talk(){
    if(dialogOpen){nextMessage();return;}if(busy)return;
    const d=directions[player.dir];if(player.x+d[0]!==npc.x||player.y+d[1]!==npc.y){$('output').textContent='村人の隣で村人の方向を向いてください。';return;}
    busy=true;const id=generation;
    try{if(typeof window.learnerTalk!=='function')throw new Error('learner/talk.js に learnerTalk がありません');
      await window.learnerTalk(game);if(id===generation){busy=false;$('output').textContent='会話コードを実行しました。';}
    }catch(e){if(id===generation){$('output').textContent='会話エラー: '+e.message;busy=false;closeDialog();}}
  }
  function reset(){generation++;player={x:7,y:8,dir:'up',frame:1};busy=false;closeDialog();draw();$('output').textContent='ゲームを初期化しました。';}
  $('restart').addEventListener('click',reset);$('talkButton').addEventListener('click',talk);
  document.querySelectorAll('[data-dir]').forEach(button=>button.addEventListener('click',()=>executeWalk(button.dataset.dir)));
  document.addEventListener('keydown',event=>{
    if(['TEXTAREA','INPUT','SELECT'].includes(event.target.tagName))return;
    const keys={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
    if(keys[event.key]){event.preventDefault();executeWalk(keys[event.key]);}
    else if(event.key===' '||event.key==='Enter'){event.preventDefault();talk();}
    else if(event.key==='Escape'){closeDialog();}
  });
  reset();
})();
