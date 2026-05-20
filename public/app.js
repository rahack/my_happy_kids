// Telegram WebApp init (safe if outside Telegram)
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// Detect and set app language: saved preference → Telegram language → English.
// setLang / getLang are defined in i18n.js which is loaded before app.js.
(function detectLang() {
  const saved = localStorage.getItem('lang');
  if (saved === 'ru' || saved === 'en') return; // user set a preference explicitly
  const tgLang = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code;
  if (tgLang && tgLang.startsWith('ru')) setLang('ru');
  // else: stays as 'en' (already set in i18n.js)
})();

const root = document.getElementById('app');
const state = {
  route: null,  // null during boot — render() skips until first go()
  user: null,                // { username, role, tg_linked }
  kids: [],
  currentKid: null,
  selectedDate: null,        // 'YYYY-MM-DD' — date shown under the calendar strip
  selectedDay: null,         // { date, tasks, reward } for the selected date
  pendingTasks: [],          // tasks awaiting validator approval
  validators: [],            // list of validators (admin's family)
  taskTemplates: [],         // predefined task templates (admin's family)
  rewardTemplates: [],       // predefined reward templates (admin's family)
  editingTemplateId: null,   // id of the template row currently being edited inline
  editingTemplateType: null, // 'task' | 'reward'
  kidsListTab: 'kids',       // 'kids' | 'tasks' | 'rewards' — active tab on the kids list page
  error: null,
  mode: localStorage.getItem('mode') || 'view', // 'view' | 'admin' | 'validator'
  modeAuthTarget: 'admin',   // which mode the auth modal is unlocking ('admin' | 'validator')
};

// Telegram initData — non-empty only when running inside the Telegram Mini App.
const tgInitData = (tg && tg.initData) || '';

// Invite token from URL (?invite=...). Set when the user opened the app via
// an invite link from the bot. Consumed once after auth, then forgotten.
function readInviteFromUrl() {
  try {
    const t = new URL(window.location.href).searchParams.get('invite');
    return t || '';
  } catch { return ''; }
}

// Try Telegram-based auto-login / binding. Returns the parsed response on
// success (action: 'login' | 'bound') or null when not applicable / 401.
async function tryTelegramAuth() {
  if (!tgInitData) return null;
  try {
    return await api('/api/tg-auth', { method: 'POST', body: { initData: tgInitData } });
  } catch (e) {
    return null;
  }
}

// After an explicit logout, the user may want to sign in under a different
// account (e.g. their TG is bound to a validator, but they want admin/admin).
// We set this flag so the boot sequence skips the Telegram auto-login until
// the Mini App is closed and reopened (sessionStorage clears with the tab).
function suppressTgAutoLogin() { try { sessionStorage.setItem('tg_skip', '1'); } catch {} }
function tgAutoLoginSuppressed() { try { return sessionStorage.getItem('tg_skip') === '1'; } catch { return false; } }
function clearTgSuppression() { try { sessionStorage.removeItem('tg_skip'); } catch {} }

// Date helpers. All dates are 'YYYY-MM-DD' strings in local time.
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
function formatClock(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
let _clockTickerStarted = false;
function startClockTicker() {
  if (_clockTickerStarted) return;
  _clockTickerStarted = true;
  setInterval(() => {
    const el = document.querySelector('.cal-clock');
    if (el) el.textContent = formatClock(new Date());
  }, 1000);
}

// ---- Background polling ----
let _pollTimer = null;
let _polling = false;

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function startPolling(fn, ms = 5000) {
  stopPolling();
  const run = async () => {
    if (document.visibilityState === 'hidden' || _polling) return;
    // Don't re-render while user is typing — it would lose focus and scroll.
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    _polling = true;
    try { await fn(); } catch (_) { /* ignore poll errors */ }
    finally { _polling = false; }
  };
  _pollTimer = setInterval(run, ms);
  // Poll immediately when switching back to the tab after being away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _pollTimer) run();
  }, { once: true });
}

// ---- Family name polling (keeps switcher labels fresh without full re-render) ----
let _familyNamePollTimer = null;

function stopFamilyNamePolling() {
  if (_familyNamePollTimer) { clearInterval(_familyNamePollTimer); _familyNamePollTimer = null; }
}

function startFamilyNamePolling() {
  stopFamilyNamePolling();
  _familyNamePollTimer = setInterval(async () => {
    if (!state.user || !state.user.can_switch_context) return;
    if (document.visibilityState === 'hidden') return;
    try {
      const families = await api('/api/my-families');
      const changed = families.some(f => {
        const old = (state.families || []).find(x => x.parent_id === f.parent_id);
        return old && old.family_name !== f.family_name;
      });
      if (!changed) return;
      state.families = families;
      // Patch option labels without full re-render
      const sel = document.querySelector('.family-select');
      if (!sel) return;
      families.forEach(f => {
        const opt = [...sel.options].find(o => parseInt(o.value, 10) === f.parent_id);
        if (opt) opt.textContent = f.is_self ? t('family.my')
          : (f.family_name || f.parent_username) + (f.role === 'validator' ? t('family.validator_suffix') : '');
      });
    } catch (_) { /* ignore */ }
  }, 15000);
}

function dayTypeOf(dateStr, todayDateStr) {
  if (dateStr === todayDateStr) return 'today';
  return dateStr < todayDateStr ? 'past' : 'future';
}

// Dropdown showing the current family context with options to switch into
// any other family the user has access to. Returns null when there's only
// one context available (nothing to switch).
function renderFamilySwitcher() {
  if (!state.user || !state.user.can_switch_context) return null;
  const families = state.families || [];
  if (families.length < 2) return null;
  const currentParentId = state.user.context && state.user.context.parent_id;
  const sel = h('select', { class: 'family-select' },
    ...families.map(f => h('option', {
      value: String(f.parent_id),
      selected: f.parent_id === currentParentId
    }, f.is_self ? t('family.my') : (f.family_name || f.parent_username) + (f.role === 'validator' ? t('family.validator_suffix') : '')))
  );
  sel.onchange = async () => {
    const pid = parseInt(sel.value, 10);
    if (pid === currentParentId) return;
    try { await switchFamilyContext(pid); }
    catch (e) { showError(e); }
  };
  return sel;
}

function setMode(m) {
  state.mode = m;
  localStorage.setItem('mode', m);
  if (m !== 'admin') {
    state.editKidId = null;
    state.editKidError = '';
    state.showAddKidForm = false;
  }
  render();
}
const isAdmin = () => state.mode === 'admin';
const isValidator = () => state.mode === 'validator';
// True if the underlying session is a validator (cannot access admin endpoints
// regardless of UI mode).
const sessionIsValidator = () => state.user && state.user.role === 'validator';

// ---- API ----
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---- Helpers ----
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'onclick') el.onclick = v;
    else if (k === 'oninput') el.oninput = v;
    else if (k === 'onchange') el.onchange = v;
    else if (k === 'onsubmit') el.onsubmit = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled') { if (v) el.disabled = true; }
    else if (k === 'value') el.value = v;
    else if (v === false || v == null) continue;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
};

// Returns a localized label for the stored gender code ('м' / 'ж').
function tGender(g) {
  return g === 'м' ? t('kid.gender_m') : t('kid.gender_f');
}

function go(route, extra = {}) {
  stopPolling();
  state.route = route;
  state.error = null;
  Object.assign(state, extra);
  render();
  if (route === 'kid') startPolling(() => reloadKid());
  if (route === 'pending') startPolling(async () => { await loadPendingTasks(); render(); });
}

function showError(err) {
  state.error = err.message || String(err);
  render();
}

// ---- Pages ----
function renderLogin() {
  // Single login form. Role (admin/validator) is determined server-side from
  // the username. Validator usernames are now arbitrary (set by their admin),
  // so no role chooser / prefilled credentials make sense anymore.
  const username = h('input', { placeholder: t('login.username') });
  const password = h('input', { type: 'password', placeholder: t('login.password') });
  const submit = async () => {
    try {
      await api('/api/login', { method: 'POST', body: { username: username.value, password: password.value } });
      clearTgSuppression();
      await enterAfterLogin();
    } catch (e) { showError(e); }
  };
  username.onkeydown = password.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

  // Explicit "Sign in with Telegram" — bypasses the suppression flag set by
  // the Logout button, so the user can come straight back into their TG
  // account without closing & reopening the Mini App.
  const tgLogin = tgInitData && h('button', {
    class: 'tg-primary',
    style: 'margin-bottom: 10px; width: 100%',
    onclick: async () => {
      clearTgSuppression();
      try {
        const r = await tryTelegramAuth();
        if (r && (r.action === 'login' || r.action === 'registered')) {
          await enterAfterLogin();
        } else {
          state.error = t('login.tg_error');
          render();
        }
      } catch (e) { showError(e); }
    }
  }, t('login.tg_button'));

  return h('div', { class: 'card' },
    h('h1', {}, t('app.title')),
    h('p', { class: 'muted' },
      tgInitData
        ? t('login.hint_inside_tg')
        : t('login.hint_outside_tg')),
    tgLogin,
    h('div', { style: 'margin-bottom: 8px' }, username),
    h('div', { style: 'margin-bottom: 8px' }, password),
    state.error && h('div', { class: 'error' }, state.error),
    h('div', { class: 'row' },
      h('button', { onclick: submit }, t('login.submit'))
    )
  );
}

