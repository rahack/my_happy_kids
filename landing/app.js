/* ============================================================
   MY HAPPY KIDS — LANDING APP.JS
   i18n, routing, dynamic rendering
   ============================================================ */

// ---- State ----
let currentLang = 'en';
let currentPage = 'home';
let currentDocsSection = 'getting-started';

// ============================================================
// TRANSLATIONS
// ============================================================
const T = {
  en: {
    nav: { home: 'Home', pricing: 'Pricing', docs: 'Docs' },
    hero: {
      badge: '✨ Telegram Mini App',
      title: 'Turn daily habits into<br>joyful rewards',
      subtitle: 'Motivate your children with structured daily tasks, approval by trusted adults, and exciting surprise rewards — all inside Telegram.',
      cta: '⚡ Open in Telegram',
      ctaSecondary: 'Read the Docs',
    },
    mockup: {
      kidName: 'Max', today: 'Today',
      task1: 'Brushed teeth', task2: 'Did homework',
      task3: 'Cleaned room',  task4: 'Read 20 min',
      pending: 'Pending',     reward: 'Surprise!',
    },
    howItWorks: {
      title: 'How it works',
      steps: [
        {
          icon: '👨‍👧', num: '1',
          title: 'Parent creates the day',
          desc: 'Add tasks for your child and set a secret reward. Only you see the reward name — it\'s a surprise until the very end.',
        },
        {
          icon: '✅', num: '2',
          title: 'Child completes tasks',
          desc: 'The child marks tasks as done. Each one enters "Pending" status and waits for a trusted adult to confirm.',
        },
        {
          icon: '🎁', num: '3',
          title: 'Reward is revealed!',
          desc: 'All tasks approved → progress 100% → parent unlocks the surprise. A magical moment for the whole family!',
        },
      ],
    },
    features: {
      title: 'Everything you need',
      items: [
        { icon: '📋', title: 'Daily Tasks',         desc: 'Create tasks for each child with reusable templates to save time every day.' },
        { icon: '🎁', title: 'Surprise Rewards',    desc: 'Set a secret reward revealed only when every task is approved and complete.' },
        { icon: '✅', title: 'Task Validation',     desc: 'Every task requires adult approval — making achievements more meaningful and fair.' },
        { icon: '👨‍👩‍👧‍👦', title: 'Multiple Children',  desc: 'Manage all your children from one account, each with their own tasks and rewards.' },
        { icon: '📅', title: 'Calendar History',    desc: 'Browse any past day to review what was done and what reward was earned.' },
        { icon: '🤝', title: 'Family Sharing',      desc: 'Invite grandparents or co-parents to validate tasks via a Telegram invite link.' },
        { icon: '🔒', title: 'PIN Protection',      desc: 'Switch to parent mode with a private PIN — admin settings stay hidden from kids.' },
        { icon: '🌍', title: 'RU / EN Languages',   desc: 'Full Russian and English support, auto-detected from your Telegram account language.' },
      ],
    },
    roles: {
      title: 'Three roles, one happy family',
      items: [
        {
          icon: '👨‍💻', title: 'Parent (Admin)',
          desc: 'Creates tasks and secret rewards, manages children profiles, sets PIN, invites validators. Full control over the family.',
        },
        {
          icon: '🧑‍🏫', title: 'Validator',
          desc: 'Approves or rejects pending tasks. Can be a grandparent, co-parent, or trusted adult. Joins via a Telegram invite link.',
        },
        {
          icon: '🧒', title: 'Child (View mode)',
          desc: 'Marks tasks as done, watches the progress bar fill up, and unlocks the surprise reward when everything is complete.',
        },
      ],
    },
    pricing: {
      title: 'Pricing',
      coming: '🚀 Coming Soon',
      comingDesc: 'My Happy Kids is currently free to use during the beta phase. Pricing plans will be announced when we launch.',
    },
    docs: {
      title: 'Documentation',
      sections: [
        { id: 'getting-started', label: 'Getting Started' },
        { id: 'roles',           label: 'Roles & Access' },
        { id: 'tasks',           label: 'Daily Tasks' },
        { id: 'rewards',         label: 'Rewards' },
        { id: 'calendar',        label: 'Calendar' },
        { id: 'sharing',         label: 'Family Sharing' },
        { id: 'settings',        label: 'Settings' },
      ],
      content: {
        'getting-started': `
<h1>Getting Started</h1>
<p class="docs-lead">My Happy Kids is a Telegram Mini App for building daily habits in children through tasks, validation, and rewards. No installation required — everything happens inside Telegram.</p>

<h2>What you need</h2>
<ul>
  <li>A <strong>Telegram account</strong></li>
  <li>Access to the <strong>My Happy Kids bot</strong> (ask the server owner for the bot link)</li>
</ul>

<h2>First launch</h2>
<ol>
  <li>Open the bot in Telegram and press <strong>Start</strong>.</li>
  <li>Tap the <strong>Menu button</strong> (bottom-left of the chat input field).</li>
  <li>The Mini App opens and <strong>automatically registers you as a Parent (Admin)</strong> using your Telegram identity — no username or password to remember.</li>
</ol>
<div class="docs-tip">💡 Your account is tied to your Telegram ID. As long as you use the same Telegram account, you will always log in automatically.</div>

<h2>Setting up your family</h2>
<ol>
  <li>On first launch you are asked to enter a <strong>family name</strong> (e.g. "The Smiths"). It is displayed to people you invite.</li>
  <li>Tap <strong>Add child</strong> and fill in name, age, and gender. Optionally add a photo.</li>
  <li>You are ready! The child's page opens where you can start adding tasks.</li>
</ol>

<h2>UI modes</h2>
<p>The app has three modes switched by buttons in the top-right corner of the header:</p>
<ul>
  <li><span class="docs-badge child">View</span> — Default. The child uses the app here: marks tasks, sees progress, unlocks rewards.</li>
  <li><span class="docs-badge admin">Admin</span> — Parent mode, protected by PIN. Add/edit tasks, set rewards, access settings.</li>
  <li><span class="docs-badge validator">Validator</span> — Protected by validator password. Approve or reject pending tasks.</li>
</ul>`,

        'roles': `
<h1>Roles &amp; Access</h1>
<p class="docs-lead">Three roles work together to create a fair, motivating system for your family.</p>

<h2>Parent (Admin)</h2>
<span class="docs-badge admin">Admin</span>
<p>The parent creates the entire family setup. There is one Admin per family — the Telegram user who first opened the app.</p>
<p><strong>Admin can:</strong></p>
<ul>
  <li>Add, edit, and delete children</li>
  <li>Create daily tasks and set rewards</li>
  <li>Use task and reward templates</li>
  <li>Manage validators (invite or create local accounts)</li>
  <li>Access all settings (PIN, family name, language)</li>
  <li>View the full calendar history</li>
</ul>
<p>Switching to Admin mode requires entering a <strong>PIN code</strong> (if set). Without a PIN the switch is instant.</p>

<h2>Validator</h2>
<span class="docs-badge validator">Validator</span>
<p>Validators approve or reject tasks that children have marked as done. There can be multiple validators per family.</p>
<p>Two types of validators exist:</p>
<ul>
  <li><strong>Telegram member</strong> — another Telegram user who accepted your invite link. They log in via their own Telegram account.</li>
  <li><strong>Local validator</strong> — a username/password account created by the admin. Useful for devices without Telegram.</li>
</ul>
<p>Validators see a list of all <strong>pending tasks</strong> across all children and can approve or reject each one.</p>

<h2>Child (View mode)</h2>
<span class="docs-badge child">View</span>
<p>Children do not have their own accounts — they use the app in view mode. The Mini App defaults to view mode when opened.</p>
<p>In view mode, children can:</p>
<ul>
  <li>See their task list and mark tasks as done</li>
  <li>Watch the progress bar fill up</li>
  <li>Unlock the surprise reward when all tasks are approved</li>
  <li>Browse the calendar to see past days</li>
</ul>
<div class="docs-tip">💡 Open the Mini App on the child's device and leave it in View mode — they won't see the Admin or Validator buttons.</div>`,

        'tasks': `
<h1>Daily Tasks</h1>
<p class="docs-lead">Tasks are the core of My Happy Kids. Every task a child marks as done goes through a simple approval flow before counting toward progress.</p>

<h2>Creating tasks</h2>
<p>Switch to <span class="docs-badge admin">Admin mode</span> and open a child's page. Tap the <strong>+</strong> button or the task input field to add a task for today.</p>
<p>You can type a task name freely or pick from your <strong>templates</strong> — a dropdown appears with saved names as you type.</p>

<h2>Task templates</h2>
<p>Templates are reusable task titles that save time. Manage them in <strong>Settings → Kids → Tasks tab</strong>.</p>
<ul>
  <li>Add a template once, use it every day</li>
  <li>Templates are shared across all children</li>
  <li>Inline editing: tap ✏️ to rename, 🗑️ to delete</li>
</ul>

<h2>Task lifecycle</h2>
<p>Every task passes through these states:</p>
<ol>
  <li><strong>Open</strong> — waiting to be done by the child.</li>
  <li><strong>Pending</strong> — child tapped the checkbox; waiting for validator approval. Shows "Pending" badge in UI.</li>
  <li><strong>Approved</strong> — validator confirmed; counts toward the progress bar.</li>
</ol>
<div class="docs-warn">⚠️ Even if you are a parent/admin, clicking a task checkbox still puts it in Pending — all tasks must be validated. This keeps the system honest.</div>
<p>From Pending a validator can:</p>
<ul>
  <li><strong>Approve</strong> → task is marked done, progress increases</li>
  <li><strong>Reject</strong> → task goes back to Open</li>
</ul>
<p>An approved task can be unchecked by clicking it again — it returns to Open (e.g. if the child did not actually finish).</p>

<h2>Deleting tasks</h2>
<p>In Admin mode, tap the 🗑️ icon next to any task. Deletion is permanent and removes the task from the day's progress.</p>`,

        'rewards': `
<h1>Rewards</h1>
<p class="docs-lead">Rewards are the exciting finale of each day. A secret reward is revealed only when all tasks are approved and the parent unlocks the surprise.</p>

<h2>Setting a reward</h2>
<p>In <span class="docs-badge admin">Admin mode</span>, open a child's page. At the bottom of the task list is the <strong>Reward section</strong>.</p>
<ul>
  <li>For <strong>today</strong>: type a reward name (or pick from templates) and save.</li>
  <li>For <strong>future days</strong>: navigate to that date in the calendar, then set a reward.</li>
  <li>The reward name is hidden from the child in View mode — they only see "🎁 Surprise!" until they earn it.</li>
</ul>

<h2>Reward templates</h2>
<p>Just like task templates, save reusable reward ideas in <strong>Settings → Kids → Rewards tab</strong>. The combo-box will suggest them as you type.</p>

<h2>The reveal flow</h2>
<p>When all tasks for a day are approved:</p>
<ol>
  <li>The progress bar reaches 100%.</li>
  <li>An <strong>"Open reward"</strong> button appears in View mode.</li>
  <li>Tapping it prompts for the <strong>admin password</strong> — ensuring the parent is present for the reveal.</li>
  <li>After the correct password the reward name is shown with a 🎁 animation.</li>
  <li>A <strong>"Give reward"</strong> button appears. Tap it to officially mark the reward as claimed.</li>
</ol>
<div class="docs-tip">💡 Involve the child! Hand them the device, let them tap "Open reward" while you type the password — makes it feel magical.</div>

<h2>Claimed rewards</h2>
<p>Once claimed the reward shows as <strong>🏆 [reward name]</strong> — visible to everyone. Past days in the calendar always show claimed rewards.</p>
<p>If you rename a reward after setting it, the claimed status resets — treat it as a new reward.</p>`,

        'calendar': `
<h1>Calendar</h1>
<p class="docs-lead">Browse any day — past, present, or future — for each child. The calendar helps you plan ahead and review history.</p>

<h2>Navigating the calendar</h2>
<p>On a child's page the <strong>calendar strip</strong> shows a horizontal row of 14 days centered on the selected date. Tap any day to view its tasks and reward.</p>
<p>Dots under dates indicate activity: a dot means there were tasks or a reward set on that day.</p>
<p>The current date is highlighted; the selected date shows a circle indicator.</p>

<h2>Day types</h2>
<table class="role-table">
  <thead><tr><th>Day</th><th>Tasks</th><th>Adding tasks</th><th>Reward</th></tr></thead>
  <tbody>
    <tr>
      <td><strong>Past</strong></td>
      <td>Frozen (read-only)</td>
      <td>Not allowed</td>
      <td>Claimed → 🏆; otherwise 🎁 "Not received"</td>
    </tr>
    <tr>
      <td><strong>Today</strong></td>
      <td>Interactive (child can check)</td>
      <td>Admin only</td>
      <td>Full flow with unlock button</td>
    </tr>
    <tr>
      <td><strong>Future</strong></td>
      <td>Locked 🔒 (visible, not checkable)</td>
      <td>Admin can pre-add</td>
      <td>🎁 "Surprise!" (name hidden in View mode)</td>
    </tr>
  </tbody>
</table>

<h2>Clock &amp; date header</h2>
<p>Above the calendar, the header shows the full selected date (e.g. "May 14, 2025, Wednesday") and a live clock <strong>HH:MM:SS</strong> ticking every second. This makes it easy to confirm you are looking at today's tasks.</p>`,

        'sharing': `
<h1>Family Sharing</h1>
<p class="docs-lead">Invite co-parents, grandparents, or any trusted adult to validate tasks — directly via Telegram.</p>

<h2>Creating an invite link</h2>
<ol>
  <li>In <span class="docs-badge admin">Admin mode</span>, go to <strong>Settings → Invites</strong>.</li>
  <li>Tap <strong>Create invite link</strong>.</li>
  <li>A <code>t.me/YourBot?start=inv_…</code> link is generated.</li>
  <li>Share this link with the person you want to invite (via Telegram, WhatsApp, etc.).</li>
</ol>
<div class="docs-tip">💡 Invite links are permanent and multi-use — share the same link with multiple people, or delete it and create a new one for security.</div>

<h2>Accepting an invite</h2>
<ol>
  <li>The invited person opens the link in Telegram — the bot opens with the invite parameter.</li>
  <li>They tap <strong>"Accept invite"</strong> in the bot message.</li>
  <li>The Mini App opens and they are added as a Validator in your family.</li>
  <li>They can now see your family in their <strong>family switcher</strong> and approve tasks.</li>
</ol>

<h2>Managing members</h2>
<p>In <strong>Settings → Validators</strong>, you see all members:</p>
<ul>
  <li><strong>Telegram members</strong> — joined via invite; shown with their Telegram username.</li>
  <li><strong>Local validators</strong> — created with login/password (no Telegram required).</li>
</ul>
<p>Tap <strong>Remove</strong> next to any member to revoke access. Their account is not deleted, just removed from your family.</p>

<h2>Multiple families</h2>
<p>If you have been invited to other families, a <strong>family selector</strong> dropdown appears at the top of the children list. Switch between families to see different sets of tasks.</p>
<p>When working in another family's context you have Validator permissions there, even if you are an Admin in your own family.</p>`,

        'settings': `
<h1>Settings</h1>
<p class="docs-lead">All settings are accessible in <span class="docs-badge admin">Admin mode</span> via the Settings icon in the navigation.</p>

<h2>General tab</h2>
<ul>
  <li><strong>Family name</strong> — display name shown to validators you invite. Tap to edit inline.</li>
  <li><strong>Language</strong> — switch between Русский and English. Saved per device in localStorage.</li>
  <li><strong>Clear database</strong> — deletes all family data (children, tasks, rewards, templates, validators, invites). Requires a two-step confirmation. There is no undo.</li>
</ul>

<h2>PIN tab</h2>
<p>The PIN protects the <strong>View → Admin</strong> mode switch.</p>
<ul>
  <li>Set a PIN of at least 4 digits.</li>
  <li>Until a PIN is set, switching to Admin mode is instant (no prompt) — convenient for first-time setup.</li>
  <li>Change PIN: provide the old PIN plus the new PIN.</li>
  <li>Delete PIN: provide the current PIN and confirm removal.</li>
</ul>
<div class="docs-warn">⚠️ If you forget your PIN you will need to clear the database or access the server directly.</div>

<h2>Invites tab</h2>
<p>Manage permanent invite links for joining your family as a Validator. See <a href="#" class="docs-link" data-docs-section="sharing">Family Sharing</a> for details.</p>

<h2>Validators tab</h2>
<p>View all validators (both Telegram members and local accounts). You can:</p>
<ul>
  <li>Create local validator accounts (username + password)</li>
  <li>Change passwords for local validators</li>
  <li>Remove validators from the family</li>
</ul>`,
      },
    },
    footer: { copy: '© 2025 My Happy Kids. Built with ❤️ for families.' },
  },

  // ======================== RUSSIAN ========================
  ru: {
    nav: { home: 'Главная', pricing: 'Тарифы', docs: 'Документация' },
    hero: {
      badge: '✨ Telegram Mini App',
      title: 'Превратите ежедневные<br>привычки в радостные награды',
      subtitle: 'Мотивируйте детей структурированными заданиями, проверкой взрослыми и захватывающими сюрпризными наградами — всё внутри Telegram.',
      cta: '⚡ Открыть в Telegram',
      ctaSecondary: 'Документация',
    },
    mockup: {
      kidName: 'Максим', today: 'Сегодня',
      task1: 'Почистил зубы', task2: 'Сделал уроки',
      task3: 'Убрал комнату',  task4: 'Читал 20 минут',
      pending: 'Проверка',     reward: 'Сюрприз!',
    },
    howItWorks: {
      title: 'Как это работает',
      steps: [
        {
          icon: '👨‍👧', num: '1',
          title: 'Родитель составляет день',
          desc: 'Добавьте задания для ребёнка и установите секретную награду. Только вы знаете её название — это сюрприз до самого конца.',
        },
        {
          icon: '✅', num: '2',
          title: 'Ребёнок выполняет задания',
          desc: 'Ребёнок отмечает задания выполненными. Каждое переходит в статус «На проверке» и ждёт подтверждения взрослого.',
        },
        {
          icon: '🎁', num: '3',
          title: 'Награда раскрывается!',
          desc: 'Все задания подтверждены → прогресс 100% → родитель открывает сюрприз. Волшебный момент для всей семьи!',
        },
      ],
    },
    features: {
      title: 'Всё что нужно',
      items: [
        { icon: '📋', title: 'Ежедневные задания',     desc: 'Создавайте задания для каждого ребёнка с шаблонами для экономии времени.' },
        { icon: '🎁', title: 'Сюрпризные награды',     desc: 'Задайте тайную награду, которая раскрывается только когда все задания подтверждены.' },
        { icon: '✅', title: 'Проверка заданий',       desc: 'Каждое задание требует подтверждения взрослого — честно и поощряет настоящие усилия.' },
        { icon: '👨‍👩‍👧‍👦', title: 'Несколько детей',     desc: 'Управляйте всеми детьми из одного аккаунта, у каждого свои задания и награды.' },
        { icon: '📅', title: 'История-календарь',      desc: 'Просматривайте любой прошлый день — что было сделано и какая была награда.' },
        { icon: '🤝', title: 'Семейное приглашение',   desc: 'Пригласите бабушку или второго родителя проверять задания по ссылке Telegram.' },
        { icon: '🔒', title: 'PIN-защита',             desc: 'Переключайтесь в режим родителя с PIN-кодом — скрывайте настройки от детей.' },
        { icon: '🌍', title: 'RU / EN языки',          desc: 'Полная поддержка русского и английского, определяется автоматически из Telegram.' },
      ],
    },
    roles: {
      title: 'Три роли, одна счастливая семья',
      items: [
        {
          icon: '👨‍💻', title: 'Родитель (Администратор)',
          desc: 'Создаёт задания и тайные награды, управляет профилями детей, устанавливает PIN, приглашает валидаторов.',
        },
        {
          icon: '🧑‍🏫', title: 'Валидатор',
          desc: 'Подтверждает или отклоняет задания на проверке. Им может быть бабушка, второй родитель или другой доверенный взрослый.',
        },
        {
          icon: '🧒', title: 'Ребёнок (режим просмотра)',
          desc: 'Отмечает задания выполненными, видит прогресс-бар и разблокирует сюрпризную награду когда всё готово.',
        },
      ],
    },
    pricing: {
      title: 'Тарифы',
      coming: '🚀 Скоро',
      comingDesc: 'My Happy Kids сейчас доступен бесплатно во время бета-теста. Информация о тарифах будет объявлена при запуске.',
    },
    docs: {
      title: 'Документация',
      sections: [
        { id: 'getting-started', label: 'Начало работы' },
        { id: 'roles',           label: 'Роли и доступ' },
        { id: 'tasks',           label: 'Задания' },
        { id: 'rewards',         label: 'Награды' },
        { id: 'calendar',        label: 'Календарь' },
        { id: 'sharing',         label: 'Семейный доступ' },
        { id: 'settings',        label: 'Настройки' },
      ],
      content: {
        'getting-started': `
<h1>Начало работы</h1>
<p class="docs-lead">My Happy Kids — Telegram Mini App для формирования ежедневных привычек у детей через задания, проверку и награды. Установка не нужна — всё работает прямо в Telegram.</p>

<h2>Что нужно</h2>
<ul>
  <li>Аккаунт в <strong>Telegram</strong></li>
  <li>Доступ к боту <strong>My Happy Kids</strong> (ссылку даст владелец сервера)</li>
</ul>

<h2>Первый запуск</h2>
<ol>
  <li>Откройте бота в Telegram и нажмите <strong>Start</strong>.</li>
  <li>Нажмите кнопку <strong>Menu</strong> (левее поля ввода).</li>
  <li>Откроется Mini App и <strong>автоматически зарегистрирует вас как Родителя (Администратора)</strong> через вашу Telegram-личность — никаких логинов и паролей.</li>
</ol>
<div class="docs-tip">💡 Ваш аккаунт привязан к вашему Telegram ID. Пока вы используете тот же аккаунт — вход всегда автоматический.</div>

<h2>Настройка семьи</h2>
<ol>
  <li>При первом запуске вас попросят ввести <strong>название семьи</strong> (например «Семья Ивановых»). Отображается у приглашённых людей.</li>
  <li>Нажмите <strong>Добавить ребёнка</strong> и заполните имя, возраст, пол. Можно добавить фото.</li>
  <li>Готово! Откроется страница ребёнка, где можно начать добавлять задания.</li>
</ol>

<h2>Режимы работы</h2>
<p>Приложение имеет три режима, переключаемых кнопками в правом верхнем углу:</p>
<ul>
  <li><span class="docs-badge child">Просмотр</span> — Режим по умолчанию. Ребёнок использует приложение здесь: отмечает задания, видит прогресс, разблокирует награду.</li>
  <li><span class="docs-badge admin">Родитель</span> — Режим родителя, защищён PIN. Добавлять/редактировать задания, устанавливать награды, настройки.</li>
  <li><span class="docs-badge validator">Валидатор</span> — Защищён паролем валидатора. Подтверждать или отклонять задания на проверке.</li>
</ul>`,

        'roles': `
<h1>Роли и доступ</h1>
<p class="docs-lead">Три роли работают вместе, создавая честную и мотивирующую систему для вашей семьи.</p>

<h2>Родитель (Администратор)</h2>
<span class="docs-badge admin">Администратор</span>
<p>Родитель создаёт всю структуру семьи. В каждой семье один Администратор — Telegram-пользователь, который первым открыл приложение.</p>
<p><strong>Администратор может:</strong></p>
<ul>
  <li>Добавлять, редактировать и удалять детей</li>
  <li>Создавать ежедневные задания и устанавливать награды</li>
  <li>Использовать шаблоны заданий и наград</li>
  <li>Управлять валидаторами (приглашать или создавать локальные аккаунты)</li>
  <li>Получать доступ к настройкам (PIN, имя семьи, язык)</li>
  <li>Просматривать всю историю в календаре</li>
</ul>
<p>Переключение в режим Администратора требует ввода <strong>PIN-кода</strong> (если установлен). Без PIN — переключение мгновенное.</p>

<h2>Валидатор</h2>
<span class="docs-badge validator">Валидатор</span>
<p>Валидаторы подтверждают или отклоняют задания, которые дети отметили выполненными. В семье может быть несколько валидаторов.</p>
<p>Два типа валидаторов:</p>
<ul>
  <li><strong>Telegram-участник</strong> — другой Telegram-пользователь, принявший вашу ссылку-приглашение.</li>
  <li><strong>Локальный валидатор</strong> — аккаунт логин/пароль, созданный администратором. Удобно для устройств без Telegram.</li>
</ul>
<p>Валидаторы видят список всех <strong>заданий на проверке</strong> по всем детям и могут подтвердить или отклонить каждое.</p>

<h2>Ребёнок (режим просмотра)</h2>
<span class="docs-badge child">Просмотр</span>
<p>У детей нет отдельных аккаунтов — они используют приложение в режиме просмотра. Mini App по умолчанию открывается в режиме просмотра.</p>
<p>В режиме просмотра дети могут:</p>
<ul>
  <li>Видеть список заданий и отмечать их выполненными</li>
  <li>Наблюдать как заполняется прогресс-бар</li>
  <li>Разблокировать сюрпризную награду когда все задания подтверждены</li>
  <li>Просматривать календарь прошлых дней</li>
</ul>
<div class="docs-tip">💡 Откройте Mini App на устройстве ребёнка и оставьте в режиме просмотра — кнопки Родителя и Валидатора будут скрыты.</div>`,

        'tasks': `
<h1>Задания</h1>
<p class="docs-lead">Задания — основа My Happy Kids. Каждое задание, отмеченное ребёнком, проходит процесс подтверждения прежде чем учитываться в прогрессе.</p>

<h2>Создание заданий</h2>
<p>Переключитесь в <span class="docs-badge admin">режим Родителя</span> и откройте страницу ребёнка. Нажмите <strong>+</strong> или поле ввода, чтобы добавить задание на сегодня.</p>
<p>Можно свободно ввести название или выбрать из <strong>шаблонов</strong> — при вводе появляется выпадающий список с сохранёнными названиями.</p>

<h2>Шаблоны заданий</h2>
<p>Шаблоны — многоразовые названия заданий, которые экономят время. Управляются в <strong>Настройки → Дети → вкладка «Задания»</strong>.</p>
<ul>
  <li>Добавьте шаблон один раз — используйте каждый день</li>
  <li>Шаблоны общие для всех детей</li>
  <li>Inline-редактирование: ✏️ для переименования, 🗑️ для удаления</li>
</ul>

<h2>Жизненный цикл задания</h2>
<p>Каждое задание проходит следующие состояния:</p>
<ol>
  <li><strong>Открыто</strong> — задание ждёт выполнения ребёнком.</li>
  <li><strong>На проверке</strong> — ребёнок нажал чекбокс; задание ждёт подтверждения валидатора. Показывает бейдж «На проверке».</li>
  <li><strong>Подтверждено</strong> — валидатор подтвердил; задание учитывается в прогресс-баре.</li>
</ol>
<div class="docs-warn">⚠️ Даже если вы родитель/администратор — нажатие чекбокса переводит задание в «На проверке». Все задания должны пройти проверку.</div>
<p>Из состояния «На проверке» валидатор может:</p>
<ul>
  <li><strong>Подтвердить</strong> → задание отмечается выполненным, прогресс растёт</li>
  <li><strong>Отклонить</strong> → задание возвращается в «Открыто»</li>
</ul>
<p>Подтверждённое задание можно снять, нажав на него снова — оно вернётся в «Открыто».</p>

<h2>Удаление заданий</h2>
<p>В режиме Родителя нажмите иконку 🗑️ рядом с заданием. Удаление необратимо.</p>`,

        'rewards': `
<h1>Награды</h1>
<p class="docs-lead">Награды — захватывающий финал каждого дня. Тайная награда раскрывается только когда все задания подтверждены и родитель открывает сюрприз.</p>

<h2>Установка награды</h2>
<p>В <span class="docs-badge admin">режиме Родителя</span> откройте страницу ребёнка. Внизу списка заданий — <strong>секция награды</strong>.</p>
<ul>
  <li>Для <strong>сегодня</strong>: введите название награды (или выберите из шаблонов) и сохраните.</li>
  <li>Для <strong>будущих дней</strong>: перейдите на нужную дату в календаре, затем установите награду.</li>
  <li>Название скрыто от ребёнка в режиме просмотра — он видит только «🎁 Сюрприз!» пока не заработает.</li>
</ul>

<h2>Шаблоны наград</h2>
<p>Как и шаблоны заданий, сохраните многоразовые идеи наград в <strong>Настройки → Дети → вкладка «Награды»</strong>. Комбо-бокс будет их предлагать.</p>

<h2>Процесс раскрытия</h2>
<p>Когда все задания дня подтверждены:</p>
<ol>
  <li>Прогресс-бар достигает 100%.</li>
  <li>В режиме просмотра появляется кнопка <strong>«Открыть награду»</strong>.</li>
  <li>Нажатие запрашивает <strong>пароль администратора</strong> — это гарантирует присутствие родителя.</li>
  <li>После верного пароля показывается название награды с анимацией 🎁.</li>
  <li>Появляется кнопка <strong>«Вручить награду»</strong>. Нажмите чтобы официально отметить награду полученной.</li>
</ol>
<div class="docs-tip">💡 Дайте ребёнку устройство и пусть он нажмёт «Открыть награду», пока вы вводите пароль — это создаёт ощущение волшебства!</div>

<h2>Полученные награды</h2>
<p>После получения награда отображается как <strong>🏆 [название]</strong>. В прошлых днях календаря полученные награды всегда видны.</p>
<p>Если переименовать награду после установки — статус claimed сбрасывается. Считается новой наградой.</p>`,

        'calendar': `
<h1>Календарь</h1>
<p class="docs-lead">Просматривайте любой день — прошлый, сегодняшний или будущий — для каждого ребёнка. Календарь помогает планировать и просматривать историю.</p>

<h2>Навигация по календарю</h2>
<p>На странице ребёнка <strong>полоса календаря</strong> показывает горизонтальный ряд из 14 дней, центрированных на выбранной дате. Нажмите на любой день, чтобы увидеть его задания и награду.</p>
<p>Точки под датами означают активность в этот день (были задания или награда).</p>
<p>Текущая дата выделена; выбранная дата отмечена кружком.</p>

<h2>Типы дней</h2>
<table class="role-table">
  <thead><tr><th>День</th><th>Задания</th><th>Добавление</th><th>Награда</th></tr></thead>
  <tbody>
    <tr>
      <td><strong>Прошлое</strong></td>
      <td>Заморожено (только чтение)</td>
      <td>Недоступно</td>
      <td>Получена → 🏆; иначе 🎁 «Не получена»</td>
    </tr>
    <tr>
      <td><strong>Сегодня</strong></td>
      <td>Интерактивно (ребёнок может отмечать)</td>
      <td>Только Родитель</td>
      <td>Полный процесс с кнопкой открытия</td>
    </tr>
    <tr>
      <td><strong>Будущее</strong></td>
      <td>Заблокировано 🔒 (видно, нельзя нажать)</td>
      <td>Родитель может добавлять заранее</td>
      <td>🎁 «Сюрприз!» (название скрыто в режиме просмотра)</td>
    </tr>
  </tbody>
</table>

<h2>Часы и дата в шапке</h2>
<p>Над календарём шапка показывает полную дату выбранного дня и живые часы <strong>ЧЧ:ММ:СС</strong>, тикающие каждую секунду — удобно убедиться, что смотрите на задания текущего дня.</p>`,

        'sharing': `
<h1>Семейный доступ</h1>
<p class="docs-lead">Пригласите второго родителя, бабушку или любого доверенного взрослого проверять задания — прямо через Telegram.</p>

<h2>Создание ссылки-приглашения</h2>
<ol>
  <li>В <span class="docs-badge admin">режиме Родителя</span> перейдите в <strong>Настройки → Приглашения</strong>.</li>
  <li>Нажмите <strong>Создать ссылку-приглашение</strong>.</li>
  <li>Генерируется ссылка вида <code>t.me/ВашБот?start=inv_…</code>.</li>
  <li>Отправьте ссылку тому, кого хотите пригласить (через Telegram, WhatsApp и т.д.).</li>
</ol>
<div class="docs-tip">💡 Ссылки постоянные и многоразовые — можно отправить одну ссылку нескольким людям, или пересоздать её для безопасности.</div>

<h2>Принятие приглашения</h2>
<ol>
  <li>Приглашённый открывает ссылку в Telegram — бот открывается с параметром приглашения.</li>
  <li>Нажимает <strong>«Принять приглашение»</strong> в сообщении бота.</li>
  <li>Открывается Mini App и человек добавляется как Валидатор в вашей семье.</li>
  <li>Теперь он видит вашу семью в <strong>переключателе семей</strong> и может подтверждать задания.</li>
</ol>

<h2>Управление участниками</h2>
<p>В <strong>Настройки → Валидаторы</strong> видны все участники:</p>
<ul>
  <li><strong>Telegram-участники</strong> — вступили через приглашение; показываются с Telegram-именем.</li>
  <li><strong>Локальные валидаторы</strong> — созданы с логином/паролем (Telegram не требуется).</li>
</ul>
<p>Нажмите <strong>Удалить</strong> рядом с участником чтобы отозвать доступ. Аккаунт не удаляется, только убирается из семьи.</p>

<h2>Несколько семей</h2>
<p>Если вас пригласили в другие семьи — в шапке списка детей появляется <strong>выпадающий список семей</strong>. Переключайтесь между семьями, чтобы видеть разные наборы заданий.</p>
<p>Работая в контексте другой семьи, у вас права Валидатора там, даже если в своей семье вы Администратор.</p>`,

        'settings': `
<h1>Настройки</h1>
<p class="docs-lead">Все настройки доступны в <span class="docs-badge admin">режиме Родителя</span> через иконку настроек в навигации.</p>

<h2>Вкладка «Общее»</h2>
<ul>
  <li><strong>Имя семьи</strong> — отображаемое имя для приглашённых валидаторов. Нажмите для редактирования.</li>
  <li><strong>Язык</strong> — переключение между Русским и English. Сохраняется в localStorage на устройстве.</li>
  <li><strong>Очистить базу данных</strong> — удаляет все данные семьи (дети, задания, награды, шаблоны, валидаторы, приглашения). Требует двухшагового подтверждения. Необратимо.</li>
</ul>

<h2>Вкладка «PIN»</h2>
<p>PIN защищает переключение <strong>Просмотр → Родитель</strong>.</p>
<ul>
  <li>Установите PIN не менее 4 цифр.</li>
  <li>Пока PIN не установлен — переключение мгновенное (без запроса) — удобно для первоначальной настройки.</li>
  <li>Смена PIN: введите старый PIN и новый PIN.</li>
  <li>Удаление PIN: введите текущий PIN и подтвердите.</li>
</ul>
<div class="docs-warn">⚠️ Если забудете PIN — потребуется очистить базу данных или иметь прямой доступ к серверу.</div>

<h2>Вкладка «Приглашения»</h2>
<p>Управляйте постоянными ссылками-приглашениями для вступления в семью. Подробности — в разделе <a href="#" class="docs-link" data-docs-section="sharing">Семейный доступ</a>.</p>

<h2>Вкладка «Валидаторы»</h2>
<p>Просмотр всех валидаторов (Telegram-участников и локальных аккаунтов). Вы можете:</p>
<ul>
  <li>Создавать локальные аккаунты валидаторов (логин + пароль)</li>
  <li>Менять пароли локальных валидаторов</li>
  <li>Удалять валидаторов из семьи</li>
</ul>`,
      },
    },
    footer: { copy: '© 2025 My Happy Kids. Сделано с ❤️ для семей.' },
  },
};

