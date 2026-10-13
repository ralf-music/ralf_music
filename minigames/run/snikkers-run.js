(function (global) {
  'use strict';

  const DEFAULTS = {
    assetBase: './assets',
    audioSrc: null,
    bestScoreKey: 'omd_snikkers_run_best_v1',
    accent: '#ea580c',
    accentHover: '#f97316',
    title: 'Snikkers Run',
    subtitle: 'Tippen oder Leertaste: springen',
    startText: 'Tippen oder Leertaste zum Starten',
    musicDefaultOn: false,
    musicVolume: 0.25,
    storage: null,
    onScore: null,
    onGameOver: null,
    onBestScore: null
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createStorageAdapter(customStorage) {
    if (customStorage && typeof customStorage.get === 'function' && typeof customStorage.set === 'function') {
      return customStorage;
    }
    return {
      get(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
      },
      set(key, value) {
        try { localStorage.setItem(key, String(value)); } catch (_) {}
      }
    };
  }

  function createMarkup(container, opts) {
    const root = document.createElement('section');
    root.className = 'snikkers-run';
    root.style.setProperty('--sr-accent', opts.accent);
    root.style.setProperty('--sr-accent-hover', opts.accentHover);
    root.innerHTML = `
      <div class="snikkers-run__panel">
        <div class="snikkers-run__head snikkers-run__head--compact">
          <button class="snikkers-run__music" type="button" aria-pressed="false">🔊 Musik an</button>
        </div>
        <button class="snikkers-run__stage" type="button" aria-label="Snikkers Run starten oder springen">
          <canvas class="snikkers-run__canvas" width="960" height="360"></canvas>
        </button>

      </div>`;
    container.replaceChildren(root);
    return root;
  }

  function mount(target, userOptions = {}) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) throw new Error('SnikkersRun: Zielcontainer nicht gefunden.');

    const opts = Object.assign({}, DEFAULTS, userOptions);
    const storage = createStorageAdapter(opts.storage);
    const root = createMarkup(container, opts);
    const stage = root.querySelector('.snikkers-run__stage');
    const canvas = root.querySelector('.snikkers-run__canvas');
    const musicBtn = root.querySelector('.snikkers-run__music');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const GROUND = 290;
    const viewportFitter = global.OMDGameViewport?.createFitter({ stage, content: canvas, logicalWidth: W, logicalHeight: H });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const spriteNames = ['run1','run2','run3','run4','jump1','jump2','land','gameover'];
    const sprites = {};
    const runFrames = ['run1','run2','run3','run4'];
    let assetsReady = false;
    let destroyed = false;
    let rafId = 0;
    let running = false;
    let over = false;
    let paused = true;
    let last = 0;
    let spawn = 950;
    let score = 0;
    let milestone = 0;
    let distance = 0;
    let obstacles = [];
    let particles = [];
    let best = Math.max(0, Number(storage.get(opts.bestScoreKey) || 0) || 0);

    const dog = { x:120, y:GROUND-56, w:84, h:56, vy:0, onGround:true, animTime:0, landTimer:0 };

    let audio = null;
    let wantMusic = Boolean(opts.musicDefaultOn);
    if (opts.audioSrc) {
      audio = new Audio(opts.audioSrc);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = clamp(Number(opts.musicVolume) || 0.25, 0, 1);
      audio.addEventListener('error', () => {
        wantMusic = false;
        musicBtn.hidden = true;
      }, { once:true });
    } else {
      musicBtn.hidden = true;
    }

    function updateMusicButton() {
      if (!audio) return;
      musicBtn.textContent = wantMusic ? '🔈 Musik aus' : '🔊 Musik an';
      musicBtn.setAttribute('aria-pressed', wantMusic ? 'true' : 'false');
    }
    updateMusicButton();

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    function spritePath(name) {
      return `${String(opts.assetBase).replace(/\/$/, '')}/${name}.png`;
    }

    Promise.all(spriteNames.map(async name => { sprites[name] = await loadImage(spritePath(name)); }))
      .then(() => { if (!destroyed) { assetsReady = true; renderStatic(); } })
      .catch(err => {
        console.error('SnikkersRun: Sprite konnte nicht geladen werden.', err);
        if (!destroyed) { assetsReady = false; renderStatic('Spielgrafik konnte nicht geladen werden'); }
      });

    function rr(x,y,w,h,r) {
      const radius = Math.min(r,w/2,h/2);
      ctx.beginPath();
      ctx.moveTo(x+radius,y);
      ctx.arcTo(x+w,y,x+w,y+h,radius);
      ctx.arcTo(x+w,y+h,x,y+h,radius);
      ctx.arcTo(x,y+h,x,y,radius);
      ctx.arcTo(x,y,x+w,y,radius);
      ctx.closePath();
    }

    function drawWorld() {
      const g = ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#1a1a3b');
      g.addColorStop(.42,'#56365d');
      g.addColorStop(.72,'#bb694e');
      g.addColorStop(1,'#e8b172');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,W,H);

      ctx.fillStyle = 'rgba(255,209,110,.95)';
      ctx.beginPath(); ctx.arc(805,92,31,0,Math.PI*2); ctx.fill();

      ctx.fillStyle = '#43425a';
      ctx.beginPath(); ctx.moveTo(0,185);
      for (let x=0;x<=W+120;x+=120) ctx.lineTo(x,160+Math.sin((x+distance*.045)/115)*20);
      ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.fill();

      ctx.fillStyle = '#21352f';
      ctx.beginPath(); ctx.moveTo(0,220);
      for (let x=0;x<=W+80;x+=80) ctx.lineTo(x,202+Math.sin((x+distance*.12)/57)*14);
      ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.fill();

      ctx.fillStyle = 'rgba(255,193,114,.18)';
      ctx.fillRect(0,233,W,12);

      ctx.strokeStyle = '#6a412d'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(0,GROUND-38); ctx.lineTo(W,GROUND-38); ctx.stroke();
      ctx.lineWidth = 7;
      for (let x=-(distance*.35%122);x<W+122;x+=122) {
        ctx.beginPath(); ctx.moveTo(x,GROUND-61); ctx.lineTo(x,GROUND-8); ctx.stroke();
      }

      ctx.fillStyle = '#45652f'; ctx.fillRect(0,GROUND-28,W,35);
      ctx.fillStyle = '#edf3dc';
      for (let x=-(distance*.5%86);x<W+60;x+=86) {
        ctx.beginPath(); ctx.arc(x+14,GROUND-18,4,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+20,GROUND-12,3,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+8,GROUND-12,3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#f5bfcc'; ctx.beginPath(); ctx.arc(x+36,GROUND-14,3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#edf3dc';
      }

      const pathGradient = ctx.createLinearGradient(0,GROUND,0,H);
      pathGradient.addColorStop(0,'#b57e4c');
      pathGradient.addColorStop(1,'#6c462f');
      ctx.fillStyle = pathGradient; ctx.fillRect(0,GROUND,W,H-GROUND);
      ctx.fillStyle = 'rgba(255,223,182,.14)';
      for (let x=-(distance%84);x<W+84;x+=84) {
        ctx.beginPath(); ctx.ellipse(x+18,GROUND+37,18,4,0,0,Math.PI*2); ctx.fill();
      }

      ctx.fillStyle = '#233924';
      for (let x=-(distance*1.1%48);x<W+50;x+=48) {
        ctx.beginPath();
        ctx.moveTo(x,H); ctx.lineTo(x+9,H-22); ctx.lineTo(x+18,H); ctx.lineTo(x+31,H-19); ctx.lineTo(x+40,H); ctx.fill();
      }
    }

    function drawShadow() {
      const lift = Math.max(0,GROUND-(dog.y+dog.h));
      const scale = Math.max(.5,1-lift/110);
      ctx.fillStyle = `rgba(0,0,0,${0.24*scale})`;
      ctx.beginPath(); ctx.ellipse(dog.x+dog.w/2+6,GROUND+3,24*scale,7.5*scale,0,0,Math.PI*2); ctx.fill();
    }

    function currentSprite() {
      if (over) return 'gameover';
      if (!running) return 'land';
      if (!dog.onGround) return dog.vy < -1.9 ? 'jump1' : 'jump2';
      if (dog.landTimer > 0) return 'land';
      return runFrames[Math.floor(dog.animTime/90)%runFrames.length];
    }

    function drawDog() {
      if (!assetsReady) return;
      const key = currentSprite();
      const img = sprites[key];
      if (!img) return;
      drawShadow();
      let drawW=126,drawH=82,ox=-18,oy=-16;
      if (key==='jump1'||key==='jump2') { drawW=128; drawH=84; ox=-17; oy=-20; }
      if (key==='land') { drawW=124; drawH=80; ox=-18; oy=-13; }
      if (key==='gameover') { drawW=132; drawH=76; ox=-24; oy=-8; }
      ctx.drawImage(img,dog.x+ox,dog.y+oy,drawW,drawH);
      if (running && dog.onGround && !over && dog.landTimer<=0 && Math.random()<.25) {
        particles.push({x:dog.x+14,y:GROUND-4,vx:-1-Math.random()*1.5,vy:-Math.random()*1.2,a:.44,r:2+Math.random()*4});
      }
    }

    function makeObstacle(type) {
      const defs = {log:[68,36],rock:[48,42],crate:[50,52],bush:[60,40],stump:[52,48],puddle:[86,24]};
      const [w,h] = defs[type];
      return {type,x:W+20,y:GROUND-h+6,w,h,passed:false};
    }

    function spawnObstacle() {
      const types = ['log','rock','crate','bush','stump','puddle'];
      obstacles.push(makeObstacle(types[Math.floor(Math.random()*types.length)]));
    }

    function drawObstacle(o) {
      ctx.save();
      if (o.type==='log') {
        const body=ctx.createLinearGradient(o.x,o.y,o.x,o.y+o.h);
        body.addColorStop(0,'#9a6339'); body.addColorStop(.48,'#754522'); body.addColorStop(1,'#4d2c18');
        ctx.fillStyle=body; rr(o.x,o.y+7,o.w,o.h-7,11); ctx.fill();
        ctx.strokeStyle='rgba(54,29,15,.72)'; ctx.lineWidth=2;
        for(let i=10;i<o.w-18;i+=13){ ctx.beginPath(); ctx.moveTo(o.x+i,o.y+11); ctx.quadraticCurveTo(o.x+i+4,o.y+18,o.x+i+1,o.y+o.h-5); ctx.stroke(); }
        const endG=ctx.createRadialGradient(o.x+o.w-12,o.y+o.h/2+3,2,o.x+o.w-12,o.y+o.h/2+3,13);
        endG.addColorStop(0,'#d2a06d'); endG.addColorStop(.55,'#a96f3e'); endG.addColorStop(1,'#6f4024');
        ctx.fillStyle=endG; ctx.beginPath(); ctx.arc(o.x+o.w-12,o.y+o.h/2+3,12,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(91,50,25,.65)'; ctx.lineWidth=1.5;
        for(const r of [5,8]){ ctx.beginPath(); ctx.arc(o.x+o.w-12,o.y+o.h/2+3,r,0,Math.PI*2); ctx.stroke(); }
        ctx.strokeStyle='#5a321b'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(o.x+16,o.y+13); ctx.lineTo(o.x+9,o.y+2); ctx.stroke();
        ctx.fillStyle='#4d7a34';
        ctx.beginPath(); ctx.ellipse(o.x+12,o.y+5,10,5,-.25,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#74a74c'; ctx.beginPath(); ctx.ellipse(o.x+22,o.y+7,6,3,.2,0,Math.PI*2); ctx.fill();
      } else if (o.type==='rock') {
        const rock=ctx.createLinearGradient(o.x,o.y,o.x+o.w,o.y+o.h);
        rock.addColorStop(0,'#9a9aa1'); rock.addColorStop(.5,'#6e6d75'); rock.addColorStop(1,'#4a4850');
        ctx.fillStyle=rock; ctx.beginPath();
        ctx.moveTo(o.x,o.y+o.h); ctx.lineTo(o.x+4,o.y+19); ctx.lineTo(o.x+16,o.y+5); ctx.lineTo(o.x+31,o.y+2); ctx.lineTo(o.x+44,o.y+14); ctx.lineTo(o.x+o.w,o.y+o.h); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.17)'; ctx.beginPath(); ctx.moveTo(o.x+12,o.y+18); ctx.lineTo(o.x+20,o.y+7); ctx.lineTo(o.x+31,o.y+5); ctx.lineTo(o.x+25,o.y+18); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='rgba(38,37,43,.65)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(o.x+30,o.y+13); ctx.lineTo(o.x+25,o.y+22); ctx.lineTo(o.x+31,o.y+27); ctx.lineTo(o.x+27,o.y+34); ctx.stroke();
        ctx.fillStyle='#4d713d'; ctx.beginPath(); ctx.ellipse(o.x+10,o.y+o.h-6,10,4,-.1,0,Math.PI*2); ctx.fill();
      } else if (o.type==='crate') {
        const wood=ctx.createLinearGradient(o.x,o.y,o.x+o.w,o.y+o.h);
        wood.addColorStop(0,'#b77a42'); wood.addColorStop(.55,'#915629'); wood.addColorStop(1,'#673817');
        ctx.fillStyle=wood; rr(o.x,o.y,o.w,o.h,4); ctx.fill();
        ctx.strokeStyle='#4a2b17'; ctx.lineWidth=3; ctx.strokeRect(o.x+3,o.y+3,o.w-6,o.h-6);
        ctx.strokeStyle='rgba(61,34,17,.55)'; ctx.lineWidth=1.4;
        for(let yy=o.y+14; yy<o.y+o.h-8; yy+=11){ ctx.beginPath(); ctx.moveTo(o.x+5,yy); ctx.lineTo(o.x+o.w-5,yy+1); ctx.stroke(); }
        ctx.strokeStyle='#563019'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(o.x+7,o.y+8); ctx.lineTo(o.x+o.w-7,o.y+o.h-8); ctx.moveTo(o.x+o.w-7,o.y+8); ctx.lineTo(o.x+7,o.y+o.h-8); ctx.stroke();
        ctx.fillStyle='#c8a67b';
        for(const [nx,ny] of [[8,8],[o.w-8,8],[8,o.h-8],[o.w-8,o.h-8]]){ ctx.beginPath(); ctx.arc(o.x+nx,o.y+ny,1.8,0,Math.PI*2); ctx.fill(); }
        ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fillRect(o.x+6,o.y+6,o.w-12,4);
      } else if (o.type==='bush') {
        ctx.strokeStyle='#31502c'; ctx.lineWidth=3;
        for(let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(o.x+o.w/2,o.y+o.h); ctx.lineTo(o.x+8+i*11,o.y+11+(i%2)*6); ctx.stroke(); }
        const blobs=[[13,23,15,'#355f31'],[27,14,17,'#42733a'],[42,23,16,'#2f592d'],[51,15,13,'#4d7d42'],[30,29,15,'#396a34']];
        for(const [bx,by,br,c] of blobs){ ctx.fillStyle=c; ctx.beginPath(); ctx.arc(o.x+bx,o.y+by,br,0,Math.PI*2); ctx.fill(); }
        ctx.fillStyle='#77a95b';
        for(let i=0;i<8;i++){ const lx=o.x+8+(i*7)%48, ly=o.y+8+((i*13)%22); ctx.beginPath(); ctx.ellipse(lx,ly,4.5,2.3,(i%3)*.5,0,Math.PI*2); ctx.fill(); }
        ctx.fillStyle='#eab0c7'; for(const [fx,fy] of [[18,14],[39,10],[48,26]]){ ctx.beginPath(); ctx.arc(o.x+fx,o.y+fy,2.5,0,Math.PI*2); ctx.fill(); }
      } else if (o.type==='stump') {
        const bark=ctx.createLinearGradient(o.x,o.y,o.x+o.w,o.y+o.h);
        bark.addColorStop(0,'#8b562f'); bark.addColorStop(.6,'#69401f'); bark.addColorStop(1,'#452714');
        ctx.fillStyle=bark; ctx.beginPath(); ctx.moveTo(o.x+8,o.y+8); ctx.lineTo(o.x+o.w-8,o.y+8); ctx.lineTo(o.x+o.w-4,o.y+o.h-5); ctx.lineTo(o.x+4,o.y+o.h-5); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#c58d58'; ctx.beginPath(); ctx.ellipse(o.x+o.w/2,o.y+8,o.w*.38,8,0,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#84532e'; ctx.lineWidth=1.5; for(const r of [7,13]){ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+8,r,r*.42,0,0,Math.PI*2);ctx.stroke();}
        ctx.strokeStyle='rgba(54,30,16,.6)'; ctx.lineWidth=2; for(let i=10;i<o.w-6;i+=11){ctx.beginPath();ctx.moveTo(o.x+i,o.y+16);ctx.lineTo(o.x+i-2,o.y+o.h-9);ctx.stroke();}
        ctx.fillStyle='#4d7838'; ctx.beginPath(); ctx.ellipse(o.x+9,o.y+o.h-5,12,4,-.2,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(o.x+o.w-8,o.y+o.h-5,10,4,.25,0,Math.PI*2); ctx.fill();
      } else if (o.type==='puddle') {
        // Deutlich sichtbare Wasserpfütze statt des dünnen Asts.
        // Sie sitzt flach auf dem Weg, bleibt aber als echtes Sprunghindernis spielbar.
        const water=ctx.createRadialGradient(o.x+o.w*.46,o.y+o.h*.55,3,o.x+o.w*.5,o.y+o.h*.55,o.w*.5);
        water.addColorStop(0,'#7ddcff');
        water.addColorStop(.42,'#3599dc');
        water.addColorStop(.78,'#1768a9');
        water.addColorStop(1,'#0d426f');
        ctx.fillStyle='rgba(72,47,31,.32)';
        ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h*.72,o.w*.5,o.h*.54,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=water;
        ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h*.60,o.w*.46,o.h*.47,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(190,238,255,.86)';ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(o.x+o.w*.39,o.y+o.h*.56,o.w*.19,o.h*.18,-.08,0,Math.PI*1.45);ctx.stroke();
        ctx.strokeStyle='rgba(108,194,238,.72)';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.ellipse(o.x+o.w*.64,o.y+o.h*.65,o.w*.16,o.h*.13,.08,Math.PI*.15,Math.PI*1.45);ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.72)';
        for(const [px,py,r] of [[.23,.46,2.2],[.69,.43,1.7],[.78,.65,1.3]]){ctx.beginPath();ctx.arc(o.x+o.w*px,o.y+o.h*py,r,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle='#7b674e';
        for(const [px,py,rx,ry,rot] of [[.08,.72,7,3,-.15],[.92,.70,6,2.6,.2]]){ctx.beginPath();ctx.ellipse(o.x+o.w*px,o.y+o.h*py,rx,ry,rot,0,Math.PI*2);ctx.fill();}
      }
      ctx.restore();
      if(o.type!=='puddle'){
        ctx.fillStyle='rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(o.x+o.w/2,GROUND+4,Math.max(14,o.w*.38),5,0,0,Math.PI*2); ctx.fill();
      }
    }

    function hit(o) {
      const ax=dog.x+19, ay=dog.y+10, aw=dog.w-36, ah=dog.h-16;
      return ax<o.x+o.w-5 && ax+aw>o.x+5 && ay<o.y+o.h && ay+ah>o.y+5;
    }

    function dust(count, strength) {
      for (let i=0;i<count;i++) particles.push({x:dog.x+28,y:GROUND-3,vx:-.8-Math.random()*strength,vy:-Math.random()*1.6,a:.42,r:2+Math.random()*3});
    }

    function drawHud() {
      ctx.fillStyle='rgba(10,12,18,.68)';rr(18,17,246,56,16);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='700 22px system-ui';ctx.fillText('Score: '+score,34,51);
      ctx.fillStyle='#f59e0b';ctx.fillText('Best: '+best,158,51);
    }

    function overlay(title, sub) {
      ctx.fillStyle='rgba(6,7,11,.50)';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='rgba(17,18,24,.92)';rr(W/2-220,H/2-68,440,136,22);ctx.fill();
      ctx.strokeStyle=opts.accent;ctx.lineWidth=2;ctx.stroke();
      ctx.textAlign='center';ctx.fillStyle=opts.accentHover;ctx.font='800 30px system-ui';ctx.fillText(title,W/2,H/2-10);
      ctx.fillStyle='#e5e7eb';ctx.font='16px system-ui';ctx.fillText(sub,W/2,H/2+26);ctx.textAlign='start';
    }

    function setBest(nextBest) {
      if (nextBest <= best) return;
      best = nextBest;
      storage.set(opts.bestScoreKey,best);
      if (typeof opts.onBestScore === 'function') opts.onBestScore(best);
    }

    function start() {
      if (!assetsReady || destroyed) return;
      cancelAnimationFrame(rafId);
      running=true;over=false;paused=false;score=0;milestone=0;distance=0;spawn=920;obstacles=[];particles=[];
      dog.x=120;dog.y=GROUND-dog.h;dog.vy=0;dog.onGround=true;dog.animTime=0;dog.landTimer=0;
      last=performance.now();
      if (wantMusic && audio && !document.hidden) audio.play().catch(()=>{});
      rafId=requestAnimationFrame(loop);
    }

    function jumpOrStart() {
      if (destroyed || !assetsReady) return;
      if (!running || over) { start(); return; }
      if (paused) return;
      if (dog.onGround) { dog.vy=-13.2;dog.onGround=false;dog.landTimer=0;dust(7,2.1); }
    }

    function endGame() {
      running=false;over=true;setBest(score);
      drawDog();drawHud();overlay('Lauf beendet',`Score ${score} · Best ${best} · Tippen zum Neustart`);
      if (typeof opts.onGameOver === 'function') opts.onGameOver({score,best});
    }

    function updateParticles(f) {
      for (const p of particles) {
        p.x+=p.vx*f;p.y+=p.vy*f;p.a-=.018*f;
        ctx.fillStyle=`rgba(234,210,172,${Math.max(0,p.a)})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      }
      particles=particles.filter(p=>p.a>0);
    }

    function loop(t) {
      if (!running || destroyed || paused) return;
      const dt=Math.min(34,t-last);last=t;const f=dt/16.667;const speed=5.1+Math.min(3.0,score*.075);
      distance+=speed*f;dog.animTime+=dt;dog.vy+=.54*f;dog.y+=dog.vy*f;
      if (dog.y+dog.h>=GROUND) {
        const wasAir=!dog.onGround;dog.y=GROUND-dog.h;dog.vy=0;dog.onGround=true;
        if (wasAir) { dog.landTimer=130;dust(4,1.6); }
      }
      if (dog.landTimer>0) dog.landTimer-=dt;
      spawn-=dt;
      if (spawn<=0) { spawnObstacle();spawn=1020+Math.random()*720-Math.min(210,score*4); }
      for(const o of obstacles) o.x-=speed*f;
      obstacles=obstacles.filter(o=>o.x+o.w>-24);

      drawWorld();
      for (const o of obstacles) {
        drawObstacle(o);
        if (!o.passed && o.x+o.w<dog.x) {
          o.passed=true;score++;setBest(score);
          if (typeof opts.onScore === 'function') opts.onScore({score,best});
          if (score%10===0) milestone=82;
        }
        if (hit(o)) { endGame(); return; }
      }
      updateParticles(f);drawDog();drawHud();
      if (milestone>0) { milestone-=f;ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.94)';ctx.font='800 22px system-ui';ctx.fillText(score+' geschafft!',W/2,92);ctx.textAlign='start'; }
      rafId=requestAnimationFrame(loop);
    }

    function renderStatic(message) {
      drawWorld();drawDog();drawHud();overlay('Snikkers Run',message || (assetsReady ? opts.startText : 'Snikkers lädt…'));
    }

    function onKeyDown(e) {
      if (e.code!=='Space') return;
      if (!root.contains(document.activeElement)) return;
      e.preventDefault();jumpOrStart();
    }
    function pauseForBackground() {
      if (audio && !audio.paused) audio.pause();
      if (running && !over && !paused) {
        paused=true;cancelAnimationFrame(rafId);renderStatic('Pausiert · tippen zum Fortsetzen');
      }
    }
    function onVisibility() {
      if (document.hidden) pauseForBackground();
    }
    function onPageHide() { pauseForBackground(); }
    function resumeIfPaused() {
      if (!paused || destroyed) return false;
      paused=false;running=true;last=performance.now();
      if (wantMusic && audio && !document.hidden) audio.play().catch(()=>{});
      rafId=requestAnimationFrame(loop);return true;
    }
    function stageAction(e) {
      if (e) {
        if (typeof e.button==='number' && e.pointerType==='mouse' && e.button!==0) return;
        e.preventDefault();
      }
      stage.focus({preventScroll:true});
      if (!resumeIfPaused()) jumpOrStart();
    }
    function preventStageContext(e) { e.preventDefault(); }
    function toggleMusic() {
      if (!audio) return;
      wantMusic=!wantMusic;updateMusicButton();
      if (wantMusic && running && !paused && !document.hidden) audio.play().catch(()=>{}); else audio.pause();
    }

    stage.addEventListener('pointerdown',stageAction,{passive:false});
    stage.addEventListener('contextmenu',preventStageContext);
    root.addEventListener('keydown',onKeyDown);
    musicBtn.addEventListener('click',toggleMusic);
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',onPageHide);

    renderStatic();

    return {
      start,
      reset() { running=false;over=false;paused=true;cancelAnimationFrame(rafId);if(audio) audio.pause();score=0;distance=0;obstacles=[];particles=[];dog.y=GROUND-dog.h;dog.vy=0;dog.onGround=true;renderStatic(); },
      pause() { if(audio) audio.pause(); if (running&&!over&&!paused){paused=true;cancelAnimationFrame(rafId);renderStatic('Pausiert · tippen zum Fortsetzen');} },
      getState() { return {running,over,paused,score,best}; },
      destroy() {
        if (destroyed) return;
        destroyed=true;cancelAnimationFrame(rafId);
        stage.removeEventListener('pointerdown',stageAction);
        stage.removeEventListener('contextmenu',preventStageContext);
        root.removeEventListener('keydown',onKeyDown);
        musicBtn.removeEventListener('click',toggleMusic);
        document.removeEventListener('visibilitychange',onVisibility);
        window.removeEventListener('pagehide',onPageHide);
        if (audio) { audio.pause();audio.src=''; }
        viewportFitter?.destroy?.();
        container.replaceChildren();
      }
    };
  }

  global.SnikkersRun = { mount };
})(window);