async function loadKids() {
  state.kids = await api('/api/kids');
}

async function loadTaskTemplates() {
  state.taskTemplates = await api('/api/task-templates');
}

async function loadRewardTemplates() {
  state.rewardTemplates = await api('/api/reward-templates');
}

// Custom combo-box: input with a filtered dropdown of suggestions.
// Returns a wrapper element whose .value getter/setter proxies to the inner input.
function comboInput(placeholder, suggestions) {
  const input = h('input', { placeholder, autocomplete: 'off' });
  const dropdown = h('div', { class: 'combo-dropdown' });

  function populate(filter) {
    const items = filter
      ? suggestions.filter(s => s.toLowerCase().includes(filter.toLowerCase()))
      : suggestions;
    dropdown.innerHTML = '';
    if (!items.length) { dropdown.style.display = 'none'; return; }
    items.forEach(title => {
      const item = document.createElement('div');
      item.className = 'combo-item';
      item.textContent = title;
      item.addEventListener('mousedown', e => {
        e.preventDefault(); // keep focus on input so blur doesn't fire first
        input.value = title;
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  input.addEventListener('focus', () => populate(input.value));
  input.addEventListener('input', () => populate(input.value));
  input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));

  const wrapper = h('div', { class: 'combo-wrapper' }, input, dropdown);
  Object.defineProperty(wrapper, 'value', {
    get: () => input.value,
    set: v => { input.value = v; }
  });
  return wrapper;
}

async function loadPendingTasks() {
  state.pendingTasks = await api('/api/pending-tasks');
}

function renderModeToggle() {
  // Validator session: cannot become admin (different account); show only
  // an exit button when in validator mode, and a "to validator" button in view.
  const validatorOnly = sessionIsValidator();

  // In validator UI mode there's no useful "view" page to fall back to —
  // hide the toggle entirely. Logout button next to it covers the only
  // meaningful action.
  if (isValidator()) return null;
  if (isAdmin()) {
    return h('button', {
      class: 'ghost',
      onclick: async () => {
        setMode('view');
      },
      title: t('mode.switch_title')
    }, t('mode.view'));
  }
  // View mode: offer Parent (if admin session) and/or Validator buttons.
  const buttons = [];
  if (!validatorOnly) {
    buttons.push(h('button', {
      class: 'ghost',
      style: 'font-size:20px;padding:4px 6px',
      onclick: () => {
        // No PIN set yet → switch in one click. The user can set a PIN later
        // in Settings to gate the switch.
        if (!state.user || !state.user.has_pin) {
          setMode('admin');
          return;
        }
        state.showModeAuth = true;
        state.modeAuthTarget = 'admin';
        state.modeAuthError = '';
        render();
      },
      title: t('mode.parent_title')
    }, '🔓'));
  }
  buttons.push(h('button', {
    class: 'ghost',
    style: 'font-size:20px;padding:4px 6px',
    onclick: () => {
      state.showModeAuth = true;
      state.modeAuthTarget = 'validator';
      state.modeAuthError = '';
      render();
    },
    title: t('mode.validator_title')
  }, '✅'));
  return h('span', {}, ...buttons);
}

// Small button that toggles between Russian and English.
// Placed in the kids-list header right after the mode toggle icons.
function renderLangToggle() {
  return h('button', {
    class: 'ghost lang-toggle',
    onclick: () => {
      setLang(getLang() === 'ru' ? 'en' : 'ru');
      render();
    }
  }, t('lang.toggle'));
}

// Modal overlay asking for admin OR validator credentials, depending on
// state.modeAuthTarget. After successful verification we switch UI mode.
function renderModeAuthModal() {
  if (!state.showModeAuth) return null;
  const target = state.modeAuthTarget || 'admin';
  const isValidatorTarget = target === 'validator';

  // Admin target: PIN-only (no username). The session is already an admin —
  // we only gate the UI switch behind the parent's secret PIN.
  // Validator target: username + password (validator creds set by admin).
  const pinInput = isValidatorTarget ? null : h('input', { type: 'password', inputmode: 'numeric', placeholder: t('auth.pin_placeholder'), autocomplete: 'off' });
  const uInput = isValidatorTarget ? h('input', { placeholder: t('auth.login_placeholder') }) : null;
  const pInput = isValidatorTarget ? h('input', { type: 'password', placeholder: t('auth.password_placeholder') }) : null;

  const submit = async () => {
    try {
      if (isValidatorTarget) {
        await api('/api/verify-validator', { method: 'POST', body: { username: uInput.value, password: pInput.value } });
      } else {
        await api('/api/verify-pin', { method: 'POST', body: { pin: pinInput.value } });
      }
      state.showModeAuth = false;
      state.modeAuthError = '';
      if (isValidatorTarget) {
        setMode('validator');
        await loadPendingTasks();
        go('pending');
      } else {
        setMode('admin');
      }
    } catch (e) {
      state.modeAuthError = isValidatorTarget ? t('auth.wrong_creds') : t('auth.wrong_pin');
      render();
    }
  };
  if (pinInput) pinInput.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  if (uInput) uInput.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  if (pInput) pInput.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

  return h('div', { class: 'modal-overlay', onclick: (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      state.showModeAuth = false;
      render();
    }
  } },
    h('div', { class: 'modal tg-auth' },
      h('div', { class: 'tg-auth-icon' }, isValidatorTarget ? '✅' : '🔑'),
      h('h2', { class: 'tg-auth-title' }, isValidatorTarget ? t('auth.validator_title') : t('auth.pin_title')),
      h('p', { class: 'tg-auth-sub' },
        isValidatorTarget
          ? t('auth.validator_sub')
          : t('auth.pin_sub')),
      isValidatorTarget
        ? [h('div', { class: 'tg-field' }, uInput), h('div', { class: 'tg-field' }, pInput)]
        : h('div', { class: 'tg-field' }, pinInput),
      state.modeAuthError && h('div', { class: 'error', style: 'text-align: center' }, state.modeAuthError),
      h('button', { class: 'tg-primary', onclick: submit }, t('auth.submit')),
      h('button', { class: 'tg-link', onclick: () => {
        state.showModeAuth = false;
        state.modeAuthError = '';
        render();
      } }, t('auth.cancel'))
    )
  );
}

// Read an image File, downscale to max 256px square, return base64 data URL (JPEG)
function readPhotoAsDataURL(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t('photo.read_error')));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(t('photo.load_error')));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const hh = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = hh;
        canvas.getContext('2d').drawImage(img, 0, 0, w, hh);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderAvatar(k, size = 40) {
  const style = `width:${size}px;height:${size}px;border-radius:50%;flex:0 0 ${size}px;` +
    'display:flex;align-items:center;justify-content:center;' +
    'background:#5eb5f7;color:#fff;font-weight:600;overflow:hidden;';
  if (k.photo) {
    const img = h('img', { src: k.photo, alt: k.name, style: `width:100%;height:100%;object-fit:cover` });
    return h('div', { class: 'avatar', style }, img);
  }
  const initial = (k.name || '?').trim().charAt(0).toUpperCase();
  return h('div', { class: 'avatar', style }, initial);
}

// Generic template tab renderer used for both Tasks and Rewards.
function renderTemplatesTab({ sectionTitle, addTitle, emptyMsg, addPlaceholder, templates, apiBase, loadFn, tplType }) {
  const addInput = h('input', { placeholder: addPlaceholder, style: 'flex: 1' });

  const renderRow = (tpl) => {
    const isEditing = state.editingTemplateId === tpl.id && state.editingTemplateType === tplType;
    if (isEditing) {
      const editInput = h('input', { value: tpl.title, style: 'flex: 1' });
      return h('div', { class: 'kid-row' },
        editInput,
        h('button', { class: 'secondary', onclick: async () => {
          if (!editInput.value.trim()) return;
          try {
            await api(`${apiBase}/${tpl.id}`, { method: 'PUT', body: { title: editInput.value.trim() } });
            state.editingTemplateId = null;
            state.editingTemplateType = null;
            await loadFn();
            render();
          } catch (e) { showError(e); }
        }}, t('templates.save')),
        h('button', { class: 'secondary', onclick: () => {
          state.editingTemplateId = null;
          state.editingTemplateType = null;
          render();
        }}, t('templates.cancel'))
      );
    }
    return h('div', { class: 'kid-row' },
      h('div', { style: 'flex: 1' }, tpl.title),
      h('button', { class: 'icon-btn', title: t('templates.edit'), onclick: () => {
        state.editingTemplateId = tpl.id;
        state.editingTemplateType = tplType;
        render();
      }}, '✏️'),
      h('button', { class: 'icon-btn danger', title: t('templates.delete'), onclick: async () => {
        try {
          await api(`${apiBase}/${tpl.id}`, { method: 'DELETE' });
          await loadFn();
          render();
        } catch (e) { showError(e); }
      }}, '🗑')
    );
  };

  return h('div', {},
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, sectionTitle),
      templates.length === 0
        ? h('div', { class: 'empty' }, emptyMsg)
        : h('div', {}, ...templates.map(renderRow))
    ),
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, addTitle),
      h('div', { class: 'row', style: 'margin-bottom: 8px' }, addInput),
      h('button', {
        onclick: async () => {
          if (!addInput.value.trim()) return;
          try {
            await api(apiBase, { method: 'POST', body: { title: addInput.value.trim() } });
            addInput.value = '';
            await loadFn();
            render();
          } catch (e) { showError(e); }
        }
      }, t('templates.add'))
    )
  );
}

