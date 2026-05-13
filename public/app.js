// Telegram WebApp init (safe if outside Telegram)
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const root = document.getElementById('app');
const state = {
  route: 'login',
  user: null,
  kids: [],
  currentKid: null,
  error: null,
  mode: localStorage.getItem('mode') || 'view', // 'view' | 'admin'
};

function setMode(m) {
  state.mode = m;
  localStorage.setItem('mode', m);
  render();
}
const isAdmin = () => state.mode === 'admin';

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
    else if (k === 'value') el.value = v;
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
  const username = h('input', { placeholder: 'Логин', value: 'admin' });
  const password = h('input', { type: 'password', placeholder: 'Пароль', value: 'admin' });
  return h('div', { class: 'card' },
    h('h1', {}, 'Happy Kids'),
    h('p', { class: 'muted' }, 'Войдите как администратор'),
    h('div', { style: 'margin-bottom: 8px' }, username),
    h('div', { style: 'margin-bottom: 8px' }, password),
    state.error && h('div', { class: 'error' }, state.error),
    h('button', {
      onclick: async () => {
        try {
          await api('/api/login', { method: 'POST', body: { username: username.value, password: password.value } });
          await loadKids();
          go('kids');
        } catch (e) { showError(e); }
      }
    }, 'Войти')
  );
}

async function loadKids() {
  state.kids = await api('/api/kids');
}

function renderModeToggle() {
  return h('button', {
    class: 'ghost',
    onclick: () => setMode(isAdmin() ? 'view' : 'admin'),
    title: 'Переключить режим'
  }, isAdmin() ? '🔓 Админ' : '👀 Просмотр');
}

function renderKidsList() {
  const nameInput = h('input', { placeholder: 'Имя' });
  const ageInput = h('input', { type: 'number', placeholder: 'Возраст', min: '1', max: '18' });
  const genderSel = h('select', {},
    h('option', { value: 'м' }, 'Мальчик'),
    h('option', { value: 'ж' }, 'Девочка')
  );

  return h('div', {},
    h('div', { class: 'header' },
      h('h1', {}, 'Дети'),
      h('div', {},
        renderModeToggle(),
        isAdmin() && h('button', { class: 'ghost', onclick: () => go('settings') }, 'Настройки'),
        isAdmin() && h('button', { class: 'ghost', onclick: async () => { await api('/api/logout', { method: 'POST' }); go('login'); } }, 'Выйти')
      )
    ),
    isAdmin() && h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Добавить ребёнка'),
      h('div', { class: 'row', style: 'margin-bottom: 8px' }, nameInput, ageInput, genderSel),
      state.error && h('div', { class: 'error' }, state.error),
      h('button', {
        onclick: async () => {
          try {
            if (!nameInput.value || !ageInput.value) throw new Error('Заполните имя и возраст');
            await api('/api/kids', { method: 'POST', body: { name: nameInput.value, age: ageInput.value, gender: genderSel.value } });
            await loadKids();
            render();
          } catch (e) { showError(e); }
        }
      }, 'Добавить')
    ),
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Список'),
      state.kids.length === 0
        ? h('div', { class: 'empty' }, isAdmin() ? 'Пока никого. Добавьте первого ребёнка выше.' : 'Список детей пуст. Переключитесь в режим «Админ», чтобы добавить.')
        : state.kids.map(k => {
            const total = k.today_total || 0;
            const done = k.today_done || 0;
            const pct = total ? Math.round(done * 100 / total) : 0;
            return h('div', {
              class: 'kid-row',
              onclick: () => openKid(k.id)
            },
              h('div', {},
                h('div', { style: 'font-weight: 600' }, `${k.name} (${k.age}, ${k.gender})`),
                h('div', { class: 'kid-meta' }, total ? `Сегодня: ${done}/${total} (${pct}%)` : 'На сегодня заданий нет')
              ),
              h('div', {}, '›')
            );
          })
    )
  );
}

async function openKid(id) {
  try {
    state.currentKid = await api(`/api/kids/${id}`);
    // Reset per-kid reward unlock state so admin must re-enter password every time
    state.rewardUnlocked = false;
    state.showUnlockForm = false;
    state.unlockError = '';
    go('kid');
  } catch (e) { showError(e); }
}

async function reloadKid() {
  state.currentKid = await api(`/api/kids/${state.currentKid.kid.id}`);
  render();
}

