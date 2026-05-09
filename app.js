// ═══════════════════════════════════════════════════════════════════════════
//  Rubrica Gemelli — frontend
// ═══════════════════════════════════════════════════════════════════════════

// ── Configurazione Supabase ──────────────────────────────────────────────────
const SUPA_URL = 'https://nbbekxuvuarxkuvvvgbi.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iYmVreHV2dWFyeGt1dnZ2Z2JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NzU4NTksImV4cCI6MjA5MzI1MTg1OX0.KPYvlg1bken6Oux0XltZL-Ld0mwyXeS7oek4uZaQDW0';

// ── Costanti ─────────────────────────────────────────────────────────────────
const LS_DATA    = 'rubrica-data';
const LS_CATS    = 'rubrica-cats';
const LS_TS      = 'rubrica-ts';
const LS_THEME   = 'rubrica-theme';
const LS_RECENT  = 'rubrica-recent-searches';
const LS_FAVS    = 'rubrica-favs';
const LS_CALLS   = 'rubrica-recent-calls';
const LS_QUEUE   = 'rubrica-pending-writes';
const MAX_RECENT = 5;
const MAX_CALLS  = 8;
const STAR_SVG   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const ALPHA_KEYS = ['0-9', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const TRASH_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const EDIT_SVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

// ── DOM cache (evita decine di getElementById) ───────────────────────────────
const $ = id => document.getElementById(id);
const D = {};
function cacheDOM() {
  [
    'contactList','countLabel','searchBar','searchWrap','btnSearchClear',
    'searchSuggestions',
    'btnTheme','btnInstall','btnSettings','btnAll','btnAlpha','btnNew',
    'chips','installToast',
    'modalOverlay','modalTitle','modalBox','contactForm',
    'fId','fNome','fCategoria','numeriContainer','btnAddNum',
    'btnCancel','btnDelete','btnSave','btnSaveVcf',
    'catModalOverlay','catModalBox','catList','fNewCat','btnAddCat',
    'btnCatCancel','btnCatSave',
    'alphaModalOverlay','alphaGrid','btnAlphaClose',
    'numMenuOverlay','numMenuTitle','numMenuSub',
  ].forEach(id => { D[id] = $(id); });
}

// ── Stato globale ────────────────────────────────────────────────────────────
let allContacts = [];
let categories  = [];
let activeCategory = null;
let activeSearch   = '';
let activeAlpha    = null;

// ── Tema (vedi sotto: implementazione 3-stati con auto/system) ──────────────
// Le funzioni applyTheme + cycleTheme sono definite più giù insieme alle costanti

// ── API Supabase con retry esponenziale ─────────────────────────────────────
async function supaFetch(path, options = {}, retryCount = 0) {
  const MAX_RETRIES = 2;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      // 5xx = retry, 4xx = errore vero
      if (res.status >= 500 && retryCount < MAX_RETRIES) {
        await sleep(200 * Math.pow(2, retryCount));
        return supaFetch(path, options, retryCount + 1);
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.hint || 'Errore rete (' + res.status + ')');
    }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (e) {
    // Errore di rete (TypeError) → retry se siamo entro la soglia
    if (e.name === 'TypeError' && retryCount < MAX_RETRIES) {
      await sleep(200 * Math.pow(2, retryCount));
      return supaFetch(path, options, retryCount + 1);
    }
    throw e;
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function formatCatName(s) {
  return s.replace(/[^a-zA-ZÀ-ÿ0-9 \-_.]/g, '').toUpperCase().trim();
}

// ── Avatar: hash colore stabile dalla categoria ──────────────────────────────
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffff;
  return Math.abs(h) % 360;
}
function avatarStyle(categoria) {
  const hue = hashHue(String(categoria || ''));
  return `background:hsl(${hue} 55% 42%)`;
}
function avatarLetter(nome) {
  const s = String(nome || '').trim();
  return s ? s[0].toUpperCase() : '?';
}

// ── Highlight match nei risultati ────────────────────────────────────────────
function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// `text` viene già escaped; tokens sono in lowercase. Wrappa i match in <mark>.
function highlight(text, tokens) {
  if (!text || !tokens || !tokens.length) return text;
  // Costruisce una regex unica per tutti i token, case-insensitive
  const re = new RegExp('(' + tokens.map(escRegex).join('|') + ')', 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

// ── Haptic feedback ──────────────────────────────────────────────────────────
function haptic(pattern = 8) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

// ── Ricerche recenti (localStorage) ──────────────────────────────────────────
function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(LS_RECENT)) || []; } catch { return []; }
}
function pushRecentSearch(q) {
  q = String(q || '').trim();
  if (!q || q.length < 2) return;
  let arr = getRecentSearches().filter(x => x.toLowerCase() !== q.toLowerCase());
  arr.unshift(q);
  arr = arr.slice(0, MAX_RECENT);
  localStorage.setItem(LS_RECENT, JSON.stringify(arr));
}
function removeRecentSearch(q) {
  const arr = getRecentSearches().filter(x => x !== q);
  localStorage.setItem(LS_RECENT, JSON.stringify(arr));
}
function renderRecentSuggestions() {
  const arr = getRecentSearches();
  if (!arr.length || activeSearch || document.activeElement !== D.searchBar) {
    D.searchSuggestions.hidden = true;
    return;
  }
  D.searchSuggestions.innerHTML = arr.map(q =>
    `<button class="search-suggestion" data-q="${esc(q)}" type="button">
       <span>${esc(q)}</span><span class="sug-x" data-x="${esc(q)}">×</span>
     </button>`
  ).join('');
  D.searchSuggestions.hidden = false;
}

// ── Salvataggio scroll position fra modal e ritorno ──────────────────────────
let savedScrollY = 0;

// ── Preferiti (★) ────────────────────────────────────────────────────────────
function getFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_FAVS)) || []); } catch { return new Set(); }
}
function setFavs(set) {
  localStorage.setItem(LS_FAVS, JSON.stringify([...set]));
}
function isFav(id) { return favs.has(String(id)); }
function toggleFav(id) {
  id = String(id);
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  setFavs(favs);
}
let favs = getFavs();

// ── Recenti chiamati ─────────────────────────────────────────────────────────
function getRecentCalls() {
  try { return JSON.parse(localStorage.getItem(LS_CALLS)) || []; } catch { return []; }
}
function pushRecentCall(id) {
  if (!id) return;
  let arr = getRecentCalls().filter(x => String(x) !== String(id));
  arr.unshift(String(id));
  arr = arr.slice(0, MAX_CALLS);
  localStorage.setItem(LS_CALLS, JSON.stringify(arr));
}