function renderKidsList() {
  const tab = isAdmin() ? (state.kidsListTab || 'kids') : 'kids';

  // Inputs for add-kid form (only needed when tab === 'kids')
  const nameInput = h('input', { placeholder: t('kids.name_placeholder') });
  const ageInput = h('input', { type: 'number', placeholder: t('kids.age_placeholder'), min: '1', max: '18' });
  const genderSel = h('select', {},
    h('option', { value: 'м' }, t('kids.boy')),
    h('option', { value: 'ж' }, t('kids.girl'))
  );
  // Hold the chosen photo (data URL) on the form input itself so closures see fresh value
  const photoInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  let newPhoto = null;
  const photoPreview = h('div', { class: 'photo-preview' }, t('kids.no_photo'));
  photoInput.onchange = async () => {
    const f = photoInput.files && photoInput.files[0];
    if (!f) return;
    try {
      newPhoto = await readPhotoAsDataURL(f);
      photoPreview.innerHTML = '';
      photoPreview.append(h('img', { src: newPhoto, style: 'width:48px;height:48px;border-radius:50%;object-fit:cover' }));
    } catch (e) { showError(e); }
  };

  return h('div', {},
    h('div', { class: 'header' },
      h('div', { style: 'flex: 1; min-width: 0' },
        h('h1', { style: 'margin: 0' }, t('kids.title')),
        renderFamilySwitcher()
      ),
      h('div', {},
        renderModeToggle(),
        renderLangToggle(),
        isAdmin() && h('button', { class: 'ghost', onclick: async () => {
          try { await loadValidators(); } catch (e) { /* ignore */ }
          try { await loadInvites(); } catch (e) { /* ignore */ }
          state.inviteCopiedAt = null;
          go('settings');
        } }, t('kids.settings')),
        isAdmin() && h('button', { class: 'ghost', onclick: async () => { await api('/api/logout', { method: 'POST' }); suppressTgAutoLogin(); state.user = null; setMode('view'); await bootToLogin(); } }, t('kids.logout'))
      )
    ),
    isAdmin() && h('div', { class: 'settings-tabs' },
      h('button', { class: 'settings-tab' + (tab === 'kids' ? ' active' : ''), onclick: () => { state.kidsListTab = 'kids'; render(); } }, t('kids.tab_kids')),
      h('button', { class: 'settings-tab' + (tab === 'tasks' ? ' active' : ''), onclick: async () => { state.kidsListTab = 'tasks'; await loadTaskTemplates(); render(); } }, t('kids.tab_tasks')),
      h('button', { class: 'settings-tab' + (tab === 'rewards' ? ' active' : ''), onclick: async () => { state.kidsListTab = 'rewards'; await loadRewardTemplates(); render(); } }, t('kids.tab_rewards'))
    ),
    tab === 'kids' && isAdmin() && (state.showAddKidForm
      ? h('div', { class: 'card' },
          h('div', { class: 'section-title' }, t('kids.add_kid_title')),
          h('div', { class: 'row', style: 'margin-bottom: 8px' }, nameInput, ageInput, genderSel),
          h('div', { class: 'row', style: 'margin-bottom: 8px; align-items: center' },
            photoPreview,
            h('button', { class: 'secondary', onclick: () => photoInput.click() }, t('kids.choose_photo')),
            photoInput
          ),
          state.error && h('div', { class: 'error' }, state.error),
          h('div', { class: 'row' },
            h('button', { class: 'secondary', onclick: () => {
              state.showAddKidForm = false;
              state.error = null;
              render();
            } }, t('kids.cancel')),
            h('button', {
              onclick: async () => {
                try {
                  if (!nameInput.value || !ageInput.value) throw new Error(t('kids.name_age_required'));
                  await api('/api/kids', { method: 'POST', body: { name: nameInput.value, age: ageInput.value, gender: genderSel.value, photo: newPhoto } });
                  state.showAddKidForm = false;
                  state.error = null;
                  await loadKids();
                  render();
                } catch (e) { showError(e); }
              }
            }, t('kids.add_button'))
          )
        )
      : h('div', { class: 'card', style: 'text-align: center' },
          h('button', { onclick: () => { state.showAddKidForm = true; render(); } }, t('kids.add_kid'))
        )
    ),
    tab === 'kids' && h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('kids.list_title')),
      state.kids.length === 0
        ? h('div', { class: 'empty' }, isAdmin() ? t('kids.empty_admin') : t('kids.empty_view'))
        : state.kids.map(k => renderKidRow(k))
    ),
    tab === 'tasks' && renderTemplatesTab({
      sectionTitle: t('templates.task.section'),
      addTitle: t('templates.task.add_title'),
      emptyMsg: t('templates.task.empty'),
      addPlaceholder: t('templates.task.placeholder'),
      templates: state.taskTemplates || [],
      apiBase: '/api/task-templates',
      loadFn: loadTaskTemplates,
      tplType: 'task'
    }),
    tab === 'rewards' && renderTemplatesTab({
      sectionTitle: t('templates.reward.section'),
      addTitle: t('templates.reward.add_title'),
      emptyMsg: t('templates.reward.empty'),
      addPlaceholder: t('templates.reward.placeholder'),
      templates: state.rewardTemplates || [],
      apiBase: '/api/reward-templates',
      loadFn: loadRewardTemplates,
      tplType: 'reward'
    })
  );
}

function renderKidRow(k) {
  const admin = isAdmin();
  const total = k.today_total || 0;
  const done = k.today_done || 0;
  const pct = total ? Math.round(done * 100 / total) : 0;

  // Inline edit mode
  if (state.editKidId === k.id) {
    const nameInput = h('input', { value: k.name });
    const ageInput = h('input', { type: 'number', min: '1', max: '18', value: k.age });
    const genderSel = h('select', {},
      h('option', { value: 'м' }, t('kids.boy')),
      h('option', { value: 'ж' }, t('kids.girl'))
    );
    genderSel.value = k.gender;

    // Photo state: pendingPhoto = data URL chosen now; or k.photo unchanged; or null to clear
    let pendingPhoto = k.photo || null;
    let photoTouched = false;
    const photoInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    const previewWrap = h('div', { class: 'photo-preview' });
    const refreshPreview = () => {
      previewWrap.innerHTML = '';
      if (pendingPhoto) {
        previewWrap.append(h('img', { src: pendingPhoto, style: 'width:48px;height:48px;border-radius:50%;object-fit:cover' }));
      } else {
        previewWrap.append(document.createTextNode(t('kids.no_photo')));
      }
    };
    refreshPreview();
    photoInput.onchange = async () => {
      const f = photoInput.files && photoInput.files[0];
      if (!f) return;
      try {
        pendingPhoto = await readPhotoAsDataURL(f);
        photoTouched = true;
        refreshPreview();
      } catch (e) { showError(e); }
    };

    return h('div', { class: 'kid-row editing' },
      h('div', { class: 'kid-edit-fields' },
        h('div', { class: 'row', style: 'margin-bottom: 6px' }, nameInput, ageInput, genderSel),
        h('div', { class: 'row', style: 'margin-bottom: 6px; align-items: center' },
          previewWrap,
          h('button', { class: 'secondary', onclick: () => photoInput.click() }, t('kids.change_photo')),
          k.photo || pendingPhoto ? h('button', { class: 'icon-btn danger', title: t('kids.remove_photo'), onclick: () => {
            pendingPhoto = null;
            photoTouched = true;
            refreshPreview();
          } }, '🗑') : null,
          photoInput
        ),
        state.editKidError && h('div', { class: 'error' }, state.editKidError),
        h('div', { class: 'row' },
          h('button', { class: 'secondary', onclick: () => {
            state.editKidId = null;
            state.editKidError = '';
            render();
          } }, t('kids.cancel')),
          h('button', { onclick: async () => {
            try {
              if (!nameInput.value || !ageInput.value) throw new Error(t('kids.name_age_required'));
              const body = { name: nameInput.value, age: ageInput.value, gender: genderSel.value };
              if (photoTouched) body.photo = pendingPhoto; // null = clear, string = set
              await api(`/api/kids/${k.id}`, { method: 'PUT', body });
              state.editKidId = null;
              state.editKidError = '';
              await loadKids();
              render();
            } catch (e) {
              state.editKidError = e.message;
              render();
            }
          } }, t('kids.save'))
        )
      )
    );
  }

  // Normal view
  return h('div', {
    class: 'kid-row',
    onclick: () => openKid(k.id)
  },
    renderAvatar(k, 44),
    h('div', { style: 'flex: 1; margin-left: 12px' },
      h('div', { style: 'font-weight: 600' }, `${k.name} (${k.age}, ${tGender(k.gender)})`),
      h('div', { class: 'kid-meta' }, total
        ? t('kids.today_progress').replace('{done}', done).replace('{total}', total).replace('{pct}', pct)
        : t('kids.no_tasks_today'))
    ),
    admin && h('button', {
      class: 'icon-btn',
      title: t('kids.edit_title'),
      onclick: (e) => {
        e.stopPropagation();
        state.editKidId = k.id;
        state.editKidError = '';
        render();
      }
    }, '✎'),
    admin && h('button', {
      class: 'icon-btn danger',
      title: t('kids.delete_title'),
      onclick: async (e) => {
        e.stopPropagation();
        if (!confirm(t('kids.delete_confirm').replace('{name}', k.name))) return;
        try {
          await api(`/api/kids/${k.id}`, { method: 'DELETE' });
          await loadKids();
          render();
        } catch (err) { showError(err); }
      }
    }, '🗑'),
    !admin && h('div', {}, '›')
  );
}

