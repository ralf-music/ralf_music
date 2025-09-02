/* RALF Editor v2 — lädt nur bei ?edit=1
   Voraussetzungen: window.state {songs,categories}, window.renderSite(songs,categories)
   Entwurfs-Speicher: localStorage keys ralf_songs_json / ralf_categories_json
*/

(function () {
  const SKEY_SONGS = 'ralf_songs_json';
  const SKEY_CATS  = 'ralf_categories_json';
  const SKEY_ARTIST = 'ralf_default_artist';

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
  const fromSeconds = (n) => {
    n = Math.max(0, Math.floor(Number(n)||0));
    const m = Math.floor(n/60), s = n%60;
    return `${m}:${String(s).padStart(2,'0')}`;
  };
  const download = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };

  // ===== State bridges =====
  const getSongs = () => ensureArray(window.state?.songs, 'songs');
  const getCats  = () => ensureArray(window.state?.categories, 'categories');
  const setSongs = (arr) => { window.state.songs = arr; localStorage.setItem(SKEY_SONGS, JSON.stringify({ songs: arr })); window.renderSite(window.state.songs, window.state.categories); };
  const setCats  = (arr) => { window.state.categories = arr; localStorage.setItem(SKEY_CATS, JSON.stringify({ categories: arr })); window.renderSite(window.state.songs, window.state.categories); };

  let DEFAULT_ARTIST = localStorage.getItem(SKEY_ARTIST) || 'R.A.L.F.';

  // ===== Admin Bar =====
  const bar = el('div', 'fixed top-3 right-3 z-50 flex flex-wrap gap-2');
  bar.innerHTML = `
    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900/90 ring-1 ring-white/10 shadow">
      <span class="text-xs px-2 py-1 rounded-full bg-orange-600 text-white">EDIT</span>
      <button id="btnSongNew" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Song hinzufügen</button>
      <button id="btnCatManage" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorien verwalten</button>
      <button id="btnSaveSongs" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Songs speichern</button>
      <button id="btnSaveCats"  class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorien speichern</button>
      <button id="btnImport"    class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Import</button>
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

  // ===== Song-Formular (mit Kategorie-Dropdown + Artist-Schnellknopf) =====
  const songFormHTML = (pref = {}) => {
    const cats = getCats();
    const catOpts = cats.map(c => `<option value="${c.key}" ${pref.category===c.key?'selected':''}>${c.label} (${c.key})</option>`).join('');
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-neutral-400">ID (slug, eindeutig)</label>
          <input id="f_id" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.id||''}">
        </div>
        <div>
          <label class="text-xs text-neutral-400">Kategorie</label>
          <select id="f_category_sel" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10">
            <option value="">— auswählen —</option>
            ${catOpts}
            <option value="__new__">+ Neue Kategorie anlegen…</option>
          </select>
          <input id="f_category_new" class="hidden mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" placeholder="neuer category-key (z. B. trance)">
        </div>
        <div>
          <label class="text-xs text-neutral-400">Titel</label>
          <input id="f_title" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.title||''}">
        </div>
        <div>
          <label class="text-xs text-neutral-400">Artist</label>
          <div class="flex gap-2">
            <input id="f_artist" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.artist||''}">
            <button type="button" id="f_artist_fill" class="mt-1 px-2 rounded-lg bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700 text-xs">↪ ${DEFAULT_ARTIST}</button>
          </div>
          <div class="mt-1 text-[11px] text-neutral-500">Klick setzt den Artist auf deinen Standard.</div>
        </div>
        <div class="sm:col-span-2">
          <label class="text-xs text-neutral-400">Cover-URL</label>
          <input id="f_cover" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.cover||''}">
        </div>
        <div class="sm:col-span-2">
          <label class="text-xs text-neutral-400">MP3-URL (RAW GitHub)</label>
          <input id="f_src" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" placeholder="https://raw.githubusercontent.com/..." value="${pref.src||''}">
        </div>
        <div>
          <label class="text-xs text-neutral-400">Dauer</label>
          <div class="flex gap-2 items-center">
            <input id="f_dur" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" placeholder="mm:ss oder Sekunden" value="${pref.duration ? fromSeconds(pref.duration) : ''}">
            <span class="text-xs text-neutral-500">mm:ss oder 212</span>
          </div>
        </div>
      </div>
      <script>
        // kleine Inline-Logik für das Modal
        (function(){
          const sel = document.getElementById('f_category_sel');
          const neu = document.getElementById('f_category_new');
          if (sel) sel.addEventListener('change', () => {
            if (sel.value === '__new__') { neu.classList.remove('hidden'); neu.focus(); }
            else neu.classList.add('hidden');
          });
          const btn = document.getElementById('f_artist_fill');
          if (btn) btn.addEventListener('click', () => {
            const a = document.getElementById('f_artist'); if (a) a.value = ${JSON.stringify(DEFAULT_ARTIST)};
          });
        })();
      </script>
    `;
  };

  // ===== Kategorien-Manager (Liste mit Bearbeiten/Löschen/Hinzufügen) =====
  const catsManagerHTML = () => {
    const rows = getCats().map(c => `
      <tr class="border-b border-neutral-800">
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.key}" data-field="key"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.label}" data-field="label"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.cover}" data-field="cover"></td>
        <td class="p-2 text-right">
          <button class="px-2 py-1 text-xs rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" data-action="del">Löschen</button>
        </td>
      </tr>
    `).join('');
    return `
      <div class="space-y-3">
        <div class="text-sm text-neutral-400">Achtung: das Ändern eines <b>Key</b> wirkt sich auf Songs aus, die diesen Key benutzen.</div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-neutral-400">
              <th class="p-2 w-32">Key</th>
              <th class="p-2 w-48">Label</th>
              <th class="p-2">Cover</th>
              <th class="p-2 w-24"></th>
            </tr>
          </thead>
          <tbody id="catRows">${rows || ''}</tbody>
        </table>
        <button id="catAddRow" class="mt-2 px-3 py-1.5 rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700 text-sm">+ Neue Kategorie</button>
      </div>
      <script>
        (function(){
          const tbody = document.getElementById('catRows');
          document.getElementById('catAddRow').addEventListener('click', () => {
            const tr = document.createElement('tr');
            tr.className='border-b border-neutral-800';
            tr.innerHTML = \`
              <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="key"  placeholder="key"></td>
              <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="label" placeholder="Label"></td>
              <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="cover" placeholder="https://..."></td>
              <td class="p-2 text-right"><button class="px-2 py-1 text-xs rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" data-action="del">Löschen</button></td>
            \`;
            tbody.appendChild(tr);
          });
          tbody?.addEventListener('click', (e) => {
            if (e.target && e.target.dataset.action === 'del') {
              e.target.closest('tr')?.remove();
            }
          });
        })();
      </script>
    `;
  };

  // ===== Modal-Helfer zum Auslesen =====
  const readSongFromModal = () => {
    const id = $('#f_id', modalWrap)?.value.trim();
    let category = $('#f_category_sel', modalWrap)?.value || '';
    if (category === '__new__') category = $('#f_category_new', modalWrap)?.value.trim() || '';
    const title  = $('#f_title', modalWrap)?.value.trim();
    const artist = $('#f_artist', modalWrap)?.value.trim();
    const cover  = $('#f_cover', modalWrap)?.value.trim();
    const src    = $('#f_src', modalWrap)?.value.trim();
    const durRaw = $('#f_dur', modalWrap)?.value.trim();
    const duration = /^\d+:\d{1,2}$/.test(durRaw) ? toSeconds(durRaw) : (isFinite(Number(durRaw)) ? Number(durRaw) : 0);

    const missing = [];
    if (!id) missing.push('ID');
    if (!category) missing.push('Kategorie');
    if (!title) missing.push('Titel');
    if (!artist) missing.push('Artist');
    if (!cover) missing.push('Cover');
    if (!src) missing.push('MP3-URL');
    if (missing.length) { alert('Bitte ausfüllen: ' + missing.join(', ')); return null; }

    return { id, title, artist, category, cover, src, duration };
  };

  const readCatsFromModal = () => {
    const rows = $$('#catRows tr', modalWrap);
    const list = rows.map(tr => {
      const obj = {};
      $$('#catRows tr input', tr);
      $$( '[data-field]', tr).forEach(inp => { obj[inp.dataset.field] = inp.value.trim(); });
      return obj;
    }).filter(x => x.key && x.label && x.cover);
    // Keys einzigartig
    const dup = list.map(x=>x.key);
    if (new Set(dup).size !== dup.length) { alert('Kategorie-Keys müssen eindeutig sein.'); return null; }
    return list;
  };

  // ===== Buttons: Aktionen =====
  $('#btnSongNew', bar).onclick = () => {
    showModal('Song hinzufügen', songFormHTML(), () => {
      const s = readSongFromModal(); if (!s) return false;

      // Neue Kategorie on-the-fly anlegen?
      if (!getCats().some(c => c.key === s.category)) {
        const label = prompt(`Neue Kategorie "${s.category}" – Anzeigename:`, s.category);
        if (!label) return false;
        setCats([...getCats(), { key: s.category, label, cover: s.cover }]);
      }

      // ID unique -> ersetzen oder pushen
      const rest = getSongs().filter(x => x.id !== s.id);
      setSongs([...rest, s]);
    });
  };

  $('#btnCatManage', bar).onclick = () => {
    showModal('Kategorien verwalten', catsManagerHTML(), () => {
      const list = readCatsFromModal(); if (!list) return false;
      setCats(list);
    });
  };

  $('#btnSaveSongs', bar).onclick = () => {
    const data = { songs: getSongs() };
    localStorage.setItem(SKEY_SONGS, JSON.stringify(data));
    download(data, 'songs.json');
  };

  $('#btnSaveCats', bar).onclick = () => {
    const data = { categories: getCats() };
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
        if (json.songs) { setSongs(json.songs); }
        else if (json.categories) { setCats(json.categories); }
        else if (Array.isArray(json)) {
          if (json.length && json[0]?.id) setSongs(json);
          else if (json.length && json[0]?.key) setCats(json);
          else return alert('JSON nicht erkannt. Erwartet songs[] oder categories[].');
        } else return alert('JSON-Format unbekannt.');
        alert('Import erfolgreich (Entwurf gespeichert).');
      } catch (e) { alert('Fehler beim JSON-Import: ' + e.message); }
    };
    fi.click();
  };

  $('#btnDiscard', bar).onclick = () => {
    if (!confirm('Lokale Entwürfe verwerfen? (songs/categories)')) return;
    localStorage.removeItem(SKEY_SONGS);
    localStorage.removeItem(SKEY_CATS);
    location.reload();
  };

  $('#btnSetArtistStd', bar).onclick = () => {
    const v = prompt('Standard-Artist setzen:', DEFAULT_ARTIST || 'R.A.L.F.');
    if (!v) return;
    DEFAULT_ARTIST = v.trim();
    localStorage.setItem(SKEY_ARTIST, DEFAULT_ARTIST);
    $('#artistStd', bar).textContent = DEFAULT_ARTIST;
    alert('Standard-Artist aktualisiert.');
  };

})();