// Reward section: title is always hidden until admin enters password.
// Below 100% just shows a locked placeholder; at 100% an "Открыть награду"
// button reveals an inline login+password form; on success — the reward title
// becomes visible and can be handed over.
function renderRewardSection(kid, today, allDone, admin) {
  const reward = today.reward;
  const claimed = reward && reward.claimed;
  const unlocked = !!state.rewardUnlocked || claimed;

  // No reward set and not admin → nothing to show
  if (!reward && !admin) return null;

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
    // Tasks not all done → reward is hidden, even if it was already claimed.
    // Unchecking a task re-locks the reward visually.
    inner.push(
      h('div', { class: 'section-title' }, '🎁 Награда дня'),
      h('div', { class: 'reward locked' },
        h('div', { style: 'font-size: 40px' }, '🔒'),
        h('h3', {}, '???'),
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

    if (state.showUnlockForm) {
      const uInput = h('input', { placeholder: 'Логин', value: 'admin' });
      const pInput = h('input', { type: 'password', placeholder: 'Пароль' });
      inner.push(
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 32px' }, '🔐'),
          h('div', { style: 'font-weight: 600; margin-bottom: 8px' }, 'Войдите, чтобы увидеть награду'),
          h('div', { style: 'margin-bottom: 6px' }, uInput),
          h('div', { style: 'margin-bottom: 6px' }, pInput),
          state.unlockError && h('div', { class: 'error' }, state.unlockError),
          h('div', { class: 'row' },
            h('button', { class: 'secondary', onclick: () => {
              state.showUnlockForm = false;
              state.unlockError = '';
              render();
            } }, 'Отмена'),
            h('button', { onclick: async () => {
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
            } }, 'Открыть')
          )
        )
      );
    } else {
      inner.push(
        h('div', { class: 'reward' },
          h('div', { style: 'font-size: 40px' }, '🎁'),
          h('h3', {}, 'Все задания выполнены!'),
          h('div', { class: 'muted', style: 'margin-bottom: 10px' }, 'Награду открывает администратор'),
          h('button', { onclick: () => {
            state.showUnlockForm = true;
            state.unlockError = '';
            render();
          } }, 'Открыть награду')
        )
      );
    }
  } else {
    // 100% done and unlocked — reveal reward title + claim
    inner.push(
      h('div', { class: 'section-title' }, '🎁 Награда дня'),
      h('div', { class: 'reward' },
        h('div', { style: 'font-size: 40px' }, '🎁'),
        h('h3', {}, reward.title),
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
  const total = today.tasks.length;
  const done = today.tasks.filter(t => t.completed).length;
  const pct = total ? Math.round(done * 100 / total) : 0;
  const allDone = total > 0 && done === total;
  const admin = isAdmin();

  const taskInput = h('input', { placeholder: 'Новое задание на сегодня' });

  return h('div', {},
    h('div', { class: 'header' },
      h('button', { class: 'ghost', onclick: async () => { await loadKids(); go('kids'); } }, '‹ Назад'),
      h('h1', {}, kid.name),
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
      h('div', { class: 'section-title' }, `Сегодня — ${today.date}`),
      h('div', { class: 'progress-wrap' }, h('div', { class: 'progress-bar', style: `width: ${pct}%` })),
      h('div', { class: 'progress-label' }, `${done} / ${total} (${pct}%)`),

      total === 0 && h('div', { class: 'empty' }, admin ? 'Заданий на сегодня нет. Добавьте ниже.' : 'На сегодня заданий ещё нет.'),

      today.tasks.map(t => h('div', { class: 'task' + (t.completed ? ' done' : '') },
        h('input', {
          type: 'checkbox',
          checked: !!t.completed,
          onchange: async () => { await api(`/api/tasks/${t.id}/toggle`, { method: 'POST' }); reloadKid(); }
        }),
        h('div', { class: 'title' }, t.title),
        admin && h('button', { class: 'del', onclick: async () => {
          await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
          reloadKid();
        } }, '✕')
      )),

      admin && h('div', { class: 'row', style: 'margin-top: 10px' },
        taskInput,
        h('button', {
          onclick: async () => {
            if (!taskInput.value.trim()) return;
            await api(`/api/kids/${kid.id}/tasks`, { method: 'POST', body: { title: taskInput.value.trim() } });
            taskInput.value = '';
            reloadKid();
          }
        }, 'Добавить')
      )
    ),

    renderRewardSection(kid, today, allDone, admin),

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

// ---- Render dispatcher ----
function render() {
  root.innerHTML = '';
  let view;
  switch (state.route) {
    case 'login': view = renderLogin(); break;
    case 'kids': view = renderKidsList(); break;
    case 'kid': view = renderKid(); break;
    case 'settings': view = renderSettings(); break;
    default: view = renderLogin();
  }
  root.append(view);
}

// ---- Boot ----
(async () => {
  try {
    const me = await api('/api/me');
    if (me.authenticated) {
      await loadKids();
      go('kids');
    } else {
      go('login');
    }
  } catch (e) {
    go('login');
  }
})();