// ── Filtri speciali (Preferiti / Recenti chiamati) ───────────────────────────
let activeSpecial = null; // 'fav' | 'recent' | null

// ── Tema con 3 stati: dark / light / auto ────────────────────────────────────
let mediaQ = window.matchMedia('(prefers-color-scheme: dark)');
function resolveTheme(mode) {
  if (mode === 'auto') return mediaQ.matches ? 'dark' : 'light';
  return mode;
}
function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  if (D.btnTheme) D.btnTheme.dataset.themeMode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0c0c0c' : '#ffffff');
  localStorage.setItem(LS_THEME, mode);
}
function cycleTheme() {
  const cur = localStorage.getItem(LS_THEME) || 'dark';
  const next = cur === 'dark' ? 'light' : (cur === 'light' ? 'auto' : 'dark');
  applyTheme(next);
  showToast('Tema: ' + (next === 'auto' ? 'automatico' : next), 1500);
}
mediaQ.addEventListener('change', () => {
  if ((localStorage.getItem(LS_THEME) || 'dark') === 'auto') applyTheme('auto');
});

// ── Coda mutazioni offline ───────────────────────────────────────────────────
function getQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE)) || []; } catch { return []; }
}
function setQueue(q) { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); }
function enqueue(op) {
  const q = getQueue();
  q.push({ ...op, ts: Date.now(), attempts: 0 });
  setQueue(q);
}
async function drainQueue() {
  const q = getQueue();
  if (!q.length) return;
  showToast(`Sincronizzo ${q.length} modific${q.length === 1 ? 'a' : 'he'} in sospeso...`, 2500);
  const remaining = [];
  for (const op of q) {
    try {
      await supaFetch(op.path, op.options);
    } catch (_) {
      op.attempts++;
      if (op.attempts < 5) remaining.push(op);
    }
  }
  setQueue(remaining);
  if (!remaining.length) {
    showToast('Modifiche sincronizzate', 2000, 'success');
    loadData(); // ricarica per riallineare ID e timestamp
  }
}
window.addEventListener('online', drainQueue);

