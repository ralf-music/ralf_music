/* === R.A.L.F. Editor v3.9 ===
   - Kategorien-Auswahl (Dropdown) im Song-Editor
   - "+ Neue Kategorie…" direkt aus dem Song-Editor
   - Übernehmen speichert Draft + rendert neu
   - Sichtbare Versionsanzeige im Panel
   Entwürfe:
     ralf_songs_json        { songs: [...] }
     ralf_categories_json   { categories: [...] }
*/

(function () {
  // --- State absichern ---
  if (!window.state || typeof window.state !== "object") window.state = {};
  if (!Array.isArray(window.state.songs))      window.state.songs = [];
  if (!Array.isArray(window.state.categories)) window.state.categories = [];

  const STD_COVER = "https://github.com/ralf-music/ralf_music/blob/main/assets/logo-kategorie.png?raw=true";

  const saveDraftSongs = () =>
    localStorage.setItem("ralf_songs_json", JSON.stringify({ songs: state.songs }, null, 2));
  const saveDraftCats = () =>
    localStorage.setItem("ralf_categories_json", JSON.stringify({ categories: state.categories }, null, 2));
  const rerender = () => typeof window.renderSite === "function" && window.renderSite(state.songs, state.categories);

  // Utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const slug = (str) => (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

  function downloadFile(name, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Toolbar ----------
  const panel = document.createElement("div");
  panel.className = "fixed top-4 right-4 bg-neutral-900 text-white p-4 rounded-lg shadow-xl z-50 flex flex-col gap-2 ring-1 ring-white/10";
  panel.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="text-xs px-2 py-0.5 rounded bg-orange-600">EDIT</span>
      <span class="text-xs text-neutral-300">v3.9</span>
    </div>
    <div class="grid grid-cols-1 gap-2">
      <button id="btnSongs"     class="bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded">Songs verwalten</button>
      <button id="btnCats"      class="bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded">Kategorien verwalten</button>
      <div class="h-[1px] bg-white/10 my-1"></div>
      <button id="btnSave"      class="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded">Songs speichern (JSON)</button>
      <button id="btnSaveCats"  class="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded">Kategorien speichern (JSON)</button>
      <button id="btnDiscard"   class="bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded">Entwürfe verwerfen</button>
    </div>
  `;
  document.body.appendChild(panel);

  $("#btnSongs").onclick = openSongEditor;
  $("#btnCats").onclick  = openCategoryEditor;

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

  // ---------- Modal Helper ----------
  function makeModal(title, withApply) {
    const wrap = document.createElement("div");
    wrap.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50";
    wrap.innerHTML = `
      <div class="bg-neutral-900 p-6 rounded-lg w-[92%] max-w-5xl ring-1 ring-white/10">
        <div class="flex items-center justify-between">
          <h3 class="font-bold">${title}</h3>
          <button class="close text-sm px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Schließen</button>
        </div>
        <div class="content mt-4"></div>
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
    const modal = makeModal("Kategorien verwalten", /*withApply*/ true);
    const content = modal.querySelector(".content");

    const list = document.createElement("div");
    list.className = "flex flex-col gap-3";

    state.categories.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "flex flex-wrap gap-2 items-center";
      row.innerHTML = `
        <input value="${c.key||""}"   placeholder="Key"       class="w-40 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${c.label||""}" placeholder="Label"     class="w-48 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${c.cover||STD_COVER}" placeholder="Cover-URL" class="flex-1 min-w-[200px] px-2 py-1 rounded bg-neutral-800"/>
        <button class="del bg-red-600 hover:bg-red-500 px-2 py-1 rounded">Löschen</button>
      `;
      const inputs = row.querySelectorAll("input");
      inputs[0].oninput = e => state.categories[i].key   = e.target.value.trim();
      inputs[1].oninput = e => state.categories[i].label = e.target.value.trim();
      inputs[2].oninput = e => state.categories[i].cover = e.target.value.trim() || STD_COVER;
      row.querySelector(".del").onclick = () => { state.categories.splice(i, 1); row.remove(); };
      list.appendChild(row);
    });

    const add = document.createElement("button");
    add.textContent = "+ Neue Kategorie";
    add.className = "bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded";
    add.onclick = () => {
      state.categories.push({ key:"neu", label:"Neue Kategorie", cover: STD_COVER });
      modal.remove(); openCategoryEditor();
    };

    content.append(list, document.createElement("div"));
    content.lastChild.className = "mt-2";
    content.lastChild.appendChild(add);

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => { saveDraftCats(); rerender(); };
  }

  // ---------- Song-Editor mit Kategorie-Select ----------
  function openSongEditor() {
    const modal = makeModal("Songs verwalten", /*withApply*/ true);
    const content = modal.querySelector(".content");

    const list = document.createElement("div");
    list.className = "flex flex-col gap-3";

    state.songs.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "grid md:grid-cols-7 grid-cols-1 gap-2 items-center";

      // Inputs
      const inpId    = inputEl(s.id,    "ID");
      const inpTitle = inputEl(s.title, "Titel");
      const inpArt   = inputEl(s.artist ?? "R.A.L.F.", "Artist");
      const selCat   = selectCategoryEl(s.category);
      const inpCover = inputEl(s.cover || "", "Cover-URL");
      const inpSrc   = inputEl(s.src   || "", "MP3-URL");
      const inpDur   = inputEl(String(s.duration || 0), "Dauer (s)", "number", "w-24");
      const delBtn   = buttonEl("Löschen", "bg-red-600 hover:bg-red-500");

      // Bindings
      inpId.oninput    = e => state.songs[i].id       = e.target.value;
      inpTitle.oninput = e => state.songs[i].title    = e.target.value;
      inpArt.oninput   = e => state.songs[i].artist   = e.target.value;
      inpCover.oninput = e => state.songs[i].cover    = e.target.value;
      inpSrc.oninput   = e => state.songs[i].src      = e.target.value;
      inpDur.oninput   = e => state.songs[i].duration = parseInt(e.target.value) || 0;

      selCat.onchange  = (e) => {
        const v = e.target.value;
        if (v === "__new__") {
          // neue Kategorie anlegen
          const label = prompt("Name der neuen Kategorie:");
          if (!label) { rebuildSelect(selCat, s.category); return; }
          const key = slug(label) || "neu";
          // existiert?
          if (!state.categories.some(c => c.key === key)) {
            state.categories.push({ key, label, cover: STD_COVER });
            saveDraftCats();
            rerender(); // damit Cat-Bar etc. frisch ist
          }
          state.songs[i].category = key;
          rebuildSelect(selCat, key);
        } else {
          state.songs[i].category = v;
        }
      };

      delBtn.onclick = () => { state.songs.splice(i, 1); row.remove(); };

      // Layout
      row.append(
        wrap(inpId),
        wrap(inpTitle),
        wrap(inpArt),
        wrap(selCat),
        wrap(inpCover),
        wrap(inpSrc),
        wrap2(inpDur, delBtn)
      );
      list.appendChild(row);
    });

    // Neuer Song
    const add = document.createElement("button");
    add.textContent = "+ Neuer Song";
    add.className = "bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded";
    add.onclick = () => {
      state.songs.push({ id:"", title:"", artist:"R.A.L.F.", category: state.categories[0]?.key || "", cover:"", src:"", duration:0 });
      modal.remove(); openSongEditor();
    };

    content.append(list, document.createElement("div"));
    content.lastChild.className = "mt-2";
    content.lastChild.appendChild(add);

    const apply = modal.querySelector(".apply");
    if (apply) apply.onclick = () => { saveDraftSongs(); rerender(); };
  }

  // ---------- kleine UI-Helfer ----------
  function inputEl(value, ph, type="text", extra="") {
    const i = document.createElement("input");
    i.type = type;
    i.value = value ?? "";
    i.placeholder = ph || "";
    i.className = `w-full px-2 py-1 rounded bg-neutral-800 ${extra}`;
    return i;
  }
  function buttonEl(label, cls="bg-neutral-800 hover:bg-neutral-700") {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = `${cls} px-2 py-1 rounded`;
    return b;
  }
  function wrap(child) {
    const d = document.createElement("div");
    d.className = "flex items-center";
    d.appendChild(child);
    return d;
  }
  function wrap2(a, b) {
    const d = document.createElement("div");
    d.className = "flex items-center gap-2";
    d.append(a, b);
    return d;
  }

  function selectCategoryEl(currentKey) {
    const sel = document.createElement("select");
    sel.className = "w-full px-2 py-1 rounded bg-neutral-800";
    rebuildSelect(sel, currentKey);
    return sel;
  }
  function rebuildSelect(sel, currentKey) {
    sel.innerHTML = "";
    // vorhandene Kategorien
    state.categories.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.label} (${c.key})`;
      if (c.key === currentKey) opt.selected = true;
      sel.appendChild(opt);
    });
    // Separator
    const sep = document.createElement("option");
    sep.disabled = true; sep.textContent = "────────";
    sel.appendChild(sep);
    // neue Kat
    const add = document.createElement("option");
    add.value = "__new__";
    add.textContent = "+ Neue Kategorie…";
    sel.appendChild(add);
  }

})();
