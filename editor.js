/* === R.A.L.F. Editor v4.3 ===
   Neu seit 4.3:
   - addedAt wird automatisch gesetzt:
       * MP3-Importer: neuer Eintrag => addedAt = now(); bestehender Eintrag behält sein addedAt
       * "+ Neuer Song": addedAt = now()
   - Songs-Editor: editierbare Spalte "addedAt" (ISO-String)
   - Einheitliche Version über EDITOR_VERSION
*/

(function () {
  // ---------- Version ----------
  const EDITOR_VERSION = "4.3";
  window.EDITOR_VERSION = EDITOR_VERSION;

  // ---------- State absichern ----------
  if (!window.state || typeof window.state !== "object") window.state = {};
  if (!Array.isArray(window.state.songs))      window.state.songs = [];
  if (!Array.isArray(window.state.categories)) window.state.categories = [];

  const STD_COVER = "https://github.com/ralf-music/ralf_music/blob/main/assets/logo-kategorie.png?raw=true";
  const DEFAULT_ARTIST = "R.A.L.F.";

  // ---------- Draft & Render ----------
  const saveDraftSongs = () =>
    localStorage.setItem("ralf_songs_json", JSON.stringify({ songs: state.songs }, null, 2));
  const saveDraftCats = () =>
    localStorage.setItem("ralf_categories_json", JSON.stringify({ categories: state.categories }, null, 2));

  // Live-Refresh falls vorhanden
  const rerender = () => {
    if (typeof window.render === "function") window.render();
    else if (typeof window.renderSite === "function") window.renderSite(state.songs, state.categories);
  };

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const stripExt = (name) => String(name || "").replace(/\.[^.]+$/, "");
  const nowISO = () => new Date().toISOString();

  // ID aus Dateiname
  function idFromFilename(name) {
    const base = stripExt(name);
    return base
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }
  // ID aus Titel
  function idFromTitle(title) {
    return String(title || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]+/g, "")
      .replace(/_+/g, "_")
      .toLowerCase();
  }
  // Titel aus Dateiname
  function titleFromFilename(name) {
    const base = stripExt(name).replace(/_/g, " ").trim();
    return base.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
  }

  function downloadFile(name, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function duplicateIds(songs) {
    const seen = new Map(); // id -> count
    for (const s of songs) {
      const id = String(s.id || "").trim();
      if (!id) continue;
      seen.set(id, (seen.get(id) || 0) + 1);
    }
    return [...seen.entries()].filter(([,count]) => count > 1).map(([id]) => id);
  }

  // ---------- Toolbar ----------
  const panel = document.createElement("div");
  panel.className = "fixed top-4 right-4 bg-neutral-900 text-white p-4 rounded-lg shadow-xl z-50 flex flex-col gap-2 ring-1 ring-white/10";
  panel.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="text-xs px-2 py-0.5 rounded bg-orange-600">EDIT</span>
      <span class="text-xs text-neutral-300">v${EDITOR_VERSION}</span>
    </div>
    <div class="grid grid-cols-1 gap-2">
      <button id="btnSongs"     class="bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded">Songs verwalten</button>
      <button id="btnCats"      class="bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded">Kategorien verwalten</button>
      <button id="btnMp3"       class="bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded">MP3 importieren</button>
      <div class="h-[1px] bg-white/10 my-1"></div>
      <button id="btnSave"      class="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded">Songs speichern (JSON)</button>
      <button id="btnSaveCats"  class="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded">Kategorien speichern (JSON)</button>
      <button id="btnDiscard"   class="bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded">Entwürfe verwerfen</button>
    </div>
  `;
  document.body.appendChild(panel);

  $("#btnSongs").onclick = openSongEditor;
  $("#btnCats").onclick  = openCategoryEditor;
  $("#btnMp3").onclick   = openMp3Importer;

  $("#btnSave").onclick = () => {
    const dups = duplicateIds(state.songs);
    if (dups.length) {
      alert("Duplikate gefunden (IDs):\n\n" + dups.join("\n") + "\n\nBitte korrigieren, bevor du speicherst.");
      return;
    }
    downloadFile("songs.json", JSON.stringify({ songs: state.songs }, null, 2));
    alert("Songs gespeichert – JSON im Repo ersetzen.");
  };
  $("#btnSaveCats").onclick = () => {
    downloadFile("categories.json", JSON.stringify({ categories: state.categories }, null, 2));
    alert("Kategorien gespeichert – JSON im Repo ersetzen.");
  };
  $("#btnDiscard").onclick = () => {
    if (!confirm("Entwürfe verwerfen? (lokale Drafts werden gelöscht)")) return;
    localStorage.removeItem("ralf_songs_json");
    localStorage.removeItem("ralf_categories_json");
    location.reload();
  };

  // ---------- Modal Helper ----------
  function makeModal(title, withApply) {
    const wrap = document.createElement("div");
    wrap.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50";
    wrap.innerHTML = `
      <div class="bg-neutral-900 p-6 rounded-lg w-[96%] max-w-6xl ring-1 ring-white/10">
        <div class="flex items-center justify-between">
          <h3 class="font-bold">${title}</h3>
          <button class="close text-sm px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Schließen</button>
        </div>
        <div class="content mt-4 max-h-[70vh] overflow-auto pr-1"></div>
        <div class="mt-5 flex justify-end gap-2">
          ${withApply ? `<button class="apply bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded">Übernehmen</button>` : ""}
          <button class="close bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded">Schließen</button>
        </div>
      </div>`;
    wrap.querySelectorAll(".close").forEach(b => b.onclick = () => wrap.remove());
    document.body.appendChild(wrap);
    return wrap;
  }

  // ---------- Kategorien-Editor ----------
  function openCategoryEditor() {
    const modal = makeModal("Kategorien verwalten", true);
    const content = modal.querySelector(".content");

    const table = document.createElement("table");
    table.className = "w-full text-sm";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    trh.className = "text-left text-neutral-400";
    ["Key","Label","Cover-URL","Aktion"].forEach((h,i)=>{
      const th = document.createElement("th");
      th.className = `py-2 ${i<2?"pr-2": i===2?"pr-2": "pl-2"} ${i===0?"w-40": i===1?"w-48": i===3?"w-28":""}`;
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");

    state.categories.forEach((c, i) => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-white/10";

      const tdKey = document.createElement("td");
      tdKey.className = "py-2 pr-2";
      const inKey = document.createElement("input");
      inKey.className = "w-full px-2 py-1 rounded bg-neutral-800";
      inKey.value = c.key || "";
      inKey.placeholder = "key";
      inKey.oninput = e => state.categories[i].key = e.target.value.trim();
      tdKey.appendChild(inKey);

      const tdLabel = document.createElement("td");
      tdLabel.className = "py-2 pr-2";
      const inLabel = document.createElement("input");
      inLabel.className = "w-full px-2 py-1 rounded bg-neutral-800";
      inLabel.value = c.label || "";
      inLabel.placeholder = "Label";
      inLabel.oninput = e => state.categories[i].label = e.target.value.trim();
      tdLabel.appendChild(inLabel);

      const tdCover = document.createElement("td");
      tdCover.className = "py-2 pr-2";
      const inCover = document.createElement("input");
      inCover.className = "w-full px-2 py-1 rounded bg-neutral-800";
      inCover.value = c.cover || STD_COVER;
      inCover.placeholder = "Cover-URL";
      inCover.oninput = e => state.categories[i].cover = (e.target.value.trim() || STD_COVER);
      tdCover.appendChild(inCover);

      const tdAct = document.createElement("td");
      tdAct.className = "py-2 pl-2";
      const del = document.createElement("button");
      del.className = "bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-sm";
      del.textContent = "Löschen";
      del.onclick = () => { state.categories.splice(i, 1); tr.remove(); };
      tdAct.appendChild(del);

      tr.append(tdKey, tdLabel, tdCover, tdAct);
      tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    const add = document.createElement("button");
    add.textContent = "+ Neue Kategorie";
    add.className = "mt-3 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded";
    add.onclick = () => { state.categories.push({ key:"neu", label:"Neue Kategorie", cover: STD_COVER }); modal.remove(); openCategoryEditor(); };

    content.append(table, add);

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => { saveDraftCats(); rerender(); };
  }

  // ---------- Songs-Editor ----------
  function openSongEditor() {
    const modal = makeModal("Songs verwalten", true);
    const content = modal.querySelector(".content");

    const table = document.createElement("table");
    table.className = "w-full text-sm";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    trh.className = "text-left text-neutral-400";
    const heads = [
      {t:"ID", cls:"py-2 pr-2 w-40"},
      {t:"Titel", cls:"py-2 pr-2 w-56"},
      {t:"Artist", cls:"py-2 pr-2 w-40"},
      {t:"Kategorie", cls:"py-2 pr-2 w-48"},
      {t:"Cover-URL", cls:"py-2 pr-2"},
      {t:"Song-URL", cls:"py-2 pr-2"},
      {t:"Dauer", cls:"py-2 pr-2 w-24"},
      {t:"addedAt (ISO)", cls:"py-2 pr-2 w-48"},
      {t:"Aktion", cls:"py-2 pl-2 w-28"},
    ];
    heads.forEach(h=>{
      const th = document.createElement("th");
      th.className = h.cls;
      th.textContent = h.t;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");

    const buildCatSelect = (currentKey, onChange) => {
      const sel = document.createElement("select");
      sel.className = "w-full px-2 py-1 rounded bg-neutral-800";
      state.categories.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.key; opt.textContent = `${c.label} (${c.key})`;
        if (c.key === currentKey) opt.selected = true;
        sel.appendChild(opt);
      });
      const sep = document.createElement("option"); sep.disabled = true; sep.textContent = "────────";
      sel.appendChild(sep);
      const plus = document.createElement("option"); plus.value = "__new__"; plus.textContent = "+ Neue Kategorie…";
      sel.appendChild(plus);
      sel.onchange = onChange;
      return sel;
    };

    const rebuildCatSel = (cell, currentKey, i) => {
      cell.innerHTML = "";
      const sel = buildCatSelect(currentKey, (e) => {
        const v = e.target.value;
        if (v === "__new__") {
          const label = prompt("Name der neuen Kategorie:");
          if (!label) { rebuildCatSel(cell, state.songs[i].category, i); return; }
          const key = idFromTitle(label) || "neu";
          if (!state.categories.some(c => c.key === key)) {
            state.categories.push({ key, label, cover: STD_COVER });
            saveDraftCats(); rerender();
          }
          state.songs[i].category = key;
          rebuildCatSel(cell, key, i);
        } else {
          state.songs[i].category = v;
        }
      });
      cell.appendChild(sel);
    };

    if (!state.songs.length) {
      const trInfo = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 9;
      td.className = "py-4 text-neutral-400";
      td.textContent = "Noch keine Songs. Nutze „+ Neuer Song“ oder den MP3-Importer.";
      trInfo.appendChild(td);
      tbody.appendChild(trInfo);
    }

    state.songs.forEach((s, i) => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-white/10";

      const tdId = document.createElement("td"); tdId.className="py-2 pr-2";
      const inId = document.createElement("input"); inId.className="w-full px-2 py-1 rounded bg-neutral-800";
      inId.value = s.id || ""; inId.placeholder="id";
      inId.oninput = e => state.songs[i].id = e.target.value; tdId.appendChild(inId);

      const tdTitle = document.createElement("td"); tdTitle.className="py-2 pr-2";
      const inTitle = document.createElement("input"); inTitle.className="w-full px-2 py-1 rounded bg-neutral-800";
      inTitle.value = s.title || ""; inTitle.placeholder="Titel";
      inTitle.onblur = () => {
        if (!inId.value.trim()) {
          inId.value = idFromTitle(inTitle.value);
          state.songs[i].id = inId.value;
        }
      };
      inTitle.oninput = e => state.songs[i].title = e.target.value;
      tdTitle.appendChild(inTitle);

      const tdArtist = document.createElement("td"); tdArtist.className="py-2 pr-2";
      const inArtist = document.createElement("input"); inArtist.className="w-full px-2 py-1 rounded bg-neutral-800";
      inArtist.value = s.artist || DEFAULT_ARTIST; inArtist.placeholder="Artist";
      inArtist.oninput = e => state.songs[i].artist = e.target.value; tdArtist.appendChild(inArtist);

      const tdCat = document.createElement("td"); tdCat.className="py-2 pr-2";
      rebuildCatSel(tdCat, s.category, i);

      const tdCover = document.createElement("td"); tdCover.className="py-2 pr-2";
      const inCover = document.createElement("input"); inCover.className="w-full px-2 py-1 rounded bg-neutral-800";
      inCover.value = s.cover || ""; inCover.placeholder="Cover-URL";
      inCover.oninput = e => state.songs[i].cover = e.target.value; tdCover.appendChild(inCover);

      const tdSrc = document.createElement("td"); tdSrc.className="py-2 pr-2";
      const inSrc = document.createElement("input"); inSrc.className="w-full px-2 py-1 rounded bg-neutral-800";
      inSrc.value = s.src || ""; inSrc.placeholder="Song-URL (RAW)";
      inSrc.oninput = e => state.songs[i].src = e.target.value; tdSrc.appendChild(inSrc);

      const tdDur = document.createElement("td"); tdDur.className="py-2 pr-2";
      const inDur = document.createElement("input"); inDur.className="w-full px-2 py-1 rounded bg-neutral-800";
      inDur.value = String(s.duration || 0); inDur.placeholder="Sek.";
      inDur.oninput = e => state.songs[i].duration = parseInt(e.target.value) || 0; tdDur.appendChild(inDur);

      const tdAdded = document.createElement("td"); tdAdded.className="py-2 pr-2";
      const inAdded = document.createElement("input"); inAdded.className="w-full px-2 py-1 rounded bg-neutral-800";
      inAdded.value = s.addedAt || "";
      inAdded.placeholder = "YYYY-MM-DD oder ISO";
      inAdded.oninput = e => state.songs[i].addedAt = e.target.value.trim();
      tdAdded.appendChild(inAdded);

      const tdAct = document.createElement("td"); tdAct.className="py-2 pl-2";
      const del = document.createElement("button");
      del.className = "bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-sm";
      del.textContent = "Löschen";
      del.onclick = () => { state.songs.splice(i, 1); tr.remove(); };
      tdAct.appendChild(del);

      tr.append(tdId, tdTitle, tdArtist, tdCat, tdCover, tdSrc, tdDur, tdAdded, tdAct);
      tbody.appendChild(tr);
    });

    table.append(thead, tbody);

    const add = document.createElement("button");
    add.textContent = "+ Neuer Song";
    add.className = "mt-3 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded";
    add.onclick = () => {
      state.songs.push({
        id: "",
        title: "",
        artist: DEFAULT_ARTIST,
        category: state.categories[0]?.key || "",
        cover: "",
        src: "",
        duration: 0,
        addedAt: nowISO()
      });
      modal.remove(); openSongEditor();
    };

    content.append(table, add);

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => {
      const dups = duplicateIds(state.songs);
      if (dups.length) {
        alert("Duplikate gefunden (IDs):\n\n" + dups.join("\n") + "\n\nBitte korrigieren, bevor du übernimmst.");
        return;
      }
      saveDraftSongs(); rerender();
      alert("Songs übernommen (lokal gespeichert).");
    };
  }

  // ---------- MP3-Importer ----------
  function openMp3Importer() {
    const modal = makeModal("MP3 importieren", true);
    const content = modal.querySelector(".content");

    const form = document.createElement("div");
    form.className = "grid md:grid-cols-2 gap-3 text-sm";
    form.innerHTML = `
      <div>
        <label class="text-xs text-neutral-400">Datei auswählen</label>
        <input type="file" id="mp3file" accept="audio/mpeg,.mp3" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Dauer (Sek.)</label>
        <input type="number" id="mp3dur" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800" placeholder="wird automatisch gelesen">
      </div>
      <div>
        <label class="text-xs text-neutral-400">ID (slug)</label>
        <input id="mp3id" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800" placeholder="z.B. beyond_the_silence">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Titel</label>
        <input id="mp3title" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Artist</label>
        <input id="mp3artist" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800" value="${DEFAULT_ARTIST}">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Kategorie</label>
        <div id="mp3catSlot"></div>
      </div>
      <div class="md:col-span-2">
        <label class="text-xs text-neutral-400">Cover-URL (leer = Kategorie/Standard)</label>
        <input id="mp3cover" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800" placeholder="">
      </div>
      <div class="md:col-span-2">
        <label class="text-xs text-neutral-400">Song-RAW-URL (GitHub)</label>
        <input id="mp3src" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800" placeholder="https://raw.githubusercontent.com/ralf-music/ralf_music/main/assets/songs/DATEI.mp3">
      </div>
      <p class="md:col-span-2 text-xs text-neutral-400 mt-2">
        Hinweis: Upload zur GitHub-Repo weiterhin manuell (Datei nach <code>/assets/songs</code>).
        Diese Maske legt den Song lokal an und erzeugt die passende RAW-URL.
      </p>
    `;
    content.appendChild(form);

    // Kategorie-Select
    const catSlot = $("#mp3catSlot", form);
    catSlot.appendChild(buildCatSelect(state.categories[0]?.key || ""));

    function buildCatSelect(currentKey) {
      const sel = document.createElement("select");
      sel.className = "w-full px-2 py-2 rounded bg-neutral-800";
      state.categories.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.key; opt.textContent = `${c.label} (${c.key})`;
        if (c.key === currentKey) opt.selected = true;
        sel.appendChild(opt);
      });
      const sep = document.createElement("option"); sep.disabled = true; sep.textContent = "────────"; sel.appendChild(sep);
      const plus = document.createElement("option"); plus.value = "__new__"; plus.textContent = "+ Neue Kategorie…"; sel.appendChild(plus);
      sel.onchange = (e) => {
        if (e.target.value === "__new__") {
          const label = prompt("Name der neuen Kategorie:");
          if (!label) { rebuild(); return; }
          const key = idFromTitle(label) || "neu";
          if (!state.categories.some(c => c.key === key)) { state.categories.push({ key, label, cover: STD_COVER }); saveDraftCats(); rerender(); }
          rebuild(key);
        }
      };
      function rebuild(key = currentKey) { catSlot.innerHTML = ""; catSlot.appendChild(buildCatSelect(key)); }
      return sel;
    }

    // Datei-Metadaten lesen + Auto-ID/Titel/URL
    const fi = $("#mp3file", form);
    fi.onchange = () => {
      const file = fi.files?.[0]; if (!file) return;
      const fname = file.name;
      $("#mp3id", form).value    = idFromFilename(fname);
      $("#mp3title", form).value = titleFromFilename(fname);
      $("#mp3src", form).value =
        `https://raw.githubusercontent.com/ralf-music/ralf_music/main/assets/songs/${encodeURIComponent(fname)}`;

      const objURL = URL.createObjectURL(file);
      const a = new Audio(); a.src = objURL;
      a.addEventListener('loadedmetadata', () => {
        $("#mp3dur", form).value = Math.max(0, Math.floor(a.duration || 0));
        URL.revokeObjectURL(objURL);
      }, { once: true });
      a.addEventListener('error', () => {
        URL.revokeObjectURL(objURL);
        alert('Konnte die MP3-Dauer nicht lesen.');
      }, { once: true });
    };

    // Übernehmen = Song anlegen/aktualisieren, Duplicate-Check, addedAt automatisch
    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => {
      const id     = $("#mp3id", form).value.trim();
      const title  = $("#mp3title", form).value.trim();
      const artist = $("#mp3artist", form).value.trim() || DEFAULT_ARTIST;
      const cat    = $("#mp3catSlot select", form).value;
      const cover  = $("#mp3cover", form).value.trim();
      const src    = $("#mp3src", form).value.trim();
      const dur    = parseInt($("#mp3dur", form).value, 10) || 0;

      if (!id || !title || !src) { alert("ID, Titel und Song-URL sind Pflicht."); return; }

      const rest = state.songs.filter(x => x.id !== id);
      const dups = duplicateIds([...rest, { id }]);
      if (dups.length) {
        alert("Duplikate gefunden (IDs):\n\n" + dups.join("\n") + "\n\nBitte ID anpassen.");
        return;
      }

      // addedAt-Strategie:
      // - vorhandener Song -> addedAt behalten
      // - neuer Song -> jetzt setzen
      const existing = state.songs.find(x => x.id === id);
      const catObj = state.categories.find(c => c.key === cat);
      const finalCover = cover || catObj?.cover || STD_COVER;
      const finalAddedAt = existing?.addedAt || nowISO();

      const entry = { id, title, artist, category: cat, cover: finalCover, src, duration: dur, addedAt: finalAddedAt };
      state.songs = [...rest, entry];

      saveDraftSongs(); rerender();
      alert("Song angelegt/aktualisiert (lokal). Lade die MP3 ins Repo nach /assets/songs hoch.");
    };
  }

})();