// ── Focus trap nei modal ─────────────────────────────────────────────────────
let activeModal = null;
let lastFocused = null;
const FOCUSABLE = 'button:not([hidden]), [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
function trapFocus(modalEl) {
  activeModal = modalEl;
  lastFocused = document.activeElement;
  const handler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeActiveModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const els = [...modalEl.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  modalEl._trapHandler = handler;
  document.addEventListener('keydown', handler);
}
function releaseFocus(modalEl) {
  if (modalEl?._trapHandler) {
    document.removeEventListener('keydown', modalEl._trapHandler);
    modalEl._trapHandler = null;
  }
  activeModal = null;
  if (lastFocused?.focus) lastFocused.focus();
  lastFocused = null;
}
function closeActiveModal() {
  if (!activeModal) return;
  if (activeModal === D.modalOverlay) closeModal();
  else if (activeModal === D.catModalOverlay) closeCatModal();
  else if (activeModal === D.alphaModalOverlay) D.alphaModalOverlay.hidden = true;
  else if (activeModal === D.numMenuOverlay)   closeNumMenu();
}

// ── Esportazione CSV / vCard ─────────────────────────────────────────────────
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvEscape(s) {
  s = String(s == null ? '' : s);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function exportCSV() {
  const rows = ['nome,categoria,numeri,note'];
  for (const c of allContacts) {
    rows.push([c.nome, c.categoria, c.numeri, c.note].map(csvEscape).join(','));
  }
  const today = new Date().toISOString().slice(0, 10);
  downloadFile(`rubrica-gemelli-${today}.csv`, rows.join('\n'), 'text/csv;charset=utf-8');
  showToast('CSV esportato', 2000, 'success');
}
function buildVCard(c) {
  const nums  = String(c.numeri || '').split('|').map(s => s.trim()).filter(Boolean);
  const notes = String(c.note   || '').split('|');
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${c.nome}`,
    `N:${c.nome};;;;`,
    `ORG:${c.categoria}`,
  ];
  nums.forEach((n, i) => {
    const nota = (notes[i] || '').trim();
    // Mette la nota nel TYPE in modo che appaia come etichetta nel telefono
    const type = nota ? `WORK,${nota.replace(/[,;:]/g, ' ')}` : 'WORK';
    lines.push(`TEL;TYPE=${type}:${n}`);
  });
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function exportSingleVCF(contact) {
  if (!contact) return;
  const slug = String(contact.nome).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'contatto';
  downloadFile(`${slug}.vcf`, buildVCard(contact), 'text/vcard;charset=utf-8');
  haptic(12);
}

// ── Pull-to-refresh ──────────────────────────────────────────────────────────
function setupPullToRefresh() {
  const indicator = $('ptrIndicator');
  if (!indicator) return;
  const THRESHOLD = 70;
  let startY = 0, pulling = false, pulled = 0;

  document.addEventListener('touchstart', e => {
    if (window.scrollY > 0) return;
    if (D.modalOverlay && !D.modalOverlay.hidden) return;
    if (D.catModalOverlay && !D.catModalOverlay.hidden) return;
    if (D.alphaModalOverlay && !D.alphaModalOverlay.hidden) return;
    startY = e.touches[0].clientY;
    pulling = true; pulled = 0;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pulled = 0; indicator.style.height = '0px'; indicator.classList.remove('armed'); return; }
    pulled = Math.min(dy, THRESHOLD * 1.5);
    indicator.style.height = `${Math.min(pulled * 0.7, 60)}px`;
    indicator.classList.toggle('armed', pulled >= THRESHOLD);
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (pulled >= THRESHOLD) {
      indicator.classList.add('spin');
      indicator.style.height = '60px';
      haptic([15, 30, 15]);
      // Forza ricarica da DB ignorando cache locale
      localStorage.removeItem(LS_TS);
      try { await loadData(); } catch (_) {}
    }
    indicator.classList.remove('spin', 'armed');
    indicator.style.height = '0px';
    pulled = 0;
  });
}

// ── Drag-to-close modal (handle bar) ─────────────────────────────────────────
function setupDragHandles() {
  document.querySelectorAll('.modal-handle').forEach(handle => {
    let startY = 0, currentY = 0, dragging = false, pointerId = null;
    const box = handle.parentElement;
    const overlay = box.parentElement;

    handle.addEventListener('pointerdown', e => {
      dragging  = true;
      pointerId = e.pointerId;
      startY    = e.clientY;
      currentY  = e.clientY;
      box.style.transition = 'none';
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;
      currentY = e.clientY;
      const dy = Math.max(0, currentY - startY);
      box.style.transform = `translateY(${dy}px)`;
      e.preventDefault();
    });
    const finish = e => {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
      const dy = currentY - startY;
      box.style.transition = 'transform .22s ease-out';
      if (dy > box.offsetHeight * 0.28) {
        box.style.transform = `translateY(${box.offsetHeight}px)`;
        setTimeout(() => {
          box.style.transform = '';
          if (overlay === D.modalOverlay)         closeModal();
          else if (overlay === D.catModalOverlay) closeCatModal();
          else                                     overlay.hidden = true;
        }, 220);
      } else {
        box.style.transform = '';
      }
    };
    handle.addEventListener('pointerup',     finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('pointerleave',  finish);
  });
}

// ── Ordinamento + memoization haystack ───────────────────────────────────────
// Aggiunge un campo `_search` precalcolato per evitare di ricomputarlo ad ogni filtro
function prepareContacts(arr) {
  const sorted = [...arr].sort((a, b) => {
    const an = String(a.nome || '');
    const bn = String(b.nome || '');
    const aNum = /^\d/.test(an);
    const bNum = /^\d/.test(bn);
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return an.localeCompare(bn, 'it');
  });
  for (const c of sorted) {
    c._search = (String(c.nome||'') + ' ' + String(c.numeri||'') + ' ' + String(c.note||'')).toLowerCase();
  }
  return sorted;
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  cacheDOM();
  applyTheme(localStorage.getItem(LS_THEME) || 'dark');
  registerSW();
  setupEvents();
  setupPullToRefresh();
  setupDragHandles();
  // Drain coda offline al boot (se la rete è ok)
  if (navigator.onLine) drainQueue().catch(() => {});
  await loadData();
}

async function loadData() {
  try {
    showLoading();

    let usedCache = false;
    try {
      setLoadingStatus('Verifica ultimo aggiornamento...');
      const tsRows  = await supaFetch('update_cache?select=ts&id=eq.1');
      const remoteTs = tsRows[0]?.ts || 0;
      const localTs  = parseInt(localStorage.getItem(LS_TS), 10) || 0;

      if (remoteTs && remoteTs === localTs) {
        const cachedData = localStorage.getItem(LS_DATA);
        const cachedCats = localStorage.getItem(LS_CATS);
        if (cachedData && cachedCats) {
          setLoadingStatus('Caricamento contatti dalla cache...');
          allContacts = prepareContacts(JSON.parse(cachedData));
          categories  = JSON.parse(cachedCats);
          usedCache   = true;
        }
      }
    } catch (_) { /* timestamp fallito → scarica normalmente */ }

    if (!usedCache) {
      setLoadingStatus('Caricamento contatti dal database...');
      const [contacts, cats] = await Promise.all([
        supaFetch('contatti?select=*'),
        supaFetch('categorie?select=*&order=ordine'),
      ]);
      allContacts = prepareContacts(contacts);
      categories  = cats;

      try {
        const tsRows2  = await supaFetch('update_cache?select=ts&id=eq.1');
        const remoteTs2 = tsRows2[0]?.ts || 0;
        localStorage.setItem(LS_TS,   String(remoteTs2));
        localStorage.setItem(LS_DATA, JSON.stringify(contacts));
        localStorage.setItem(LS_CATS, JSON.stringify(cats));
      } catch (_) { /* salvataggio cache non critico */ }
    }

    renderChips();
    renderContacts(allContacts);
  } catch (e) {
    showError(e.message);
  }
}

// ── Render Chips (categorie + speciali) ─────────────────────────────────────
function renderChips() {
  const sorted = [...categories].sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const favCount = favs.size;
  const recentCount = getRecentCalls().length;

  let html = '';
  if (favCount) {
    html += `<button class="chip chip-special${activeSpecial === 'fav' ? ' active' : ''}" data-special="fav" type="button">★ Preferiti</button>`;
  }
  if (recentCount) {
    html += `<button class="chip chip-special${activeSpecial === 'recent' ? ' active' : ''}" data-special="recent" type="button">🕐 Recenti</button>`;
  }
  html += sorted.map(c =>
    `<button class="chip${activeCategory === c.nome ? ' active' : ''}" data-cat="${esc(c.nome)}" type="button">${esc(c.nome)}</button>`
  ).join('');

  D.chips.innerHTML = html;
}

// ── Filtri ───────────────────────────────────────────────────────────────────
function applyFilters() {
  let result = allContacts;
  if (activeSpecial === 'fav') {
    result = result.filter(c => favs.has(String(c.id)));
  } else if (activeSpecial === 'recent') {
    const recents = getRecentCalls();
    const order = new Map(recents.map((id, i) => [String(id), i]));
    result = result
      .filter(c => order.has(String(c.id)))
      .sort((a, b) => order.get(String(a.id)) - order.get(String(b.id)));
  }
  if (activeCategory) result = result.filter(c => c.categoria === activeCategory);
  if (activeAlpha) {
    if (activeAlpha === '0-9') {
      result = result.filter(c => /^\d/.test(String(c.nome || '')));
    } else {
      result = result.filter(c => String(c.nome || '').toUpperCase().startsWith(activeAlpha));
    }
  }
  if (activeSearch) result = smartSearch(result, activeSearch);
  renderContacts(result);
}

// ── Ricerca smart 3-tier ottimizzata ─────────────────────────────────────────
function smartSearch(contacts, rawQuery) {
  const q = rawQuery.toLowerCase().trim();
  if (!q) return contacts;

  const tokens = q.split(/\s+/).filter(Boolean);
  const escRe  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pre-compile regex tier-2 una sola volta per query (non per contatto)
  const tier2Re = tokens.map(t => new RegExp('\\b' + escRe(t) + '\\b'));
  const doTier3 = q.length >= 4;

  const tier1 = [], tier2 = [], tier3 = [];

  for (const c of contacts) {
    const h = c._search || ''; // memoizzato in prepareContacts
    if (h.includes(q)) {
      tier1.push(c);
    } else if (tier2Re.every(re => re.test(h))) {
      tier2.push(c);
    } else if (doTier3 && tokens.every(t => h.includes(t))) {
      tier3.push(c);
    }
  }
  return [...tier1, ...tier2, ...tier3];
}

// ── Render contatti con avatar + highlight ──────────────────────────────────
function renderContacts(contacts) {
  updateCount(contacts.length);
  if (!contacts.length) {
    D.contactList.innerHTML = '<div class="state-msg"><div class="ico">∅</div><div>Nessun risultato</div></div>';
    return;
  }

  // Tokens per highlighting (solo se c'è ricerca attiva)
  const searchTokens = activeSearch
    ? activeSearch.split(/\s+/).filter(t => t.length >= 2)
    : null;

  const html = contacts.map(c => {
    const nome = esc(String(c.nome));
    const nomeH = searchTokens ? highlight(nome, searchTokens) : nome;
    const nums  = String(c.numeri || '').split('|').map(n => n.trim()).filter(Boolean);
    const notes = String(c.note   || '').split('|');

    const groups = nums.map((n, i) => {
      const nota   = (notes[i] || '').trim();
      const nEsc   = esc(n);
      const nH     = searchTokens ? highlight(nEsc, searchTokens) : nEsc;
      const notaH  = nota ? (searchTokens ? highlight(esc(nota), searchTokens) : esc(nota)) : '';
      return `<span class="num-group"><a class="num-pill" href="tel:${n}" data-num="${esc(n)}" data-nome="${esc(c.nome)}">${nH}</a>${nota ? `<span class="num-nota-inline">${notaH}</span>` : ''}</span>`;
    }).join('');

    const star = isFav(c.id) ? `<span class="contact-fav-star" aria-label="Preferito">${STAR_SVG}</span>` : '';
    return `<div class="contact-card" data-id="${c.id}">
      <div class="contact-avatar" style="${avatarStyle(c.categoria)}" aria-hidden="true">${avatarLetter(c.nome)}</div>
      <div class="contact-info" data-id="${c.id}">
        <div class="contact-name">${star}<span class="contact-name-text">${nomeH}</span></div>
        <div class="contact-numbers">${groups}</div>
        <div class="contact-cat">${esc(String(c.categoria))}</div>
      </div>
      <button class="btn-edit" data-id="${c.id}" aria-label="Modifica contatto" type="button">${EDIT_SVG}</button>
    </div>`;
  }).join('');
  D.contactList.innerHTML = html;
}

function showLoading() {
  D.contactList.innerHTML =
    '<div class="state-msg"><div class="spinner"></div><div id="loadStatus" class="load-status" aria-live="polite"></div></div>';
  updateCount(null);
}
function setLoadingStatus(msg) {
  const el = $('loadStatus');
  if (el) el.textContent = msg;
}
function showError(msg) {
  D.contactList.innerHTML =
    `<div class="state-msg"><div class="ico">×</div><div>${esc(msg)}</div><div class="sub">Controlla la connessione e riprova</div></div>`;
  updateCount(null);
}
function updateCount(n) {
  D.countLabel.textContent = n !== null ? `${n} contatti` : '';
}

// ── Events setup ─────────────────────────────────────────────────────────────
function setupEvents() {
  // Tema (3 stati: dark → light → auto)
  D.btnTheme.addEventListener('click', cycleTheme);

  // Search debounced
  const debouncedFilter = debounce(() => {
    applyFilters();
    // Aggiungi alle recenti dopo che l'utente ha smesso di scrivere (se ha trovato qualcosa)
    if (activeSearch && activeSearch.length >= 2) pushRecentSearch(activeSearch);
  }, 400);
  D.searchBar.addEventListener('input', e => {
    activeSearch = e.target.value.toLowerCase().trim();
    D.searchWrap.classList.toggle('has-text', !!activeSearch);
    if (!activeSearch) renderRecentSuggestions();
    else D.searchSuggestions.hidden = true;
    debouncedFilter();
  });
  D.btnSearchClear.addEventListener('click', () => {
    D.searchBar.value = '';
    activeSearch = '';
    D.searchWrap.classList.remove('has-text');
    applyFilters();
    D.searchBar.focus();
  });

  // Mostra Tutti
  D.btnAll.addEventListener('click', () => {
    activeCategory = null;
    activeSearch   = '';
    activeAlpha    = null;
    activeSpecial  = null;
    D.searchBar.value = '';
    D.searchWrap.classList.remove('has-text');
    renderChips();
    D.btnAll.classList.add('active');
    D.btnAlpha.classList.remove('active');
    renderContacts(allContacts);
  });

  // Alpha
  D.btnAlpha.addEventListener('click', openAlphaModal);
  D.btnAlphaClose.addEventListener('click', () => { releaseFocus(D.alphaModalOverlay); D.alphaModalOverlay.hidden = true; });
  D.alphaModalOverlay.addEventListener('click', e => {
    if (e.target === D.alphaModalOverlay) { releaseFocus(D.alphaModalOverlay); D.alphaModalOverlay.hidden = true; }
  });

  // Nuovo
  D.btnNew.addEventListener('click', () => openModal(null));
  D.btnAddNum.addEventListener('click', () => { const f = addNumRow(); f.focus(); });
  D.btnCancel.addEventListener('click', closeModal);
  D.modalOverlay.addEventListener('click', e => {
    if (e.target === D.modalOverlay) closeModal();
  });

  // Categorie
  D.btnSettings.addEventListener('click', openCatModal);
  D.btnCatCancel.addEventListener('click', closeCatModal);
  D.catModalOverlay.addEventListener('click', e => {
    if (e.target === D.catModalOverlay) closeCatModal();
  });
  D.btnAddCat.addEventListener('click', addNewCategory);
  D.fNewCat.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addNewCategory(); }
  });
  D.btnCatSave.addEventListener('click', saveCatChanges);

  // Form submit
  D.contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    await saveContact();
  });
  D.btnDelete.addEventListener('click', async () => {
    if (await showConfirm('Eliminare questo contatto?', 'error')) await deleteContact();
  });

  // ── Event delegation: lista contatti ──────────────────────────────────────
  D.contactList.addEventListener('click', e => {
    // 1) Pulsante edit (matita)
    const editBtn = e.target.closest('.btn-edit');
    if (editBtn) {
      e.stopPropagation();
      haptic(8);
      openEdit(editBtn.dataset.id);
      return;
    }
    // 2) Numero — PRIMA di .contact-info perché ne è figlio
    const numLink = e.target.closest('.num-pill');
    if (numLink && !longPressTriggered) {
      haptic(12);
      const card = numLink.closest('.contact-card');
      if (card) {
        const wasEmpty = getRecentCalls().length === 0;
        pushRecentCall(card.dataset.id);
        // Se è la prima chiamata, ridisegna le chips per mostrare "🕐 Recenti"
        if (wasEmpty) renderChips();
      }
      return; // lascia procedere il link tel: nativo
    }
    // 3) Area info (nome) → apre modal modifica
    const info = e.target.closest('.contact-info');
    if (info && !longPressTriggered) {
      haptic(8);
      openEdit(info.dataset.id);
    }
  });

  // ── Long-press su numero → menu copia/condividi ──────────────────────────
  setupLongPress();

  // ── Event delegation: chips categorie + speciali ─────────────────────────
  D.chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    haptic(8);
    if (chip.dataset.special) {
      const sp = chip.dataset.special;
      activeSpecial = activeSpecial === sp ? null : sp;
      activeCategory = null;
      renderChips();
      D.btnAll.classList.toggle('active', !activeSpecial);
      applyFilters();
      return;
    }
    const cat = chip.dataset.cat;
    activeCategory = activeCategory === cat ? null : cat;
    activeSpecial = null;
    renderChips();
    D.btnAll.classList.toggle('active', !activeCategory);
    applyFilters();
  });

  // ── Esportazione ──────────────────────────────────────────────────────────
  $('btnExportCSV')?.addEventListener('click', exportCSV);

  // Salva singolo contatto come vCard (solo modal modifica)
  D.btnSaveVcf.addEventListener('click', () => {
    const c = D.btnSaveVcf._contact;
    if (c) exportSingleVCF(c);
  });

  // ── Suggerimenti ricerca recenti ──────────────────────────────────────────
  D.searchBar.addEventListener('focus', renderRecentSuggestions);
  D.searchBar.addEventListener('blur',  () => {
    // Delay per permettere il click sul suggerimento
    setTimeout(() => { D.searchSuggestions.hidden = true; }, 150);
  });
  D.searchBar.addEventListener('change', () => {
    if (activeSearch) pushRecentSearch(activeSearch);
  });
  D.searchSuggestions.addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (x) {
      e.stopPropagation();
      removeRecentSearch(x.dataset.x);
      renderRecentSuggestions();
      return;
    }
    const sug = e.target.closest('.search-suggestion');
    if (sug) {
      const q = sug.dataset.q;
      D.searchBar.value = q;
      activeSearch = q.toLowerCase();
      D.searchWrap.classList.add('has-text');
      D.searchSuggestions.hidden = true;
      pushRecentSearch(q);
      applyFilters();
    }
  });

  // ── Menu numero: azioni ───────────────────────────────────────────────────
  D.numMenuOverlay.addEventListener('click', e => {
    if (e.target === D.numMenuOverlay) closeNumMenu();
    const action = e.target.closest('[data-action]');
    if (!action) return;
    handleNumMenuAction(action.dataset.action);
  });

  // Salva scroll position prima di aprire un modal
  document.addEventListener('focusin', () => {});
}

// ── Long press detection (numero | card) ─────────────────────────────────────
let longPressTimer = null;
let longPressTriggered = false;
let longPressNum  = '';
let longPressNome = '';
let longPressMode = '';   // 'num' | 'card'
let longPressId   = '';
function setupLongPress() {
  D.contactList.addEventListener('pointerdown', e => {
    const a    = e.target.closest('.num-pill');
    const card = e.target.closest('.contact-info');
    if (!a && !card) return;
    longPressTriggered = false;
    if (a) {
      longPressMode = 'num';
      longPressNum  = a.dataset.num  || a.textContent.trim();
      longPressNome = a.dataset.nome || '';
    } else {
      longPressMode = 'card';
      longPressId   = card.dataset.id;
    }
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      haptic([15, 30, 15]);
      if (longPressMode === 'num') openNumMenu(longPressNum, longPressNome);
      else if (longPressMode === 'card') {
        toggleFav(longPressId);
        showToast(isFav(longPressId) ? '★ Aggiunto ai preferiti' : 'Rimosso dai preferiti', 1800, 'success');
        renderChips();
        applyFilters();
      }
    }, 500);
  });
  const cancel = () => { clearTimeout(longPressTimer); };
  D.contactList.addEventListener('pointerup',     cancel);
  D.contactList.addEventListener('pointerleave',  cancel);
  D.contactList.addEventListener('pointercancel', cancel);
  D.contactList.addEventListener('pointermove', e => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 5) cancel();
  });
  // Quando si attiva il long-press, blocca il click successivo
  D.contactList.addEventListener('click', e => {
    if (longPressTriggered) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => { longPressTriggered = false; }, 50);
    }
  }, true);
}

function openNumMenu(num, nome) {
  D.numMenuTitle.textContent = num;
  D.numMenuSub.textContent   = nome || '';
  D.numMenuOverlay.hidden = false;
  trapFocus(D.numMenuOverlay);
}
function closeNumMenu() {
  releaseFocus(D.numMenuOverlay);
  D.numMenuOverlay.hidden = true;
}
async function handleNumMenuAction(action) {
  const num  = D.numMenuTitle.textContent;
  const nome = D.numMenuSub.textContent;
  closeNumMenu();
  haptic(8);
  switch (action) {
    case 'call':
      window.location.href = `tel:${num}`;
      break;
    case 'copy':
      await copyText(num);
      showToast('Numero copiato', 2000, 'success');
      break;
    case 'copy-full':
      await copyText(`${nome}: ${num}`);
      showToast('Copiato negli appunti', 2000, 'success');
      break;
    case 'share':
      if (navigator.share) {
        try {
          await navigator.share({ title: nome, text: `${nome}: ${num}` });
        } catch (_) {}
      } else {
        await copyText(`${nome}: ${num}`);
        showToast('Condivisione non supportata — copiato', 3000);
      }
      break;
    case 'close':
      break;
  }
}
async function copyText(text) {
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return; } catch (_) {}
  }
  // Fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  ta.remove();
}

// ── Modal contatto ───────────────────────────────────────────────────────────
function addNumRow(num = '', nota = '') {
  const row = document.createElement('div');
  row.className = 'num-row';
  row.innerHTML = `
    <div class="num-row-inputs">
      <input type="tel" class="f-num" placeholder="Numero" value="${esc(num)}" inputmode="numeric" autocomplete="off">
      <input type="text" class="f-nota" placeholder="Nota (opzionale)" value="${esc(nota)}" autocomplete="off">
    </div>
    <button type="button" class="btn-rm-num" aria-label="Rimuovi riga">×</button>`;

  const fNum = row.querySelector('.f-num');
  fNum.addEventListener('input', () => {
    fNum.value = fNum.value.replace(/[^\d]/g, '');
    fNum.classList.toggle('invalid', fNum.value.length > 0 && !/^\d+$/.test(fNum.value));
  });
  fNum.addEventListener('blur', () => {
    fNum.classList.toggle('invalid', fNum.value.length > 0 && !/^\d+$/.test(fNum.value));
  });

  const fNota = row.querySelector('.f-nota');
  fNota.addEventListener('input', () => {
    if (fNota.value.includes('|')) fNota.value = fNota.value.replace(/\|/g, '');
  });

  row.querySelector('.btn-rm-num').addEventListener('click', () => {
    if (D.numeriContainer.querySelectorAll('.num-row').length > 1) row.remove();
  });

  D.numeriContainer.appendChild(row);
  return fNum;
}

function collectPairs() {
  const rows = D.numeriContainer.querySelectorAll('.num-row');
  const numeri = [], note = [];
  let valid = true;
  rows.forEach(row => {
    const n = row.querySelector('.f-num').value.trim();
    const t = row.querySelector('.f-nota').value.trim();
    if (!n) return;
    if (!/^\d+$/.test(n)) {
      row.querySelector('.f-num').classList.add('invalid');
      valid = false;
    } else {
      numeri.push(n);
      note.push(t);
    }
  });
  if (!valid) return null;
  return { numeri: numeri.join('|'), note: note.join('|') };
}

function openModal(contact) {
  // Salva scroll position per ripristinarla alla chiusura
  savedScrollY = window.scrollY;

  const isNew = !contact;
  D.modalTitle.textContent = isNew ? 'Nuovo Contatto' : 'Modifica Contatto';
  D.fId.value   = contact?.id ?? '';
  D.fNome.value = contact?.nome ?? '';
  D.btnDelete.hidden = isNew;
  D.btnSaveVcf.hidden = isNew;
  D.btnSaveVcf._contact = contact || null;
  D.fCategoria.innerHTML = categories.map(c =>
    `<option value="${esc(c.nome)}"${c.nome === contact?.categoria ? ' selected' : ''}>${esc(c.nome)}</option>`
  ).join('');

  D.numeriContainer.innerHTML = '';
  const nums  = String(contact?.numeri || '').split('|').map(s => s.trim()).filter(Boolean);
  const notes = String(contact?.note   || '').split('|');
  if (nums.length) {
    nums.forEach((n, i) => addNumRow(n, notes[i] || ''));
  } else {
    addNumRow();
  }

  D.modalOverlay.hidden = false;
  trapFocus(D.modalOverlay);
  setTimeout(() => D.fNome.focus(), 50);
}
function openEdit(id) {
  const c = allContacts.find(x => String(x.id) === String(id));
  if (c) openModal(c);
}
function closeModal() {
  releaseFocus(D.modalOverlay);
  D.modalOverlay.hidden = true;
  // Ripristina scroll position
  if (savedScrollY) {
    requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
  }
}

// ── Cache locale post-mutazione ──────────────────────────────────────────────
function updateLocalData(contacts, cats) {
  allContacts = prepareContacts(contacts);
  categories  = cats;
  renderChips();
  applyFilters();
  supaFetch('update_cache?select=ts&id=eq.1').then(rows => {
    const ts = rows[0]?.ts || 0;
    localStorage.setItem(LS_TS,   String(ts));
    localStorage.setItem(LS_DATA, JSON.stringify(contacts));
    localStorage.setItem(LS_CATS, JSON.stringify(cats));
  }).catch(() => {
    localStorage.removeItem(LS_TS);
  });
}

async function saveContact() {
  const id   = D.fId.value;
  const nome = D.fNome.value.trim();
  if (!nome) { showToast('Il nome è obbligatorio', 3000, 'warning'); return; }

  const pairs = collectPairs();
  if (!pairs) { showToast('Uno o più numeri contengono caratteri non validi (solo cifre)', 3500, 'warning'); return; }
  if (!pairs.numeri) { showToast('Inserisci almeno un numero', 3000, 'warning'); return; }

  const payload = {
    nome,
    categoria: D.fCategoria.value,
    numeri:    pairs.numeri,
    note:      pairs.note,
  };
  const btn = D.btnSave;
  btn.innerHTML = '<span class="btn-spinner"></span>'; btn.disabled = true;
  try {
    let updatedContacts;
    if (!id) {
      const rows = await supaFetch('contatti', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(payload),
      });
      updatedContacts = [...allContacts, rows[0]];
      showToast('Contatto aggiunto con successo', 3000, 'success');
    } else {
      await supaFetch(`contatti?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      updatedContacts = allContacts.map(c =>
        String(c.id) === String(id) ? { ...c, ...payload } : c
      );
      showToast('Contatto aggiornato con successo', 3000, 'success');
    }
    closeModal();
    updateLocalData(updatedContacts, categories);
  } catch (e) {
    showToast('Errore: ' + e.message, 4000, 'error');
  } finally {
    btn.textContent = 'Salva'; btn.disabled = false;
  }
}