async function openKid(id) {
  try {
    state.currentKid = await api(`/api/kids/${id}`);
    state.selectedDate = state.currentKid.today.date;
    state.selectedDay = state.currentKid.today; // { date, tasks, reward }
    state.calendarAnchor = null; // re-center strip on selected date
    state._calendarNeedsScroll = true;
    // Reset per-kid reward unlock state so admin must re-enter password every time
    state.rewardUnlocked = false;
    state.showUnlockForm = false;
    state.unlockError = '';
    // Preload templates so the datalists are available on the kid page
    if (isAdmin()) await Promise.all([loadTaskTemplates(), loadRewardTemplates()]);
    go('kid');
  } catch (e) { showError(e); }
}

async function loadSelectedDay() {
  const kidId = state.currentKid.kid.id;
  state.selectedDay = await api(`/api/kids/${kidId}/day/${state.selectedDate}`);
}

async function selectDate(date) {
  state.selectedDate = date;
  // Re-center the calendar strip on the newly selected date
  state.calendarAnchor = null;
  state._calendarNeedsScroll = true;
  // Reset reward unlock when switching days so password can't be "reused"
  state.rewardUnlocked = false;
  state.showUnlockForm = false;
  state.unlockError = '';
  try {
    await loadSelectedDay();
    render();
  } catch (e) { showError(e); }
}

async function reloadKid() {
  // Reload both the profile (for calendar/history/stats) and the currently selected day
  const kidId = state.currentKid.kid.id;
  state.currentKid = await api(`/api/kids/${kidId}`);
  await loadSelectedDay();
  // If tasks are no longer 100% done, re-lock the reward so the password
  // form is required again next time everything is completed.
  const day = state.selectedDay;
  const allDone = day.tasks.length > 0 && day.tasks.every(t => t.completed);
  if (!allDone) state.rewardUnlocked = false;
  // Patch only the dynamic parts — calendar strip is never touched,
  // so its scroll position stays exactly where the user left it.
  const inner = document.getElementById('kid-dyn-inner');
  const outer = document.getElementById('kid-dyn-outer');
  if (inner && outer) {
    inner.replaceWith(renderKidDynInner());
    outer.replaceWith(renderKidDynOuter());
  } else {
    render(); // fallback if DOM structure is unexpected
  }
}

// Horizontal date strip: shows a window of days around the selected date,
// with arrows to shift the window by a week. Markers come from profile.calendar
// (any day that has tasks or a reward).
function renderCalendarStrip(kid, todayDate) {
  const selected = state.selectedDate;
  const windowDays = 14; // total visible cells
  // Anchor the window so the selected date is near the center
  const anchor = state.calendarAnchor || shiftDate(selected, -Math.floor(windowDays / 2));
  state.calendarAnchor = anchor;

  const calMap = new Map();
  for (const c of (state.currentKid.calendar || [])) calMap.set(c.date, c);

  const dowShort = t('cal.dow_short');
  const monthShort = t('cal.month_short');

  const cells = [];
  for (let i = 0; i < windowDays; i++) {
    const date = shiftDate(anchor, i);
    const type = dayTypeOf(date, todayDate);
    const info = calMap.get(date);
    const classes = ['cal-cell', `cal-${type}`];
    if (date === selected) classes.push('cal-selected');
    if (info && info.total > 0) classes.push('cal-has-tasks');
    if (info && info.claimed) classes.push('cal-claimed');

    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dowShort[dt.getDay()];

    const markers = [];
    if (info && info.total > 0) markers.push(h('span', { class: 'cal-dot cal-dot-tasks' }));
    if (info && info.claimed) markers.push(h('span', { class: 'cal-dot cal-dot-reward' }));

    // Show short month label for the first day of month so transitions are visible
    const monthAbbr = monthShort[m - 1];
    const monthBadge = d === 1 ? h('div', { class: 'cal-month-badge' }, monthAbbr) : null;

    cells.push(h('button', {
      class: classes.join(' '),
      onclick: () => selectDate(date),
    },
      h('div', { class: 'cal-dow' }, dow),
      h('div', { class: 'cal-day' }, String(d)),
      monthBadge,
      h('div', { class: 'cal-markers' }, ...markers)
    ));
  }

  // Header: full selected date (day month year, weekday) + live clock
  const monthGen = t('cal.month_gen');
  const dowFull = t('cal.dow_full');
  const dateFmt = t('cal.date_format');
  const [sy, sm, sd] = selected.split('-').map(Number);
  const selDt = new Date(sy, sm - 1, sd);
  const headerLabel = dateFmt
    .replace('{day}', sd)
    .replace('{month}', monthGen[sm - 1])
    .replace('{year}', sy)
    .replace('{dow}', dowFull[selDt.getDay()]);
  const clockEl = h('span', { class: 'cal-clock' }, formatClock(new Date()));
  startClockTicker();

  const strip = h('div', { class: 'cal-strip' }, ...cells);
  // After mount, center the selected cell — only when the date just changed.
  // rAF fires after browser layout so scrollWidth/offsetLeft are available.
  if (state._calendarNeedsScroll) {
    state._calendarNeedsScroll = false;
    requestAnimationFrame(() => {
      const sel = strip.querySelector('.cal-selected');
      if (sel && strip.scrollWidth > strip.clientWidth) {
        strip.scrollLeft = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
        state._calStripScroll = strip.scrollLeft;
      }
    });
  }

  return h('div', { class: 'calendar-wrap' },
    h('div', { class: 'cal-header' },
      h('span', { class: 'cal-header-date' }, headerLabel),
      clockEl
    ),
    h('div', { class: 'calendar' },
      h('button', {
        class: 'cal-nav',
        onclick: () => { state.calendarAnchor = shiftDate(anchor, -7); render(); }
      }, '‹'),
      strip,
      h('button', {
        class: 'cal-nav',
        onclick: () => { state.calendarAnchor = shiftDate(anchor, 7); render(); }
      }, '›')
    )
  );
}

