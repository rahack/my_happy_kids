// Telegram WebApp init (safe if outside Telegram)
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const root = document.getElementById('app');
const state = {
  route: 'login',
  user: null,                // { username, role }
  kids: [],
  currentKid: null,
  selectedDate: null,        // 'YYYY-MM-DD' — date shown under the calendar strip
  selectedDay: null,         // { date, tasks, reward } for the selected date
  pendingTasks: [],          // tasks awaiting validator approval
  error: null,
  mode: localStorage.getItem('mode') || 'view', // 'view' | 'admin' | 'validator'
  modeAuthTarget: 'admin',   // which mode the auth modal is unlocking ('admin' | 'validator')
};

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

function dayTypeOf(dateStr, todayDateStr) {
  if (dateStr === todayDateStr) return 'today';
  return dateStr < todayDateStr ? 'past' : 'future';
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

function go(route, extra = {}) {
  state.route = route;
  state.error = null;
  Object.assign(state, extra);
  render();
}

function showError(err) {
  state.error = err.message || String(err);
  render();
}

// ---- Pages ----
function renderLogin() {
  // Two-step login flow:
  //   step 1 (state.loginRole == null) — role chooser: Родитель / Валидатор
  //   step 2 (state.loginRole == 'admin'|'validator') — credentials form
  // If there are no kids yet (fresh install), the chooser is skipped and we
  // jump straight to admin login.
  if (!state.loginRole) {
    return h('div', { class: 'card' },
      h('h1', {}, 'Happy Kids'),
      h('p', { class: 'muted' }, 'Как вы хотите войти?'),
      h('div', { class: 'row', style: 'margin-top: 12px' },
        h('button', { onclick: () => { state.loginRole = 'admin'; state.error = null; render(); } }, 'Родитель 🔓'),
        h('button', { class: 'secondary', onclick: () => { state.loginRole = 'validator'; state.error = null; render(); } }, 'Валидатор ✅')
      )
    );
  }

  const isValidatorLogin = state.loginRole === 'validator';
  const username = h('input', { placeholder: 'Логин', value: isValidatorLogin ? 'validator' : 'admin' });
  const password = h('input', { type: 'password', placeholder: 'Пароль', value: isValidatorLogin ? '' : 'admin' });
  const submit = async () => {
    try {
      const res = await api('/api/login', { method: 'POST', body: { username: username.value, password: password.value } });
      state.user = { username: res.username, role: res.role };
      state.loginRole = null;
      if (res.role === 'validator') {
        setMode('validator');
        await loadPendingTasks();
        go('pending');
      } else {
        await loadKids();
        go('kids');
      }
    } catch (e) { showError(e); }
  };
  username.onkeydown = password.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

  return h('div', { class: 'card' },
    h('h1', {}, 'Happy Kids'),
    h('p', { class: 'muted' }, isValidatorLogin ? 'Вход для валидатора' : 'Вход для родителя'),
    h('div', { style: 'margin-bottom: 8px' }, username),
    h('div', { style: 'margin-bottom: 8px' }, password),
    state.error && h('div', { class: 'error' }, state.error),
    h('div', { class: 'row' },
      // Hide "Назад" when the chooser was auto-skipped (no kids yet) —
      // there's nothing to go back to.
      !state.loginNoChoice && h('button', { class: 'secondary', onclick: () => {
        state.loginRole = null;
        state.error = null;
        render();
      } }, '‹ Назад'),
      h('button', { onclick: submit }, 'Войти')
    )
  );
}

async function loadKids() {
  state.kids = await api('/api/kids');
}

async function loadPendingTasks() {
  state.pendingTasks = await api('/api/pending-tasks');
}

function renderModeToggle() {
  // Validator session: cannot become admin (different account); show only
  // an exit button when in validator mode, and a "to validator" button in view.
  const validatorOnly = sessionIsValidator();

  if (isAdmin() || isValidator()) {
    return h('button', {
      class: 'ghost',
      onclick: async () => {
        setMode('view');
        // If we were on the validator page (admin session in validator mode),
        // bounce back to the kids list. Validator-only sessions have no kids
        // list to return to and must log out instead.
        if (state.route === 'pending') {
          if (sessionIsValidator()) {
            await api('/api/logout', { method: 'POST' });
            state.user = null;
            await bootToLogin();
          } else {
            await loadKids();
            go('kids');
          }
        }
      },
      title: 'Переключить режим'
    }, 'Просмотр 👀');
  }
  // View mode: offer Parent (if admin session) and/or Validator buttons.
  const buttons = [];
  if (!validatorOnly) {
    buttons.push(h('button', {
      class: 'ghost',
      onclick: () => {
        state.showModeAuth = true;
        state.modeAuthTarget = 'admin';
        state.modeAuthError = '';
        render();
      },
      title: 'Войти как родитель'
    }, 'Родитель 🔓'));
  }
  buttons.push(h('button', {
    class: 'ghost',
    onclick: () => {
      state.showModeAuth = true;
      state.modeAuthTarget = 'validator';
      state.modeAuthError = '';
      render();
    },
    title: 'Войти как валидатор'
  }, 'Валидатор ✅'));
  return h('span', {}, ...buttons);
}

// Modal overlay asking for admin OR validator credentials, depending on
// state.modeAuthTarget. After successful verification we switch UI mode.
function renderModeAuthModal() {
  if (!state.showModeAuth) return null;
  const target = state.modeAuthTarget || 'admin';
  const isValidatorTarget = target === 'validator';
  const defaultUser = isValidatorTarget ? 'validator' : 'admin';
  const uInput = h('input', { placeholder: 'Логин', value: defaultUser });
  const pInput = h('input', { type: 'password', placeholder: 'Пароль' });
  const submit = async () => {
    try {
      const endpoint = isValidatorTarget ? '/api/verify-validator' : '/api/verify-admin';
      await api(endpoint, {
        method: 'POST',
        body: { username: uInput.value, password: pInput.value }
      });
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
      state.modeAuthError = 'Неверный логин или пароль';
      render();
    }
  };
  uInput.onkeydown = pInput.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

  return h('div', { class: 'modal-overlay', onclick: (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      state.showModeAuth = false;
      render();
    }
  } },
    h('div', { class: 'modal tg-auth' },
      h('div', { class: 'tg-auth-icon' }, isValidatorTarget ? '✅' : '🔑'),
      h('h2', { class: 'tg-auth-title' }, isValidatorTarget ? 'Вход валидатора' : 'Вход'),
      h('p', { class: 'tg-auth-sub' },
        isValidatorTarget
          ? 'Введите логин и пароль валидатора, чтобы подтверждать выполнение заданий.'
          : 'Введите логин и пароль родителя, чтобы перейти в режим редактирования.'),
      h('div', { class: 'tg-field' }, uInput),
      h('div', { class: 'tg-field' }, pInput),
      state.modeAuthError && h('div', { class: 'error', style: 'text-align: center' }, state.modeAuthError),
      h('button', { class: 'tg-primary', onclick: submit }, 'Войти'),
      h('button', { class: 'tg-link', onclick: () => {
        state.showModeAuth = false;
        state.modeAuthError = '';
        render();
      } }, 'Отмена')
    )
  );
}