async function deleteContact() {
  const id  = D.fId.value;
  const btn = D.btnDelete;
  btn.innerHTML = '<span class="btn-spinner"></span>'; btn.disabled = true;
  try {
    await supaFetch(`contatti?id=eq.${id}`, { method: 'DELETE' });
    closeModal();
    showToast('Contatto eliminato con successo', 3000, 'success');
    updateLocalData(allContacts.filter(c => String(c.id) !== String(id)), categories);
  } catch (e) {
    showToast('Errore eliminazione: ' + e.message, 4000, 'error');
  } finally {
    btn.textContent = 'Elimina'; btn.disabled = false;
  }
}

// ── Modal Alpha ──────────────────────────────────────────────────────────────
function openAlphaModal() {
  D.alphaGrid.innerHTML = ALPHA_KEYS.map(k =>
    `<button class="alpha-btn${k === '0-9' ? ' num-btn' : ''}${activeAlpha === k ? ' active' : ''}"
             data-key="${k}" type="button">${k}</button>`
  ).join('');
  D.alphaGrid.querySelectorAll('.alpha-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (activeAlpha === key) {
        activeAlpha = null;
        D.btnAlpha.classList.remove('active');
        D.btnAll.classList.add('active');
      } else {
        activeAlpha = key;
        D.btnAlpha.classList.add('active');
        D.btnAll.classList.remove('active');
      }
      D.alphaModalOverlay.hidden = true;
      applyFilters();
    });
  });
  D.alphaModalOverlay.hidden = false;
  trapFocus(D.alphaModalOverlay);
}