// ============================================================
// UTILITIES
// ============================================================

/** Deep-get a dot-path key from T[currentLang] */
function t(key) {
  const parts = key.split('.');
  let obj = T[currentLang];
  for (const p of parts) { obj = obj?.[p]; }
  return obj ?? key;
}

/** Apply data-i18n / data-i18n-html attributes to DOM */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.getElementById('langEn').classList.toggle('active', currentLang === 'en');
  document.getElementById('langRu').classList.toggle('active', currentLang === 'ru');
  document.documentElement.lang = currentLang;
}

// ============================================================
// LANGUAGE
// ============================================================
function detectLang() {
  const saved = localStorage.getItem('landing_lang');
  if (saved === 'en' || saved === 'ru') return saved;
  const nav = (navigator.language || '').toLowerCase();
  return nav.startsWith('ru') ? 'ru' : 'en';
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('landing_lang', lang);
  applyI18n();
  renderDynamic();
}

// ============================================================
// DYNAMIC RENDERING
// ============================================================
function renderDynamic() {
  renderSteps();
  renderFeatures();
  renderRoles();
  renderDocs();
}

function renderSteps() {
  const grid = document.getElementById('stepsGrid');
  if (!grid) return;
  grid.innerHTML = t('howItWorks.steps').map(s => `
    <div class="step-card">
      <div class="step-num">${s.num}</div>
      <div class="step-icon">${s.icon}</div>
      <div class="step-title">${s.title}</div>
      <p class="step-desc">${s.desc}</p>
    </div>`).join('');
}

