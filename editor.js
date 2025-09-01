<script>
(async function () {
  const qs = new URLSearchParams(location.search);
  const EDIT = qs.get("edit") === "1";

  // Speicher-Keys, damit du lokal testen kannst
  const LS_SONGS = "ralf_songs_json";
  const LS_CATS  = "ralf_categories_json";

  // Helper
  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));

  async function loadJSON(path, lsKey) {
    try {
      const local = localStorage.getItem(lsKey);
      if (local) return JSON.parse(local);
    } catch (e) {}
    const r = await fetch(path + "?_=" + Date.now());
    if (!r.ok) throw new Error("Could not load " + path);
    return await r.json();
  }

  function download(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Daten laden (mit lokalem Override)
  let songsData = await loadJSON("/songs.json", LS_SONGS);
  let catsData  = await loadJSON("/categories.json", LS_CATS);

  // Seite benutzt evtl. globale Variablen – hier stellen wir sie bereit
  window.__RALF_SONGS__ = songsData;
  window.__RALF_CATEGORIES__ = catsData;

  // Falls deine bestehende Seite eine Render-Funktion hat, hier triggern (optional)
  if (typeof window.renderSite === "function") window.renderSite(songsData, catsData);

  if (!EDIT) return; // Editor nur im ?edit=1 Modus

  // Minimal-Styles
  const style = document.createElement("style");
  style.textContent = `
  .ralf-editor { position: fixed; inset: 60px 16px 16px 16px; background:#0b0b0b; color:#e5e5e5;
    border:1px solid #333; border-radius:12px; padding:12px; z-index:9999; overflow:auto; font:14px/1.4 system-ui,sans-serif;}
  .ralf-row { display:grid; grid-template-columns: 1fr 1fr 1fr 1fr 2fr 2fr 100px 80px; gap:8px; margin-bottom:8px; align-items:center;}
  .ralf-row input, .ralf-row select { width:100%; padding:6px; background:#141414; color:#e5e5e5; border:1px solid #444; border-radius:8px; }
  .ralf-toolbar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
  .ralf-btn { background:#222; color:#eee; border:1px solid #444; padding:8px 10px; border-radius:10px; cursor:pointer; }
  .ralf-btn.primary { background:#d96a00; border-color:#d96a00; color:#000; font-weight:700; }
  .ralf-h { font-weight:700; margin:12px 0 6px; }
  .muted { color:#aaa }
  .chip { display:inline-block; background:#222; border:1px solid #444; padding:4px 8px; border-radius:999px; margin-right:6px; }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "ralf-editor";
  wrap.innerHTML = `
    <div class="ralf-toolbar">
      <button class="ralf-btn" id="ralf-close">Editor schließen</button>
      <button class="ralf-btn" id="ralf-reset">Lokale Änderungen verwerfen</button>
      <button class="ralf-btn" id="ralf-apply">Änderungen lokal anwenden (Seite nutzt diese Daten)</button>
      <button class="ralf-btn primary" id="ralf-dl-songs">songs.json downloaden</button>
      <button class="ralf-btn" id="ralf-dl-cats">categories.json downloaden</button>
      <span class="muted">Tipp: Dateien anschließend auf GitHub ersetzen → Commit → Netlify deployed.</span>
    </div>

    <div class="ralf-h">Kategorien</div>
    <div id="cats"></div>
    <button class="ralf-btn" id="add-cat">Kategorie hinzufügen</button>

    <div class="ralf-h">Songs</div>
    <div class="muted" style="margin-bottom:6px">
      Vorhandene Kategorien:
      ${catsData.categories.map(c => `<span class="chip">${c.key}</span>`).join(" ")}
    </div>
    <div id="songs"></div>
    <button class="ralf-btn" id="add-song">Song hinzufügen</button>
  `;
  document.body.appendChild(wrap);

  function renderCats() {
    const host = $("#cats", wrap);
    host.innerHTML = "";
    catsData.categories.forEach((c, idx) => {
      const row = document.createElement("div");
      row.className = "ralf-row";
      row.innerHTML = `
        <input placeholder="key" value="${c.key ?? ""}">
        <input placeholder="label" value="${c.label ?? ""}">
        <input placeholder="cover (URL)" value="${c.cover ?? ""}">
        <div></div><div></div>
        <button class="ralf-btn" data-act="up">▲</button>
        <button class="ralf-btn" data-act="down">▼</button>
        <button class="ralf-btn" data-act="del">Löschen</button>
      `;
      const [key, label, cover] = row.querySelectorAll("input");
      key.oninput = () => (c.key = key.value);
      label.oninput = () => (c.label = label.value);
      cover.oninput = () => (c.cover = cover.value);
      row.querySelector('[data-act="del"]').onclick = () => { catsData.categories.splice(idx,1); renderCats(); };
      row.querySelector('[data-act="up"]').onclick = () => { if (idx>0) { const t=catsData.categories.splice(idx,1)[0]; catsData.categories.splice(idx-1,0,t); renderCats(); } };
      row.querySelector('[data-act="down"]').onclick = () => { if (idx<catsData.categories.length-1) { const t=catsData.categories.splice(idx,1)[0]; catsData.categories.splice(idx+1,0,t); renderCats(); } };
      host.appendChild(row);
    });
  }

  function renderSongs() {
    const host = $("#songs", wrap);
    host.innerHTML = "";
    songsData.songs.forEach((s, idx) => {
      const row = document.createElement("div");
      row.className = "ralf-row";
      row.innerHTML = `
        <input placeholder="id" value="${s.id ?? ""}">
        <input placeholder="title" value="${s.title ?? ""}">
        <input placeholder="artist" value="${s.artist ?? ""}">
        <select></select>
        <input placeholder="cover (URL)" value="${s.cover ?? ""}">
        <input placeholder="audio src (URL)" value="${s.src ?? ""}">
        <input type="number" placeholder="duration" value="${s.duration ?? 0}">
        <button class="ralf-btn" data-act="del">Löschen</button>
      `;
      const [id, title, artist, sel, cover, src, dur] = row.querySelectorAll("input, select");
      // Kategorien ins Select
      sel.innerHTML = catsData.categories.map(c => `<option value="${c.key}">${c.key}</option>`).join("");
      sel.value = s.category ?? "";
      id.oninput = () => (s.id = id.value);
      title.oninput = () => (s.title = title.value);
      artist.oninput = () => (s.artist = artist.value);
      sel.onchange = () => (s.category = sel.value);
      cover.oninput = () => (s.cover = cover.value);
      src.oninput = () => (s.src = src.value);
      dur.oninput = () => (s.duration = Number(dur.value||0));
      row.querySelector('[data-act="del"]').onclick = () => { songsData.songs.splice(idx,1); renderSongs(); };
      host.appendChild(row);
    });
  }

  // Buttons
  $("#add-cat", wrap).onclick = () => { catsData.categories.push({key:"NeueKategorie", label:"Neue Kategorie", cover:""}); renderCats(); };
  $("#add-song", wrap).onclick = () => { songsData.songs.push({id:"neuer-song", title:"Neuer Song", artist:"R.A.L.F.", category: catsData.categories[0]?.key || "Other", cover:"", src:"", duration:0}); renderSongs(); };

  $("#ralf-dl-songs", wrap).onclick = () => download("songs.json", songsData);
  $("#ralf-dl-cats",  wrap).onclick = () => download("categories.json", catsData);

  $("#ralf-apply", wrap).onclick = () => {
    localStorage.setItem(LS_SONGS, JSON.stringify(songsData));
    localStorage.setItem(LS_CATS,  JSON.stringify(catsData));
    alert("Lokale Änderungen gespeichert. Seite nutzt jetzt die lokalen Daten.");
    if (typeof window.renderSite === "function") window.renderSite(songsData, catsData);
  };

  $("#ralf-reset", wrap).onclick = () => {
    localStorage.removeItem(LS_SONGS);
    localStorage.removeItem(LS_CATS);
    location.reload();
  };

  $("#ralf-close", wrap).onclick = () => { wrap.remove(); };

  // initial render
  renderCats();
  renderSongs();
})();
</script>