// ── Modal Categorie ──────────────────────────────────────────────────────────
let catOriginal   = [];
let catPending    = [];
let catPendingNew = [];

async function openCatModal() {
  D.catModalOverlay.hidden = false;
  trapFocus(D.catModalOverlay);
  D.catList.innerHTML = '<div style="text-align:center;padding:1.5rem 1rem"><div class="spinner"></div></div>';
  try {
    const [cats, conts] = await Promise.all([
      supaFetch('categorie?select=*&order=ordine'),
      supaFetch('contatti?select=categoria'),
    ]);
    catOriginal = cats.map(c => ({
      ...c,
      count: conts.filter(x => x.categoria === c.nome).length,
    }));
    catPending    = catOriginal.map(c => ({ ...c, editNome: c.nome, deleted: false }));
    catPendingNew = [];
    renderCatList();
  } catch (e) {
    D.catModalOverlay.hidden = true;
    showToast('Errore caricamento categorie: ' + e.message, 4000, 'error');
  }
}

async function closeCatModal() {
  if (hasCatChanges() && !(await showConfirm('Ci sono modifiche non salvate.\nChiudere ugualmente?', 'warning'))) return;
  releaseFocus(D.catModalOverlay);
  D.catModalOverlay.hidden = true;
}

function hasCatChanges() {
  return catPending.some(c => c.deleted || c.editNome !== c.nome) || catPendingNew.length > 0;
}