// Reward section: title is always hidden until admin enters password.
// Below 100% just shows a locked placeholder; at 100% an "Открыть награду"
// button reveals an inline login+password form; on success — the reward title
// becomes visible and can be handed over.
function renderRewardSection(kid, day, allDone, admin, dayType) {
  const reward = day.reward;
  const claimed = reward && reward.claimed;
  const unlocked = !!state.rewardUnlocked || claimed;

  // --- Past day: read-only, reward shown openly if claimed, locked otherwise ---
  if (dayType === 'past') {
    if (!reward) return null;
    if (claimed) {
      return h('div', { class: 'card' },
        h('div', { class: 'section-title' }, t('reward.title_trophy')),
        h('div', { class: 'reward claimed' },
          h('div', { style: 'font-size: 40px' }, '🏆'),
          h('h3', {}, reward.title),
          h('div', { class: 'muted' }, t('reward.claimed_label'))
        )
      );
    }
    return h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('reward.title_gift')),
      h('div', { class: 'reward locked' },
        h('div', { style: 'font-size: 40px' }, '🔒'),
        h('h3', {}, reward.title),
        h('div', { class: 'muted' }, t('reward.not_claimed'))
      )
    );
  }

  // --- Future day ---
  if (dayType === 'future') {
    // View mode: show locked placeholder if reward exists, otherwise nothing
    if (!admin) {
      if (!reward) return null;
      return h('div', { class: 'card' },
        h('div', { class: 'section-title' }, t('reward.title_gift')),
        h('div', { class: 'reward locked' },
          h('div', { style: 'font-size: 48px' }, '🎁'),
          h('h3', {}, t('reward.surprise')),
          h('div', { class: 'muted' }, t('reward.surprise_opens'))
        )
      );
    }
    const inner = [];
    if (!reward) {
      const newInput = comboInput(t('templates.reward.placeholder'), (state.rewardTemplates || []).map(r => r.title));
      inner.push(
        h('div', { class: 'section-title' }, t('reward.day_title').replace('{date}', day.date)),
        h('div', { class: 'muted', style: 'margin-bottom: 8px' }, t('reward.not_assigned_yet')),
        h('div', { class: 'row' },
          newInput,
          h('button', { onclick: async () => {
            if (!newInput.value.trim()) return;
            await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { date: day.date, title: newInput.value.trim() } });
            reloadKid();
          } }, t('reward.assign'))
        )
      );
    } else {
      // Future reward — admin sees the title (planning view)
      inner.push(
        h('div', { class: 'section-title' }, t('reward.day_title').replace('{date}', day.date)),
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 40px' }, '🎁'),
          h('h3', {}, reward.title),
          h('div', { class: 'muted' }, t('reward.opens_on_day'))
        )
      );
      const editInput = comboInput(t('reward.new_placeholder'), (state.rewardTemplates || []).map(r => r.title));
      inner.push(
        h('div', { class: 'section-title' }, t('reward.edit_title')),
        h('div', { class: 'row' },
          editInput,
          h('button', { class: 'secondary', onclick: async () => {
            if (!editInput.value.trim()) return;
            await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { date: day.date, title: editInput.value.trim() } });
            editInput.value = '';
            reloadKid();
          } }, t('reward.save'))
        )
      );
    }
    return h('div', { class: 'card' }, ...inner);
  }

  // --- Today: existing behaviour ---
  // No reward set in view mode → show a small placeholder so the kid knows
  // a reward is just missing (vs. UI being broken).
  if (!reward && !admin) {
    return h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('reward.daily_title')),
      h('div', { class: 'reward locked' },
        h('div', { style: 'font-size: 48px' }, '🎁'),
        h('h3', {}, '******'),
        h('div', { class: 'muted' }, t('reward.not_selected'))
      )
    );
  }

  const inner = [];

  if (!reward) {
    // Admin mode without reward yet: show creation input only
    const newInput = comboInput(t('templates.reward.placeholder'), (state.rewardTemplates || []).map(r => r.title));
    inner.push(
      h('div', { class: 'section-title' }, t('reward.daily_title')),
      h('div', { class: 'muted', style: 'margin-bottom: 8px' }, t('reward.not_assigned_today')),
      h('div', { class: 'row' },
        newInput,
        h('button', { onclick: async () => {
          if (!newInput.value.trim()) return;
          await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { title: newInput.value.trim() } });
          reloadKid();
        } }, t('reward.assign'))
      )
    );
  } else if (!allDone) {
    // Tasks not all done → reward is hidden from kid; admin always sees the title.
    inner.push(
      h('div', { class: 'section-title' }, t('reward.daily_title')),
      admin
        ? h('div', { class: 'reward' },
            h('div', { style: 'font-size: 40px' }, '🎁'),
            h('h3', {}, reward.title),
            h('div', { class: 'muted' }, t('reward.locked_until_done'))
          )
        : h('div', { class: 'reward locked' },
            h('div', { style: 'font-size: 48px' }, '🎁'),
            h('h3', {}, t('reward.surprise')),
            h('div', { class: 'muted' }, t('reward.locked_until_done'))
          )
    );
  } else if (claimed) {
    inner.push(
      h('div', { class: 'section-title' }, t('reward.trophy_daily')),
      h('div', { class: 'reward claimed' },
        h('div', { style: 'font-size: 40px' }, '🏆'),
        h('h3', {}, reward.title),
        h('div', { class: 'muted' }, t('reward.received'))
      )
    );
  } else if (!unlocked) {
    // 100% done but not unlocked yet — show reveal button (or login form if requested)
    inner.push(h('div', { class: 'section-title' }, t('reward.daily_title')));

    if (admin) {
      // Admin already authorized — title is always visible. No claim button:
      // the actual handover happens in view mode (kid sees the surprise).
      inner.push(
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 40px' }, '🎁'),
          h('h3', {}, reward.title),
          h('div', { class: 'muted' }, t('reward.all_done_admin'))
        )
      );
    } else if (state.showUnlockForm) {
      const pinInput = h('input', { type: 'password', inputmode: 'numeric', placeholder: t('auth.pin_placeholder'), autocomplete: 'off' });
      const submitUnlock = async () => {
        try {
          await api('/api/verify-pin', { method: 'POST', body: { pin: pinInput.value } });
          state.rewardUnlocked = true;
          state.showUnlockForm = false;
          state.unlockError = '';
          render();
        } catch (e) {
          state.unlockError = t('reward.wrong_pin');
          render();
        }
      };
      pinInput.onkeydown = (e) => { if (e.key === 'Enter') submitUnlock(); };
      inner.push(
        h('div', { class: 'reward unlock-form' },
          h('div', { style: 'font-size: 32px' }, '🔐'),
          h('div', { style: 'font-weight: 600; margin-bottom: 12px' }, t('reward.enter_pin')),
          h('div', { class: 'tg-field' }, pinInput),
          state.unlockError && h('div', { class: 'error', style: 'text-align: center' }, state.unlockError),
          h('div', { class: 'row' },
            h('button', { class: 'secondary', onclick: () => {
              state.showUnlockForm = false;
              state.unlockError = '';
              render();
            } }, t('reward.cancel')),
            h('button', { onclick: submitUnlock }, t('reward.open'))
          )
        )
      );
    } else {
      // No PIN set → reveal in one click (no unlock form). Once a PIN is set
      // in Settings, the PIN form gates the reveal.
      const hasPin = state.user && state.user.has_pin;
      inner.push(
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 40px' }, '🎁'),
          h('h3', {}, t('reward.all_done')),
          h('div', { class: 'muted', style: 'margin-bottom: 10px' }, t('reward.parent_opens')),
          h('button', { onclick: () => {
            if (!hasPin) {
              state.rewardUnlocked = true;
              render();
              return;
            }
            state.showUnlockForm = true;
            state.unlockError = '';
            render();
          } }, t('reward.open_reward'))
        )
      );
    }
  } else {
    // 100% done and unlocked (password accepted) — show claim button.
    // In view mode the title stays hidden as a surprise; admin always sees it.
    inner.push(
      h('div', { class: 'section-title' }, t('reward.daily_title')),
      h('div', { class: 'reward' },
        h('div', { style: 'font-size: 48px' }, '🎁'),
        h('h3', {}, admin ? reward.title : t('reward.surprise_ready')),
        h('div', { class: 'muted', style: 'margin-bottom: 10px' }, t('reward.ready_to_give')),
        h('button', { onclick: async () => {
          await api(`/api/rewards/${reward.id}/claim`, { method: 'POST' });
          state.rewardUnlocked = false; // reset, since claimed status now persists
          reloadKid();
        } }, t('reward.give_reward'))
      )
    );
  }

  // Admin extra: edit reward title (only when reward exists). Input has no
  // prefilled value to avoid leaking the title to anyone glancing at the screen.
  if (admin && reward) {
    const editInput = comboInput(t('reward.new_placeholder'), (state.rewardTemplates || []).map(r => r.title));
    inner.push(
      h('div', { class: 'section-title' }, t('reward.edit_title')),
      h('div', { class: 'row' },
        editInput,
        h('button', { class: 'secondary', onclick: async () => {
          if (!editInput.value.trim()) return;
          await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { title: editInput.value.trim() } });
          editInput.value = '';
          reloadKid();
        } }, t('reward.save'))
      )
    );
  }

  return h('div', { class: 'card' }, ...inner);
}

