/* === R.A.L.F. Editor v4.1.1 ===
   - FIX: Artist-Zelle im Songs-Dialog (kein verschachteltes Template mehr)
   - Songs-Editor als breite Tabelle
   - Kategorie-Dropdown (+ Neue Kategorie…)
   - MP3-Importer
   - Übernehmen = Draft speichern + Seite neu rendern
   Draft-Keys:
     ralf_songs_json        { songs: [...] }
     ralf_categories_json   { categories: [...] }
*/

(function () {
  if (!window.state || typeof window.state !== "object") window.state = {};
  if (!Array.isArray(window.state.songs))      window.state.songs = [];
  if (!Array.isArray(window.state.categories)) window.state.categories = [];

  const STD_COVER = "https://github.com/ralf-music/ralf_music/blob/main/assets/logo-kategorie.png?raw=true";
  const DEFAULT_ARTIST = "R.A.L.F.";

  const saveDraftSongs = () =>
    localStorage.setItem("ralf_songs_json", JSON.stringify({ songs: state.songs }, null, 2));
  const saveDraftCats = () =>
    localStorage.setItem("ralf_categories_json", JSON.stringify({ categories: state.categories }, null, 2));
  const rerender = () => typeof window.renderSite === "function" && window.renderSite(state.songs, state.categories);

  const $ = (sel, root = document) => root.querySelector(sel);
  const slug = (str) => (str || "").toString().trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
  const stripExt = (name) => name.replace(/\.[^.]+$/, "");
  function downloadFile(name, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  // Toolbar
  const panel = document.createElement("div");
  panel.className = "fixed top-4 right-4 bg-neutral-900 text-white p-4 rounded-lg shadow-xl z-50 flex flex-col gap-2 ring-1 ring-white/10";
  panel.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="text-xs px-2 py-0.5 rounded bg-orange-600">EDIT</span>
      <span class="text-xs text-neutral-300">v4.1.1</span>
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

  // Modal
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

  // Kategorien-Editor
  function openCategoryEditor() {
    const modal = makeModal("Kategorien verwalten", true);
    const content = modal.querySelector(".content");

    const table = document.createElement("table");
    table.className = "w-full text-sm";
    table.innerHTML = `
      <thead>
        <tr class="text-left text-neutral-400">
          <th class="py-2 pr-2 w-40">Key</th>
          <th class="py-2 pr-2 w-48">Label</th>
          <th class="py-2 pr-2">Cover-URL</th>
          <th class="py-2 pl-2 w-28">Aktion</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    state.categories.forEach((c, i) => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-white/10";
      tr.innerHTML = `
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${c.key||""}"   placeholder="key"></td>
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${c.label||""}" placeholder="Label"></td>
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${c.cover||STD_COVER}" placeholder="Cover-URL"></td>
        <td class="py-2 pl-2"><button class="del bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-sm">Löschen</button></td>
      `;
      const [key, label, cover] = tr.querySelectorAll("input");
      key.oninput   = e => state.categories[i].key   = e.target.value.trim();
      label.oninput = e => state.categories[i].label = e.target.value.trim();
      cover.oninput = e => state.categories[i].cover = (e.target.value.trim() || STD_COVER);
      tr.querySelector(".del").onclick = () => { state.categories.splice(i, 1); tr.remove(); };
      tbody.appendChild(tr);
    });

    const add = document.createElement("button");
    add.textContent = "+ Neue Kategorie";
    add.className = "mt-3 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded";
    add.onclick = () => { state.categories.push({ key:"neu", label:"Neue Kategorie", cover: STD_COVER }); modal.remove(); openCategoryEditor(); };

    content.append(table, add);

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => { saveDraftCats(); rerender(); };
  }

  // Songs-Editor
  function openSongEditor() {
    const modal = makeModal("Songs verwalten", true);
    const content = modal.querySelector(".content");

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
          <th class="py-2 pl-2 w-28">Aktion</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    // Hinweis, wenn keine Songs existieren
    if (!state.songs.length) {
      const trInfo = document.createElement("tr");
      trInfo.innerHTML = `<td colspan="8" class="py-4 text-neutral-400">Noch keine Songs. Nutze „+ Neuer Song“ oder den MP3-Importer.</td>`;
      tbody.appendChild(trInfo);
    }

    const buildCatSelect = (currentKey) => {
      const sel = document.createElement("select");
      sel.className = "w-full px-2 py-1 rounded bg-neutral-800";
      state.categories.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = `${c.label} (${c.key})`;
        if (c.key === currentKey) opt.selected = true;
        sel.appendChild(opt);
      });
      const sep = document.createElement("option"); sep.disabled = true; sep.textContent = "────────"; sel.appendChild(sep);
      const plus = document.createElement("option"); plus.value = "__new__"; plus.textContent = "+ Neue Kategorie…"; sel.appendChild(plus);
      return sel;
    };

    state.songs.forEach((s, i) => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-white/10";
      tr.innerHTML = `
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${s.id||""}"      placeholder="id"></td>
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${s.title||""}"   placeholder="Titel"></td>
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${s.artist || DEFAULT_ARTIST}" placeholder="Artist"></td>
        <td class="py-2 pr-2 slot-cat"></td>
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${s.cover||""}"   placeholder="Cover-URL"></td>
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${s.src||""}"     placeholder="Song-URL (RAW)"></td>
        <td class="py-2 pr-2"><input class="w-full px-2 py-1 rounded bg-neutral-800" value="${s.duration||0}" placeholder="Sek."></td>
        <td class="py-2 pl-2"><button class="del bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-sm">Löschen</button></td>
      `;
      const [id, title, artist, , cover, src, dur] = tr.querySelectorAll("input");
      id.oninput     = e => state.songs[i].id       = e.target.value;
      title.oninput  = e => state.songs[i].title    = e.target.value;
      artist.oninput = e => state.songs[i].artist   = e.target.value;
      cover.oninput  = e => state.songs[i].cover    = e.target.value;
      src.oninput    = e => state.songs[i].src      = e.target.value;
      dur.oninput    = e => state.songs[i].duration = parseInt(e.target.value) || 0;

      const catCell = tr.querySelector(".slot-cat");
      let catSel = buildCatSelect(s.category);
      catCell.appendChild(catSel);

      const rebuildCatSel = (current) => { catCell.innerHTML = ""; catSel = buildCatSelect(current); catCell.appendChild(catSel); };

      catSel.onchange = (e) => {
        const v = e.target.value;
        if (v === "__new__") {
          const label = prompt("Name der neuen Kategorie:");
          if (!label) { rebuildCatSel(s.category); return; }
          const key = slug(label) || "neu";
          if (!state.categories.some(c => c.key === key)) {
            state.categories.push({ key, label, cover: STD_COVER });
            saveDraftCats(); rerender();
          }
          state.songs[i].category = key;
          rebuildCatSel(key);
        } else {
          state.songs[i].category = v;
        }
      };

      tr.querySelector(".del").onclick = () => { state.songs.splice(i, 1); tr.remove(); };

      tbody.appendChild(tr);
    });

    const add = document.createElement("button");
    add.textContent = "+ Neuer Song";
    add.className = "mt-3 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded";
    add.onclick = () => {
      state.songs.push({
        id: "", title: "", artist: DEFAULT_ARTIST,
        category: state.categories[0]?.key || "",
        cover: "", src: "", duration: 0
      });
      modal.remove(); openSongEditor();
    };

    content.append(table, add);

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => { saveDraftSongs(); rerender(); };
  }

  // MP3-Importer
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
        <input id="mp3id" class="mt-1 w-full px-2 py-2 rounded bg-neutral-800" placeholder="z.B. glasherz">
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
          const label = prompt("Name der neuen Kategorie:"); if (!label) { rebuild(); return; }
          const key = slug(label) || "neu";
          if (!state.categories.some(c => c.key === key)) { state.categories.push({ key, label, cover: STD_COVER }); saveDraftCats(); rerender(); }
          rebuild(key);
        }
      };
      function rebuild(key = currentKey) {
        catSlot.innerHTML = ""; catSlot.appendChild(buildCatSelect(key));
      }
      return sel;
    }

    const fi = $("#mp3file", form);
    fi.onchange = () => {
      const file = fi.files?.[0]; if (!file) return;
      const fname = file.name;
      $("#mp3id", form).value    = slug(stripExt(fname));
      $("#mp3title", form).value = stripExt(fname);
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

      const catObj = state.categories.find(c => c.key === cat);
      const finalCover = cover || catObj?.cover || STD_COVER;

      const rest = state.songs.filter(x => x.id !== id);
      state.songs = [...rest, { id, title, artist, category: cat, cover: finalCover, src, duration: dur }];

      saveDraftSongs(); rerender();
      alert("Song angelegt (lokal). Lade die MP3 ins Repo nach /assets/songs hoch.");
    };
  }

})();
