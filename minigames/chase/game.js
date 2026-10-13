(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const gameCard = document.getElementById('gameCard');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const levelPicker = document.getElementById('levelPicker');
  const levelButtons = [...document.querySelectorAll('.level-btn')];
  const snacksEl = document.getElementById('snacks');
  const timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best');
  const livesEl = document.getElementById('lives');
  const musicBtn = document.getElementById('musicBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const themeAudio = document.getElementById('themeAudio');

  const CELL = 48;
  const COLS = 19;
  const ROWS = 13;
  const W = COLS * CELL;
  const H = ROWS * CELL;
  const LEGACY_BEST_KEY = 'snikkers_chase_best_time_v1';
  const BEST_KEY_PREFIX = 'snikkers_chase_best_time_v2_level_';
  const MUSIC_KEY = 'snikkers_chase_music_v1';
  const LEVELS = {
    1:{id:1,label:'Level 1',flies:2},
    2:{id:2,label:'Level 2',flies:3}
  };
  const viewportFitter = window.OMDGameViewport?.createFitter({ stage, content: canvas, logicalWidth: W, logicalHeight: H });

  const GRID = [
    '###################',
    '#........#........#',
    '#.###.##.#.##.###.#',
    '#.#.....#.#.....#.#',
    '#.#.###.....###.#.#',
    '#.....#.###.#.....#',
    '###.#.#.....#.#.###',
    '#...#...#.#...#...#',
    '#.#####.#.#.#####.#',
    '#.......#.#.......#',
    '#.###.##...##.###.#',
    '#.................#',
    '###################'
  ];

  const DIRS = {
    left:{dr:0,dc:-1}, right:{dr:0,dc:1}, up:{dr:-1,dc:0}, down:{dr:1,dc:0}, none:{dr:0,dc:0}
  };
  const OPP = {left:'right',right:'left',up:'down',down:'up',none:'none'};
  const DIR_LIST = ['left','up','right','down'];

  const snikkersImg = new Image();
  snikkersImg.src = 'assets/snikkers.png';
  const snikkersIdleImg = new Image();
  snikkersIdleImg.src = 'assets/idle.png';
  const runImgs = ['assets/run1.png','assets/run2.png','assets/run3.png','assets/run4.png'].map(src => { const img = new Image(); img.src = src; return img; });

  const flySheetImg = new Image();
  flySheetImg.src = 'assets/flies_sheet.png';
  const FLY_FRAME_W = 627;
  const FLY_FRAME_H = 627;

  let running = false;
  let paused = true;
  let ended = false;
  let won = false;
  let lastNow = 0;
  let raf = 0;
  let elapsed = 0;
  let lives = 3;
  let invulnerable = 0;
  let musicEnabled = localStorage.getItem(MUSIC_KEY) !== '0';
  let pseudoFullscreen = false;
  let pointerStart = null;
  let totalSnacks = 0;
  let collected = 0;
  let snacks = new Set();
  let particles = [];
  let playerFacing = 'right';
  let selectedLevel = 1;
  let activeFlyCount = LEVELS[selectedLevel].flies;
  let bestTime = null;

  const startPlayer = {r:11,c:9};
  const flyStarts = [{r:1,c:1},{r:1,c:17},{r:11,c:17}];

  const player = makeEntity(startPlayer.r,startPlayer.c,165,'left');
  const flies = [
    {...makeEntity(flyStarts[0].r,flyStarts[0].c,118,'right'), color:'#50656e', ai:'direct', wing:0, frameOffset:0},
    {...makeEntity(flyStarts[1].r,flyStarts[1].c,112,'left'), color:'#5c5a62', ai:'cutter', wing:Math.PI, frameOffset:2},
    {...makeEntity(flyStarts[2].r,flyStarts[2].c,110,'left'), color:'#665560', ai:'ambush', wing:Math.PI/2, frameOffset:1}
  ];

  function makeEntity(r,c,speed,dir='none'){
    return {r,c,fromR:r,fromC:c,toR:r,toC:c,progress:0,dir,nextDir:dir,speed,x:(c+.5)*CELL,y:(r+.5)*CELL};
  }

  function tileKey(r,c){return `${r},${c}`;}
  function walkable(r,c){return r>=0&&r<ROWS&&c>=0&&c<COLS&&GRID[r][c] !== '#';}
  function canMove(r,c,dir){const d=DIRS[dir]; return dir!=='none' && walkable(r+d.dr,c+d.dc);}
  function centerOf(r,c){return {x:(c+.5)*CELL,y:(r+.5)*CELL};}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function activeFlies(){return flies.slice(0,activeFlyCount);}
  function bestKey(levelId=selectedLevel){return `${BEST_KEY_PREFIX}${levelId}`;}
  function loadBest(levelId=selectedLevel){
    let value=Number(localStorage.getItem(bestKey(levelId))||0);
    if(!value && levelId===1) value=Number(localStorage.getItem(LEGACY_BEST_KEY)||0);
    return value>0?value:null;
  }
  function updateLevelButtons(){
    levelButtons.forEach(btn=>btn.classList.toggle('is-selected',Number(btn.dataset.level)===selectedLevel));
  }
  function showLevelPicker(show){levelPicker?.classList.toggle('hidden',!show);}

  function formatTime(sec){
    const s=Math.max(0,sec);
    const whole=Math.floor(s);
    const min=Math.floor(whole/60);
    const rem=whole%60;
    const tenths=Math.floor((s-whole)*10);
    return `${min}:${String(rem).padStart(2,'0')}.${tenths}`;
  }

  function updateHud(){
    snacksEl.textContent=`${collected} / ${totalSnacks}`;
    timeEl.textContent=formatTime(elapsed);
    bestEl.textContent=bestTime ? formatTime(bestTime) : '–';
    livesEl.textContent='♥'.repeat(lives)+'♡'.repeat(Math.max(0,3-lives));
  }

  function buildSnacks(){
    snacks=new Set();
    const exclusions=new Set([tileKey(startPlayer.r,startPlayer.c), ...flyStarts.slice(0,activeFlyCount).map(p=>tileKey(p.r,p.c))]);
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        if(walkable(r,c)&&!exclusions.has(tileKey(r,c))) snacks.add(tileKey(r,c));
      }
    }
    totalSnacks=snacks.size;
    collected=0;
  }

  function resetEntity(entity,pos,dir){
    entity.r=pos.r; entity.c=pos.c; entity.fromR=pos.r; entity.fromC=pos.c; entity.toR=pos.r; entity.toC=pos.c;
    entity.progress=0; entity.dir=dir; entity.nextDir=dir;
    const p=centerOf(pos.r,pos.c); entity.x=p.x; entity.y=p.y;
  }

  function resetPositions(){
    resetEntity(player,startPlayer,'left');
    playerFacing='right';
    activeFlies().forEach((fly,index)=>resetEntity(fly,flyStarts[index],index===0?'right':'left'));
    invulnerable=1.6;
  }

  function prepareGame(){
    cancelAnimationFrame(raf);
    buildSnacks();
    lives=3; elapsed=0; particles=[]; ended=false; won=false; paused=true; running=false;
    resetPositions();
    updateHud();
    render();
  }

  function startPreparedGame(){
    running=true; paused=false; ended=false;
    overlay.classList.add('hidden');
    lastNow=performance.now();
    updateHud();
    playMusic();
    stage.focus({preventScroll:true});
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(loop);
  }

  function newGame(){
    prepareGame();
    startPreparedGame();
  }

  function resumeGame(){
    if(ended) return newGame();
    running=true; paused=false; lastNow=performance.now(); overlay.classList.add('hidden'); playMusic();
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(loop);
  }

  function pauseGame(){
    if(!running||ended) return;
    running=false; paused=true; cancelAnimationFrame(raf); pauseMusic();
    overlayTitle.textContent='PAUSIERT';
    overlayText.textContent=`${LEVELS[selectedLevel].label} · Tippen zum Weiterspielen`;
    startBtn.textContent='WEITERSPIELEN';
    showLevelPicker(false);
    overlay.classList.remove('hidden');
  }

  function selectLevel(levelId){
    if(running) return;
    const next=LEVELS[Number(levelId)]||LEVELS[1];
    selectedLevel=next.id;
    activeFlyCount=next.flies;
    bestTime=loadBest(selectedLevel);
    updateLevelButtons();
    prepareGame();
    overlayTitle.textContent='Snikkers Chase';
    overlayText.textContent=`${next.label} · ${next.flies} Fliegen · sammle alle Snacks.`;
    startBtn.textContent='SPIEL STARTEN';
    showLevelPicker(true);
    overlay.classList.remove('hidden');
  }

  function finishGame(isWin){
    running=false; ended=true; won=isWin; cancelAnimationFrame(raf); pauseMusic();
    if(isWin && (!bestTime || elapsed<bestTime)){
      bestTime=elapsed; localStorage.setItem(bestKey(),String(bestTime));
    }
    updateHud();
    overlayTitle.textContent=isWin?'GESCHAFFT!':'GAME OVER';
    overlayText.textContent=isWin?`${LEVELS[selectedLevel].label} geschafft in ${formatTime(elapsed)}.`:`${LEVELS[selectedLevel].label}: Snikkers wurde dreimal von den Fliegen erwischt.`;
    startBtn.textContent='NOCHMAL SPIELEN';
    showLevelPicker(true);
    overlay.classList.remove('hidden');
  }

  function queueDirection(dir){ player.nextDir=dir; if(dir==='left'||dir==='right') playerFacing=dir; }

  function choosePlayerDirection(){
    if(canMove(player.r,player.c,player.nextDir)) return player.nextDir;
    if(canMove(player.r,player.c,player.dir)) return player.dir;
    return 'none';
  }

  function predictedPlayerTile(steps=3){
    let r=player.r,c=player.c;
    const dir=player.dir!=='none'?player.dir:player.nextDir;
    for(let i=0;i<steps;i++){
      if(!canMove(r,c,dir)) break;
      r+=DIRS[dir].dr; c+=DIRS[dir].dc;
    }
    return {r,c};
  }

  function bfsFirstStep(sr,sc,tr,tc,forbiddenReverse=null){
    const q=[[sr,sc]];
    const seen=new Set([tileKey(sr,sc)]);
    const first=new Map();
    while(q.length){
      const [r,c]=q.shift();
      if(r===tr&&c===tc) return first.get(tileKey(r,c)) || 'none';
      for(const dir of DIR_LIST){
        if(r===sr&&c===sc&&forbiddenReverse&&dir===forbiddenReverse) continue;
        const d=DIRS[dir], nr=r+d.dr, nc=c+d.dc, k=tileKey(nr,nc);
        if(!walkable(nr,nc)||seen.has(k)) continue;
        seen.add(k); first.set(k, first.get(tileKey(r,c)) || dir); q.push([nr,nc]);
      }
    }
    return 'none';
  }

  function chooseFlyDirection(fly,index){
    const reverse=OPP[fly.dir];
    const possible=DIR_LIST.filter(d=>canMove(fly.r,fly.c,d));
    let candidates=possible.filter(d=>d!==reverse);
    if(!candidates.length) candidates=possible;
    if(!candidates.length) return 'none';

    let target={r:player.r,c:player.c};
    if(fly.ai==='cutter') target=predictedPlayerTile(3);
    if(fly.ai==='ambush') target=predictedPlayerTile(5);

    const chase=bfsFirstStep(fly.r,fly.c,target.r,target.c,candidates.length>1?reverse:null);
    if(fly.ai==='direct') return candidates.includes(chase)?chase:candidates[0];

    // cutter/ambush flies cut off the route, but stay slightly less deterministic
    const chaseChance=fly.ai==='ambush'?0.82:0.72;
    if(Math.random()<chaseChance && candidates.includes(chase)) return chase;
    return candidates[Math.floor(Math.random()*candidates.length)];
  }

  function beginStep(entity,dir){
    if(dir==='none'||!canMove(entity.r,entity.c,dir)){
      entity.dir='none'; entity.fromR=entity.r; entity.fromC=entity.c; entity.toR=entity.r; entity.toC=entity.c; entity.progress=0;
      return;
    }
    const d=DIRS[dir];
    entity.dir=dir; entity.fromR=entity.r; entity.fromC=entity.c; entity.toR=entity.r+d.dr; entity.toC=entity.c+d.dc; entity.progress=0;
  }

  function advanceEntity(entity,dt,isPlayer=false,flyIndex=0){
    let distance=entity.speed*dt;
    let safety=0;
    while(distance>0 && safety++<5){
      if(entity.fromR===entity.toR && entity.fromC===entity.toC){
        const dir=isPlayer?choosePlayerDirection():chooseFlyDirection(entity,flyIndex);
        beginStep(entity,dir);
        if(dir==='none') break;
      }
      const remainingPx=(1-entity.progress)*CELL;
      if(distance<remainingPx){
        entity.progress+=distance/CELL;
        distance=0;
      }else{
        distance-=remainingPx;
        entity.progress=1;
      }
      const a=centerOf(entity.fromR,entity.fromC), b=centerOf(entity.toR,entity.toC);
      entity.x=a.x+(b.x-a.x)*entity.progress;
      entity.y=a.y+(b.y-a.y)*entity.progress;
      if(entity.progress>=.999999){
        entity.r=entity.toR; entity.c=entity.toC; entity.fromR=entity.r; entity.fromC=entity.c; entity.toR=entity.r; entity.toC=entity.c; entity.progress=0;
        const p=centerOf(entity.r,entity.c); entity.x=p.x; entity.y=p.y;
        if(isPlayer) collectSnack(entity.r,entity.c);
      }
    }
  }

  function collectSnack(r,c){
    const k=tileKey(r,c);
    if(!snacks.has(k)) return;
    snacks.delete(k); collected++;
    const p=centerOf(r,c);
    for(let i=0;i<5;i++) particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*90,vy:(Math.random()-.5)*90,life:.45});
    updateHud();
    if(collected>=totalSnacks) finishGame(true);
  }

  function handleCollisions(){
    if(invulnerable>0) return;
    for(const fly of activeFlies()){
      const dx=player.x-fly.x, dy=player.y-fly.y;
      if(dx*dx+dy*dy < 24*24){
        lives--;
        updateHud();
        if(lives<=0){finishGame(false);return;}
        resetPositions();
        return;
      }
    }
  }

  function update(dt){
    elapsed+=dt;
    if(invulnerable>0) invulnerable=Math.max(0,invulnerable-dt);
    advanceEntity(player,dt,true,0);
    activeFlies().forEach((fly,index)=>advanceEntity(fly,dt,false,index));
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt;
      if(p.life<=0) particles.splice(i,1);
    }
    handleCollisions();
    updateHud();
  }

  function roundRect(x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath();
  }

  function drawBackground(){
    const g=ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,'#2a2630'); g.addColorStop(.5,'#211e27'); g.addColorStop(1,'#19171e');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // very subtle kitchen floor pattern
    ctx.strokeStyle='rgba(255,255,255,.035)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=96){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=96){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  }

  function drawMaze(){
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const x=c*CELL,y=r*CELL;
        if(GRID[r][c]==='#'){
          const wall=ctx.createLinearGradient(x,y,x,y+CELL);
          wall.addColorStop(0,'#9e7658'); wall.addColorStop(1,'#6f4f3c');
          ctx.fillStyle=wall; roundRect(x+4,y+4,CELL-8,CELL-8,11); ctx.fill();
          ctx.strokeStyle='rgba(255,222,185,.16)'; ctx.lineWidth=2; ctx.stroke();
          ctx.fillStyle='rgba(255,255,255,.07)'; roundRect(x+8,y+8,CELL-16,5,3); ctx.fill();
        }
      }
    }
  }

  function drawSnacks(){
    ctx.lineWidth=1.5;
    for(const k of snacks){
      const [r,c]=k.split(',').map(Number); const p=centerOf(r,c);
      ctx.save(); ctx.translate(p.x,p.y);
      ctx.fillStyle='#e1a154'; ctx.strokeStyle='#8a592c';
      roundRect(-6,-4,12,8,3); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#734a2a';
      ctx.beginPath();ctx.arc(-2,-1,1.2,0,Math.PI*2);ctx.arc(3,2,1.2,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer(){
    const blink=invulnerable>0 && Math.floor(invulnerable*10)%2===0;
    if(blink) return;
    const moving = player.dir !== 'none' || player.progress > 0.001;
    if(player.dir==='left' || player.dir==='right') playerFacing = player.dir;
    const bob = moving ? Math.sin(elapsed * 20) * 1.5 : Math.sin(elapsed * 5) * 0.35;
    const stretchX = moving ? 1 + Math.sin(elapsed * 20 + Math.PI/2) * 0.02 : 1;
    const stretchY = moving ? 1 - Math.sin(elapsed * 20 + Math.PI/2) * 0.02 : 1;
    const shadowW = moving ? 18 + Math.sin(elapsed * 20 + Math.PI/2) * 1.5 : 18;
    let frameImg = snikkersImg;
    if(moving && runImgs.every(img => img.complete && img.naturalWidth)){
      frameImg = runImgs[Math.floor(elapsed * 10) % runImgs.length];
    } else if(!moving && snikkersIdleImg.complete && snikkersIdleImg.naturalWidth){
      frameImg = snikkersIdleImg;
    }

    ctx.save();
    ctx.translate(player.x, player.y + bob);
    const scaleX=(playerFacing==='right')?1:-1;
    ctx.scale(scaleX * stretchX, stretchY);
    ctx.globalAlpha=.22;
    ctx.fillStyle='#000';
    ctx.beginPath();
    ctx.ellipse(0,15,shadowW,6.2,0,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=1;
    if(frameImg.complete && frameImg.naturalWidth){
      ctx.drawImage(frameImg,-29,-22,58,38);
    }else{
      ctx.fillStyle='#d59a62'; ctx.beginPath(); ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function drawFly(fly,index){
    fly.wing += .24 + index*.02;
    ctx.save();
    ctx.translate(fly.x,fly.y);
    const angle=Math.atan2(DIRS[fly.dir].dr,DIRS[fly.dir].dc);
    if(fly.dir!=='none') ctx.rotate(angle + Math.PI/2);

    ctx.globalAlpha=.28;
    ctx.fillStyle='#000';
    ctx.beginPath();
    ctx.ellipse(0,16,16,5.5,0,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=1;

    if(flySheetImg.complete && flySheetImg.naturalWidth){
      const frame = (Math.floor(elapsed * 10) + (fly.frameOffset||0)) % 4;
      const sx = (frame % 2) * FLY_FRAME_W;
      const sy = Math.floor(frame / 2) * FLY_FRAME_H;
      const size = 42;
      ctx.drawImage(flySheetImg, sx, sy, FLY_FRAME_W, FLY_FRAME_H, -size/2, -size/2, size, size);
    } else {
      const flap=Math.sin(fly.wing)*4;
      ctx.fillStyle='rgba(215,235,240,.75)'; ctx.strokeStyle='rgba(80,95,105,.45)'; ctx.lineWidth=1.5;
      ctx.beginPath();ctx.ellipse(-3,-10,10,6,-.55,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.ellipse(-3,10,10,6,.55,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=fly.color; ctx.strokeStyle='#27282d'; ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(1,0,14,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#202124'; ctx.beginPath();ctx.arc(11,-5,4.5,0,Math.PI*2);ctx.arc(11,5,4.5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#33343a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-5,-6-flap*.15);ctx.lineTo(-15,-15-flap*.25);ctx.moveTo(-5,6+flap*.15);ctx.lineTo(-15,15+flap*.25);ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles(){
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.45,0,1);ctx.fillStyle='#ffd37f';ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    drawBackground();
    drawSnacks();
    drawMaze();
    drawPlayer();
    activeFlies().forEach((fly,index)=>drawFly(fly,index));
    drawParticles();
  }

  function loop(now){
    if(!running) return;
    const dt=Math.min(.035,(now-lastNow)/1000||0); lastNow=now;
    update(dt); render();
    if(running) raf=requestAnimationFrame(loop);
  }

  function updateMusicButton(){musicBtn.textContent=musicEnabled?'♫ AN':'♫ AUS';musicBtn.setAttribute('aria-pressed',String(musicEnabled));}
  async function playMusic(){if(!musicEnabled||!running||document.hidden)return;themeAudio.volume=.22;try{await themeAudio.play();}catch{}}
  function pauseMusic(){themeAudio.pause();}

  musicBtn.addEventListener('click',()=>{
    musicEnabled=!musicEnabled; localStorage.setItem(MUSIC_KEY,musicEnabled?'1':'0'); updateMusicButton();
    if(musicEnabled) playMusic(); else pauseMusic();
  });

  function handleKey(e,down){
    if(!down) return;
    const map={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
    const dir=map[e.key];
    if(dir){queueDirection(dir);e.preventDefault();}
    if((e.key===' '||e.key==='Enter')&&!running){paused?resumeGame():newGame();e.preventDefault();}
  }
  window.addEventListener('keydown',e=>handleKey(e,true));

  stage.addEventListener('pointerdown',e=>{
    if(!running){
      if(e.target.closest?.('button')) return;
      paused?resumeGame():newGame();
      e.preventDefault();
      return;
    }
    pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};
    stage.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('pointermove',e=>{
    if(!running||!pointerStart||pointerStart.id!==e.pointerId)return;
    const dx=e.clientX-pointerStart.x, dy=e.clientY-pointerStart.y;
    if(Math.hypot(dx,dy)<22)return;
    queueDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
    pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};
    e.preventDefault();
  });
  stage.addEventListener('pointerup',e=>{if(pointerStart?.id===e.pointerId)pointerStart=null;stage.releasePointerCapture?.(e.pointerId);});
  stage.addEventListener('pointercancel',()=>{pointerStart=null;});

  async function requestNativeFullscreen(){
    try{
      const fn=gameCard.requestFullscreen||gameCard.webkitRequestFullscreen; if(fn) await fn.call(gameCard);
      if(screen.orientation?.lock){try{await screen.orientation.lock('landscape');}catch{}}
    }catch{}
  }
  async function leaveNativeFullscreen(){
    try{
      if(document.fullscreenElement||document.webkitFullscreenElement){const fn=document.exitFullscreen||document.webkitExitFullscreen;if(fn)await fn.call(document);}
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
    window.OMDGameViewport?.refit();
  });
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&pseudoFullscreen)gameCard.classList.add('is-fullscreen');updateFullscreenButton();window.OMDGameViewport?.refit();});
  document.addEventListener('webkitfullscreenchange',()=>{updateFullscreenButton();window.OMDGameViewport?.refit();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pauseGame();});

  levelButtons.forEach(btn=>btn.addEventListener('click',()=>selectLevel(Number(btn.dataset.level))));
  startBtn.addEventListener('click',()=>{if(paused)resumeGame();else newGame();});
  snikkersImg.addEventListener('load',render);
  snikkersIdleImg.addEventListener('load',render);
  runImgs.forEach(img => img.addEventListener('load',render));
  flySheetImg.addEventListener('load',render);

  updateMusicButton();
  selectLevel(1);
})();