// Dynamic inner part of kid page: progress + tasks + add-input.
// Wrapped in id="kid-dyn-inner" so reloadKid() can patch it without
// touching the calendar strip.
function renderKidDynInner() {
  const { kid, today } = state.currentKid;
  const day = state.selectedDay;
  const dayType = dayTypeOf(day.date, today.date);
  const total = day.tasks.length;
  const done = day.tasks.filter(t => t.completed).length;
  const pct = total ? Math.round(done * 100 / total) : 0;
  const admin = isAdmin();
  const canEditTasks = admin && (dayType === 'today' || dayType === 'future');
  const canToggleTasks = dayType === 'today';

  const emptyMsg =
    dayType === 'today' ? (admin ? t('tasks.empty_today_admin') : t('tasks.empty_today_view'))
    : dayType === 'past' ? t('tasks.empty_past')
    : (admin ? t('tasks.empty_future_admin') : t('tasks.empty_future_view'));

  const taskInput = comboInput(
    dayType === 'today' ? t('tasks.new_today') : t('tasks.new_date').replace('{date}', day.date),
    (state.taskTemplates || []).map(tpl => tpl.title)
  );

  const taskEls = day.tasks.map(task => {
    // Today: real checkbox. Past: show ✓ / ✕ marker (frozen). Future: lock icon.
    let marker;
    if (canToggleTasks) {
      marker = h('input', {
        type: 'checkbox',
        // Show checked while pending OR approved — kid sees their tick stays
        checked: !!task.completed || !!task.pending,
        onchange: async () => { await api(`/api/tasks/${task.id}/toggle`, { method: 'POST' }); reloadKid(); }
      });
    } else if (dayType === 'future') {
      marker = h('div', { class: 'task-marker future' }, '🔒');
    } else {
      // past, or today in view mode — show current state without checkbox
      marker = h('div', { class: 'task-marker past ' + (task.completed ? 'done' : 'missed') }, task.completed ? '✓' : '○');
    }
    return h('div', { class: 'task' + (task.completed ? ' done' : '') + (task.pending ? ' pending' : '') + (!canToggleTasks ? ' readonly' : '') },
      marker,
      h('div', { class: 'title' }, task.title),
      task.pending && h('span', { class: 'task-pending-badge', title: t('tasks.pending_badge') }, t('tasks.pending_badge')),
      canEditTasks && admin && h('button', { class: 'del', onclick: async () => {
        await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
        reloadKid();
      } }, '✕')
    );
  });

  return h('div', { id: 'kid-dyn-inner' },
    h('div', { class: 'progress-wrap' }, h('div', { class: 'progress-bar', style: `width: ${pct}%` })),
    h('div', { class: 'progress-label' }, `${done} / ${total} (${pct}%)`),
    total === 0 && h('div', { class: 'empty' }, emptyMsg),
    ...taskEls,
    canEditTasks && admin && h('div', { class: 'row', style: 'margin-top: 10px' },
      taskInput,
      h('button', {
        onclick: async () => {
          if (!taskInput.value.trim()) return;
          await api(`/api/kids/${kid.id}/tasks`, { method: 'POST', body: { date: day.date, title: taskInput.value.trim() } });
          taskInput.value = '';
          reloadKid();
        }
      }, t('tasks.add'))
    )
  );
}

// Dynamic outer part: reward + stats + history cards.
function renderKidDynOuter() {
  const { kid, today, history, stats } = state.currentKid;
  const day = state.selectedDay;
  const dayType = dayTypeOf(day.date, today.date);
  const total = day.tasks.length;
  const done = day.tasks.filter(task => task.completed).length;
  const allDone = total > 0 && done === total;
  const admin = isAdmin();

  return h('div', { id: 'kid-dyn-outer' },
    renderRewardSection(kid, day, allDone, admin, dayType),
    admin && h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('stats.title')),
      h('div', {}, t('stats.days_with_tasks').replace('{n}', stats.days_with_tasks || 0)),
      h('div', {}, t('stats.total_tasks').replace('{total}', stats.total_tasks || 0).replace('{done}', stats.completed_tasks || 0)),
      h('div', {}, t('stats.rewards_claimed').replace('{n}', stats.rewards_claimed || 0))
    ),
    admin && h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('history.title')),
      history.length === 0
        ? h('div', { class: 'empty' }, t('history.empty'))
        : history.map(d => h('div', { class: 'history-day' },
            h('div', { class: 'date' }, d.date),
            h('div', { class: 'summary' },
              t('history.tasks').replace('{done}', d.done || 0).replace('{total}', d.total) +
              (d.reward ? t('history.reward').replace('{title}', d.reward.title) + (d.reward.claimed ? t('history.reward_claimed') : '') : '')
            )
          ))
    )
  );
}

function renderKid() {
  const { kid, today } = state.currentKid;
  const admin = isAdmin();

  return h('div', {},
    h('div', { class: 'header' },
      h('button', { class: 'ghost', onclick: async () => { await loadKids(); go('kids'); } }, t('kid.back')),
      h('div', { style: 'flex:1' }),
      h('div', {},
        renderModeToggle(),
        admin && h('button', { class: 'ghost danger', onclick: async () => {
          if (!confirm(t('kid.delete_confirm').replace('{name}', kid.name))) return;
          await api(`/api/kids/${kid.id}`, { method: 'DELETE' });
          await loadKids();
          go('kids');
        } }, t('kid.delete'))
      )
    ),

    h('div', { class: 'card' },
      h('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:6px' },
        renderAvatar(kid, 48),
        h('div', {},
          h('div', { style: 'font-weight:600;font-size:16px' }, kid.name),
          h('div', { class: 'muted' }, t('kid.age_gender').replace('{age}', kid.age).replace('{gender}', tGender(kid.gender)))
        )
      ),
      renderCalendarStrip(kid, today.date),
      renderKidDynInner()
    ),

    renderKidDynOuter()
  );
}

async function loadValidators() {
  state.validators = await api('/api/members');
}

// Manual creation of a validator account by login/password (legacy flow,
// useful for non-Telegram or browser-only validators).
function renderValidatorAddBlock() {
  const newUser = h('input', { placeholder: t('validators.login_placeholder') });
  const newPass = h('input', { type: 'password', placeholder: t('validators.password_placeholder') });
  return h('div', { class: 'card' },
    h('div', { class: 'section-title' }, t('validators.add_title')),
    h('p', { class: 'muted', style: 'margin-bottom: 10px' }, t('validators.add_hint')),
    h('div', { class: 'row', style: 'margin-bottom: 8px' }, newUser, newPass),
    h('button', {
      onclick: async () => {
        if (!newUser.value.trim() || !newPass.value) return;
        try {
          await api('/api/validators', { method: 'POST', body: { username: newUser.value.trim(), password: newPass.value } });
          newUser.value = ''; newPass.value = '';
          await loadValidators();
          render();
        } catch (e) { showError(e); }
      }
    }, t('validators.add'))
  );
}

// Combined list of validators in the family — both legacy login/password
// accounts (type='local') and TG-invited memberships (type='tg_member').
function renderValidatorsListBlock() {
  const list = state.validators || [];
  return h('div', { class: 'card' },
    h('div', { class: 'section-title' }, t('validators.list_title')),
    list.length === 0
      ? h('div', { class: 'empty' }, t('validators.empty'))
      : h('div', {}, ...list.map(v => {
          const isTg = v.type === 'tg_member';
          return h('div', { class: 'kid-row' },
            h('div', { style: 'flex: 1' },
              h('div', { style: 'font-weight: 600' }, v.username),
              h('div', { class: 'kid-meta' }, isTg ? t('validators.tg_guest') : (v.tg_linked ? t('validators.tg_linked') : t('validators.tg_not_linked')))
            ),
            !isTg && h('button', {
              class: 'icon-btn',
              title: t('validators.change_password_title'),
              onclick: async () => {
                const p = prompt(t('validators.change_password_prompt').replace('{name}', v.username));
                if (!p) return;
                try {
                  await api(`/api/validators/${v.id}/password`, { method: 'POST', body: { password: p } });
                  alert(t('validators.password_changed'));
                } catch (e) { showError(e); }
              }
            }, '🔑'),
            h('button', {
              class: 'icon-btn danger',
              title: isTg ? t('validators.revoke_title') : t('validators.delete_title'),
              onclick: async () => {
                const msg = isTg
                  ? t('validators.revoke_confirm').replace('{name}', v.username)
                  : t('validators.delete_confirm').replace('{name}', v.username);
                if (!confirm(msg)) return;
                try {
                  if (isTg) {
                    await api(`/api/members/${v.id}`, { method: 'DELETE' });
                  } else {
                    await api(`/api/validators/${v.id}`, { method: 'DELETE' });
                  }
                  await loadValidators();
                  render();
                } catch (e) { showError(e); }
              }
            }, '🗑')
          );
        }))
  );
}

async function loadInvites() {
  state.invites = await api('/api/invites');
}