function renderCatList() {
  const existingHTML = catPending
    .filter(c => !c.deleted)
    .map(c => {
      const pidx = catPending.indexOf(c);
      const canDel = c.count === 0;
      return `
        <div class="cat-item">
          <input class="cat-name-input" type="text" value="${esc(c.editNome)}"
                 data-pidx="${pidx}" autocomplete="off" spellcheck="false">
          <span class="cat-count">${c.count > 0 ? c.count + ' cont.' : '—'}</span>
          <button class="cat-del-btn ${canDel ? 'can-del' : 'no-del'}"
                  data-pidx="${pidx}" data-type="existing" type="button"
                  title="${canDel ? 'Elimina' : 'Ha contatti — elimina prima i contatti'}">${TRASH_SVG}</button>
        </div>`;
    }).join('');

  const newHTML = catPendingNew.map((nc, ni) => `
    <div class="cat-item">
      <input class="cat-name-input" type="text" value="${esc(nc.nome)}"
             data-nidx="${ni}" autocomplete="off" spellcheck="false">
      <span class="cat-count" style="color:var(--accent);font-style:italic">nuovo</span>
      <button class="cat-del-btn can-del" data-nidx="${ni}" data-type="new"
              type="button" title="Rimuovi">${TRASH_SVG}</button>
    </div>`).join('');

  D.catList.innerHTML = existingHTML + newHTML;

  D.catList.querySelectorAll('.cat-name-input[data-pidx]').forEach(input => {
    const idx = Number(input.dataset.pidx);
    input.addEventListener('input', () => { catPending[idx].editNome = input.value; });
    input.addEventListener('blur', () => {
      const f = formatCatName(input.value) || catPending[idx].nome;
      input.value = f;
      catPending[idx].editNome = f;
    });
  });

  D.catList.querySelectorAll('.cat-name-input[data-nidx]').forEach(input => {
    const ni = Number(input.dataset.nidx);
    input.addEventListener('input', () => { catPendingNew[ni].nome = input.value; });
    input.addEventListener('blur', () => {
      const f = formatCatName(input.value) || catPendingNew[ni].nome;
      input.value = f;
      catPendingNew[ni].nome = f;
    });
  });

  D.catList.querySelectorAll('.cat-del-btn').forEach(btn => {
    if (btn.classList.contains('no-del')) {
      btn.addEventListener('click', () => {
        const c = catPending[Number(btn.dataset.pidx)];
        showToast(`"${c.nome}" ha ${c.count} contatti — non può essere eliminata`, 4000, 'warning');
      });
      return;
    }
    btn.addEventListener('click', () => {
      if (btn.dataset.type === 'existing') {
        catPending[Number(btn.dataset.pidx)].deleted = true;
      } else {
        catPendingNew.splice(Number(btn.dataset.nidx), 1);
      }
      renderCatList();
    });
  });
}

