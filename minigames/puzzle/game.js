(() => {
  'use strict';

  const SIZE = 4;
  const TILE_COUNT = SIZE * SIZE;
  const IMAGE_COUNT = 31;
  const BEST_TIME_KEY = 'snikkers_puzzle_slide_best_time_v1';
  const BEST_MOVES_KEY = 'snikkers_puzzle_slide_best_moves_v1';
  const MUSIC_KEY = 'snikkers_puzzle_slide_music_v1';

  const boardEl = document.getElementById('board');
  const boardWrap = document.getElementById('boardWrap');
  const timeEl = document.getElementById('time');
  const movesEl = document.getElementById('moves');
  const bestTimeEl = document.getElementById('bestTime');
  const bestMovesEl = document.getElementById('bestMoves');
  const previewImg = document.getElementById('previewImg');
  const overlay = document.getElementById('startOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const newBtn = document.getElementById('newBtn');
  const musicBtn = document.getElementById('musicBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const finishBanner = document.getElementById('finishBanner');
  const gameCard = document.getElementById('gameCard');
  const themeAudio = document.getElementById('themeAudio');

  let board = [];
  let blank = TILE_COUNT - 1;
  let currentImage = '';
  let lastImageIndex = -1;
  let running = false;
  let paused = false;
  let solved = false;
  let busy = false;
  let moves = 0;
  let elapsed = 0;
  let lastTick = 0;
  let raf = 0;
  let drag = null;
  let musicEnabled = localStorage.getItem(MUSIC_KEY) !== '0';
  let pseudoFullscreen = false;
  let bestTime = Number(localStorage.getItem(BEST_TIME_KEY) || 0) || null;
  let bestMoves = Number(localStorage.getItem(BEST_MOVES_KEY) || 0) || null;
  const tileEls = new Map();

  function formatTime(sec){
    const s = Math.max(0, sec);
    const whole = Math.floor(s);
    const min = Math.floor(whole / 60);
    const rem = whole % 60;
    const tenths = Math.floor((s - whole) * 10);
    return `${min}:${String(rem).padStart(2,'0')}.${tenths}`;
  }

  function updateHud(){
    timeEl.textContent = formatTime(elapsed);
    movesEl.textContent = String(moves);
    bestTimeEl.textContent = bestTime ? formatTime(bestTime) : '–';
    bestMovesEl.textContent = bestMoves ? String(bestMoves) : '–';
  }

  function imagePath(index){
    return `assets/puzzle/snikkers${String(index + 1).padStart(2,'0')}.jpg`;
  }

  function chooseImage(){
    let idx;
    do { idx = Math.floor(Math.random() * IMAGE_COUNT); } while(IMAGE_COUNT > 1 && idx === lastImageIndex);
    lastImageIndex = idx;
    currentImage = imagePath(idx);
    previewImg.src = currentImage;
    boardEl.style.backgroundImage = `url("${currentImage}")`;
  }

  function solvedBoard(){
    board = Array.from({length:TILE_COUNT}, (_,i)=>i);
    blank = TILE_COUNT - 1;
  }

  function posOf(tile){ return board.indexOf(tile); }
  function row(index){ return Math.floor(index / SIZE); }
  function col(index){ return index % SIZE; }
  function adjacent(a,b){ return Math.abs(row(a)-row(b)) + Math.abs(col(a)-col(b)) === 1; }

  function tileTransform(index, dx=0, dy=0){
    const r = row(index), c = col(index);
    return `translate(calc(${c * 100}% + ${dx}px), calc(${r * 100}% + ${dy}px))`;
  }

  function tileBackground(tile){
    const r = row(tile), c = col(tile);
    return {
      size: `${SIZE * 100}% ${SIZE * 100}%`,
      position: `${(c/(SIZE-1))*100}% ${(r/(SIZE-1))*100}%`
    };
  }

  function buildTiles(){
    tileEls.clear();
    boardEl.innerHTML = '';
    boardEl.classList.remove('solved');
    for(let tile=0; tile<TILE_COUNT-1; tile++){
      const el = document.createElement('div');
      el.className = 'tile';
      el.dataset.tile = String(tile);
      el.setAttribute('role','button');
      el.setAttribute('tabindex','0');
      el.setAttribute('aria-label',`Puzzleteil ${tile+1}`);
      const face = document.createElement('div');
      face.className = 'tile-face';
      const bg = tileBackground(tile);
      face.style.backgroundImage = `url("${currentImage}")`;
      face.style.backgroundSize = bg.size;
      face.style.backgroundPosition = bg.position;
      el.appendChild(face);
      boardEl.appendChild(el);
      tileEls.set(tile, el);
      el.addEventListener('pointerdown', e => beginDrag(e, tile));
      el.addEventListener('keydown', e => handleKeyTile(e, tile));
    }
    renderPositions();
  }

  function renderPositions(){
    for(const [tile,el] of tileEls){
      const idx = posOf(tile);
      el.style.transform = tileTransform(idx);
    }
  }

  function validMove(tile){
    const idx = posOf(tile);
    return adjacent(idx, blank);
  }

  function moveTile(tile, countMove=true){
    if(busy || solved || !validMove(tile)) return false;
    const idx = posOf(tile);
    board[blank] = tile;
    board[idx] = TILE_COUNT - 1;
    blank = idx;
    if(countMove) moves++;
    renderPositions();
    updateHud();
    if(countMove) checkSolvedSoon();
    return true;
  }

  function legalTiles(){
    const list = [];
    for(let tile=0; tile<TILE_COUNT-1; tile++) if(validMove(tile)) list.push(tile);
    return list;
  }

  function shuffleBoard(){
    solvedBoard();
    let previousBlank = -1;
    for(let i=0;i<220;i++){
      const candidates = legalTiles().filter(tile => posOf(tile) !== previousBlank);
      const tile = candidates[Math.floor(Math.random()*candidates.length)] ?? legalTiles()[0];
      const oldBlank = blank;
      moveTile(tile,false);
      previousBlank = oldBlank;
    }
    if(isSolved()){
      const list = legalTiles();
      if(list.length) moveTile(list[0],false);
    }
  }

  function isSolved(){
    return board.every((value,index)=>value===index);
  }

  function beginDrag(e,tile){
    if(!running || busy || solved) return;
    if(e.pointerType==='mouse' && e.button!==0) return;
    const el = tileEls.get(tile);
    if(!el) return;
    drag = {
      tile,
      id:e.pointerId,
      startX:e.clientX,
      startY:e.clientY,
      dx:0,
      dy:0,
      valid:validMove(tile),
      index:posOf(tile)
    };
    el.classList.add('dragging');
    try{el.setPointerCapture?.(e.pointerId);}catch{}
    e.preventDefault();
  }

  function updateDrag(e){
    if(!drag || drag.id!==e.pointerId || !running) return;
    const el = tileEls.get(drag.tile);
    if(!el) return;
    const rect = boardEl.getBoundingClientRect();
    const cell = rect.width / SIZE;
    let dx = e.clientX - drag.startX;
    let dy = e.clientY - drag.startY;

    if(drag.valid){
      const br=row(blank), bc=col(blank), tr=row(drag.index), tc=col(drag.index);
      const dirX = bc-tc;
      const dirY = br-tr;
      if(dirX!==0){
        dy=0;
        dx = Math.max(-cell,Math.min(cell,dx));
        if(Math.sign(dx)!==Math.sign(dirX)) dx*=.18;
      }else{
        dx=0;
        dy = Math.max(-cell,Math.min(cell,dy));
        if(Math.sign(dy)!==Math.sign(dirY)) dy*=.18;
      }
    }else{
      if(Math.abs(dx)>Math.abs(dy)){dy=0;dx=Math.max(-cell*.16,Math.min(cell*.16,dx));}
      else{dx=0;dy=Math.max(-cell*.16,Math.min(cell*.16,dy));}
    }
    drag.dx=dx; drag.dy=dy;
    el.style.transform = tileTransform(drag.index,dx,dy);
    e.preventDefault();
  }

  function endDrag(e){
    if(!drag || drag.id!==e.pointerId) return;
    const d=drag;
    drag=null;
    const el=tileEls.get(d.tile);
    if(!el) return;
    el.classList.remove('dragging');
    const rect=boardEl.getBoundingClientRect();
    const threshold=(rect.width/SIZE)*.28;

    if(d.valid && Math.hypot(d.dx,d.dy)>=threshold){
      el.style.transform = tileTransform(d.index,d.dx,d.dy);
      requestAnimationFrame(()=>moveTile(d.tile,true));
    }else{
      el.style.transform = tileTransform(d.index);
      el.classList.add('invalid');
      setTimeout(()=>el.classList.remove('invalid'),230);
    }
    try{el.releasePointerCapture?.(e.pointerId);}catch{}
  }

  function handleKeyTile(e,tile){
    if(!running || busy || solved) return;
    if(['Enter',' '].includes(e.key) && validMove(tile)){
      moveTile(tile,true);
      e.preventDefault();
    }
  }

  function checkSolvedSoon(){
    if(!isSolved()) return;
    busy=true;
    setTimeout(finishGame,230);
  }

  function finishGame(){
    solved=true;
    paused=false;
    running=false;
    cancelAnimationFrame(raf);
    pauseMusic();
    if(!bestTime || elapsed<bestTime){bestTime=elapsed;localStorage.setItem(BEST_TIME_KEY,String(bestTime));}
    if(!bestMoves || moves<bestMoves){bestMoves=moves;localStorage.setItem(BEST_MOVES_KEY,String(bestMoves));}
    updateHud();
    boardEl.style.backgroundImage = `url("${currentImage}")`;
    boardEl.classList.add('solved');
    finishBanner.textContent=`GESCHAFFT! · ${formatTime(elapsed)} · ${moves} Züge`;
    finishBanner.classList.add('show');
    setTimeout(()=>{
      overlayTitle.textContent='GESCHAFFT!';
      overlayText.textContent=`${formatTime(elapsed)} · ${moves} Züge`;
      startBtn.textContent='NEUES PUZZLE';
      overlay.classList.remove('hidden');
      finishBanner.classList.remove('show');
    },1800);
  }

  function tick(now){
    if(!running) return;
    const dt=Math.max(0,Math.min(.05,(now-lastTick)/1000||0));
    lastTick=now;
    elapsed+=dt;
    updateHud();
    raf=requestAnimationFrame(tick);
  }

  function startGame(){
    chooseImage();
    overlayTitle.textContent='Snikkers Puzzle Slide';
    overlayText.textContent='4×4 · Wischen oder mit der Maus ziehen';
    startBtn.textContent='SPIEL STARTEN';
    solved=false;
    paused=false;
    busy=false;
    solvedBoard();
    buildTiles();
    shuffleBoard();
    renderPositions();
    boardEl.style.backgroundImage = 'none';
    moves=0;
    elapsed=0;
    running=true;
    finishBanner.classList.remove('show');
    overlay.classList.add('hidden');
    updateHud();
    lastTick=performance.now();
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(tick);
    playMusic();
  }

  function resetPreviewState(){
    chooseImage();
    solvedBoard();
    moves=0;elapsed=0;solved=false;paused=false;busy=false;running=false;
    buildTiles();
    boardEl.style.backgroundImage = `url("${currentImage}")`;
    boardEl.classList.add('solved');
    updateHud();
  }

  function updateMusicButton(){
    musicBtn.textContent=musicEnabled?'♫ AN':'♫ AUS';
    musicBtn.setAttribute('aria-pressed',String(musicEnabled));
  }
  async function playMusic(){
    if(!musicEnabled || !running || document.hidden) return;
    themeAudio.volume=.20;
    try{await themeAudio.play();}catch{}
  }
  function pauseMusic(){themeAudio.pause();}

  musicBtn.addEventListener('click',()=>{
    musicEnabled=!musicEnabled;
    localStorage.setItem(MUSIC_KEY,musicEnabled?'1':'0');
    updateMusicButton();
    if(musicEnabled) playMusic(); else pauseMusic();
  });

  startBtn.addEventListener('click',()=>{
    if(paused){
      paused=false;
      overlay.classList.add('hidden');
      running=true;
      lastTick=performance.now();
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(tick);
      playMusic();
      return;
    }
    startGame();
  });
  newBtn.addEventListener('click',()=>{
    running=false;paused=false;cancelAnimationFrame(raf);pauseMusic();
    overlayTitle.textContent='Neues Puzzle?';
    overlayText.textContent='Ein neues Motiv wird zufällig gewählt und lösbar gemischt.';
    startBtn.textContent='NEUES PUZZLE STARTEN';
    overlay.classList.remove('hidden');
  });

  boardEl.addEventListener('pointermove',updateDrag);
  boardEl.addEventListener('pointerup',endDrag);
  boardEl.addEventListener('pointercancel',e=>{
    if(drag && drag.id===e.pointerId){
      const el=tileEls.get(drag.tile);
      if(el){el.classList.remove('dragging');el.style.transform=tileTransform(drag.index);}
      drag=null;
    }
  });

  async function requestNativeFullscreen(){
    try{
      const fn=gameCard.requestFullscreen||gameCard.webkitRequestFullscreen;
      if(fn) await fn.call(gameCard);
      if(screen.orientation?.lock){try{await screen.orientation.lock('landscape');}catch{}}
    }catch{}
  }
  async function leaveNativeFullscreen(){
    try{
      if(document.fullscreenElement||document.webkitFullscreenElement){
        const fn=document.exitFullscreen||document.webkitExitFullscreen;
        if(fn) await fn.call(document);
      }
      if(screen.orientation?.unlock){try{screen.orientation.unlock();}catch{}}
    }catch{}
  }
  function updateFullscreenButton(){
    const active=pseudoFullscreen||document.fullscreenElement===gameCard||document.webkitFullscreenElement===gameCard;
    fullscreenBtn.textContent=active?'⤢':'⛶';
    fullscreenBtn.setAttribute('aria-label',active?'Vollbild verlassen':'Vollbild einschalten');
  }
  fullscreenBtn.addEventListener('click',async()=>{
    const active=pseudoFullscreen||document.fullscreenElement===gameCard||document.webkitFullscreenElement===gameCard;
    if(active){pseudoFullscreen=false;gameCard.classList.remove('is-fullscreen');await leaveNativeFullscreen();}
    else{pseudoFullscreen=true;gameCard.classList.add('is-fullscreen');await requestNativeFullscreen();}
    updateFullscreenButton();
  });
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&pseudoFullscreen)gameCard.classList.add('is-fullscreen');updateFullscreenButton();});
  document.addEventListener('webkitfullscreenchange',updateFullscreenButton);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && running){
      running=false;
      paused=true;
      cancelAnimationFrame(raf);
      pauseMusic();
      overlayTitle.textContent='PAUSIERT';
      overlayText.textContent=`${formatTime(elapsed)} · ${moves} Züge`;
      startBtn.textContent='WEITERSPIELEN';
      overlay.classList.remove('hidden');
    }
  });

  updateMusicButton();
  resetPreviewState();
})();