function renderFeatures() {
  const grid = document.getElementById('featuresGrid');
  if (!grid) return;
  grid.innerHTML = t('features.items').map(f => `
    <div class="feature-card">
      <div class="feature-icon">${f.icon}</div>
      <div class="feature-title">${f.title}</div>
      <p class="feature-desc">${f.desc}</p>
    </div>`).join('');
}

function renderRoles() {
  const grid = document.getElementById('rolesGrid');
  if (!grid) return;
  grid.innerHTML = t('roles.items').map(r => `
    <div class="role-card">
      <div class="role-icon">${r.icon}</div>
      <div class="role-title">${r.title}</div>
      <p class="role-desc">${r.desc}</p>
    </div>`).join('');
}

function renderDocs() {
  const sidebar  = document.getElementById('docsSidebar');
  const content  = document.getElementById('docsContent');
  if (!sidebar || !content) return;

  const sections    = t('docs.sections');
  const docContent  = T[currentLang].docs.content;
  const sidebarLabel = currentLang === 'en' ? 'Documentation' : 'Документация';

  sidebar.innerHTML = `
    <div class="docs-sidebar-title">${sidebarLabel}</div>
    ${sections.map(s => `
      <div class="docs-nav-item${currentDocsSection === s.id ? ' active' : ''}"
           data-section="${s.id}">${s.label}</div>
    `).join('')}`;

  content.innerHTML = sections.map(s => `
    <div class="docs-section${currentDocsSection === s.id ? ' active' : ''}" id="docs-${s.id}">
      ${docContent[s.id] || ''}
    </div>`).join('');

  // Sidebar click handlers
  sidebar.querySelectorAll('.docs-nav-item').forEach(el => {
    el.addEventListener('click', () => showDocsSection(el.dataset.section));
  });
  // Inline doc links
  content.querySelectorAll('[data-docs-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showDocsSection(link.dataset.docsSection);
    });
  });
}

