/* RALF Editor v3.4 — MP3-Helfer + Kategorien-Manager (immer state, Default-Cover)
   Lädt nur bei ?edit=1
   Erwartet: window.state {songs,categories}, window.renderSite(songs,categories)
   Speichert Entwürfe in localStorage:
     - ralf_songs_json
     - ralf_categories_json
     - ralf_default_artist
*/
(function () {
  const SKEY_SONGS   = 'ralf_songs_json';
  const SKEY_CATS    = 'ralf_categories_json';
  const SKEY_ARTIST  = 'ralf_default_artist';

  // Standard-Cover für neue Kategorien
  const DEFAULT_CAT_COVER = "https://github.com/ralf-music/ralf_music/blob/main/assets/logo-kategorie.png?raw=true";

  // ===== Helpers =====
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls = '', html = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (html) n.innerHTML = html; return n; };
  const ensureArray = (x, prop) => Array.isArray(x) ? x : (x && x[prop] ? x[prop] : []);
  const toSeconds = (v) => {
    if (v == null || v === '') return 0;
    if (/^\d+:\d{1,2}$/.test(v)) { const [m,s]=v.split(':').map(Number); return m*60+s; }
    const n = Number(v); return isFinite(n) ? Math.floor(n) : 0;
  };
  const fromSeconds = (n) => { n = Math.max(0, Math.floor(Number(n)||0)); const m=Math.floor(n/60), s=n%60; return `${m}:${String(s).padStart(2,'0')}`; };
  const download = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };
  const stripExt = (name) => name.replace(/\.[^.]+$/, '');
  const niceId   = (name) => stripExt(name).trim().replace(/\s+/g,'-').replace(/[^a-zA-Z0-9-_]/g,'').toLowerCase();

  // ===== State bridges =====
  const getSongs = () => ensureArray(window.state?.songs, 'songs');
  const getCats  = () => ensureArray(window.state?.categories, 'categories');
  const setSongs = (arr) => { window.state.songs = arr; localStorage.setItem(SKEY_SONGS, JSON.stringify({ songs: arr })); window.renderSite(window.state.songs, window.state.categories); };
  const setCats  = (arr) => { window.state.categories = arr; localStorage.setItem(SKEY_CATS,  JSON.stringify({ categories: arr })); window.renderSite(window.state.songs, window.state.categories); };

  let DEFAULT_ARTIST = localStorage.getItem(SKEY_ARTIST) || 'R.A.L.F.';

  // ===== Admin Bar =====
  const bar = el('div', 'fixed top-3 right-3 z-50 flex flex-wrap gap-2');
  bar.innerHTML = `
    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900/90 ring-1 ring-white/10 shadow">
      <span class="text-xs px-2 py-1 rounded-full bg-orange-600 text-white">EDIT</span>
      <button id="btnSongNew"   class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Song hinzufügen</button>
      <button id="btnMp3Helper" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">MP3 importieren</button>
      <button id="btnCatManage" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorien verwalten</button>
      <button id="btnSaveSongs" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Songs speichern</button>
      <button id="btnSaveCats"  class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorien speichern</button>
      <button id="btnDiscard"   class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Entwurf verwerfen</button>
      <span class="hidden sm:inline text-xs text-neutral-400">Artist-Standard: <b id="artistStd" class="text-neutral-200">${DEFAULT_ARTIST}</b></span>
      <button id="btnSetArtistStd" class="px-2 py-1 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Standard ändern</button>
    </div>`;
  document.body.appendChild(bar);

  // ===== Modal =====
  const modalWrap = el('div', 'fixed inset-0 z-50 hidden');
  modalWrap.innerHTML = `
    <div class="absolute inset-0 bg-black/60"></div>
    <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,95vw)] rounded-2xl bg-neutral-900 ring-1 ring-white/10 shadow-xl">
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
    $('#modalBody',  modalWrap).innerHTML   = bodyHTML;
    modalWrap.classList.remove('hidden');
    const close = () => modalWrap.classList.add('hidden');
    $('#modalClose', modalWrap).onclick = close;
    $('#modalCancel',modalWrap).onclick = close;
    $('#modalOK',    modalWrap).onclick = () => { if (!onOK || onOK() !== false) close(); };
  };

  // ===== Kategorien-Manager =====
  const catsManagerHTML = () => {
    const rows = getCats().map(c => `
      <tr class="border-b border-neutral-800">
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.key}"   data-field="key"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.label}" data-field="label"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.cover}" data-field="cover"></td>
        <td class="p-2 text-right"><button class="px-2 py-1 text-xs rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" data-action="del">Löschen</button></td>
      </tr>
    `).join('');
    return `
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-neutral-400">
            <th class="p-2 w-32">Key</th>
            <th class="p-2 w-48">Label</th>
            <th class="p-2">Cover</th>
            <th class="p-2 w-24"></th>
          </tr>
        </thead>
        <tbody id="catRows">${rows}</tbody>
      </table>
      <button id="catAddRow" class="mt-3 px-3 py-1.5 rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700 text-sm">+ Neue Kategorie</button>
    `;
  };

  // ===== Modal Events =====
  modalWrap.addEventListener('click', (e) => {
    const t = e.target;
    // Artist schnell füllen
    if (t.id === 'f_artist_fill') {
      const a = $('#f_artist', modalWrap); if (a) a.value = DEFAULT_ARTIST;
    }
    // Kategorie-Zeile hinzufügen
    if (t.id === 'catAddRow') {
      const tbody = $('#catRows', modalWrap);
      const tr = document.createElement('tr');
      tr.className = 'border-b border-neutral-800';
      tr.innerHTML = `
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="key"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="label"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="cover" value="${DEFAULT_CAT_COVER}"></td>
        <td class="p-2 text-right"><button class="px-2 py-1 text-xs rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" data-action="del">Löschen</button></td>
      `;
      tbody.appendChild(tr);
    }
    // Kategorie-Zeile löschen
    if (t.dataset?.action === 'del') {
      t.closest('tr')?.remove();
    }
  });

  // ===== Read Helpers =====
  const readCatsFromModal = () => {
    const rows = $$('#catRows tr', modalWrap);
    return rows.map(tr => {
      const obj = {};
      $$('input[data-field]', tr).forEach(inp => { obj[inp.dataset.field] = inp.value.trim(); });
      if (!obj.cover) obj.cover = DEFAULT_CAT_COVER; // falls leer → Standard setzen
      return obj;
    }).filter(x => x.key && x.label);
  };

  // ===== Aktionen =====
  $('#btnCatManage', bar).onclick = () => {
    showModal('Kategorien verwalten', catsManagerHTML(), () => {
      const list = readCatsFromModal(); 
      if (!list) return false;
      setCats(list);
    });
  };

  $('#btnSaveCats', bar).onclick = () => {
    const data = { categories: getCats() };
    localStorage.setItem(SKEY_CATS, JSON.stringify(data));
    download(data, 'categories.json');
  };

  // Rest (Songs, MP3-Helper, Discard, Artist-Std) bleibt unverändert...
  // ...
})();