function addNewCategory() {
  const nome = formatCatName(D.fNewCat.value);
  if (!nome) { showToast('Nome categoria non valido', 3000, 'warning'); return; }

  const allNames = [
    ...catPending.filter(c => !c.deleted).map(c => c.editNome.toLowerCase()),
    ...catPendingNew.map(c => c.nome.toLowerCase())
  ];
  if (allNames.includes(nome.toLowerCase())) {
    showToast('Categoria già esistente: ' + nome, 3000, 'warning'); return;
  }
  catPendingNew.push({ nome });
  D.fNewCat.value = '';
  renderCatList();
  D.fNewCat.focus();
}

async function saveCatChanges() {
  const finalNames = [
    ...catPending.filter(c => !c.deleted).map(c => formatCatName(c.editNome)),
    ...catPendingNew.map(c => formatCatName(c.nome))
  ];
  if (finalNames.some(n => !n)) {
    showToast('Il nome di una categoria è vuoto o non valido', 3000, 'warning'); return;
  }
  const lower = finalNames.map(n => n.toLowerCase());
  if (lower.some((n, i) => lower.indexOf(n) !== i)) {
    showToast('Ci sono categorie con lo stesso nome', 3000, 'warning'); return;
  }

  const renames = catPending.filter(c => !c.deleted && c.editNome !== c.nome);
  const renamesWithCont = renames.filter(c => c.count > 0);
  if (renamesWithCont.length) {
    const msg = renamesWithCont.map(c =>
      `• "${c.nome}" → "${c.editNome}" (${c.count} contatti verranno aggiornati)`
    ).join('\n');
    if (!(await showConfirm(`Attenzione — verranno aggiornati i contatti:\n\n${msg}\n\nProcedere?`, 'warning'))) return;
  }

  const btn = D.btnCatSave;
  btn.innerHTML = '<span class="btn-spinner"></span>'; btn.disabled = true;
  try {
    // ── RPC atomica (transazione PostgreSQL) ────────────────────────────────
    const adds    = catPendingNew.map(nc => formatCatName(nc.nome));
    const renamesPayload = renames.map(c => ({ old: c.nome, new: formatCatName(c.editNome) }));
    const deletes = catPending.filter(c => c.deleted).map(c => c.nome);

    try {
      await supaFetch('rpc/update_categorie_batch', {
        method: 'POST',
        body: JSON.stringify({ adds, renames: renamesPayload, deletes }),
      });
    } catch (rpcErr) {
      // Fallback: la RPC potrebbe non esistere ancora — flusso a chiamate sequenziali
      const maxOrdSupa = categories.reduce((m, c) => Math.max(m, c.ordine || 0), 0);
      for (const [i, nc] of catPendingNew.entries()) {
        await supaFetch('categorie', {
          method: 'POST',
          body: JSON.stringify({ nome: formatCatName(nc.nome), ordine: maxOrdSupa + i + 1 }),
        });
      }
      for (const c of renames) {
        await supaFetch('rpc/rename_categoria', {
          method: 'POST',
          body: JSON.stringify({ old_nome: c.nome, new_nome: formatCatName(c.editNome) }),
        });
      }
      for (const c of catPending.filter(c => c.deleted)) {
        await supaFetch('categorie?nome=eq.' + encodeURIComponent(c.nome), { method: 'DELETE' });
      }
    }

    let updatedCats     = [...categories];
    let updatedContacts = [...allContacts];

    for (const c of renames) {
      const newNome = formatCatName(c.editNome);
      updatedCats     = updatedCats.map(cat  => cat.nome === c.nome  ? { ...cat,  nome: newNome } : cat);
      updatedContacts = updatedContacts.map(cont => cont.categoria === c.nome ? { ...cont, categoria: newNome } : cont);
    }
    const maxOrd = updatedCats.reduce((m, c) => Math.max(m, c.ordine || 0), 0);
    catPendingNew.forEach((nc, i) => {
      updatedCats.push({ id: Date.now() + i, nome: formatCatName(nc.nome), ordine: maxOrd + i + 1 });
    });
    const deletedNames = catPending.filter(c => c.deleted).map(c => c.nome);
    updatedCats = updatedCats.filter(cat => !deletedNames.includes(cat.nome));

    D.catModalOverlay.hidden = true;
    showToast('Categorie aggiornate con successo', 3000, 'success');
    updateLocalData(updatedContacts, updatedCats);
  } catch (e) {
    showToast('Errore: ' + e.message, 5000, 'error');
  } finally {
    btn.textContent = 'Salva modifiche'; btn.disabled = false;
  }
}