function showDocsSection(id) {
  currentDocsSection = id;
  document.querySelectorAll('.docs-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.section === id));
  document.querySelectorAll('.docs-section').forEach(el =>
    el.classList.toggle('active', el.id === 'docs-' + id));
  document.getElementById('docsContent')?.scrollTo(0, 0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// ROUTING
// ============================================================
const VALID_PAGES = ['home', 'pricing', 'docs'];

function showPage(name) {
  if (!VALID_PAGES.includes(name)) name = 'home';
  currentPage = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  document.querySelectorAll('.nav-link, .mobile-link').forEach(a =>
    a.classList.toggle('active', a.dataset.page === name));
  const footer = document.getElementById('siteFooter');
  if (footer) footer.style.display = (name === 'docs') ? 'none' : '';
  window.scrollTo(0, 0);
  history.pushState(null, '', '#' + name);
  // Trigger fade-in for newly visible sections
  requestAnimationFrame(observeVisible);
  // Animate phone progress bar when home appears
  if (name === 'home') {
    setTimeout(() => {
      const bar = document.getElementById('mockProgress');
      if (bar) bar.style.width = '75%';
    }, 700);
  }
}

// ============================================================
// MOBILE MENU
// ============================================================
function toggleMobileMenu(open) {
  const menu = document.getElementById('mobileMenu');
  if (!menu) return;
  const next = (open !== undefined) ? open : !menu.classList.contains('open');
  menu.classList.toggle('open', next);
}

// ============================================================
// SCROLL ANIMATIONS
// ============================================================
let scrollObserver = null;
function observeVisible() {
  document.querySelectorAll('.fade-in-section:not(.visible)').forEach(el => {
    if (scrollObserver) scrollObserver.observe(el);
  });
}
function initScrollAnimations() {
  scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        scrollObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  observeVisible();
}

// ============================================================
// INIT
// ============================================================
function initNavLinks() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      const page = el.dataset.page;
      if (!page) return;
      e.preventDefault();
      showPage(page);
      toggleMobileMenu(false);
    });
  });
}

