(function(){
"use strict";
function build(project){
 if(!project||project.format!=="RPGMapEditor"||!project.maps||typeof project.maps!=="object")throw Error("RPGMapEditor形式のJSONを選択してください。");
 const maps={};
 for(const [id,m] of Object.entries(project.maps)){
  const width=Number(m.width),height=Number(m.height),tiles=m.tiles;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Array.isArray(tiles)||tiles.length!==width*height)throw Error(`マップ ${id} のタイル配列が不正です`);
  const events=(m.events||[]).map(e=>({...e,trigger:e.trigger==="player_touch"?"step":e.trigger==="action_button"?"action":e.trigger,destination:e.destination||(e.targetMapId?{mapId:e.targetMapId,x:Number(e.targetX||0),y:Number(e.targetY||0)}:null)}));
  const tw=Number(m.tileWidth||m.tileSize||16),th=Number(m.tileHeight||m.tileSize||16);
  const isWalkable=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<height&&tiles[y*width+x]!=="#";
  const midX=Math.floor(width/2),midY=Math.floor(height/2);
  let start={x:midX,y:midY};
  if(!isWalkable(start.x,start.y)){
   let best=Infinity;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(isWalkable(x,y)){let dist=Math.abs(x-midX)+Math.abs(y-midY);if(dist<best){best=dist;start={x,y};}}
  }
  if(!isWalkable(start.x,start.y))throw Error(`マップ ${id} に通行可能な開始地点がありません`);
  maps[id]={id,name:m.name||id,WIDTH:width,HEIGHT:height,TILE_SIZE:tw,TILE_HEIGHT:th,gridOffsetX:Number(m.gridOffsetX||0),gridOffsetY:Number(m.gridOffsetY||0),imagePath:m.imagePath, imageData:m.imageData, imageWidth:m.imageWidth,imageHeight:m.imageHeight,layers:Array.isArray(m.layers)?m.layers:[],tiles,npcs:m.npcs||[],events,start,isWalkable,isGrass:(x,y)=>tiles[y*width+x]==="G",getEvent(x,y,trigger){return events.find(e=>e.trigger===trigger&&x>=e.x&&y>=e.y&&x<e.x+(Number(e.width)||1)&&y<e.y+(Number(e.height)||1))||null;}};
 }
 window.RPGMaps=maps;
 window.RPGDefaultMapId=maps[project.currentMapId]?project.currentMapId:Object.keys(maps)[0];
 window.RPGMapData=maps[window.RPGDefaultMapId];
 window.RPGCharacters=project.characters||[];
 window.RPGEditorProject=project;
 return maps;
}
window.loadRPGEditorProject=build;
if(window.RPG_EDITOR_PROJECT)build(window.RPG_EDITOR_PROJECT);
})();
