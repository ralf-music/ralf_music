/* === R.A.L.F. Editor v3.8 === */

(function () {
  if (!window.state) window.state = {};
  if (!state.songs) state.songs = [];
  if (!state.categories) state.categories = [];

  const stdCover = "https://github.com/ralf-music/ralf_music/blob/main/assets/logo-kategorie.png?raw=true";

  // UI erzeugen
  const panel = document.createElement("div");
  panel.className = "fixed top-4 right-4 bg-neutral-900 text-white p-4 rounded-lg shadow-xl z-50 flex flex-col gap-2";
  panel.innerHTML = `
    <h2 class="font-bold mb-2">Editor</h2>
    <button id="btnSongs" class="bg-orange-600 hover:bg-orange-500 px-3 py-1 rounded">Songs verwalten</button>
    <button id="btnCats" class="bg-orange-600 hover:bg-orange-500 px-3 py-1 rounded">Kategorien verwalten</button>
    <button id="btnSave" class="bg-green-600 hover:bg-green-500 px-3 py-1 rounded">Songs speichern</button>
    <button id="btnSaveCats" class="bg-green-600 hover:bg-green-500 px-3 py-1 rounded">Kategorien speichern</button>
    <button id="btnClose" class="bg-neutral-700 hover:bg-neutral-600 px-3 py-1 rounded">Editor schließen</button>
  `;
  document.body.appendChild(panel);

  // --- Songs ---
  document.getElementById("btnSongs").onclick = () => openSongEditor();
  document.getElementById("btnSave").onclick = () => {
    downloadFile("songs.json", JSON.stringify({ songs: state.songs }, null, 2));
    alert("Songs gespeichert – bitte Datei ins Repo hochladen!");
  };

  // --- Kategorien ---
  document.getElementById("btnCats").onclick = () => openCategoryEditor();
  document.getElementById("btnSaveCats").onclick = () => {
    downloadFile("categories.json", JSON.stringify({ categories: state.categories }, null, 2));
    alert("Kategorien gespeichert – bitte Datei ins Repo hochladen!");
  };

  // --- Schließen ---
  document.getElementById("btnClose").onclick = () => panel.remove();

  /* SONG EDITOR */
  function openSongEditor() {
    const wrap = makeModal("Songs verwalten");
    const list = document.createElement("div");
    list.className = "flex flex-col gap-3";

    state.songs.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "flex gap-2 items-center";
      row.innerHTML = `
        <input value="${s.id}" placeholder="ID" class="flex-1 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${s.title}" placeholder="Titel" class="flex-1 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${s.artist}" placeholder="Artist" class="w-32 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${s.category}" placeholder="Kategorie" class="w-40 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${s.cover}" placeholder="Cover-URL" class="flex-1 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${s.src}" placeholder="MP3-URL" class="flex-1 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${s.duration}" placeholder="Dauer (s)" class="w-20 px-2 py-1 rounded bg-neutral-800"/>
        <button class="bg-red-600 hover:bg-red-500 px-2 py-1 rounded">X</button>
      `;
      const inputs = row.querySelectorAll("input");
      inputs[0].oninput = e => state.songs[i].id = e.target.value;
      inputs[1].oninput = e => state.songs[i].title = e.target.value;
      inputs[2].oninput = e => state.songs[i].artist = e.target.value;
      inputs[3].oninput = e => state.songs[i].category = e.target.value;
      inputs[4].oninput = e => state.songs[i].cover = e.target.value;
      inputs[5].oninput = e => state.songs[i].src = e.target.value;
      inputs[6].oninput = e => state.songs[i].duration = parseInt(e.target.value) || 0;
      row.querySelector("button").onclick = () => { state.songs.splice(i, 1); row.remove(); };
      list.appendChild(row);
    });

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Neuer Song";
    addBtn.className = "bg-orange-600 hover:bg-orange-500 px-3 py-1 rounded mt-2";
    addBtn.onclick = () => {
      state.songs.push({ id: "", title: "", artist: "R.A.L.F.", category: "", cover: "", src: "", duration: 0 });
      wrap.remove();
      openSongEditor();
    };
    wrap.querySelector(".content").append(list, addBtn);
  }

  /* CATEGORY EDITOR */
  function openCategoryEditor() {
    const wrap = makeModal("Kategorien verwalten");
    const list = document.createElement("div");
    list.className = "flex flex-col gap-3";

    state.categories.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "flex gap-2 items-center";
      row.innerHTML = `
        <input value="${c.key}" placeholder="Key" class="w-32 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${c.label}" placeholder="Label" class="w-40 px-2 py-1 rounded bg-neutral-800"/>
        <input value="${c.cover}" placeholder="Cover-URL" class="flex-1 px-2 py-1 rounded bg-neutral-800"/>
        <button class="bg-red-600 hover:bg-red-500 px-2 py-1 rounded">Löschen</button>
      `;
      const inputs = row.querySelectorAll("input");
      inputs[0].oninput = e => state.categories[i].key = e.target.value;
      inputs[1].oninput = e => state.categories[i].label = e.target.value;
      inputs[2].oninput = e => state.categories[i].cover = e.target.value;
      row.querySelector("button").onclick = () => { state.categories.splice(i, 1); row.remove(); };
      list.appendChild(row);
    });

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Neue Kategorie";
    addBtn.className = "bg-orange-600 hover:bg-orange-500 px-3 py-1 rounded mt-2";
    addBtn.onclick = () => {
      state.categories.push({ key: "neu", label: "Neue Kategorie", cover: stdCover });
      wrap.remove();
      openCategoryEditor();
    };
    wrap.querySelector(".content").append(list, addBtn);
  }

  /* MODAL HELFER */
  function makeModal(title) {
    const wrap = document.createElement("div");
    wrap.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50";
    wrap.innerHTML = `
      <div class="bg-neutral-900 p-6 rounded-lg w-[90%] max-w-4xl">
        <h3 class="font-bold mb-4">${title}</h3>
        <div class="content"></div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="close bg-neutral-700 hover:bg-neutral-600 px-3 py-1 rounded">Schließen</button>
        </div>
      </div>`;
    wrap.querySelector(".close").onclick = () => wrap.remove();
    document.body.appendChild(wrap);
    return wrap;
  }

  /* DOWNLOAD HELFER */
  function downloadFile(name, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
})();
