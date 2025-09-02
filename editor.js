/* RALF Editor v3.8 — stabile Saves (Cats+Songs), MP3-Import, Default-Cover, state-Fix
   Lädt nur bei ?edit=1
   Erwartet: window.state {songs,categories}, window.renderSite(songs,categories)
   Lokale Entwürfe: ralf_songs_json, ralf_categories_json, ralf_default_artist
*/
(function () {
  const SKEY_SONGS   = 'ralf_songs_json';
  const SKEY_CATS    = 'ralf_categories_json';
  const SKEY_ARTIST  = 'ralf_default_artist';

  const DEFAULT_CAT_COVER = "https://github.com/ralf-music/ralf_music/blob/main/assets/logo-kategorie.png?raw=true";

  // ---------- sicherstellen, dass window.state existiert ----------
  function ensureState() {
    if (!window.state || typeof window.state !== 'object') {
      window.state = { songs: [], categories: [], cat: 'all', query: '', active: null };
    }
    if (!Array.isArray(window.state.songs)) window.state.songs = [];
    if (!Array.isArray(window.state.categories)) window.state.categories = [];
  }
  ensureState();

  // ---------- kleine Helfer ----------
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

  // ---------- Bridge zum App-State ----------
  const getSongs = () => { ensureState(); return ensureArray(window.state.songs, 'songs'); };
  const getCats  = () => { ensureState(); return ensureArray(window.state.categories, 'categories'); };

  const setSongs = (arr) => {
    ensureState();
    window.state.songs = arr;
    localStorage.setItem(SKEY_SONGS, JSON.stringify({ songs: arr }));
    if (typeof window.renderSite === 'function') window.renderSite(window.state.songs, window.state.categories);
  };
  const setCats = (arr) => {
    ensureState();
    window.state.categories = arr;
    localStorage.setItem(SKEY_CATS, JSON.stringify({ categories: arr }));
    if (typeof window.renderSite === 'function') window.renderSite(window.state.songs, window.state.categories);
  };

  let DEFAULT_ARTIST = localStorage.getItem(SKEY_ARTIST) || 'R.A.L.F.';

  // ---------- Admin-Bar ----------
  const bar = el('div', 'fixed top-3 right-3 z-50 flex flex-wrap gap-2');
  bar.innerHTML = `
    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900/90 ring-1 ring-white/10 shadow text-white">
      <span class="text-xs px-2 py-1 rounded-full bg-orange-600 text-white">EDIT</span>
      <button id="btnSongNew"   class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Song hinzufügen</button>
      <button id="btnMp3Helper" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">MP3 importieren</button>
      <button id="btnCatManage" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorien verwalten</button>
      <button id="btnSaveSongs" class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Songs speichern</button>
      <button id="btnSaveCats"  class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Kategorien speichern</button>
      <button id="btnDiscard"   class="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Entwurf verwerfen</button>
      <span class="hidden sm:inline text-xs text-neutral-300">Artist-Standard: <b id="artistStd" class="text-neutral-100">${DEFAULT_ARTIST}</b></span>
      <button id="btnSetArtistStd" class="px-2 py-1 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 ring-1 ring-white/10">Standard ändern</button>
    </div>`;
  document.body.appendChild(bar);

  // ---------- Modal ----------
  const modal = el('div', 'fixed inset-0 z-50 hidden');
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60"></div>
    <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,95vw)] rounded-2xl bg-neutral-900 ring-1 ring-white/10 shadow-xl text-white">
      <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
        <h3 id="modalTitle" class="font-semibold">Titel</h3>
        <button id="modalClose" type="button" class="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700">✕</button>
      </div>
      <div id="modalBody" class="p-5"></div>
      <div class="p-5 border-t border-neutral-800 flex justify-end gap-2">
        <button id="modalCancel" type="button" class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">Abbrechen</button>
        <button id="modalOK" type="button" class="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let modalOnOK = null;
  const openModal = (title, bodyHTML, onOK) => {
    $('#modalTitle', modal).textContent = title;
    $('#modalBody', modal).innerHTML = bodyHTML;
    modalOnOK = onOK || null;
    modal.classList.remove('hidden');
  };
  const closeModal = () => { modal.classList.add('hidden'); modalOnOK = null; };

  $('#modalClose', modal).onclick = closeModal;
  $('#modalCancel', modal).onclick = closeModal;
  $('#modalOK', modal).onclick = () => {
    try {
      if (!modalOnOK) { closeModal(); return; }
      const res = modalOnOK();
      if (res !== false) closeModal();
    } catch (err) {
      alert('Fehler beim Speichern: ' + (err?.message || err));
      console.error(err);
    }
  };

  // ---------- Kategorien-Manager ----------
  const catsManagerHTML = () => {
    const rows = getCats().map(c => `
      <tr class="border-b border-neutral-800">
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.key}"   data-field="key"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.label}" data-field="label"></td>
        <td class="p-2 flex gap-2">
          <input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" value="${c.cover || DEFAULT_CAT_COVER}" data-field="cover">
          <button class="px-2 py-1 text-xs rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" data-action="del">Löschen</button>
        </td>
      </tr>
    `).join('');
    return `
      <div class="text-sm text-neutral-300 mb-3">Key ist der technische Name, Label ist die Anzeige. Cover kann leer bleiben, dann wird das Standardbild verwendet.</div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-neutral-400">
            <th class="p-2 w-40">Key</th>
            <th class="p-2 w-48">Label</th>
            <th class="p-2">Cover</th>
          </tr>
        </thead>
        <tbody id="catRows">${rows}</tbody>
      </table>
      <button id="catAddRow" type="button" class="mt-4 px-3 py-1.5 rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700 text-sm">+ Neue Kategorie</button>
    `;
  };

  modal.addEventListener('click', (e) => {
    const t = e.target;
    if (t.id === 'catAddRow') {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-neutral-800';
      tr.innerHTML = `
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="key" placeholder="z.B. deutsch-rap"></td>
        <td class="p-2"><input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="label" placeholder="Deutsch Rap"></td>
        <td class="p-2 flex gap-2">
          <input class="w-full px-2 py-1 rounded bg-neutral-800 ring-1 ring-white/10" data-field="cover" value="${DEFAULT_CAT_COVER}">
          <button class="px-2 py-1 text-xs rounded bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" data-action="del">Löschen</button>
        </td>
      `;
      $('#catRows', modal).appendChild(tr);
    }
    if (t.dataset?.action === 'del') {
      t.closest('tr')?.remove();
    }
  });

  const readCatsFromModal = () => {
    const rows = $$('#catRows tr', modal);
    const out = [];
    rows.forEach(tr => {
      const obj = {};
      $$('input[data-field]', tr).forEach(inp => obj[inp.dataset.field] = (inp.value||'').trim());
      if (!obj.key || !obj.label) return; // unvollständige Zeilen ignorieren
      if (!obj.cover) obj.cover = DEFAULT_CAT_COVER;
      out.push(obj);
    });
    if (!out.length) throw new Error('Keine gültigen Kategorienzeilen.');
    return out;
  };

  $('#btnCatManage', bar).onclick = () => {
    openModal('Kategorien verwalten', catsManagerHTML(), () => {
      const list = readCatsFromModal();
      setCats(list);
      alert('Kategorien übernommen. Mit „Kategorien speichern“ exportierst du die JSON fürs Repo.');
    });
  };

  // ---------- Songs speichern / Kategorien speichern ----------
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

  // ---------- Song-Form ----------
  const songFormHTML = (pref = {}) => {
    const cats = getCats();
    const catOpts = cats.map(c => `<option value="${c.key}" ${pref.category===c.key?'selected':''}>${c.label} (${c.key})</option>`).join('');
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <label class="text-xs text-neutral-400">ID (slug)</label>
          <input id="f_id" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.id||''}" placeholder="z.b. glasherz">
        </div>
        <div>
          <label class="text-xs text-neutral-400">Kategorie</label>
          <select id="f_category_sel" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10">
            <option value="">— auswählen —</option>
            ${catOpts}
            <option value="__new__">+ Neue Kategorie…</option>
          </select>
          <input id="f_category_new" class="hidden mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" placeholder="neuer category-key">
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
        </div>
        <div class="sm:col-span-2">
          <label class="text-xs text-neutral-400">Cover-URL</label>
          <input id="f_cover" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.cover||''}" placeholder="leer = Kategorie-Cover / Standard">
        </div>
        <div class="sm:col-span-2">
          <label class="text-xs text-neutral-400">MP3-URL (RAW GitHub)</label>
          <input id="f_src" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.src||''}">
        </div>
        <div>
          <label class="text-xs text-neutral-400">Dauer</label>
          <input id="f_dur" class="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-800 ring-1 ring-white/10" value="${pref.duration ? fromSeconds(pref.duration) : ''}" placeholder="z.B. 3:32">
        </div>
      </div>`;
  };

  modal.addEventListener('change', (e) => {
    if (e.target?.id === 'f_category_sel') {
      const showNew = e.target.value === '__new__';
      $('#f_category_new', modal)?.classList.toggle('hidden', !showNew);
    }
  });
  modal.addEventListener('click', (e) => {
    if (e.target?.id === 'f_artist_fill') {
      const a = $('#f_artist', modal); if (a) a.value = DEFAULT_ARTIST;
    }
  });

  const saveSongFromModal = () => {
    const id  = $('#f_id', modal)?.value.trim();
    const ttl = $('#f_title', modal)?.value.trim();
    const art = $('#f_artist', modal)?.value.trim();
    const sel = $('#f_category_sel', modal)?.value;
    const cat = sel === '__new__' ? ($('#f_category_new', modal)?.value.trim() || '') : (sel || '');

    let cov = $('#f_cover', modal)?.value.trim();
    const src = $('#f_src', modal)?.value.trim();
    const dur = toSeconds($('#f_dur', modal)?.value.trim());

    if (!id)  return alert('Bitte eine ID eingeben.'), false;
    if (!ttl) return alert('Bitte Titel eingeben.'), false;
    if (!art) return alert('Bitte Artist eingeben.'), false;

    // Kategorie robust wählen/erzeugen
    let cats = getCats();
    let finalCat = cat;
    if (!finalCat) {
      if (cats.length === 0) {
        cats = [{ key: 'unsortiert', label: 'Unsortiert', cover: DEFAULT_CAT_COVER }];
        setCats(cats);
      }
      finalCat = cats[0].key;
    }
    if (!cats.some(c => c.key === finalCat)) {
      const labelGuess = finalCat.replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();
      cats = [...cats, { key: finalCat, label: labelGuess || finalCat, cover: DEFAULT_CAT_COVER }];
      setCats(cats);
    }

    if (!cov) {
      const catObj = cats.find(c => c.key === finalCat);
      cov = catObj?.cover || DEFAULT_CAT_COVER;
    }
    if (!src) return alert('Bitte MP3-URL (RAW) eintragen.'), false;

    const s = { id, title: ttl, artist: art, category: finalCat, cover: cov, src, duration: dur };
    const rest = getSongs().filter(x => x.id !== id);
    setSongs([...rest, s]);
    alert('Song gespeichert (lokal). Mit „Songs speichern“ exportierst du die JSON fürs Repo.');
    return true;
  };

  $('#btnSongNew', bar).onclick = () => openModal('Song hinzufügen', songFormHTML(), () => saveSongFromModal());

  $('#btnMp3Helper', bar).onclick = () => {
    const fi = el('input'); fi.type = 'file'; fi.accept = 'audio/mpeg,.mp3';
    fi.onchange = () => {
      const file = fi.files?.[0]; if (!file) return;
      const objURL = URL.createObjectURL(file);
      const a = new Audio(); a.src = objURL;
      a.addEventListener('loadedmetadata', () => {
        const seconds = Math.floor(a.duration || 0);
        URL.revokeObjectURL(objURL);
        const fname = file.name;
        const id = niceId(fname);
        const title = stripExt(fname);
        const rawURL = `https://raw.githubusercontent.com/ralf-music/ralf_music/main/assets/songs/${encodeURIComponent(fname)}`;
        const pref = { id, title, artist: DEFAULT_ARTIST, category: '', cover: '', src: rawURL, duration: seconds };
        openModal('Neuer Song (aus MP3)', songFormHTML(pref), () => saveSongFromModal());
      }, { once: true });
      a.addEventListener('error', () => {
        URL.revokeObjectURL(objURL);
        alert('Konnte die MP3-Dauer nicht lesen.');
      }, { once: true });
    };
    fi.click();
  };

  // ---------- Rest ----------
  $('#btnDiscard', bar).onclick = () => {
    if (!confirm('Entwürfe verwerfen? (lokale Änderungen werden gelöscht)')) return;
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
