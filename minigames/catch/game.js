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
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best');
  const musicBtn = document.getElementById('musicBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const themeAudio = document.getElementById('themeAudio');

  const W = 960;
  const H = 540;
  const FLOOR_Y = 500;
  const SPAWN_Y = 138;
  const ROUND_SECONDS = 90;
  const BEST_KEY = 'snikkers_catch_best_v1';
  const MUSIC_KEY = 'snikkers_catch_music_v1';
  const viewportFitter = window.OMDGameViewport?.createFitter({ stage, content: canvas, logicalWidth: W, logicalHeight: H });

  const dogImage = new Image();
  dogImage.src = 'assets/snikkers.png';

  let running = false;
  let paused = true;
  let roundEnded = false;
  let lastTime = 0;
  let animationFrame = 0;
  let elapsed = 0;
  let spawnTimer = 0;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let pointerActive = false;
  let musicEnabled = localStorage.getItem(MUSIC_KEY) !== '0';
  let pseudoFullscreen = false;
  const keys = { left:false, right:false };
  const items = [];
  const popups = [];

  const dog = {
    x: W / 2,
    targetX: W / 2,
    y: FLOOR_Y - 92,
    width: 160,
    height: 104,
    speed: 620,
  };

  const TYPES = [
    { id:'biscuit', label:'+10', points:10, weight:38, size:34, speed:[155,205] },
    { id:'bone', label:'+20', points:20, weight:24, size:43, speed:[150,195] },
    { id:'special', label:'+30', points:30, weight:10, size:40, speed:[145,190] },
    { id:'chocolate', label:'−20', points:-20, weight:16, size:46, speed:[175,225] },
    { id:'rock', label:'−30', points:-30, weight:12, size:42, speed:[195,250] },
  ];

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function rand(min,max){ return min + Math.random()*(max-min); }

  function formatTime(seconds){
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  function updateHud(){
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    const remaining = Math.max(0, ROUND_SECONDS - elapsed);
    timeEl.textContent = formatTime(remaining);
    timeEl.parentElement.classList.toggle('urgent', remaining <= 10 && running);
  }

  function updateMusicButton(){
    musicBtn.textContent = musicEnabled ? '♫ AN' : '♫ AUS';
    musicBtn.setAttribute('aria-pressed', String(musicEnabled));
  }

  async function playMusic(){
    if(!musicEnabled || !running || document.hidden) return;
    themeAudio.volume = 0.26;
    try{ await themeAudio.play(); }catch{}
  }

  function pauseMusic(){ themeAudio.pause(); }

  function pickType(){
    const total = TYPES.reduce((s,t)=>s+t.weight,0);
    let r = Math.random()*total;
    for(const t of TYPES){ r -= t.weight; if(r <= 0) return t; }
    return TYPES[0];
  }

  function resetRound(){
    items.length = 0;
    popups.length = 0;
    score = 0;
    elapsed = 0;
    spawnTimer = 0.35;
    dog.x = W/2;
    dog.targetX = W/2;
    roundEnded = false;
    updateHud();
  }

  function startNewRound(){
    resetRound();
    paused = false;
    running = true;
    lastTime = performance.now();
    overlay.classList.add('hidden');
    stage.focus({preventScroll:true});
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(loop);
    playMusic();
  }

  function resumeRound(){
    if(roundEnded) return startNewRound();
    paused = false;
    running = true;
    lastTime = performance.now();
    overlay.classList.add('hidden');
    stage.focus({preventScroll:true});
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(loop);
    playMusic();
  }

  function pauseRound(){
    if(!running) return;
    running = false;
    paused = true;
    cancelAnimationFrame(animationFrame);
    pauseMusic();
    overlayTitle.textContent = 'PAUSIERT';
    overlayText.textContent = `Noch ${formatTime(ROUND_SECONDS-elapsed)} · Tippen zum Weiterspielen`;
    startBtn.textContent = 'WEITERSPIELEN';
    overlay.classList.remove('hidden');
  }

  function finishRound(){
    running = false;
    paused = false;
    roundEnded = true;
    cancelAnimationFrame(animationFrame);
    pauseMusic();
    elapsed = ROUND_SECONDS;
    if(score > best){
      best = score;
      localStorage.setItem(BEST_KEY,String(best));
    }
    updateHud();
    overlayTitle.textContent = 'RUNDE BEENDET';
    overlayText.textContent = `Punkte: ${score} · Best: ${best}`;
    startBtn.textContent = 'NOCHMAL SPIELEN';
    overlay.classList.remove('hidden');
  }

  function spawnItem(){
    const type = pickType();
    const difficulty = clamp(elapsed / ROUND_SECONDS, 0, 1);
    const baseSpeed = rand(type.speed[0], type.speed[1]);
    items.push({
      type,
      x: rand(95, 865),
      y: SPAWN_Y,
      vy: baseSpeed * (1 + difficulty*0.48),
      rotation: rand(-0.35,0.35),
      vr: rand(-1.2,1.2),
      size:type.size,
    });
  }

  function update(dt){
    elapsed += dt;
    if(elapsed >= ROUND_SECONDS){ finishRound(); return; }

    if(keys.left) dog.targetX -= dog.speed*dt;
    if(keys.right) dog.targetX += dog.speed*dt;
    dog.targetX = clamp(dog.targetX,dog.width*.46,W-dog.width*.46);
    dog.x = lerp(dog.x,dog.targetX,1-Math.pow(0.00005,dt));

    spawnTimer -= dt;
    if(spawnTimer <= 0){
      spawnItem();
      const difficulty = clamp(elapsed/ROUND_SECONDS,0,1);
      spawnTimer = rand(.60,.94)*(1-difficulty*.31);
      if(elapsed > 28 && Math.random() < .13 + difficulty*.14){
        setTimeout(()=>{ if(running) spawnItem(); },110);
      }
    }

    const catchBox = {
      x:dog.x-dog.width*.38,
      y:dog.y+17,
      w:dog.width*.76,
      h:dog.height*.66,
    };

    for(let i=items.length-1;i>=0;i--){
      const item = items[i];
      item.y += item.vy*dt;
      item.rotation += item.vr*dt;
      const r = item.size*.38;
      const hit = item.x+r>catchBox.x && item.x-r<catchBox.x+catchBox.w && item.y+r>catchBox.y && item.y-r<catchBox.y+catchBox.h;
      if(hit){
        score = Math.max(0,score+item.type.points);
        if(score>best){ best=score; localStorage.setItem(BEST_KEY,String(best)); }
        popups.push({x:item.x,y:item.y-8,text:item.type.label,positive:item.type.points>0,life:.72});
        items.splice(i,1);
        updateHud();
        continue;
      }
      if(item.y-item.size>H+10) items.splice(i,1);
    }

    for(let i=popups.length-1;i>=0;i--){
      popups[i].life -= dt;
      popups[i].y -= 42*dt;
      if(popups[i].life<=0) popups.splice(i,1);
    }
    updateHud();
  }

  function roundRect(x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
  }

  function drawKitchenBackground(){
    const wall = ctx.createLinearGradient(0,0,0,330);
    wall.addColorStop(0,'#f7efe4');
    wall.addColorStop(.7,'#ecdfd0');
    wall.addColorStop(1,'#e4d4c1');
    ctx.fillStyle = wall;
    ctx.fillRect(0,0,W,330);

    // soft backsplash / kitchen wall band
    ctx.fillStyle = '#eadcc9';
    ctx.fillRect(0,138,W,118);
    ctx.strokeStyle = 'rgba(126,94,71,.08)';
    ctx.lineWidth = 1;
    for(let x=0;x<W;x+=72){ ctx.beginPath(); ctx.moveTo(x,138); ctx.lineTo(x,256); ctx.stroke(); }
    for(let y=138;y<=256;y+=39){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    function drawOpenCabinet(cabX, cabY, cabW, cabH, variant){
      const shellGrad = ctx.createLinearGradient(cabX,cabY,cabX,cabY+cabH);
      shellGrad.addColorStop(0,'#c79262');
      shellGrad.addColorStop(1,'#b27b49');
      ctx.fillStyle = shellGrad;
      roundRect(cabX,cabY,cabW,cabH,12); ctx.fill();
      ctx.strokeStyle='rgba(83,54,35,.26)'; ctx.lineWidth=2; ctx.stroke();

      ctx.fillStyle='#8d613f';
      roundRect(cabX+14,cabY+16,cabW-28,cabH-24,8); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.08)';
      ctx.fillRect(cabX+20,cabY+24,cabW-40,4);
      ctx.fillStyle='#6f4b33';
      ctx.fillRect(cabX+20,cabY+60,cabW-40,6);

      // doors
      ctx.save();
      ctx.translate(cabX+18,cabY+18);
      ctx.rotate(-0.34);
      const dl=ctx.createLinearGradient(0,0,92,0); dl.addColorStop(0,'#d3aa7d'); dl.addColorStop(1,'#bc8756');
      ctx.fillStyle=dl; roundRect(-92,0,92,74,8); ctx.fill();
      ctx.strokeStyle='rgba(89,61,39,.24)'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#7a573c'; roundRect(-16,26,5,18,2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(cabX+cabW-18,cabY+18);
      ctx.rotate(0.34);
      const dr=ctx.createLinearGradient(0,0,92,0); dr.addColorStop(0,'#bc8756'); dr.addColorStop(1,'#d3aa7d');
      ctx.fillStyle=dr; roundRect(0,0,92,74,8); ctx.fill();
      ctx.strokeStyle='rgba(89,61,39,.24)'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#7a573c'; roundRect(10,26,5,18,2); ctx.fill();
      ctx.restore();

      // contents vary slightly
      if(variant===0){
        ctx.fillStyle='#d9926d';
        ctx.beginPath(); ctx.ellipse(cabX+62,cabY+55,22,7,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#f1c17c';
        ctx.beginPath(); ctx.ellipse(cabX+62,cabY+59,28,8,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#c78945';
        for(const [dx,dy] of [[-10,-4],[-1,-6],[8,-3],[14,-5],[-5,1]]){ ctx.beginPath(); ctx.arc(cabX+62+dx,cabY+55+dy,4.3,0,Math.PI*2); ctx.fill(); }
        ctx.save(); ctx.translate(cabX+142,cabY+79); ctx.rotate(-0.1);
        ctx.fillStyle='#70757a'; ctx.strokeStyle='#42484d'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-13,7); ctx.lineTo(-9,-10); ctx.lineTo(5,-14); ctx.lineTo(16,-3); ctx.lineTo(14,11); ctx.lineTo(-2,15); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if(variant===1){
        ctx.fillStyle='#d9926d';
        ctx.beginPath(); ctx.ellipse(cabX+112,cabY+55,30,8,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#f1c17c';
        ctx.beginPath(); ctx.ellipse(cabX+112,cabY+60,36,9,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#c78945';
        for(const [dx,dy] of [[-14,-5],[-3,-7],[9,-4],[18,-6],[-8,0],[4,1]]){ ctx.beginPath(); ctx.arc(cabX+112+dx,cabY+56+dy,5,0,Math.PI*2); ctx.fill(); }
        ctx.save(); ctx.translate(cabX+246,cabY+51); ctx.rotate(-0.08);
        ctx.fillStyle='#f4ddb2'; ctx.strokeStyle='#b08b52'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(-16,0,6,0,Math.PI*2); ctx.arc(16,0,6,0,Math.PI*2); ctx.fill(); ctx.stroke();
        roundRect(-16,-4,32,8,4); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.translate(cabX+310,cabY+82); ctx.rotate(0.1);
        ctx.fillStyle='#6e4a35'; ctx.strokeStyle='#3f2c22'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-16,-10); ctx.lineTo(6,-8); ctx.quadraticCurveTo(10,0,18,5); ctx.quadraticCurveTo(12,12,-18,9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(cabX+60,cabY+47); ctx.rotate(0.06);
        ctx.fillStyle='#f4ddb2'; ctx.strokeStyle='#b08b52'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(-14,0,5.5,0,Math.PI*2); ctx.arc(14,0,5.5,0,Math.PI*2); ctx.fill(); ctx.stroke();
        roundRect(-14,-4,28,8,4); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.translate(cabX+136,cabY+80); ctx.rotate(0.08);
        ctx.fillStyle='#6e4a35'; ctx.strokeStyle='#3f2c22'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-15,-9); ctx.lineTo(5,-8); ctx.quadraticCurveTo(9,0,17,4); ctx.quadraticCurveTo(12,12,-16,8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }

    // three open hanging cabinets so the full width feels playable
    drawOpenCabinet(70,28,188,102,0);
    drawOpenCabinet(286,24,388,108,1);
    drawOpenCabinet(702,28,188,102,2);

    // soft shadow directly below the cabinet / spawn area across almost the whole playable width
    const shadow = ctx.createLinearGradient(0,SPAWN_Y-6,0,SPAWN_Y+80);
    shadow.addColorStop(0,'rgba(66,42,29,.15)');
    shadow.addColorStop(1,'rgba(66,42,29,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(60,SPAWN_Y-6,W-120,96);

    // quiet fall zone below
    const fall = ctx.createLinearGradient(0,SPAWN_Y,0,332);
    fall.addColorStop(0,'rgba(255,249,241,.78)');
    fall.addColorStop(1,'rgba(246,237,226,.55)');
    ctx.fillStyle = fall;
    ctx.fillRect(0,SPAWN_Y,W,194);

    // simple lower kitchen line
    const counterY = 248;
    ctx.fillStyle = '#cfaa82';
    ctx.fillRect(0,counterY,W,82);
    ctx.fillStyle = '#b58d65';
    ctx.fillRect(0,counterY,W,14);
    ctx.strokeStyle='rgba(92,63,44,.16)'; ctx.lineWidth=2;
    for(let x=0;x<W;x+=120){ ctx.strokeRect(x+1,counterY+15,118,66); }
    ctx.fillStyle='#7a573c';
    for(let x=46;x<W;x+=120){ roundRect(x,counterY+46,28,4,2); ctx.fill(); }

    // floor: broad tiles, calm perspective
    const floorTop = 330;
    const floorGrad = ctx.createLinearGradient(0,floorTop,0,H);
    floorGrad.addColorStop(0,'#ddd8d3');
    floorGrad.addColorStop(1,'#bbb6b2');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0,floorTop,W,H-floorTop);

    ctx.strokeStyle='rgba(96,90,84,.18)';
    ctx.lineWidth=2;
    for(let y=385;y<H;y+=78){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // only a few slightly angled grout lines, no dramatic vanishing point
    const seams = [110, 300, 495, 680, 850];
    for(const x of seams){
      ctx.beginPath();
      ctx.moveTo(x,floorTop);
      ctx.lineTo(x + (x < W/2 ? -24 : 24), H);
      ctx.stroke();
    }

    // subtle warm light for coherence
    const light = ctx.createRadialGradient(190,88,30,190,88,300);
    light.addColorStop(0,'rgba(255,245,199,.18)');
    light.addColorStop(1,'rgba(255,245,199,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0,0,W,H);

    const vignette = ctx.createRadialGradient(W/2,H/2,220,W/2,H/2,640);
    vignette.addColorStop(.62,'rgba(255,255,255,0)');
    vignette.addColorStop(1,'rgba(60,43,38,.12)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0,0,W,H);
  }

  function drawBiscuit(item){ctx.fillStyle='#c98a45';roundRect(-item.size*.45,-item.size*.28,item.size*.9,item.size*.56,item.size*.16);ctx.fill();ctx.strokeStyle='#89552b';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#6f472b';for(const [x,y] of [[-.2,-.1],[.18,-.12],[-.08,.13],[.26,.1]]){ctx.beginPath();ctx.arc(x*item.size,y*item.size,2.2,0,Math.PI*2);ctx.fill();}}
  function drawBone(item){ctx.fillStyle='#f4d69b';ctx.strokeStyle='#a97738';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-item.size*.33,0,item.size*.16,0,Math.PI*2);ctx.arc(item.size*.33,0,item.size*.16,0,Math.PI*2);ctx.fill();ctx.stroke();roundRect(-item.size*.33,-item.size*.12,item.size*.66,item.size*.24,item.size*.1);ctx.fill();ctx.stroke();}
  function drawSpecial(item){ctx.fillStyle='#ffd95e';ctx.strokeStyle='#a66d15';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const r=i%2===0?item.size*.42:item.size*.19;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();}
  function drawChocolate(item){ctx.fillStyle='#6b3b25';ctx.strokeStyle='#3c2118';ctx.lineWidth=2;roundRect(-item.size*.42,-item.size*.3,item.size*.84,item.size*.6,item.size*.09);ctx.fill();ctx.stroke();ctx.strokeStyle='#a76b49';ctx.lineWidth=1.5;for(let x=-1;x<=1;x+=2){ctx.beginPath();ctx.moveTo(x*item.size*.14,-item.size*.27);ctx.lineTo(x*item.size*.14,item.size*.27);ctx.stroke();}ctx.beginPath();ctx.moveTo(-item.size*.38,0);ctx.lineTo(item.size*.38,0);ctx.stroke();}
  function drawRock(item){ctx.fillStyle='#70757a';ctx.strokeStyle='#42484d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-item.size*.34,item.size*.16);ctx.lineTo(-item.size*.23,-item.size*.24);ctx.lineTo(item.size*.05,-item.size*.37);ctx.lineTo(item.size*.35,-item.size*.08);ctx.lineTo(item.size*.29,item.size*.27);ctx.lineTo(-item.size*.06,item.size*.36);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.23)';ctx.beginPath();ctx.moveTo(-item.size*.17,-item.size*.16);ctx.lineTo(item.size*.05,-item.size*.24);ctx.stroke();}

  function drawItem(item){ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.rotation);if(item.type.id==='biscuit')drawBiscuit(item);else if(item.type.id==='bone')drawBone(item);else if(item.type.id==='special')drawSpecial(item);else if(item.type.id==='chocolate')drawChocolate(item);else drawRock(item);ctx.restore();}

  function drawDog(){
    ctx.save();ctx.globalAlpha=.2;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(dog.x,FLOOR_Y-4,dog.width*.39,12,0,0,Math.PI*2);ctx.fill();ctx.restore();
    if(dogImage.complete&&dogImage.naturalWidth)ctx.drawImage(dogImage,dog.x-dog.width/2,dog.y,dog.width,dog.height);else{ctx.fillStyle='#d9954f';ctx.beginPath();ctx.arc(dog.x,dog.y+55,46,0,Math.PI*2);ctx.fill();}
  }

  function drawPopups(){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 24px system-ui';for(const p of popups){ctx.globalAlpha=clamp(p.life/.32,0,1);ctx.lineWidth=5;ctx.strokeStyle='rgba(30,20,24,.65)';ctx.strokeText(p.text,p.x,p.y);ctx.fillStyle=p.positive?'#31c86a':'#ff4c63';ctx.fillText(p.text,p.x,p.y);}ctx.globalAlpha=1;}

  function render(){ctx.clearRect(0,0,W,H);drawKitchenBackground();for(const item of items)drawItem(item);drawDog();drawPopups();}

  function loop(now){
    if(!running) return;
    const dt=Math.min(.032,(now-lastTime)/1000||0);lastTime=now;update(dt);render();
    if(running) animationFrame=requestAnimationFrame(loop);
  }

  function pointerToWorldX(clientX){const rect=canvas.getBoundingClientRect();return clamp((clientX-rect.left)/rect.width*W,dog.width*.46,W-dog.width*.46);}

  stage.addEventListener('pointerdown',(e)=>{if(!running){if(e.target.closest?.('button'))return;paused?resumeRound():startNewRound();e.preventDefault();return;}pointerActive=true;stage.setPointerCapture?.(e.pointerId);dog.targetX=pointerToWorldX(e.clientX);e.preventDefault();});
  stage.addEventListener('pointermove',(e)=>{if(!running)return;if(e.pointerType==='mouse'||pointerActive){dog.targetX=pointerToWorldX(e.clientX);e.preventDefault();}});
  stage.addEventListener('pointerup',(e)=>{pointerActive=false;stage.releasePointerCapture?.(e.pointerId);});
  stage.addEventListener('pointercancel',()=>{pointerActive=false;});

  window.addEventListener('keydown',(e)=>{
    if(['ArrowLeft','a','A'].includes(e.key)){keys.left=true;e.preventDefault();}
    if(['ArrowRight','d','D'].includes(e.key)){keys.right=true;e.preventDefault();}
    if((e.key===' '||e.key==='Enter')&&!running){paused?resumeRound():startNewRound();e.preventDefault();}
  });
  window.addEventListener('keyup',(e)=>{if(['ArrowLeft','a','A'].includes(e.key))keys.left=false;if(['ArrowRight','d','D'].includes(e.key))keys.right=false;});

  musicBtn.addEventListener('click',()=>{
    musicEnabled=!musicEnabled;
    localStorage.setItem(MUSIC_KEY,musicEnabled?'1':'0');
    updateMusicButton();
    if(musicEnabled) playMusic(); else pauseMusic();
  });

  async function requestNativeFullscreen(){
    try{
      const fn=gameCard.requestFullscreen||gameCard.webkitRequestFullscreen;
      if(fn){await fn.call(gameCard);}
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
    fullscreenBtn.title=active?'Vollbild verlassen':'Vollbild';
  }

  fullscreenBtn.addEventListener('click',async()=>{
    const active=pseudoFullscreen||document.fullscreenElement===gameCard||document.webkitFullscreenElement===gameCard;
    if(active){
      pseudoFullscreen=false;gameCard.classList.remove('is-fullscreen');await leaveNativeFullscreen();
    }else{
      pseudoFullscreen=true;gameCard.classList.add('is-fullscreen');await requestNativeFullscreen();
    }
    updateFullscreenButton();
    window.OMDGameViewport?.refit();
  });

  document.addEventListener('fullscreenchange',()=>{
    if(!document.fullscreenElement&&pseudoFullscreen){gameCard.classList.add('is-fullscreen');}
    updateFullscreenButton();
    window.OMDGameViewport?.refit();
  });
  document.addEventListener('webkitfullscreenchange',()=>{updateFullscreenButton();window.OMDGameViewport?.refit();});

  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pauseRound();});

  startBtn.addEventListener('click',()=>{
    if(paused){resumeRound();return;}
    overlayTitle.textContent='Snikkers Catch';
    overlayText.textContent='90 Sekunden · Tippen ins Spielfeld oder auf SPIEL STARTEN';
    startBtn.textContent='SPIEL STARTEN';
    startNewRound();
  });

  themeAudio.addEventListener('ended',()=>{if(musicEnabled&&running){themeAudio.currentTime=0;playMusic();}});
  dogImage.addEventListener('load',render);

  resetRound();
  paused=true;
  running=false;
  overlayTitle.textContent='Snikkers Catch';
  overlayText.textContent='90 Sekunden · Tippen ins Spielfeld oder auf SPIEL STARTEN';
  startBtn.textContent='SPIEL STARTEN';
  overlay.classList.remove('hidden');
  updateMusicButton();
  updateHud();
  render();
})();