// ── Toast / Confirm ──────────────────────────────────────────────────────────
function showToast(msg, duration = 3500, type = '') {
  const t = D.installToast;
  t.textContent = msg;
  t.className = 'show' + (type ? ' toast-' + type : '');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => { t.classList.remove('show'); }, duration);
}

function showConfirm(msg, type = 'warning') {
  return new Promise(resolve => {
    const t = D.installToast;
    clearTimeout(t._hideTimer);
    t.innerHTML = `
      <div style="line-height:1.45;margin-bottom:.6rem">${esc(msg).replace(/\n/g,'<br>')}</div>
      <div style="display:flex;gap:.5rem;justify-content:center">
        <button class="tc-no"  style="padding:.42rem 1rem;border:1px solid rgba(128,128,128,.45);border-radius:6px;background:transparent;color:inherit;font-family:inherit;font-size:.82rem;cursor:pointer;min-height:36px">Annulla</button>
        <button class="tc-yes" style="padding:.42rem 1rem;border:none;border-radius:6px;background:var(--accent);color:#fff;font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;min-height:36px">Conferma</button>
      </div>`;
    t.className = 'show toast-confirm' + (type ? ' toast-' + type : '');
    const done = ok => { t.classList.remove('show'); resolve(ok); };
    t.querySelector('.tc-yes').addEventListener('click', () => done(true),  { once: true });
    t.querySelector('.tc-no') .addEventListener('click', () => done(false), { once: true });
  });
}

// ── Service Worker + update notify ───────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(nw);
        }
      });
    });
  }).catch(() => {});

  // Quando il nuovo SW prende il controllo, ricarica
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}

function showUpdateBanner(worker) {
  const t = D.installToast;
  clearTimeout(t._hideTimer);
  t.innerHTML = `
    <div style="line-height:1.45;margin-bottom:.6rem">Aggiornamento disponibile</div>
    <div style="display:flex;gap:.5rem;justify-content:center">
      <button class="tc-no"  style="padding:.42rem 1rem;border:1px solid rgba(128,128,128,.45);border-radius:6px;background:transparent;color:inherit;font-family:inherit;font-size:.82rem;cursor:pointer;min-height:36px">Più tardi</button>
      <button class="tc-yes" style="padding:.42rem 1rem;border:none;border-radius:6px;background:var(--accent);color:#fff;font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;min-height:36px">Ricarica</button>
    </div>`;
  t.className = 'show toast-confirm toast-success';
  t.querySelector('.tc-yes').addEventListener('click', () => {
    worker.postMessage('SKIP_WAITING');
  }, { once: true });
  t.querySelector('.tc-no').addEventListener('click', () => {
    t.classList.remove('show');
  }, { once: true });
}

// ── PWA install ──────────────────────────────────────────────────────────────
let installPrompt = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  D.btnInstall.classList.add('ready');
  D.btnInstall.title = 'Installa app';
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  setStarDone();
});
function setStarDone() {
  D.btnInstall.classList.remove('ready');
  D.btnInstall.classList.add('done');
  D.btnInstall.querySelector('svg').setAttribute('fill', 'currentColor');
}

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await init();

  // Gestione shortcuts PWA (?action=new | ?action=search)
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  if (action === 'new')         setTimeout(() => openModal(null), 100);
  else if (action === 'search') setTimeout(() => D.searchBar.focus(), 100);
  if (action) {
    // Pulisce l'URL senza ricaricare
    history.replaceState(null, '', location.pathname);
  }

  // Setup install button
  D.btnInstall.addEventListener('click', async () => {
    if (isInStandalone) { showToast('App già installata sulla schermata Home'); return; }
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') { installPrompt = null; setStarDone(); }
    } else if (isIOS) {
      showToast('Safari: tocca  →  "Aggiungi a schermata Home"', 5000);
    } else {
      showToast('Premi Ctrl+D per aggiungere ai preferiti del browser');
    }
  });
  if (isInStandalone) setStarDone();
});
