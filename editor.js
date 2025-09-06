/* === R.A.L.F. Editor v4.3 ===
   Neu:
   - Sortieren für Songs & Kategorien (↑/↓ pro Zeile + Dropdown-Sortierung)
   - addedAt wird bei neuen Songs automatisch gesetzt (Importer & "Neuer Song")
   - Duplicate-Check unverändert, Draft-Save unverändert
*/

(function () {
  // ---------- Version ----------
  const EDITOR_VERSION = "4.3";

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
  const rerender = () =>
    typeof window.render === "function"
      ? window.render()
      : (typeof window.renderSite === "function" && window.renderSite(state.songs, state.categories));

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const stripExt = (name) => String(name || "").replace(/\.[^.]+$/, "");
  const nowISO = () => new Date().toISOString();

  function idFromFilename(name) {
    const base = stripExt(name);
    return base
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }
  function idFromTitle(title) {
    return String(title || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]+/g, "")
      .replace(/_+/g, "_")
      .toLowerCase();
  }
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
    const seen = new Map();
    for (const s of songs) {
      const id = String(s.id || "").trim();
      if (!id) continue;
      seen.set(id, (seen.get(id) || 0) + 1);
    }
    return [...seen.entries()].filter(([, c]) => c > 1).map(([id]) => id);
  }
  function moveItem(arr, from, to) {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
    const [it] = arr.splice(from, 1);
    arr.splice(to, 0, it);
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function parseDateSafe(v) {
    if (!v && v !== 0) return null;
    if (typeof v === "number") return new Date(v);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
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
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-bold">${title}</h3>
          <div class="flex items-center gap-2">
            ${withApply ? `<button class="apply bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded">Übernehmen</button>` : ""}
            <button class="close bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded">Schließen</button>
          </div>
        </div>
        <div class="content mt-4 max-h-[70vh] overflow-auto pr-1"></div>
      </div>`;
    wrap.querySelectorAll(".close").forEach(b => b.onclick = () => wrap.remove());
    document.body.appendChild(wrap);
    return wrap;
  }

  // ---------- Kategorien-Editor (mit Sortierung) ----------
  function openCategoryEditor() {
    const modal = makeModal("Kategorien verwalten", true);
    const content = modal.querySelector(".content");

    const topBar = document.createElement("div");
    topBar.className = "flex items-center gap-2 mb-3";
    topBar.innerHTML = `
      <label class="text-xs text-neutral-400">Sortieren:</label>
      <select id="catSortSel" class="px-2 py-1 rounded bg-neutral-800">
        <option value="none">— keine —</option>
        <option value="label_az">Label A–Z</option>
        <option value="label_za">Label Z–A</option>
        <option value="key_az">Key A–Z</option>
        <option value="key_za">Key Z–A</option>
      </select>
      <button id="catSortApply" class="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700">Anwenden</button>
      <div class="flex-1"></div>
      <button id="catAdd" class="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700">+ Neue Kategorie</button>
    `;
    content.appendChild(topBar);

    const table = document.createElement("table");
    table.className = "w-full text-sm";
    table.innerHTML = `
      <thead>
        <tr class="text-left text-neutral-400">
          <th class="py-2 pr-2 w-40">Key</th>
          <th class="py-2 pr-2 w-48">Label</th>
          <th class="py-2 pr-2">Cover-URL</th>
          <th class="py-2 pl-2 w-32">Reihenfolge</th>
          <th class="py-2 pl-2 w-28">Aktion</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = $("tbody", table);
    content.appendChild(table);

    function rebuildRows() {
      tbody.innerHTML = "";
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

        const tdOrder = document.createElement("td");
        tdOrder.className = "py-2 pl-2";
        const up = document.createElement("button");
        up.className = "px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 mr-1";
        up.textContent = "↑";
        up.onclick = () => { moveItem(state.categories, i, Math.max(0, i - 1)); rebuildRows(); };
        const dn = document.createElement("button");
        dn.className = "px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700";
        dn.textContent = "↓";
        dn.onclick = () => { moveItem(state.categories, i, Math.min(state.categories.length - 1, i + 1)); rebuildRows(); };
        tdOrder.append(up, dn);

        const tdAct = document.createElement("td");
        tdAct.className = "py-2 pl-2";
        const del = document.createElement("button");
        del.className = "bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-sm";
        del.textContent = "Löschen";
        del.onclick = () => { state.categories.splice(i, 1); rebuildRows(); };
        tdAct.appendChild(del);

        tr.append(tdKey, tdLabel, tdCover, tdOrder, tdAct);
        tbody.appendChild(tr);
      });
    }
    rebuildRows();

    $("#catSortApply", content).onclick = () => {
      const mode = $("#catSortSel", content).value;
      const a = state.categories;
      const by = (k) => (x) => (x[k] || "").toString().toLowerCase();
      switch (mode) {
        case "label_az": a.sort((x,y)=>cmp(by("label")(x),by("label")(y))); break;
        case "label_za": a.sort((x,y)=>cmp(by("label")(y),by("label")(x))); break;
        case "key_az":   a.sort((x,y)=>cmp(by("key")(x),by("key")(y)));     break;
        case "key_za":   a.sort((x,y)=>cmp(by("key")(y),by("key")(x)));     break;
        default: /* none */ break;
      }
      rebuildRows();
    };

    $("#catAdd", content).onclick = () => {
      state.categories.push({ key: "neu", label: "Neue Kategorie", cover: STD_COVER });
      rebuildRows();
    };

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => { saveDraftCats(); rerender(); alert("Kategorien übernommen (lokal gespeichert)."); };
  }

  // ---------- Songs-Editor (mit Sortierung) ----------
  function openSongEditor() {
    const modal = makeModal("Songs verwalten", true);
    const content = modal.querySelector(".content");

    const topBar = document.createElement("div");
    topBar.className = "flex items-center gap-2 mb-3 flex-wrap";
    topBar.innerHTML = `
      <label class="text-xs text-neutral-400">Sortieren:</label>
      <select id="songSortSel" class="px-2 py-1 rounded bg-neutral-800">
        <option value="none">— keine —</option>
        <option value="title_az">Titel A–Z</option>
        <option value="title_za">Titel Z–A</option>
        <option value="artist_az">Artist A–Z</option>
        <option value="artist_za">Artist Z–A</option>
        <option value="cat_az">Kategorie A–Z (Label)</option>
        <option value="cat_za">Kategorie Z–A (Label)</option>
        <option value="newest">Neueste zuerst (addedAt)</option>
        <option value="oldest">Älteste zuerst (addedAt)</option>
      </select>
      <button id="songSortApply" class="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700">Anwenden</button>
      <div class="flex-1"></div>
      <button id="songAdd" class="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700">+ Neuer Song</button>
    `;
    content.appendChild(topBar);

    const table = document.createElement("table");
    table.className = "w-full text-sm";
    table.innerHTML = `
      <thead>
        <tr class="text-left text-neutral-400">
          <th class="py-2 pr-2 w-40">ID</th>
          <th class="py-2 pr-2 w-56">Titel</th>
          <th class="py-2 pr-2 w-40">Artist</th>
          <th class="py-2 pr-2 w-48">Kategorie</th>
          <th class="py-2 pr-2">Cover-URL</th>
          <th class="py-2 pr-2">Song-URL</th>
          <th class="py-2 pr-2 w-24">Dauer</th>
          <th class="py-2 pr-2 w-40">addedAt</th>
          <th class="py-2 pl-2 w-28">Reihenfolge</th>
          <th class="py-2 pl-2 w-28">Aktion</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = $("tbody", table);
    content.appendChild(table);

    const labelByKey = new Map((state.categories || []).map(c => [c.key, c.label || c.key]));

    function buildCatSelect(currentKey, onChange) {
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
    }

    function rebuildCatSel(cell, currentKey, i) {
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
    }

    function rebuildRows() {
      tbody.innerHTML = "";

      if (!state.songs.length) {
        const trInfo = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 10;
        td.className = "py-4 text-neutral-400";
        td.textContent = "Noch keine Songs. Nutze „+ Neuer Song“ oder den MP3-Importer.";
        trInfo.appendChild(td);
        tbody.appendChild(trInfo);
        return;
      }

      state.songs.forEach((s, i) => {
        const tr = document.createElement("tr");
        tr.className = "border-t border-white/10";

        // ID
        const tdId = document.createElement("td"); tdId.className="py-2 pr-2";
        const inId = document.createElement("input"); inId.className="w-full px-2 py-1 rounded bg-neutral-800";
        inId.value = s.id || ""; inId.placeholder="id";
        inId.oninput = e => state.songs[i].id = e.target.value;
        tdId.appendChild(inId);

        // Titel
        const tdTitle = document.createElement("td"); tdTitle.className="py-2 pr-2";
        const inTitle = document.createElement("input"); inTitle.className="w-full px-2 py-1 rounded bg-neutral-800";
        inTitle.value = s.title || ""; inTitle.placeholder="Titel";
        inTitle.onblur = () => { if (!inId.value.trim()) { inId.value = idFromTitle(inTitle.value); state.songs[i].id = inId.value; } };
        inTitle.oninput = e => state.songs[i].title = e.target.value;
        tdTitle.appendChild(inTitle);

        // Artist
        const tdArtist = document.createElement("td"); tdArtist.className="py-2 pr-2";
        const inArtist = document.createElement("input"); inArtist.className="w-full px-2 py-1 rounded bg-neutral-800";
        inArtist.value = s.artist || DEFAULT_ARTIST; inArtist.placeholder="Artist";
        inArtist.oninput = e => state.songs[i].artist = e.target.value;
        tdArtist.appendChild(inArtist);

        // Kategorie
        const tdCat = document.createElement("td"); tdCat.className="py-2 pr-2";
        rebuildCatSel(tdCat, s.category, i);

        // Cover
        const tdCover = document.createElement("td"); tdCover.className="py-2 pr-2";
        const inCover = document.createElement("input"); inCover.className="w-full px-2 py-1 rounded bg-neutral-800";
        inCover.value = s.cover || ""; inCover.placeholder="Cover-URL";
        inCover.oninput = e => state.songs[i].cover = e.target.value;
        tdCover.appendChild(inCover);

        // Song-URL
        const tdSrc = document.createElement("td"); tdSrc.className="py-2 pr-2";
        const inSrc = document.createElement("input"); inSrc.className="w-full px-2 py-1 rounded bg-neutral-800";
        inSrc.value = s.src || ""; inSrc.placeholder="Song-URL (RAW)";
        inSrc.oninput = e => state.songs[i].src = e.target.value;
        tdSrc.appendChild(inSrc);

        // Dauer
        const tdDur = document.createElement("td"); tdDur.className="py-2 pr-2";
        const inDur = document.createElement("input"); inDur.className="w-full px-2 py-1 rounded bg-neutral-800";
        inDur.value = String(s.duration || 0); inDur.placeholder="Sek.";
        inDur.oninput = e => state.songs[i].duration = parseInt(e.target.value) || 0;
        tdDur.appendChild(inDur);

        // addedAt
        const tdAdded = document.createElement("td"); tdAdded.className="py-2 pr-2";
        const wrap = document.createElement("div"); wrap.className="flex items-center gap-2";
        const inAdded = document.createElement("input"); inAdded.className="w-full px-2 py-1 rounded bg-neutral-800";
        inAdded.value = s.addedAt || ""; inAdded.placeholder="YYYY-MM-DDTHH:MM:SSZ";
        inAdded.oninput = e => state.songs[i].addedAt = e.target.value.trim();
        const btnNow = document.createElement("button");
        btnNow.className = "px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs whitespace-nowrap";
        btnNow.textContent = "↻ jetzt";
        btnNow.onclick = () => { state.songs[i].addedAt = nowISO(); inAdded.value = state.songs[i].addedAt; };
        wrap.append(inAdded, btnNow);
        tdAdded.appendChild(wrap);

        // Reihenfolge
        const tdOrder = document.createElement("td"); tdOrder.className="py-2 pl-2";
        const up = document.createElement("button");
        up.className = "px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 mr-1";
        up.textContent = "↑";
        up.onclick = () => { moveItem(state.songs, i, Math.max(0, i - 1)); rebuildRows(); };
        const dn = document.createElement("button");
        dn.className = "px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700";
        dn.textContent = "↓";
        dn.onclick = () => { moveItem(state.songs, i, Math.min(state.songs.length - 1, i + 1)); rebuildRows(); };
        tdOrder.append(up, dn);

        // Aktion
        const tdAct = document.createElement("td"); tdAct.className="py-2 pl-2";
        const del = document.createElement("button");
        del.className = "bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-sm";
        del.textContent = "Löschen";
        del.onclick = () => { state.songs.splice(i, 1); rebuildRows(); };
        tdAct.appendChild(del);

        tr.append(tdId, tdTitle, tdArtist, tdCat, tdCover, tdSrc, tdDur, tdAdded, tdOrder, tdAct);
        tbody.appendChild(tr);
      });
    }
    rebuildRows();

    $("#songSortApply", content).onclick = () => {
      const mode = $("#songSortSel", content).value;
      const a = state.songs;
      const lbk = new Map((state.categories || []).map(c => [c.key, c.label || c.key]));
      switch (mode) {
        case "title_az": a.sort((x,y)=>cmp((x.title||"").toLowerCase(), (y.title||"").toLowerCase())); break;
        case "title_za": a.sort((x,y)=>cmp((y.title||"").toLowerCase(), (x.title||"").toLowerCase())); break;
        case "artist_az": a.sort((x,y)=>cmp((x.artist||"").toLowerCase(), (y.artist||"").toLowerCase())); break;
        case "artist_za": a.sort((x,y)=>cmp((y.artist||"").toLowerCase(), (x.artist||"").toLowerCase())); break;
        case "cat_az": {
          a.sort((x,y)=>cmp((lbk.get(x.category)||"").toLowerCase(), (lbk.get(y.category)||"").toLowerCase()));
          break;
        }
        case "cat_za": {
          a.sort((x,y)=>cmp((lbk.get(y.category)||"").toLowerCase(), (lbk.get(x.category)||"").toLowerCase()));
          break;
        }
        case "newest": {
          a.sort((x,y)=>{
            const dx = parseDateSafe(x.addedAt); const dy = parseDateSafe(y.addedAt);
            if (dx && dy) return dy - dx;
            if (dx && !dy) return -1;
            if (!dx && dy) return 1;
            return 0;
          });
          break;
        }
        case "oldest": {
          a.sort((x,y)=>{
            const dx = parseDateSafe(x.addedAt); const dy = parseDateSafe(y.addedAt);
            if (dx && dy) return dx - dy;
            if (dx && !dy) return -1;
            if (!dx && dy) return 1;
            return 0;
          });
          break;
        }
        default: /* none */ break;
      }
      rebuildRows();
    };

    $("#songAdd", content).onclick = () => {
      state.songs.push({
        id: "", title: "", artist: DEFAULT_ARTIST,
        category: state.categories[0]?.key || "",
        cover: "", src: "", duration: 0,
        addedAt: nowISO()
      });
      rebuildRows();
    };

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => {
      const dups = duplicateIds(state.songs);
      if (dups.length) {
        alert("Duplikate gefunden (IDs):\n\n" + dups.join("\n") + "\n\nBitte ID anpassen.");
        return;
      }
      saveDraftSongs(); rerender();
      alert("Songs übernommen (lokal gespeichert).");
    };
  }

  // ---------- MP3-Importer (setzt addedAt automatisch) ----------
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

      const future = [...state.songs.filter(x => x.id !== id), { id, title, artist, category: cat, cover, src, duration: dur }];
      const dups = duplicateIds(future);
      if (dups.length) {
        alert("Duplikate gefunden (IDs):\n\n" + dups.join("\n") + "\n\nBitte ID anpassen.");
        return;
      }

      const catObj = state.categories.find(c => c.key === cat);
      const finalCover = cover || catObj?.cover || STD_COVER;

      const rest = state.songs.filter(x => x.id !== id);
      state.songs = [...rest, {
        id, title, artist, category: cat,
        cover: finalCover, src, duration: dur,
        addedAt: nowISO()
      }];

      saveDraftSongs(); rerender();
      alert("Song angelegt (lokal). Lade die MP3 ins Repo nach /assets/songs hoch.");
    };
  }

})();
