const BattleBag = (()=>{
  let opened=false, spent=[],managed=false;
  const overlay=document.getElementById('bagOverlay'), frame=document.getElementById('bagFrame');
  function close(){opened=false;overlay.hidden=true;frame.src='about:blank';command()}
  async function use(data){
    const id=String(data.identifier||'');const inventory=embedded?(initial?.inventory||[]):[];
    const owned=inventory.filter(x=>String(x.itemId)===id).reduce((n,x)=>n+Number(x.quantity||0),0);
    const already=spent.filter(x=>x===id).length;
    if(embedded && owned<=already){message('アイテムが ありません！');return}
    if(data.category==='key'){message('バトルでは つかえません！');return}
    if(data.category==='heal'){
      const amount=Number(data.heal)||0;
      if(amount<=0){message('このどうぐは まだ使えません！');return}
      if(hero.current<=0||hero.current>=hero.hp){message('いまは つかえません！');return}
      spent.push(id);managed=true;opened=false;overlay.hidden=true;frame.src='about:blank';
      let t=epoch;hide();hero.current=Math.min(hero.hp,hero.current+amount);refresh();
      if(await pause(`${hero.name}の HPが かいふくした！`,t))await counter(t);
      return;
    }
    if(data.category==='ball'){
      if(initial?.battleType === 'trainer'){close();message('トレーナーの ポケモンは つかまえられない！');return;}
      opened=false;overlay.hidden=true;frame.src='about:blank';
      // 既存の捕獲処理を使用。バッグ側の消費はbagSpentで親に報告する。
      items.ball=Math.max(1,Number(items.ball)||0);const before=items.ball;await capture();if(items.ball<before){spent.push(id);managed=true;}return;
    }
  }
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow||e.origin!==location.origin)return;
    if(e.data?.type==='bag-ready')frame.contentWindow.postMessage({type:'bag-data',inventory:embedded?(initial?.inventory||[]):[{itemId:'poke-ball',quantity:5},{itemId:'potion',quantity:2}],party},location.origin);
    if(e.data?.type==='bag-close')close();
    if(e.data?.type==='bag-use')void use(e.data);
  });
  return {open(){if(opened)return;opened=true;overlay.hidden=false;frame.src='../bag/index.html?mode=battle';frame.onload=()=>frame.contentWindow?.focus()},isOpen(){return opened},get spent(){return spent},get managed(){return managed},reset(){spent=[];managed=false;opened=false;overlay.hidden=true}};
})();
