/* RALF Editor v1 — lädt nur bei ?edit=1
   Voraussetzungen: window.state {songs,categories}, window.renderSite(songs,cats)
   Entwurfs-Speicher: localStorage keys ralf_songs_json / ralf_categories_json
*/

(function () {
  const SKEY_SONGS = 'ralf_songs_json';
  const SKEY_CATS  = 'ralf_categories_json';

  // Helper
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls = '', html = '') => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html) n.innerHTML = html;
    return n;
  };
  const toSeconds = (v) => {
    if (v == null || v === '') return 0;
    if (/^\d+:\d{1,2}$/.test(v)) {
      const [m, s] = v.split(':').map(Number);
      return m * 60 + s;
    }
    const n = Number(v);
    return isFinite(n) ? Math.floor(n) : 0;
  };
  const download = (obj, filename) => {
    const blob = new Blob(
      [Array.isArray(obj) ? JSON.stringify({ songs: obj }, null, 2) : JSON.stringify(obj, null, 2)],
      { type: 'application/json;charset=utf-8' }
    );
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };

  // Admin-Bar
  const bar = el('div', 'fixed top-3 right-3 z-50 flex flex-wrap gap-2');
  bar.innerHTML = `
    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900/90 ring-1 ring-white/10 shadow">
      <span class="text-xs px-2 py-1 rounded-full bg-orange-600 text-white">EDIT</span>
      <button id="btnAddSong" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Song hinzufügen</button>
      <button id="btnAddCat"  class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorie</button>
      <button id="btnSaveSongs" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Songs speichern</button>
      <button id="btnSaveCats"  class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorien speichern</button>
      <button id="btnImport" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Import</button>
      <button id="btnDiscard" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Entwurf verwerfen</button>
    </div>`;
  document.body.appendChild(bar);

  // Modal
  const modalWrap = el('div', 'fixed inset-0 z-50 hidden');
  modalWrap.innerHTML = `
    <div class="absolute inset-0 bg-black/60"></div>
    <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,95vw)] rounded-2xl bg-neutral-900 ring-1 ring-white/10 shadow-xl">
      <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
        <h3 id="modalTitle" class="font-semibold">Titel</h3>
        <button id="modalClose" class="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700">✕</button>
      </div>
      <div id="modalBody" class="p-5"></div>
      <div class="p-5 border-t border-neutral-800 flex justify-end gap-2">
        <button id="modalCancel" class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">Abbrechen</button>
        <button id="modalOK" class="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(modalWrap);

  const showModal = (title, bodyHTML, onOK) => {
    $('#modalTitle', modalWrap).textContent = title;
    $('#modalBody', modalWrap).innerHTML = bodyHTML;
    modalWrap.classList.remove('hidden');
    const close = () => modalWrap.classList.add('hidden');
    $('#modalClose', modalWrap).onclick = close;
    $('#modalCancel', modalWrap).onclick = close;
    $('#modalOK', modalWrap).onclick = () => { if (onOK && onOK() !== false) close(); };
  };

  // Song-Formular
  const songFormHTML = (prefill = {}) => `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="text-xs text-neutral-400">ID (slug, eindeutig)</label>
        <input id="f_id" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.id || ''}">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Kategorie-Key (z. B. trance)</label>
        <input id="f_category" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.category || ''}">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Titel</label>
        <input id="f_title" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.title || ''}">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Artist</label>
        <input id="f_artist" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.artist || ''}">
      </div>
      <div class="sm:col-span-2">
        <label class="text-xs text-neutral-400">Cover-URL</label>
        <input id="f_cover" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.cover || ''}">
      </div>
      <div class="sm:col-span-2">
        <label class="text-xs text-neutral-400">MP3-URL (RAW GitHub)</label>
        <input id="f_src" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" placeholder="https://raw.githubusercontent.com/..." value="${prefill.src || ''}">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Dauer (Sekunden oder mm:ss)</label>
        <input id="f_dur" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.duration || ''}">
      </div>
    </div>
    <p class="mt-3 text-xs text-neutral-500">Tipp: Dauer kannst du als <b>3:32</b> oder <b>212</b> eintragen.</p>
  `;

  // Kategorie-Formular
  const catFormHTML = (prefill = {}) => `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="text-xs text-neutral-400">Key (slug, eindeutig)</label>
        <input id="c_key" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.key || ''}">
      </div>
      <div>
        <label class="text-xs text-neutral-400">Label (Anzeige)</label>
        <input id="c_label" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.label || ''}">
      </div>
      <div class="sm:col-span-2">
        <label class="text-xs text-neutral-400">Cover-URL</label>
        <input id="c_cover" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${prefill.cover || ''}">
      </div>
    </div>
  `;

  // Buttons verdrahten
  $('#btnAddSong', bar).onclick = () => {
    showModal('Song hinzufügen', songFormHTML(), () => {
      const s = {
        id: $('#f_id', modalWrap).value.trim(),
        title: $('#f_title', modalWrap).value.trim(),
        artist: $('#f_artist', modalWrap).value.trim(),
        category: $('#f_category', modalWrap).value.trim(),
        cover: $('#f_cover', modalWrap).value.trim(),
        src: $('#f_src', modalWrap).value.trim(),
        duration: toSeconds($('#f_dur', modalWrap).value.trim())
      };
      // Pflichtfelder
      const required = ['id','title','artist','category','cover','src'];
      for (const k of required) {
        if (!s[k]) { alert(`Feld "${k}" fehlt.`); return false; }
      }
      // ID unique
      if ((window.state.songs || []).some(x => x.id === s.id)) {
        if (!confirm('ID existiert bereits. Überschreiben?')) return false;
        window.state.songs = window.state.songs.filter(x => x.id !== s.id);
      }
      window.state.songs.push(s);
      // Entwurf speichern
      localStorage.setItem(SKEY_SONGS, JSON.stringify({ songs: window.state.songs }));
      window.renderSite(window.state.songs, window.state.categories);
    });
  };

  $('#btnAddCat', bar).onclick = () => {
    showModal('Kategorie hinzufügen', catFormHTML(), () => {
      const c = {
        key:   $('#c_key', modalWrap).value.trim(),
        label: $('#c_label', modalWrap).value.trim(),
        cover: $('#c_cover', modalWrap).value.trim()
      };
      const required = ['key','label','cover'];
      for (const k of required) { if (!c[k]) { alert(`Feld "${k}" fehlt.`); return false; } }
      if ((window.state.categories || []).some(x => x.key === c.key)) {
        if (!confirm('Key existiert bereits. Überschreiben?')) return false;
        window.state.categories = window.state.categories.filter(x => x.key !== c.key);
      }
      window.state.categories.push(c);
      localStorage.setItem(SKEY_CATS, JSON.stringify({ categories: window.state.categories }));
      window.renderSite(window.state.songs, window.state.categories);
    });
  };

  $('#btnSaveSongs', bar).onclick = () => {
    const data = { songs: (window.state.songs || []) };
    localStorage.setItem(SKEY_SONGS, JSON.stringify(data));
    download(data, 'songs.json');
  };

  $('#btnSaveCats', bar).onclick = () => {
    const data = { categories: (window.state.categories || []) };
    localStorage.setItem(SKEY_CATS, JSON.stringify(data));
    download(data, 'categories.json');
  };

  $('#btnImport', bar).onclick = () => {
    const fi = el('input'); fi.type = 'file'; fi.accept = '.json,application/json';
    fi.onchange = async () => {
      const file = fi.files[0]; if (!file) return;
      const text = await file.text();
      try {
        const json = JSON.parse(text);
        if (json.songs) {
          localStorage.setItem(SKEY_SONGS, JSON.stringify(json));
          window.state.songs = json.songs;
        } else if (json.categories) {
          localStorage.setItem(SKEY_CATS, JSON.stringify(json));
          window.state.categories = json.categories;
        } else if (Array.isArray(json)) {
          // Rate anhand des ersten Elements
          if (json.length && json[0].id) {
            localStorage.setItem(SKEY_SONGS, JSON.stringify({ songs: json }));
            window.state.songs = json;
          } else if (json.length && json[0].key) {
            localStorage.setItem(SKEY_CATS, JSON.stringify({ categories: json }));
            window.state.categories = json;
          } else {
            alert('JSON nicht erkannt. Erwartet songs[] oder categories[].');
            return;
          }
        } else {
          alert('JSON-Format unbekannt.');
          return;
        }
        window.renderSite(window.state.songs, window.state.categories);
        alert('Import erfolgreich (Entwurf gespeichert).');
      } catch (e) {
        alert('Fehler beim JSON-Import: ' + e.message);
      }
    };
    fi.click();
  };

  $('#btnDiscard', bar).onclick = () => {
    if (!confirm('Lokale Entwürfe verwerfen? (songs/categories)')) return;
    localStorage.removeItem(SKEY_SONGS);
    localStorage.removeItem(SKEY_CATS);
    location.reload();
  };

  // Kleines „Edit“-Badge am Seitenrand, falls das Dock den Inhalt verdeckt
  document.body.classList.add('pr-[0px]'); // Reserve für die Bar, aktuell nicht nötig
})();