function initCta() {
  const btn = document.getElementById('ctaBtn');
  if (!btn) return;
  const url = (typeof window.BOT_URL !== 'undefined') ? window.BOT_URL : null;
  if (url) {
    btn.href = url;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
  } else {
    // No bot URL configured — scroll to docs as fallback
    btn.addEventListener('click', e => {
      e.preventDefault();
      showPage('docs');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Detect language
  currentLang = detectLang();

  // Parse initial page/section from hash
  const hash = window.location.hash.slice(1) || 'home';
  if (hash.startsWith('docs/')) {
    currentDocsSection = hash.slice(5) || 'getting-started';
    currentPage = 'docs';
  } else if (VALID_PAGES.includes(hash)) {
    currentPage = hash;
  } else {
    currentPage = 'home';
  }

  // Apply translations + render dynamic content
  applyI18n();
  renderDynamic();

  // Show correct page (home is already active in HTML, may need override)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + currentPage);
  if (page) page.classList.add('active');

  // Nav active state
  document.querySelectorAll('.nav-link, .mobile-link').forEach(a =>
    a.classList.toggle('active', a.dataset.page === currentPage));

  // Footer visibility
  const footer = document.getElementById('siteFooter');
  if (footer) footer.style.display = (currentPage === 'docs') ? 'none' : '';

  // CTA button
  initCta();

  // Nav links (data-page)
  initNavLinks();

  // Scroll animations
  initScrollAnimations();

  // Animate phone bar if home
  if (currentPage === 'home') {
    setTimeout(() => {
      const bar = document.getElementById('mockProgress');
      if (bar) bar.style.width = '75%';
    }, 800);
  }

  // Header shadow on scroll
  const header = document.getElementById('header');
  window.addEventListener('scroll', () =>
    header?.classList.toggle('scrolled', window.scrollY > 8), { passive: true });

  // Browser back/forward
  window.addEventListener('popstate', () => {
    const h = window.location.hash.slice(1) || 'home';
    if (VALID_PAGES.includes(h)) showPage(h);
  });
});