// Read an image File, downscale to max 256px square, return base64 data URL (JPEG)
function readPhotoAsDataURL(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
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

function renderKidsList() {
  const nameInput = h('input', { placeholder: 'Имя' });
  const ageInput = h('input', { type: 'number', placeholder: 'Возраст', min: '1', max: '18' });
  const genderSel = h('select', {},
    h('option', { value: 'м' }, 'Мальчик'),
    h('option', { value: 'ж' }, 'Девочка')
  );
  // Hold the chosen photo (data URL) on the form input itself so closures see fresh value
  const photoInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  let newPhoto = null;
  const photoPreview = h('div', { class: 'photo-preview' }, 'Без фото');
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
      h('h1', {}, 'Дети'),
      h('div', {},
        renderModeToggle(),
        isAdmin() && h('button', { class: 'ghost', onclick: () => go('settings') }, 'Настройки'),
        isAdmin() && h('button', { class: 'ghost', onclick: async () => { await api('/api/logout', { method: 'POST' }); state.user = null; setMode('view'); await bootToLogin(); } }, 'Выйти')
      )
    ),
    isAdmin() && (state.showAddKidForm
      ? h('div', { class: 'card' },
          h('div', { class: 'section-title' }, 'Добавить ребёнка'),
          h('div', { class: 'row', style: 'margin-bottom: 8px' }, nameInput, ageInput, genderSel),
          h('div', { class: 'row', style: 'margin-bottom: 8px; align-items: center' },
            photoPreview,
            h('button', { class: 'secondary', onclick: () => photoInput.click() }, 'Выбрать фото'),
            photoInput
          ),
          state.error && h('div', { class: 'error' }, state.error),
          h('div', { class: 'row' },
            h('button', { class: 'secondary', onclick: () => {
              state.showAddKidForm = false;
              state.error = null;
              render();
            } }, 'Отмена'),
            h('button', {
              onclick: async () => {
                try {
                  if (!nameInput.value || !ageInput.value) throw new Error('Заполните имя и возраст');
                  await api('/api/kids', { method: 'POST', body: { name: nameInput.value, age: ageInput.value, gender: genderSel.value, photo: newPhoto } });
                  state.showAddKidForm = false;
                  state.error = null;
                  await loadKids();
                  render();
                } catch (e) { showError(e); }
              }
            }, 'Добавить')
          )
        )
      : h('div', { class: 'card', style: 'text-align: center' },
          h('button', { onclick: () => { state.showAddKidForm = true; render(); } }, 'Добавить ребёнка')
        )
    ),
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Список'),
      state.kids.length === 0
        ? h('div', { class: 'empty' }, isAdmin() ? 'Пока никого. Добавьте первого ребёнка выше.' : 'Список детей пуст. Переключитесь в режим «Родитель», чтобы добавить.')
        : state.kids.map(k => renderKidRow(k))
    )
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
      h('option', { value: 'м' }, 'Мальчик'),
      h('option', { value: 'ж' }, 'Девочка')
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
        previewWrap.append(document.createTextNode('Без фото'));
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
          h('button', { class: 'secondary', onclick: () => photoInput.click() }, 'Сменить фото'),
          k.photo || pendingPhoto ? h('button', { class: 'icon-btn danger', title: 'Убрать фото', onclick: () => {
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
          } }, 'Отмена'),
          h('button', { onclick: async () => {
            try {
              if (!nameInput.value || !ageInput.value) throw new Error('Заполните имя и возраст');
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
          } }, 'Сохранить')
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
      h('div', { style: 'font-weight: 600' }, `${k.name} (${k.age}, ${k.gender})`),
      h('div', { class: 'kid-meta' }, total ? `Сегодня: ${done}/${total} (${pct}%)` : 'На сегодня заданий нет')
    ),
    admin && h('button', {
      class: 'icon-btn',
      title: 'Редактировать',
      onclick: (e) => {
        e.stopPropagation();
        state.editKidId = k.id;
        state.editKidError = '';
        render();
      }
    }, '✎'),
    admin && h('button', {
      class: 'icon-btn danger',
      title: 'Удалить',
      onclick: async (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить профиль ${k.name}? Все задания и награды будут удалены.`)) return;
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
    // Reset per-kid reward unlock state so admin must re-enter password every time
    state.rewardUnlocked = false;
    state.showUnlockForm = false;
    state.unlockError = '';
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
  render();
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
    const dow = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dt.getDay()];

    const markers = [];
    if (info && info.total > 0) markers.push(h('span', { class: 'cal-dot cal-dot-tasks' }));
    if (info && info.claimed) markers.push(h('span', { class: 'cal-dot cal-dot-reward' }));

    // Show short month label for the first day of month so transitions are visible
    const monthAbbr = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][m - 1];
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
  const monthGen = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dowFull = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  const [sy, sm, sd] = selected.split('-').map(Number);
  const selDt = new Date(sy, sm - 1, sd);
  const headerLabel = `${sd} ${monthGen[sm - 1]} ${sy} г., ${dowFull[selDt.getDay()]}`;
  const clockEl = h('span', { class: 'cal-clock' }, formatClock(new Date()));
  startClockTicker();

  const strip = h('div', { class: 'cal-strip' }, ...cells);
  // After mount, center the selected cell horizontally inside the strip
  queueMicrotask(() => {
    const sel = strip.querySelector('.cal-selected');
    if (sel && strip.scrollWidth > strip.clientWidth) {
      strip.scrollLeft = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
    }
  });

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
        h('div', { class: 'section-title' }, '🏆 Награда'),
        h('div', { class: 'reward claimed' },
          h('div', { style: 'font-size: 40px' }, '🏆'),
          h('h3', {}, reward.title),
          h('div', { class: 'muted' }, 'Награда получена')
        )
      );
    }
    return h('div', { class: 'card' },
      h('div', { class: 'section-title' }, '🎁 Награда'),
      h('div', { class: 'reward locked' },
        h('div', { style: 'font-size: 40px' }, '🔒'),
        h('h3', {}, reward.title),
        h('div', { class: 'muted' }, 'Не получена')
      )
    );
  }

  // --- Future day ---
  if (dayType === 'future') {
    // View mode: show locked placeholder if reward exists, otherwise nothing
    if (!admin) {
      if (!reward) return null;
      return h('div', { class: 'card' },
        h('div', { class: 'section-title' }, '🎁 Награда'),
        h('div', { class: 'reward locked' },
          h('div', { style: 'font-size: 48px' }, '🎁'),
          h('h3', {}, 'Сюрприз!'),
          h('div', { class: 'muted' }, 'Награда уже назначена — откроется в этот день')
        )
      );
    }
    const inner = [];
    if (!reward) {
      const newInput = h('input', { placeholder: 'Название награды' });
      inner.push(
        h('div', { class: 'section-title' }, '🎁 Награда на ' + day.date),
        h('div', { class: 'muted', style: 'margin-bottom: 8px' }, 'Награда ещё не назначена.'),
        h('div', { class: 'row' },
          newInput,
          h('button', { onclick: async () => {
            if (!newInput.value.trim()) return;
            await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { date: day.date, title: newInput.value.trim() } });
            reloadKid();
          } }, 'Назначить')
        )
      );
    } else {
      // Future reward — admin sees the title (planning view)
      inner.push(
        h('div', { class: 'section-title' }, '🎁 Награда на ' + day.date),
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 40px' }, '🎁'),
          h('h3', {}, reward.title),
          h('div', { class: 'muted' }, 'Откроется в день, когда задания будут выполнены')
        )
      );
      const editInput = h('input', { placeholder: 'Новое название награды' });
      inner.push(
        h('div', { class: 'section-title' }, 'Изменить награду'),
        h('div', { class: 'row' },
          editInput,
          h('button', { class: 'secondary', onclick: async () => {
            if (!editInput.value.trim()) return;
            await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { date: day.date, title: editInput.value.trim() } });
            editInput.value = '';
            reloadKid();
          } }, 'Сохранить')
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
      h('div', { class: 'section-title' }, '🎁 Награда дня'),
      h('div', { class: 'reward locked' },
        h('div', { style: 'font-size: 48px' }, '🎁'),
        h('h3', {}, '******'),
        h('div', { class: 'muted' }, 'Награда на сегодня пока не выбрана')
      )
    );
  }

  const inner = [];

  if (!reward) {
    // Admin mode without reward yet: show creation input only
    const newInput = h('input', { placeholder: 'Название награды' });
    inner.push(
      h('div', { class: 'section-title' }, '🎁 Награда дня'),
      h('div', { class: 'muted', style: 'margin-bottom: 8px' }, 'Награда на сегодня ещё не назначена.'),
      h('div', { class: 'row' },
        newInput,
        h('button', { onclick: async () => {
          if (!newInput.value.trim()) return;
          await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { title: newInput.value.trim() } });
          reloadKid();
        } }, 'Назначить')
      )
    );
  } else if (!allDone) {
    // Tasks not all done → reward is hidden from kid; admin always sees the title.
    inner.push(
      h('div', { class: 'section-title' }, '🎁 Награда дня'),
      admin
        ? h('div', { class: 'reward' },
            h('div', { style: 'font-size: 40px' }, '🎁'),
            h('h3', {}, reward.title),
            h('div', { class: 'muted' }, 'Откроется, когда все задания будут выполнены')
          )
        : h('div', { class: 'reward locked' },
            h('div', { style: 'font-size: 48px' }, '🎁'),
            h('h3', {}, 'Сюрприз!'),
            h('div', { class: 'muted' }, 'Награда откроется, когда все задания будут выполнены')
          )
    );
  } else if (claimed) {
    inner.push(
      h('div', { class: 'section-title' }, '🏆 Награда дня'),
      h('div', { class: 'reward claimed' },
        h('div', { style: 'font-size: 40px' }, '🏆'),
        h('h3', {}, reward.title),
        h('div', { class: 'muted' }, 'Награда получена!')
      )
    );
  } else if (!unlocked) {
    // 100% done but not unlocked yet — show reveal button (or login form if requested)
    inner.push(h('div', { class: 'section-title' }, '🎁 Награда дня'));

    if (admin) {
      // Admin already authorized — title is always visible. No claim button:
      // the actual handover happens in view mode (kid sees the surprise).
      inner.push(
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 40px' }, '🎁'),
          h('h3', {}, reward.title),
          h('div', { class: 'muted' }, 'Все задания выполнены — можно вручать!')
        )
      );
    } else if (state.showUnlockForm) {
      const uInput = h('input', { placeholder: 'Логин', value: 'admin' });
      const pInput = h('input', { type: 'password', placeholder: 'Пароль' });
      const submitUnlock = async () => {
        try {
          await api('/api/verify-admin', {
            method: 'POST',
            body: { username: uInput.value, password: pInput.value }
          });
          state.rewardUnlocked = true;
          state.showUnlockForm = false;
          state.unlockError = '';
          render();
        } catch (e) {
          state.unlockError = 'Неверный логин или пароль';
          render();
        }
      };
      uInput.onkeydown = pInput.onkeydown = (e) => { if (e.key === 'Enter') submitUnlock(); };
      inner.push(
        h('div', { class: 'reward unlock-form' },
          h('div', { style: 'font-size: 32px' }, '🔐'),
          h('div', { style: 'font-weight: 600; margin-bottom: 12px' }, 'Войдите, чтобы увидеть награду'),
          h('div', { class: 'tg-field' }, uInput),
          h('div', { class: 'tg-field' }, pInput),
          state.unlockError && h('div', { class: 'error', style: 'text-align: center' }, state.unlockError),
          h('div', { class: 'row' },
            h('button', { class: 'secondary', onclick: () => {
              state.showUnlockForm = false;
              state.unlockError = '';
              render();
            } }, 'Отмена'),
            h('button', { onclick: submitUnlock }, 'Открыть')
          )
        )
      );
    } else {
      inner.push(
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 40px' }, '🎁'),
          h('h3', {}, 'Все задания выполнены!'),
          h('div', { class: 'muted', style: 'margin-bottom: 10px' }, 'Награду открывает родитель'),
          h('button', { onclick: () => {
            state.showUnlockForm = true;
            state.unlockError = '';
            render();
          } }, 'Открыть награду')
        )
      );
    }
  } else {
    // 100% done and unlocked (password accepted) — show claim button.
    // In view mode the title stays hidden as a surprise; admin always sees it.
    inner.push(
      h('div', { class: 'section-title' }, '🎁 Награда дня'),
      h('div', { class: 'reward' },
        h('div', { style: 'font-size: 48px' }, '🎁'),
        h('h3', {}, admin ? reward.title : 'Сюрприз готов!'),
        h('div', { class: 'muted', style: 'margin-bottom: 10px' }, 'Все задания выполнены — можно вручать!'),
        h('button', { onclick: async () => {
          await api(`/api/rewards/${reward.id}/claim`, { method: 'POST' });
          state.rewardUnlocked = false; // reset, since claimed status now persists
          reloadKid();
        } }, 'Вручить награду')
      )
    );
  }

  // Admin extra: edit reward title (only when reward exists). Input has no
  // prefilled value to avoid leaking the title to anyone glancing at the screen.
  if (admin && reward) {
    const editInput = h('input', { placeholder: 'Новое название награды' });
    inner.push(
      h('div', { class: 'section-title' }, 'Изменить награду'),
      h('div', { class: 'row' },
        editInput,
        h('button', { class: 'secondary', onclick: async () => {
          if (!editInput.value.trim()) return;
          await api(`/api/kids/${kid.id}/reward`, { method: 'POST', body: { title: editInput.value.trim() } });
          editInput.value = '';
          reloadKid();
        } }, 'Сохранить')
      )
    );
  }

  return h('div', { class: 'card' }, ...inner);
}

function renderKid() {
  const data = state.currentKid;
  const { kid, today, history, stats } = data;
  const day = state.selectedDay;
  const dayType = dayTypeOf(day.date, today.date);
  const total = day.tasks.length;
  const done = day.tasks.filter(t => t.completed).length;
  const pct = total ? Math.round(done * 100 / total) : 0;
  const allDone = total > 0 && done === total;
  const admin = isAdmin();
  // Admin adds/deletes tasks (today + future). Anyone can toggle checkboxes
  // on today (kid marks off what they did; admin verifies in person).
  const canEditTasks = admin && (dayType === 'today' || dayType === 'future');
  const canToggleTasks = dayType === 'today';

  const taskInput = h('input', { placeholder: dayType === 'today' ? 'Новое задание на сегодня' : `Новое задание на ${day.date}` });

  const emptyMsg =
    dayType === 'today' ? (admin ? 'Заданий на сегодня нет. Добавьте ниже.' : 'На сегодня заданий ещё нет.')
    : dayType === 'past' ? 'В этот день заданий не было.'
    : (admin ? 'Заданий ещё нет. Добавьте ниже.' : 'Этот день ещё не наступил.');

  return h('div', {},
    h('div', { class: 'header' },
      h('button', { class: 'ghost', onclick: async () => { await loadKids(); go('kids'); } }, '‹ Назад'),
      h('div', { style: 'display:flex;align-items:center;gap:10px;flex:1;min-width:0' },
        renderAvatar(kid, 36),
        h('h1', { style: 'margin:0;font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, kid.name)
      ),
      h('div', {},
        renderModeToggle(),
        admin && h('button', { class: 'ghost danger', onclick: async () => {
          if (!confirm(`Удалить профиль ${kid.name}?`)) return;
          await api(`/api/kids/${kid.id}`, { method: 'DELETE' });
          await loadKids();
          go('kids');
        } }, 'Удалить')
      )
    ),

    h('div', { class: 'card' },
      h('div', { class: 'muted' }, `${kid.age} лет, ${kid.gender}`),
      h('div', { class: 'progress-wrap' }, h('div', { class: 'progress-bar', style: `width: ${pct}%` })),
      h('div', { class: 'progress-label' }, `${done} / ${total} (${pct}%)`),

      renderCalendarStrip(kid, today.date),

      total === 0 && h('div', { class: 'empty' }, emptyMsg),

      day.tasks.map(t => {
        // Today: real checkbox. Past: show ✓ / ✕ marker (frozen). Future: lock icon.
        let marker;
        if (canToggleTasks) {
          marker = h('input', {
            type: 'checkbox',
            // Show checked while pending OR approved — kid sees their tick stays
            checked: !!t.completed || !!t.pending,
            onchange: async () => { await api(`/api/tasks/${t.id}/toggle`, { method: 'POST' }); reloadKid(); }
          });
        } else if (dayType === 'future') {
          marker = h('div', { class: 'task-marker future' }, '🔒');
        } else {
          // past, or today in view mode — show current state without checkbox
          marker = h('div', { class: 'task-marker past ' + (t.completed ? 'done' : 'missed') }, t.completed ? '✓' : '○');
        }
        return h('div', { class: 'task' + (t.completed ? ' done' : '') + (t.pending ? ' pending' : '') + (!canToggleTasks ? ' readonly' : '') },
          marker,
          h('div', { class: 'title' }, t.title),
          t.pending && h('span', { class: 'task-pending-badge', title: 'Ждёт подтверждения валидатора' }, 'На проверке'),
          canEditTasks && admin && h('button', { class: 'del', onclick: async () => {
            await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
            reloadKid();
          } }, '✕')
        );
      }),

      canEditTasks && admin && h('div', { class: 'row', style: 'margin-top: 10px' },
        taskInput,
        h('button', {
          onclick: async () => {
            if (!taskInput.value.trim()) return;
            await api(`/api/kids/${kid.id}/tasks`, { method: 'POST', body: { date: day.date, title: taskInput.value.trim() } });
            taskInput.value = '';
            reloadKid();
          }
        }, 'Добавить')
      )
    ),

    renderRewardSection(kid, day, allDone, admin, dayType),

    admin && h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Статистика'),
      h('div', {}, `Дней с заданиями: ${stats.days_with_tasks || 0}`),
      h('div', {}, `Всего заданий: ${stats.total_tasks || 0}, выполнено: ${stats.completed_tasks || 0}`),
      h('div', {}, `Наград получено: ${stats.rewards_claimed || 0}`)
    ),

    admin && h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'История'),
      history.length === 0
        ? h('div', { class: 'empty' }, 'Пока пусто')
        : history.map(d => h('div', { class: 'history-day' },
            h('div', { class: 'date' }, d.date),
            h('div', { class: 'summary' },
              `${d.done || 0}/${d.total} заданий` +
              (d.reward ? ` · награда: ${d.reward.title}${d.reward.claimed ? ' ✓' : ''}` : '')
            )
          ))
    )
  );
}

function renderSettings() {
  const oldP = h('input', { type: 'password', placeholder: 'Старый пароль' });
  const newP = h('input', { type: 'password', placeholder: 'Новый пароль' });
  return h('div', {},
    h('div', { class: 'header' },
      h('button', { class: 'ghost', onclick: () => go('kids') }, '‹ Назад'),
      h('h1', {}, 'Настройки')
    ),
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Сменить пароль'),
      h('div', { style: 'margin-bottom: 8px' }, oldP),
      h('div', { style: 'margin-bottom: 8px' }, newP),
      state.error && h('div', { class: 'error' }, state.error),
      h('button', {
        onclick: async () => {
          try {
            await api('/api/change-password', { method: 'POST', body: { oldPassword: oldP.value, newPassword: newP.value } });
            alert('Пароль изменён');
            oldP.value = ''; newP.value = '';
          } catch (e) { showError(e); }
        }
      }, 'Сохранить')
    )
  );
}

function renderPending() {
  const items = state.pendingTasks || [];
  const grouped = new Map();
  for (const t of items) {
    const key = `${t.kid_id}|${t.kid_name}|${t.kid_photo || ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  }

  return h('div', {},
    h('div', { class: 'header' },
      h('h1', {}, 'На проверке'),
      h('div', {},
        renderModeToggle(),
        h('button', { class: 'ghost', onclick: async () => { await api('/api/logout', { method: 'POST' }); state.user = null; setMode('view'); await bootToLogin(); } }, 'Выйти')
      )
    ),
    items.length === 0
      ? h('div', { class: 'card' },
          h('div', { class: 'empty' }, 'Нет заданий, ждущих подтверждения. Можно отдохнуть! ✨')
        )
      : Array.from(grouped.entries()).map(([key, tasks]) => {
          const [, name, photo] = key.split('|');
          const kidStub = { name, photo: photo || null };
          return h('div', { class: 'card' },
            h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:8px' },
              renderAvatar(kidStub, 36),
              h('div', { style: 'font-weight:600' }, name)
            ),
            ...tasks.map(t => h('div', { class: 'task pending' },
              h('div', { class: 'task-marker pending-mark' }, '⏳'),
              h('div', { class: 'title' },
                h('div', {}, t.title),
                h('div', { class: 'muted', style: 'font-size:12px' }, t.date)
              ),
              h('button', { onclick: async () => {
                await api(`/api/tasks/${t.id}/approve`, { method: 'POST' });
                await loadPendingTasks();
                render();
              } }, 'Подтвердить'),
              h('button', { class: 'secondary', onclick: async () => {
                await api(`/api/tasks/${t.id}/reject`, { method: 'POST' });
                await loadPendingTasks();
                render();
              } }, 'Отклонить')
            ))
          );
        })
  );
}

// ---- Render dispatcher ----
function render() {
  root.innerHTML = '';
  let view;
  switch (state.route) {
    case 'login': view = renderLogin(); break;
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

// ---- Boot ----
async function bootToLogin() {
  try {
    const probe = await api('/api/has-kids');
    if (!probe.has_kids) {
      // Fresh install — go straight to admin login, hide the "back" button.
      state.loginRole = 'admin';
      state.loginNoChoice = true;
    } else {
      state.loginRole = null;
      state.loginNoChoice = false;
    }
  } catch (e) {
    state.loginRole = null;
    state.loginNoChoice = false;
  }
  go('login');
}

(async () => {
  try {
    const me = await api('/api/me');
    if (me.authenticated) {
      state.user = { username: me.username, role: me.role };
      if (me.role === 'validator') {
        setMode('validator');
        await loadPendingTasks();
        go('pending');
      } else {
        await loadKids();
        go('kids');
      }
    } else {
      await bootToLogin();
    }
  } catch (e) {
    await bootToLogin();
  }
})();
