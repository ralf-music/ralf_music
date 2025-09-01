(async function () {
  const EDIT = new URLSearchParams(location.search).get("edit") === "1";
  const LS_SONGS = "ralf_songs_json";
  const LS_CATS  = "ralf_categories_json";
  const $ = (s,p=document)=>p.querySelector(s);

  async function loadJSON(path, lsKey) {
    try {
      const local = localStorage.getItem(lsKey);
      if (local) return JSON.parse(local);
    } catch(e){}
    const r = await fetch(path + "?_=" + Date.now());
    if (!r.ok) throw new Error("Load failed: " + path);
    return await r.json();
  }
  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  // Daten laden (mit LocalStorage-Override)
  let songsData = await loadJSON("/songs.json", LS_SONGS);
  let catsData  = await loadJSON("/categories.json", LS_CATS);

  // Seite aktualisieren, falls deine index.html window.renderSite anbietet
  if (typeof window.renderSite === "function") {
    window.renderSite(songsData, catsData);
  }

  if (!EDIT) return;

  // Styles
  const style = document.createElement("style");
  style.textContent = `
  .ralf-ed {position:fixed; left:12px; right:12px; top:64px; bottom:12px; background:#0b0b0b; color:#eaeaea;
    border:1px solid #333; border-radius:12px; z-index:9999; padding:12px; overflow:auto; font:14px/1.45 system-ui,sans-serif;}
  .ed-bar {display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;}
  .btn {background:#222; color:#eee; border:1px solid #444; padding:8px 10px; border-radius:10px; cursor:pointer}
  .btn.primary{background:#ff8a1f; color:#000; border-color:#ff8a1f; font-weight:700}
  .grid {display:grid; gap:8px}
  .row  {display:grid; grid-template-columns: 1.1fr 1.1fr 1.1fr 1.1fr 2fr 2fr 120px 90px; gap:8px; align-items:center}
  .row input, .row select {width:100%; padding:6px 8px; border:1px solid #444; border-radius:8px; background:#141414; color:#eee}
  .h {font-weight:700; margin:10px 0 6px}
  .chip{display:inline-block; padding:3px 8px; border-radius:999px; border:1px solid #444; background:#1a1a1a; margin-right:6px; font-size:12px}
  .cards{display:grid; grid-template-columns: 1fr; gap:8px}
  .muted{color:#aaa}
  `;
  document.head.appendChild(style);

  // UI
  const wrap = document.createElement("div");
  wrap.className = "ralf-ed";
  wrap.innerHTML = `
    <div class="ed-bar">
      <button class="btn" id="ed-close">Editor schließen</button>
      <button class="btn" id="ed-reset">Lokale Änderungen verwerfen</button>
      <button class="btn" id="ed-apply">Änderungen lokal anwenden</button>
      <button class="btn primary" id="ed-dl-songs">songs.json downloaden</button>
      <button class="btn" id="ed-dl-cats">categories.json downloaden</button>
      <span class="muted">Nach Download: Dateien in GitHub ersetzen → Commit → Netlify deployed.</span>
    </div>

    <div class="h">Kategorien</div>
    <div id="cats" class="cards"></div>
    <button class="btn" id="add-cat">Kategorie hinzufügen</button>

    <div class="h">Songs</div>
    <div class="muted" style="margin-bottom:6px">
      Vorhandene Kategorien:
      <span id="cat-list"></span>
    </div>
    <div id="songs" class="cards"></div>
    <button class="btn" id="add-song">Song hinzufügen</button>
  `;
  document.body.appendChild(wrap);

  function renderCatListChipline() {
    $("#cat-list", wrap).innerHTML =
      (catsData.categories||[]).map(c=>`<span class="chip">${c.key}</span>`).join(" ");
  }

  function renderCats() {
    const host = $("#cats", wrap);
    host.innerHTML = "";
    (catsData.categories||[]).forEach((c, idx) => {
      const card = document.createElement("div");
      card.className = "row";
      card.innerHTML = `
        <input placeholder="key" value="${c.key??""}">
        <input placeholder="label" value="${c.label??""}">
        <input placeholder="cover (URL)" value="${c.cover??""}">
        <div></div>
        <div></div>
        <div></div>
        <button class="btn" data-act="up">▲</button>
        <button class="btn" data-act="down">▼</button>
        <button class="btn" data-act="del">Löschen</button>
      `;
      const [key,label,cover] = card.querySelectorAll("input");
      key.oninput   = ()=>c.key   = key.value.trim();
      label.oninput = ()=>c.label = label.value;
      cover.oninput = ()=>c.cover = cover.value;

      card.querySelector('[data-act="del"]').onclick  = ()=>{ catsData.categories.splice(idx,1); renderCats(); renderCatListChipline(); };
      card.querySelector('[data-act="up"]').onclick   = ()=>{ if(idx>0){ const t=catsData.categories.splice(idx,1)[0]; catsData.categories.splice(idx-1,0,t); renderCats(); renderCatListChipline(); } };
      card.querySelector('[data-act="down"]').onclick = ()=>{ if(idx<catsData.categories.length-1){ const t=catsData.categories.splice(idx,1)[0]; catsData.categories.splice(idx+1,0,t); renderCats(); renderCatListChipline(); } };

      host.appendChild(card);
    });
  }

  function renderSongs() {
    const host = $("#songs", wrap);
    host.innerHTML = "";
    (songsData.songs||[]).forEach((s, idx) => {
      const card = document.createElement("div");
      card.className = "row";
      card.innerHTML = `
        <input placeholder="id" value="${s.id??""}">
        <input placeholder="title" value="${s.title??""}">
        <input placeholder="artist" value="${s.artist??""}">
        <select></select>
        <input placeholder="cover (URL)" value="${s.cover??""}">
        <input placeholder="audio src (URL)" value="${s.src??""}">
        <input type="number" placeholder="duration (Sek.)" value="${Number(s.duration||0)}">
        <button class="btn" data-act="del">Löschen</button>
      `;
      const [id,title,artist,sel,cover,src,dur] = card.querySelectorAll("input, select");

      // Kategorien ins Select
      sel.innerHTML = (catsData.categories||[]).map(c=>`<option value="${c.key}">${c.key}</option>`).join("");
      sel.value = s.category ?? "";

      id.oninput    = ()=>s.id = id.value.trim();
      title.oninput = ()=>s.title = title.value;
      artist.oninput= ()=>s.artist = artist.value;
      sel.onchange  = ()=>s.category = sel.value;
      cover.oninput = ()=>s.cover = cover.value;
      src.oninput   = ()=>s.src = src.value;
      dur.oninput   = ()=>s.duration = Number(dur.value||0);

      card.querySelector('[data-act="del"]').onclick = ()=>{ songsData.songs.splice(idx,1); renderSongs(); };

      host.appendChild(card);
    });
  }

  // Buttons
  $("#add-cat", wrap).onclick  = ()=>{ (catsData.categories ||= []).push({key:"NeueKategorie", label:"Neue Kategorie", cover:""}); renderCats(); renderCatListChipline(); };
  $("#add-song", wrap).onclick = ()=>{ (songsData.songs ||= []).push({id:"neuer-song", title:"Neuer Song", artist:"R.A.L.F.", category:(catsData.categories?.[0]?.key)||"Other", cover:"", src:"", duration:0}); renderSongs(); };

  $("#ed-dl-songs", wrap).onclick = ()=>download("songs.json", songsData);
  $("#ed-dl-cats",  wrap).onclick = ()=>download("categories.json", catsData);

  $("#ed-apply", wrap).onclick = ()=>{
    localStorage.setItem(LS_SONGS, JSON.stringify(songsData));
    localStorage.setItem(LS_CATS,  JSON.stringify(catsData));
    alert("Lokale Änderungen gespeichert. Seite nutzt jetzt die lokalen Daten.");
    if (typeof window.renderSite === "function") window.renderSite(songsData, catsData);
  };
  $("#ed-reset", wrap).onclick = ()=>{
    localStorage.removeItem(LS_SONGS);
    localStorage.removeItem(LS_CATS);
    location.reload();
  };
  $("#ed-close", wrap).onclick = ()=>wrap.remove();

  // initial
  renderCatListChipline();
  renderCats();
  renderSongs();
})();