function renderInvitesBlock() {
  const list = state.invites || [];
  // Share helpers — copy to clipboard, or open Telegram share picker.
  const shareViaTelegram = (url) => {
    const msg = encodeURIComponent(t('invites.share_msg'));
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${msg}`;
    if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank');
  };
  const copyToClipboard = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      state.inviteCopiedAt = Date.now();
      render();
    } catch {
      // Fallback: select a temp textarea
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); state.inviteCopiedAt = Date.now(); render(); }
      finally { document.body.removeChild(ta); }
    }
  };

  return h('div', { class: 'card' },
    h('div', { class: 'section-title' }, t('invites.title')),
    h('p', { class: 'muted', style: 'margin-bottom: 10px' }, t('invites.hint')),
    list.length === 0
      ? h('div', { class: 'empty' }, t('invites.empty'))
      : h('div', {}, ...list.map(inv => h('div', { class: 'kid-row', style: 'flex-direction: column; gap: 6px; align-items: stretch' },
          h('div', {},
            h('div', { style: 'font-family: monospace; font-size: 12px; word-break: break-all' }, inv.url || t('invites.no_url')),
            h('div', { class: 'kid-meta' }, t('invites.created_at').replace('{date}', inv.created_at || ''))
          ),
          h('div', { style: 'display: flex; gap: 6px; align-items: center' },
            inv.url && h('button', { class: 'secondary', onclick: () => copyToClipboard(inv.url) }, t('invites.copy')),
            inv.url && h('button', { class: 'secondary', onclick: () => shareViaTelegram(inv.url) }, t('invites.share')),
            h('button', {
              class: 'icon-btn danger',
              title: t('invites.revoke_title'),
              onclick: async () => {
                if (!confirm(t('invites.revoke_confirm'))) return;
                try {
                  await api(`/api/invites/${inv.id}`, { method: 'DELETE' });
                  await loadInvites();
                  render();
                } catch (e) { showError(e); }
              }
            }, '🗑')
          )
        ))),
    state.inviteCopiedAt && h('div', { class: 'flash-success' }, t('invites.copied')),
    h('button', {
      style: 'margin-top: 10px',
      onclick: async () => {
        try {
          await api('/api/invites', { method: 'POST' });
          await loadInvites();
          render();
        } catch (e) { showError(e); }
      }
    }, t('invites.create'))
  );
}

function renderTelegramBlock() {
  // Only meaningful when running inside Telegram. Outside (browser), the
  // user can't bind anyway; we hide the block so it doesn't confuse.
  if (!tgInitData) {
    return h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('telegram.title')),
      h('p', { class: 'muted' },
        state.user && state.user.tg_linked
          ? t('telegram.already_linked')
          : t('telegram.open_in_tg'))
    );
  }
  if (state.user && state.user.tg_linked) {
    return h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('telegram.title')),
      h('p', { class: 'muted' }, t('telegram.linked_success'))
    );
  }
  return h('div', { class: 'card' },
    h('div', { class: 'section-title' }, t('telegram.title')),
    h('p', { class: 'muted', style: 'margin-bottom: 10px' }, t('telegram.link_hint')),
    state.tgLinkError && h('div', { class: 'error' }, state.tgLinkError),
    h('button', {
      onclick: async () => {
        const r = await tryTelegramAuth();
        if (r && r.action === 'bound') {
          state.user.tg_linked = true;
          state.tgLinkError = '';
          alert(t('telegram.link_ok'));
        } else if (r && r.action === 'login') {
          // Already linked elsewhere (shouldn't normally happen here).
          state.user.tg_linked = true;
        } else {
          state.tgLinkError = t('telegram.link_err');
        }
        render();
      }
    }, t('telegram.link_btn'))
  );
}

// Brief inline success message; visually fades via CSS animation. We only
// clear the state flag after the animation finishes — without triggering a
// re-render, so the user's focus inside the form is preserved.
let _pinFlashTimer = null;
function flashPinSuccess(msg) {
  state.pinSuccess = msg;
  state.pinError = '';
  if (_pinFlashTimer) clearTimeout(_pinFlashTimer);
  _pinFlashTimer = setTimeout(() => {
    state.pinSuccess = '';
    _pinFlashTimer = null;
  }, 2500);
}

// Map server-side English error messages (returned in JSON {error: ...})
// to user-facing localized text.
function pinErrorRu(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('wrong old pin')) return t('pin.err_wrong_old');
  if (m.includes('wrong pin')) return t('pin.err_wrong');
  if (m.includes('pin must be')) return t('pin.err_too_short');
  if (m.includes('pin not set')) return t('pin.err_not_set');
  return msg || t('pin.err_generic');
}

function renderPinBlock() {
  const hasPin = state.user && state.user.has_pin;
  const deleteOpen = !!state.pinDeleteOpen;
  const oldPin = h('input', { type: 'password', inputmode: 'numeric', placeholder: t('pin.old_placeholder'), autocomplete: 'off' });
  const newPin = h('input', { type: 'password', inputmode: 'numeric', placeholder: hasPin ? t('pin.new_placeholder') : t('pin.create_placeholder'), autocomplete: 'off' });
  const deletePin = h('input', { type: 'password', inputmode: 'numeric', placeholder: t('pin.current_placeholder'), autocomplete: 'off' });

  // While the delete form is open, hide the add/change form to keep focus
  // and intent unambiguous.
  return h('div', { class: 'card' },
    h('div', { class: 'section-title' }, t('pin.title')),
    h('p', { class: 'muted', style: 'margin-bottom: 10px' },
      hasPin ? t('pin.hint_set') : t('pin.hint_unset')),
    !deleteOpen && hasPin && h('div', { style: 'margin-bottom: 8px' }, oldPin),
    !deleteOpen && h('div', { style: 'margin-bottom: 8px' }, newPin),
    state.pinError && h('div', { class: 'error' }, state.pinError),
    state.pinSuccess && h('div', { class: 'flash-success' }, state.pinSuccess),
    !deleteOpen && h('div', { class: 'row' },
      h('button', {
        onclick: async () => {
          try {
            const body = { pin: newPin.value };
            if (hasPin) body.oldPin = oldPin.value;
            await api('/api/admin-pin', { method: 'POST', body });
            oldPin.value = ''; newPin.value = '';
            await refreshUser();
            flashPinSuccess(hasPin ? t('pin.changed') : t('pin.set_success'));
            render();
          } catch (e) {
            state.pinError = pinErrorRu(e.message);
            render();
          }
        }
      }, hasPin ? t('pin.change') : t('pin.set')),
      hasPin && h('button', {
        class: 'secondary',
        onclick: () => {
          state.pinDeleteOpen = true;
          state.pinError = '';
          render();
        }
      }, t('pin.delete'))
    ),
    // Inline confirmation for delete — appears only when "Удалить PIN" was
    // clicked. Avoids native prompt() (broken focus inside Telegram WebApp).
    hasPin && deleteOpen && h('div', {},
      h('div', { class: 'muted', style: 'margin-bottom: 8px' }, t('pin.delete_confirm')),
      h('div', { style: 'margin-bottom: 8px' }, deletePin),
      h('div', { class: 'row' },
        h('button', { class: 'secondary', onclick: () => {
          state.pinDeleteOpen = false;
          state.pinError = '';
          render();
        } }, t('pin.cancel')),
        h('button', { class: 'danger', onclick: async () => {
          try {
            await api('/api/admin-pin', { method: 'DELETE', body: { pin: deletePin.value } });
            state.pinDeleteOpen = false;
            await refreshUser();
            flashPinSuccess(t('pin.deleted'));
            render();
          } catch (e) {
            state.pinError = pinErrorRu(e.message);
            render();
          }
        } }, t('pin.delete_btn'))
      )
    )
  );
}

function renderGeneralBlock() {
  const currentName = (state.user && state.user.family_name) || '';
  const input = h('input', { placeholder: t('general.family_name_placeholder'), value: currentName });
  const submit = async () => {
    if (!input.value.trim()) return;
    try {
      await api('/api/family-name', { method: 'POST', body: { name: input.value.trim() } });
      state.generalError = null;
      state.generalSuccess = t('general.saved');
      await refreshUser();
      render();
      setTimeout(() => { state.generalSuccess = null; render(); }, 2000);
    } catch (e) {
      state.generalError = e.message || t('general.save_error');
      state.generalSuccess = null;
      render();
    }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  // Two-step inline confirmation — avoids window.confirm() which freezes
  // Telegram's keyboard focus and breaks subsequent inputs.
  const confirming = !!state.clearDbConfirm;

  const dangerContent = confirming
    ? h('div', {},
        h('p', { style: 'color:#e53935;font-weight:600;margin-bottom:8px' }, t('general.confirm_title')),
        h('p', { class: 'muted', style: 'margin-bottom:12px;font-size:13px' }, t('general.confirm_desc')),
        state.generalError && h('div', { class: 'error', style: 'margin-bottom:8px' }, state.generalError),
        h('div', { style: 'display:flex;gap:8px' },
          h('button', { class: 'danger', style: 'flex:1', onclick: async () => {
            try {
              await api('/api/clear-database', { method: 'POST' });
            } catch (e) {
              state.generalError = e.message || t('general.save_error');
              state.clearDbConfirm = false;
              render();
              return;
            }
            window.location.reload();
          } }, t('general.confirm_yes')),
          h('button', { class: 'secondary', style: 'flex:1', onclick: () => {
            state.clearDbConfirm = false;
            render();
          } }, t('general.confirm_no'))
        )
      )
    : h('div', {},
        h('p', { class: 'muted', style: 'margin-bottom:10px' }, t('general.clear_db_hint')),
        h('button', { class: 'danger', onclick: () => {
          state.clearDbConfirm = true;
          render();
        } }, t('general.clear_db'))
      );

  return h('div', {},
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, t('general.family_name_title')),
      h('p', { class: 'muted', style: 'margin-bottom: 10px' }, t('general.family_name_hint')),
      h('div', { class: 'tg-field', style: 'margin-bottom: 8px' }, input),
      !confirming && state.generalError && h('div', { class: 'error', style: 'margin-bottom: 8px' }, state.generalError),
      state.generalSuccess && h('div', { style: 'color: #34c759; margin-bottom: 8px; font-size: 13px' }, state.generalSuccess),
      h('button', { onclick: submit }, t('general.save'))
    ),
    h('div', { class: 'card', style: 'margin-top: 12px' },
      h('div', { class: 'section-title' }, t('general.danger_title')),
      dangerContent
    )
  );
}

function renderSettings() {
  const tabs = [
    { id: 'general',    label: t('settings.tab_general') },
    { id: 'pin',        label: t('settings.tab_pin') },
    { id: 'invites',    label: t('settings.tab_invites') },
    { id: 'validators', label: t('settings.tab_validators') },
  ];
  const tab = state.settingsTab || 'general';

  const tabBar = h('div', { class: 'settings-tabs' },
    ...tabs.map(tb => h('button', {
      class: 'settings-tab' + (tab === tb.id ? ' active' : ''),
      onclick: async () => {
        state.settingsTab = tb.id;
        if (tb.id === 'validators') try { await loadValidators(); } catch (_) {}
        render();
      }
    }, tb.label))
  );

  let content;
  if (tab === 'general') {
    content = renderGeneralBlock();
  } else if (tab === 'pin') {
    content = renderPinBlock();
  } else if (tab === 'invites') {
    content = renderInvitesBlock();
  } else {
    content = h('div', {}, renderValidatorAddBlock(), renderValidatorsListBlock());
  }

  return h('div', {},
    h('div', { class: 'header' },
      h('button', { class: 'ghost', onclick: () => go('kids') }, t('settings.back')),
      h('h1', {}, t('settings.title'))
    ),
    tabBar,
    content
  );
}

function renderPending() {
  const items = state.pendingTasks || [];
  const grouped = new Map();
  for (const task of items) {
    if (!grouped.has(task.kid_id)) grouped.set(task.kid_id, []);
    grouped.get(task.kid_id).push(task);
  }

  return h('div', {},
    h('div', { class: 'header' },
      h('div', { style: 'flex: 1; min-width: 0' },
        h('h1', { style: 'margin: 0' }, t('pending.title')),
        renderFamilySwitcher()
      ),
      h('div', {},
        renderModeToggle(),
        h('button', { class: 'ghost', onclick: async () => { await api('/api/logout', { method: 'POST' }); suppressTgAutoLogin(); state.user = null; setMode('view'); await bootToLogin(); } }, t('pending.logout'))
      )
    ),
    items.length === 0
      ? h('div', { class: 'card' },
          h('div', { class: 'empty' }, t('pending.empty'))
        )
      : Array.from(grouped.values()).map(tasks => {
          const t0 = tasks[0];
          const kidStub = { name: t0.kid_name, photo: t0.kid_photo || null };
          return h('div', { class: 'card' },
            h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:8px' },
              renderAvatar(kidStub, 40),
              h('div', {},
                h('div', { style: 'font-weight:600' }, t0.kid_name),
                h('div', { class: 'muted', style: 'font-size:13px' }, t('kid.age_gender').replace('{age}', t0.kid_age).replace('{gender}', tGender(t0.kid_gender)))
              )
            ),
            ...tasks.map(task => h('div', { class: 'task pending' },
              h('div', { class: 'task-marker pending-mark' }, '⏳'),
              h('div', { class: 'title' },
                h('div', {}, task.title),
                h('div', { class: 'muted', style: 'font-size:12px' }, task.date)
              ),
              h('button', { onclick: async () => {
                await api(`/api/tasks/${task.id}/approve`, { method: 'POST' });
                await loadPendingTasks();
                render();
              } }, t('pending.approve')),
              h('button', { class: 'secondary', onclick: async () => {
                await api(`/api/tasks/${task.id}/reject`, { method: 'POST' });
                await loadPendingTasks();
                render();
              } }, t('pending.reject'))
            ))
          );
        })
  );
}

// ---- Render dispatcher ----
function render() {
  if (!state.route) return;  // still booting, nothing to show yet
  root.innerHTML = '';
  let view;
  switch (state.route) {
    case 'login': view = renderLogin(); break;
    case 'setup-family': view = renderSetupFamily(); break;
    case 'kids': view = renderKidsList(); break;
    case 'kid': view = renderKid(); break;
    case 'settings': view = renderSettings(); break;
    case 'pending': view = renderPending(); break;
    default: view = renderLogin();
  }
  root.append(view);
  const modal = renderModeAuthModal();
  if (modal) root.append(modal);
}

// ---- Setup family (mandatory on first login) ----
function renderSetupFamily() {
  const input = h('input', { placeholder: t('setup.placeholder'), style: 'width: 100%; box-sizing: border-box' });
  const submit = async () => {
    if (!input.value.trim()) return;
    try {
      await api('/api/family-name', { method: 'POST', body: { name: input.value.trim() } });
      state.setupFamilyError = null;
      await refreshUser();
      await routeForCurrentContext();
    } catch (e) {
      state.setupFamilyError = e.message || t('setup.error');
      render();
    }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  return h('div', { class: 'page' },
    h('div', { class: 'card', style: 'text-align: center; padding: 32px 24px' },
      h('div', { style: 'font-size: 40px; margin-bottom: 12px' }, '👨‍👩‍👧'),
      h('h2', { style: 'margin-bottom: 8px' }, t('setup.title')),
      h('p', { class: 'muted', style: 'margin-bottom: 20px' }, t('setup.hint')),
      h('div', { class: 'tg-field', style: 'margin-bottom: 12px' }, input),
      state.setupFamilyError && h('div', { class: 'error', style: 'margin-bottom: 8px' }, state.setupFamilyError),
      h('button', { style: 'width: 100%', onclick: submit }, t('setup.submit'))
    )
  );
}

// ---- Boot ----
async function bootToLogin() {
  go('login');
}

async function refreshUser() {
  const me = await api('/api/me');
  if (me.authenticated) {
    state.user = {
      username: me.username,
      role: me.role,                       // primary role (admin / legacy validator)
      tg_linked: !!me.tg_linked,
      has_pin: !!me.has_pin,
      family_name: me.family_name || null,
      context: me.context || null,        // { parent_id, parent_username, parent_family_name, role, is_self }
      can_switch_context: !!me.can_switch_context
    };
    // Load the list of available families so the header switcher has data.
    if (me.can_switch_context) {
      try { state.families = await api('/api/my-families'); }
      catch { state.families = []; }
      startFamilyNamePolling();
    } else {
      state.families = [];
      stopFamilyNamePolling();
    }
  }
  return me;
}

// Route based on the *current context's* role, not the user's primary role.
async function routeForCurrentContext() {
  const ctx = state.user && state.user.context;
  if (ctx && ctx.role === 'validator') {
    setMode('validator');
    await loadPendingTasks();
    go('pending');
  } else {
    setMode('view');
    await loadKids();
    go('kids');
  }
}

async function enterAfterLogin() {
  const me = await refreshUser();
  if (!me.authenticated) return bootToLogin();
  // Admins must set a family name before doing anything else.
  if (me.role === 'admin' && !me.family_name) { go('setup-family'); return; }
  // If we arrived via an invite link, redeem it now (idempotent) and switch
  // into the new family's validator context.
  const inviteToken = readInviteFromUrl();
  if (inviteToken) {
    try {
      const r = await api('/api/invites/redeem', { method: 'POST', body: { token: inviteToken } });
      await api('/api/switch-context', { method: 'POST', body: { parent_id: r.parent_id } });
      // Refresh user state so context info reflects the switch.
      await refreshUser();
    } catch (e) {
      // Show the error but continue routing so the user isn't stuck.
      state.error = t('invite.redeem_error') + (e.message || '');
    } finally {
      // Strip ?invite=... from the URL so a refresh doesn't re-trigger.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }
  await routeForCurrentContext();
}

async function switchFamilyContext(parentId) {
  await api('/api/switch-context', { method: 'POST', body: { parent_id: parentId } });
  await refreshUser();
  await routeForCurrentContext();
}

(async () => {
  try {
    // 1. Existing session?
    const me = await api('/api/me');
    if (me.authenticated) {
      await enterAfterLogin();
      return;
    }
    // 2. Try Telegram-based auto-login (only if running inside Telegram and
    //    this Telegram id is already bound to some user). Suppressed after an
    //    explicit logout so the user can sign in under a different account.
    if (tgInitData && !tgAutoLoginSuppressed()) {
      const r = await tryTelegramAuth();
      // 'login' — existing user signed in; 'registered' — fresh admin account
      // auto-created for this Telegram user. Both end with an authenticated
      // session and tg_linked=true.
      if (r && (r.action === 'login' || r.action === 'registered')) {
        await enterAfterLogin();
        return;
      }
    }
    // 3. Fall through to login form.
    await bootToLogin();
  } catch (e) {
    await bootToLogin();
  }
})();
