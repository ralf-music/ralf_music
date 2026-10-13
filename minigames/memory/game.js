(() => {
  'use strict';

  const boardEl = document.getElementById('board');
  const boardWrap = document.getElementById('boardWrap');
  const hudEl = document.getElementById('hud');
  const levelSelect = document.getElementById('levelSelect');
  const subtitleEl = document.getElementById('subtitle');
  const hintEl = document.getElementById('hint');
  const pairsEl = document.getElementById('pairs');
  const movesEl = document.getElementById('moves');
  const timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best');
  const newGameBtn = document.getElementById('newGameBtn');
  const againBtn = document.getElementById('againBtn');
  const finishPanel = document.getElementById('finishPanel');
  const finishTitle = document.getElementById('finishTitle');
  const finishText = document.getElementById('finishText');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const musicBtn = document.getElementById('musicBtn');
  const gameCard = document.getElementById('gameCard');

  const LEVELS = {
    '5x4': { key:'5x4', cols:5, rows:4, pairs:10, fields:20, joker:false, label:'5 × 4' },
    '5x5': { key:'5x5', cols:5, rows:5, pairs:12, fields:25, spacer:true, label:'5 × 5' },
    '5x6': { key:'5x6', cols:5, rows:6, pairs:15, fields:30, joker:false, label:'5 × 6' }
  };
  const MISMATCH_DELAY = 820;
  const IMAGE_POOL = Array.from({length: 31}, (_, i) => `assets/memory/snikkers${String(i + 1).padStart(2,'0')}.jpg`);

  let level = null;
  let cards = [];
  let firstCard = null;
  let secondCard = null;
  let locked = false;
  let matchedPairs = 0;
  let moves = 0;
  let startedAt = null;
  let elapsedMs = 0;
  let timerId = null;
  let finished = false;
  let pseudoFullscreen = false;
  let fitFrame = 0;

  // Soft generative pentatonic Memory theme. No external audio file required.
  let musicWanted = true;
  let audioCtx = null;
  let musicTimer = null;
  let noteStep = 0;
  const THEME_NOTES = [293.66, 392.00, 440.00, 523.25, 440.00, 392.00, 329.63, 293.66, 261.63, 329.63, 392.00, 440.00];

  function updateMusicButton(){
    if(!musicBtn) return;
    musicBtn.textContent = musicWanted ? '♪ AN' : '♪ AUS';
    musicBtn.setAttribute('aria-pressed', musicWanted ? 'true' : 'false');
    musicBtn.setAttribute('aria-label', musicWanted ? 'Musik ausschalten' : 'Musik einschalten');
  }

  function createAudioContext(){
    if(audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function playSoftTone(freq, when, duration=2.6, volume=.026){
    const ctx = createAudioContext();
    if(!ctx || !musicWanted) return;
    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    harmonic.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    harmonic.frequency.setValueAtTime(freq * 2, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1450, when);
    filter.Q.setValueAtTime(.35, when);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + .055);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    osc.connect(filter);
    harmonic.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when); harmonic.start(when);
    osc.stop(when + duration + .05); harmonic.stop(when + duration + .05);
  }

  function playThemeStep(){
    if(!musicWanted || !audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime + .03;
    const freq = THEME_NOTES[noteStep % THEME_NOTES.length];
    playSoftTone(freq, now, 2.4, .022);
    // Quiet lower support every fourth note keeps it calm rather than melodic-busy.
    if(noteStep % 4 === 0) playSoftTone(freq / 2, now, 3.4, .010);
    noteStep++;
  }

  async function ensureMusic(){
    if(!musicWanted) return;
    const ctx = createAudioContext();
    if(!ctx) return;
    try{ if(ctx.state === 'suspended') await ctx.resume(); }catch{}
    if(ctx.state !== 'running') return;
    if(!musicTimer){
      playThemeStep();
      musicTimer = window.setInterval(playThemeStep, 1450);
    }
  }

  function pauseMusic(){
    if(musicTimer){ clearInterval(musicTimer); musicTimer = null; }
    if(audioCtx && audioCtx.state === 'running'){ try{ audioCtx.suspend(); }catch{} }
  }

  function stopMusicCompletely(){
    if(musicTimer){ clearInterval(musicTimer); musicTimer = null; }
    if(audioCtx){ try{ audioCtx.close(); }catch{} audioCtx = null; }
  }

  function shuffle(array){
    const a = [...array];
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function formatTime(ms){
    const total = Math.floor(ms/1000);
    const min = Math.floor(total/60);
    const sec = total%60;
    return `${min}:${String(sec).padStart(2,'0')}`;
  }

  function bestKey(type){
    return `snikkers_memory_${type}_v2_${level ? level.key : '5x4'}`;
  }

  function getBestTime(){
    if(!level) return null;
    let value = Number(localStorage.getItem(bestKey('best_time')) || 0);
    if(!value && level.key === '5x4') value = Number(localStorage.getItem('snikkers_memory_best_time_v1') || 0);
    return value > 0 ? value : null;
  }

  function getBestMoves(){
    if(!level) return null;
    let value = Number(localStorage.getItem(bestKey('best_moves')) || 0);
    if(!value && level.key === '5x4') value = Number(localStorage.getItem('snikkers_memory_best_moves_v1') || 0);
    return value > 0 ? value : null;
  }

  function updateHud(){
    if(!level) return;
    pairsEl.textContent = `${matchedPairs} / ${level.pairs}`;
    movesEl.textContent = String(moves);
    const nowElapsed = startedAt && !finished ? performance.now()-startedAt : elapsedMs;
    timeEl.textContent = formatTime(nowElapsed);
    const bt = getBestTime();
    const bm = getBestMoves();
    bestEl.textContent = bt ? `${formatTime(bt)} · ${bm ?? '–'} Z.` : '–';
  }

  function startTimerIfNeeded(){
    if(startedAt || finished) return;
    startedAt = performance.now();
    timerId = window.setInterval(updateHud, 250);
  }

  function stopTimer(){
    if(startedAt && !finished) elapsedMs = performance.now()-startedAt;
    if(timerId){ clearInterval(timerId); timerId = null; }
  }

  function createDeck(){
    const chosen = shuffle(IMAGE_POOL).slice(0, level.pairs);
    const doubled = shuffle(chosen.flatMap((src, pairId) => [
      {type:'pair', pairId, src, uid:`${pairId}-a`},
      {type:'pair', pairId, src, uid:`${pairId}-b`}
    ]));

    if(level.spacer){
      doubled.splice(Math.floor(level.fields / 2), 0, {type:'spacer', uid:'spacer'});
    }
    return doubled;
  }

  function getBoardLayout(){
    const viewport = window.OMDGameViewport?.getViewportSize?.() || {
      width: window.innerWidth || document.documentElement.clientWidth || 1,
      height: window.innerHeight || document.documentElement.clientHeight || 1
    };
    const landscape = viewport.width >= viewport.height;
    if(level?.key === '5x6' && landscape){
      return { cols:6, rows:5, landscape:true };
    }
    return { cols:level?.cols || 5, rows:level?.rows || 4, landscape };
  }

  function applyBoardLayout(){
    if(!level) return getBoardLayout();
    const layout = getBoardLayout();
    boardEl.style.gridTemplateColumns = `repeat(${layout.cols},minmax(0,1fr))`;
    boardEl.dataset.cols = String(layout.cols);
    boardEl.dataset.rows = String(layout.rows);
    return layout;
  }

  function renderBoard(){
    boardEl.innerHTML = '';
    applyBoardLayout();

    cards.forEach(card => {
      if(card.type === 'spacer'){
        const spacer = document.createElement('div');
        spacer.className = 'spacer-card';
        spacer.setAttribute('aria-hidden','true');
        boardEl.appendChild(spacer);
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'memory-card';
      btn.type = 'button';
      btn.dataset.uid = card.uid;
      btn.dataset.pairId = String(card.pairId);
      btn.setAttribute('aria-label','Memory-Karte');
      btn.innerHTML = `
        <span class="card-inner">
          <span class="card-face card-back" aria-hidden="true"></span>
          <span class="card-face card-front"><img src="${card.src}" alt="Memory-Motiv" draggable="false"></span>
        </span>`;
      btn.addEventListener('click', () => flipCard(btn));
      boardEl.appendChild(btn);
    });
    scheduleBoardFit();
  }

  function flipCard(cardEl){
    ensureMusic();
    if(locked || finished || cardEl.classList.contains('is-flipped') || cardEl.classList.contains('is-matched')) return;
    startTimerIfNeeded();
    cardEl.classList.add('is-flipped');

    if(!firstCard){
      firstCard = cardEl;
      return;
    }

    secondCard = cardEl;
    moves++;
    updateHud();

    const match = firstCard.dataset.pairId === secondCard.dataset.pairId;
    if(match){
      firstCard.classList.add('is-matched');
      secondCard.classList.add('is-matched');
      firstCard.disabled = true;
      secondCard.disabled = true;
      firstCard = null;
      secondCard = null;
      matchedPairs++;
      updateHud();
      if(matchedPairs >= level.pairs) finishGame();
      return;
    }

    locked = true;
    const a = firstCard;
    const b = secondCard;
    window.setTimeout(() => {
      a.classList.remove('is-flipped');
      b.classList.remove('is-flipped');
      firstCard = null;
      secondCard = null;
      locked = false;
    }, MISMATCH_DELAY);
  }

  function finishGame(){
    stopTimer();
    finished = true;
    elapsedMs = startedAt ? performance.now()-startedAt : elapsedMs;

    const oldBestTime = getBestTime();
    const oldBestMoves = getBestMoves();
    if(!oldBestTime || elapsedMs < oldBestTime) localStorage.setItem(bestKey('best_time'), String(Math.round(elapsedMs)));
    if(!oldBestMoves || moves < oldBestMoves) localStorage.setItem(bestKey('best_moves'), String(moves));

    updateHud();
    finishTitle.textContent = 'GESCHAFFT!';
    finishText.textContent = `${level.label} · ${formatTime(elapsedMs)} · ${moves} Züge`;
    finishPanel.classList.remove('hidden');
  }

  function resetRound(){
    if(timerId){ clearInterval(timerId); timerId = null; }
    cards = createDeck();
    firstCard = null;
    secondCard = null;
    locked = false;
    matchedPairs = 0;
    moves = 0;
    startedAt = null;
    elapsedMs = 0;
    finished = false;
    finishPanel.classList.add('hidden');
    renderBoard();
    updateHud();
  }

  function startLevel(levelKey){
    ensureMusic();
    level = LEVELS[levelKey] || LEVELS['5x4'];
    levelSelect.classList.add('hidden');
    hudEl.classList.remove('hidden');
    boardWrap.classList.remove('hidden');
    hintEl.classList.remove('hidden');
    subtitleEl.textContent = `Finde alle ${level.pairs} Paare.`;
    hintEl.textContent = level.spacer
      ? `${level.fields} Felder · ${level.pairs} Paare · leere Mitte ohne Karte`
      : level.key === '5x6'
        ? `${level.fields} Karten · ${level.pairs} Paare · Hochformat 5×6 / Querformat 6×5`
        : `${level.fields} Karten · ${level.pairs} zufällige Paare aus dem Bilderpool`;
    resetRound();
    scheduleBoardFit();
  }

  function showLevelSelect(){
    stopTimer();
    level = null;
    cards = [];
    firstCard = null;
    secondCard = null;
    locked = false;
    finished = false;
    boardEl.innerHTML = '';
    finishPanel.classList.add('hidden');
    hudEl.classList.add('hidden');
    boardWrap.classList.add('hidden');
    hintEl.classList.add('hidden');
    levelSelect.classList.remove('hidden');
    subtitleEl.textContent = 'Wähle deine Spielfeldgröße.';
    scheduleBoardFit();
  }

  function fitBoard(){
    if(!level || boardWrap.classList.contains('hidden')) return;
    const viewport = window.OMDGameViewport?.getViewportSize?.() || {
      width: window.innerWidth || document.documentElement.clientWidth || 1,
      height: window.innerHeight || document.documentElement.clientHeight || 1
    };
    const rect = boardWrap.getBoundingClientRect();
    const availableWidth = Math.max(1, rect.width || viewport.width);
    const layout = applyBoardLayout();
    const landscape = layout.landscape;
    const fullscreen = pseudoFullscreen || document.fullscreenElement === gameCard || document.webkitFullscreenElement === gameCard;

    let availableHeight;
    if(fullscreen){
      availableHeight = Math.max(1, rect.height || (viewport.height - 120));
    }else if(landscape){
      availableHeight = Math.max(1, viewport.height - 20);
    }else{
      availableHeight = Number.POSITIVE_INFINITY;
    }

    const gap = parseFloat(getComputedStyle(boardEl).gap) || 0;
    const gapW = gap * (layout.cols - 1);
    const gapH = gap * (layout.rows - 1);
    const widthFromHeight = Number.isFinite(availableHeight)
      ? Math.max(1, ((availableHeight - gapH) / layout.rows) * layout.cols + gapW)
      : 590;
    const cap = fullscreen ? 720 : 590;
    const target = Math.max(1, Math.floor(Math.min(availableWidth, widthFromHeight, cap)));
    document.documentElement.style.setProperty('--memory-board-max', `${target}px`);
  }

  function scheduleBoardFit(){
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitBoard);
    [60,180,360,700].forEach(delay => setTimeout(fitBoard, delay));
  }

  async function requestNativeFullscreen(){
    try{
      const fn = gameCard.requestFullscreen || gameCard.webkitRequestFullscreen;
      if(fn) await fn.call(gameCard);
    }catch{}
  }

  async function leaveNativeFullscreen(){
    try{
      if(document.fullscreenElement || document.webkitFullscreenElement){
        const fn = document.exitFullscreen || document.webkitExitFullscreen;
        if(fn) await fn.call(document);
      }
    }catch{}
  }

  function updateFullscreenButton(){
    const active = pseudoFullscreen || document.fullscreenElement===gameCard || document.webkitFullscreenElement===gameCard;
    fullscreenBtn.textContent = active ? '⤢' : '⛶';
    fullscreenBtn.setAttribute('aria-label', active ? 'Vollbild verlassen' : 'Vollbild einschalten');
    fullscreenBtn.title = active ? 'Vollbild verlassen' : 'Vollbild';
    scheduleBoardFit();
  }

  if(musicBtn){
    musicBtn.addEventListener('click', async () => {
      musicWanted = !musicWanted;
      updateMusicButton();
      if(musicWanted) await ensureMusic();
      else pauseMusic();
    });
  }
  updateMusicButton();

  fullscreenBtn.addEventListener('click', async () => {
    const active = pseudoFullscreen || document.fullscreenElement===gameCard || document.webkitFullscreenElement===gameCard;
    if(active){
      pseudoFullscreen = false;
      gameCard.classList.remove('is-fullscreen');
      await leaveNativeFullscreen();
    }else{
      pseudoFullscreen = true;
      gameCard.classList.add('is-fullscreen');
      await requestNativeFullscreen();
    }
    updateFullscreenButton();
  });

  document.addEventListener('fullscreenchange', () => {
    if(!document.fullscreenElement && pseudoFullscreen) gameCard.classList.add('is-fullscreen');
    updateFullscreenButton();
  });
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

  document.addEventListener('visibilitychange', () => {
    if(document.hidden){
      if(startedAt && !finished) elapsedMs = performance.now()-startedAt;
      pauseMusic();
    }else if(musicWanted){
      ensureMusic();
    }
  });

  window.addEventListener('resize', scheduleBoardFit, {passive:true});
  window.addEventListener('orientationchange', scheduleBoardFit, {passive:true});
  if(window.visualViewport) window.visualViewport.addEventListener('resize', scheduleBoardFit, {passive:true});

  levelSelect.addEventListener('click', event => {
    const button = event.target.closest('[data-level]');
    if(button) startLevel(button.dataset.level);
  });
  newGameBtn.addEventListener('click', showLevelSelect);
  againBtn.addEventListener('click', () => level ? resetRound() : showLevelSelect());

  window.addEventListener('pagehide', stopMusicCompletely, {once:true});
  showLevelSelect();
})();
