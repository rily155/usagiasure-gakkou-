/* Battle party selection reuses the field party UI. */
window.BattleParty = (() => {
  const overlay = document.getElementById('partyOverlay');
  const frame = document.getElementById('partyFrame');
  let opened = false;
  function isOpen() { return opened; }
  function close() {
    if (!opened) return;
    opened = false;
    overlay.hidden = true;
    frame.removeAttribute('src');
    if (hero.current > 0) command();
    else { message('つぎの ポケモンを えらんで！'); open(); }
  }
  function open() {
    if (opened || !party?.length || busy) return;
    opened = true;
    overlay.hidden = false;
    frame.src = '../pokemon_menu/index.html?mode=battle';
    frame.focus();
  }
  window.addEventListener('message', event => {
    if (!opened || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const data = event.data || {};
    if (data.type === 'pokemon-party-ready') {
      frame.contentWindow.postMessage({
        type: 'pokemon-party-data',
        party: party.map((p, i) => ({
          instanceId: p.instanceId,
          pokemonId: p.id,
          name: p.name,
          level: p.level,
          hp: p.current,
          maxHp: p.hp,
          battleActive: i === active
        }))
      }, location.origin);
    } else if (data.type === 'pokemon-party-close') {
      close();
    } else if (data.type === 'pokemon-party-select') {
      const index = Number(data.index);
      if (!Number.isInteger(index) || index < 0 || index >= party.length) return;
      if (index === active || party[index].current <= 0) return;
      opened = false;
      overlay.hidden = true;
      frame.removeAttribute('src');
      switchTo(index);
    }
  });
  return { open, close, isOpen };
})();
