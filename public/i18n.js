// ---- Internationalization (i18n) ----
// Supports 'ru' and 'en'. Defaults to 'en'; 'ru' is set when Telegram
// language code starts with 'ru' (detected in app.js) or via the in-app toggle.

const TRANSLATIONS = {
  ru: {
    // App
    'app.title': 'Happy Kids',

    // Login
    'login.hint_inside_tg': 'Родители — нажмите «Войти через Telegram». Валидаторам — введите логин и пароль, выданные родителем.',
    'login.hint_outside_tg': 'Родители заходят через Telegram. Валидаторам — введите логин и пароль, выданные родителем.',
    'login.tg_button': 'Войти через Telegram',
    'login.username': 'Логин',
    'login.password': 'Пароль',
    'login.submit': 'Войти',
    'login.tg_error': 'Не удалось войти через Telegram',

    // Kids list
    'kids.title': 'Доска',
    'kids.settings': 'Настройки',
    'kids.logout': 'Выйти',
    'kids.tab_kids': 'Дети',
    'kids.tab_tasks': 'Задания',
    'kids.tab_rewards': 'Награды',
    'kids.add_kid': 'Добавить ребёнка',
    'kids.add_kid_title': 'Добавить ребёнка',
    'kids.name_placeholder': 'Имя',
    'kids.age_placeholder': 'Возраст',
    'kids.boy': 'Мальчик',
    'kids.girl': 'Девочка',
    'kids.no_photo': 'Без фото',
    'kids.choose_photo': 'Выбрать фото',
    'kids.change_photo': 'Сменить фото',
    'kids.remove_photo': 'Убрать фото',
    'kids.cancel': 'Отмена',
    'kids.add_button': 'Добавить',
    'kids.save': 'Сохранить',
    'kids.name_age_required': 'Заполните имя и возраст',
    'kids.list_title': 'Список',
    'kids.empty_admin': 'Пока никого. Добавьте первого ребёнка выше.',
    'kids.empty_view': 'Список детей пуст. Переключитесь в режим «Родитель», чтобы добавить.',
    'kids.today_progress': 'Сегодня: {done}/{total} ({pct}%)',
    'kids.no_tasks_today': 'На сегодня заданий нет',
    'kids.edit_title': 'Редактировать',
    'kids.delete_title': 'Удалить',
    'kids.delete_confirm': 'Удалить профиль {name}? Все задания и награды будут удалены.',

    // Templates
    'templates.task.section': 'Список заданий',
    'templates.task.add_title': 'Добавить задание',
    'templates.task.empty': 'Пока нет заданий. Добавьте ниже.',
    'templates.task.placeholder': 'Название задания',
    'templates.reward.section': 'Список наград',
    'templates.reward.add_title': 'Добавить награду',
    'templates.reward.empty': 'Пока нет наград. Добавьте ниже.',
    'templates.reward.placeholder': 'Название награды',
    'templates.edit': 'Редактировать',
    'templates.delete': 'Удалить',
    'templates.save': 'Сохранить',
    'templates.cancel': 'Отмена',
    'templates.add': 'Добавить',

    // Calendar
    'cal.dow_short': ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    'cal.dow_full': ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
    'cal.month_short': ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    'cal.month_gen': ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    'cal.date_format': '{day} {month} {year} г., {dow}',

    // Kid page
    'kid.back': '‹ Назад',
    'kid.delete': 'Удалить',
    'kid.delete_confirm': 'Удалить профиль {name}?',
    'kid.age_gender': '{age} лет, {gender}',
    'kid.gender_m': 'мальчик',
    'kid.gender_f': 'девочка',

    // Tasks
    'tasks.empty_today_admin': 'Заданий на сегодня нет. Добавьте ниже.',
    'tasks.empty_today_view': 'На сегодня заданий ещё нет.',
    'tasks.empty_past': 'В этот день заданий не было.',
    'tasks.empty_future_admin': 'Заданий ещё нет. Добавьте ниже.',
    'tasks.empty_future_view': 'Этот день ещё не наступил.',
    'tasks.new_today': 'Новое задание на сегодня',
    'tasks.new_date': 'Новое задание на {date}',
    'tasks.add': 'Добавить',
    'tasks.pending_badge': 'На проверке',

    // Stats & history
    'stats.title': 'Статистика',
    'stats.days_with_tasks': 'Дней с заданиями: {n}',
    'stats.total_tasks': 'Всего заданий: {total}, выполнено: {done}',
    'stats.rewards_claimed': 'Наград получено: {n}',
    'history.title': 'История',
    'history.empty': 'Пока пусто',
    'history.tasks': '{done}/{total} заданий',
    'history.reward': ' · награда: {title}',
    'history.reward_claimed': ' ✓',

    // Reward section
    'reward.title_trophy': '🏆 Награда',
    'reward.title_gift': '🎁 Награда',
    'reward.claimed_label': 'Награда получена',
    'reward.not_claimed': 'Не получена',
    'reward.day_title': '🎁 Награда на {date}',
    'reward.not_assigned_yet': 'Награда ещё не назначена.',
    'reward.assign': 'Назначить',
    'reward.new_placeholder': 'Новое название награды',
    'reward.opens_on_day': 'Откроется в день, когда задания будут выполнены',
    'reward.edit_title': 'Изменить награду',
    'reward.save': 'Сохранить',
    'reward.daily_title': '🎁 Награда дня',
    'reward.not_selected': 'Награда на сегодня пока не выбрана',
    'reward.surprise': 'Сюрприз!',
    'reward.surprise_opens': 'Награда уже назначена — откроется в этот день',
    'reward.not_assigned_today': 'Награда на сегодня ещё не назначена.',
    'reward.locked_until_done': 'Откроется, когда все задания будут выполнены',
    'reward.trophy_daily': '🏆 Награда дня',
    'reward.received': 'Награда получена!',
    'reward.enter_pin': 'Введите PIN родителя',
    'reward.wrong_pin': 'Неверный PIN',
    'reward.cancel': 'Отмена',
    'reward.open': 'Открыть',
    'reward.all_done': 'Все задания выполнены!',
    'reward.parent_opens': 'Награду открывает родитель',
    'reward.open_reward': 'Открыть награду',
    'reward.ready_to_give': 'Все задания выполнены — можно вручать!',
    'reward.surprise_ready': 'Сюрприз готов!',
    'reward.give_reward': 'Вручить награду',
    'reward.all_done_admin': 'Все задания выполнены — можно вручать!',

    // Mode toggle
    'mode.view': 'Просмотр 👀',
    'mode.switch_title': 'Переключить режим',
    'mode.parent_title': 'Войти как родитель',
    'mode.validator_title': 'Войти как валидатор',

    // Mode auth modal
    'auth.validator_title': 'Вход валидатора',
    'auth.pin_title': 'PIN родителя',
    'auth.validator_sub': 'Введите логин и пароль валидатора, чтобы подтверждать выполнение заданий.',
    'auth.pin_sub': 'Введите PIN родителя, чтобы перейти в режим редактирования.',
    'auth.login_placeholder': 'Логин',
    'auth.password_placeholder': 'Пароль',
    'auth.pin_placeholder': 'PIN',
    'auth.submit': 'Войти',
    'auth.cancel': 'Отмена',
    'auth.wrong_creds': 'Неверный логин или пароль',
    'auth.wrong_pin': 'Неверный PIN',

    // Settings
    'settings.title': 'Настройки',
    'settings.back': '‹ Назад',
    'settings.tab_general': 'Общее',
    'settings.tab_pin': 'PIN',
    'settings.tab_invites': 'Приглашения',
    'settings.tab_validators': 'Пользователи',
    'settings.tab_users': 'Пользователи',

    // General settings
    'general.family_name_title': 'Название семьи',
    'general.family_name_hint': 'Это имя увидят приглашённые валидаторы вместо вашего ID.',
    'general.family_name_placeholder': 'Введите имя семьи',
    'general.saved': 'Сохранено',
    'general.save_error': 'Не удалось сохранить',
    'general.save': 'Сохранить',
    'general.danger_title': 'Опасная зона',
    'general.confirm_title': 'Вы уверены? Это необратимо.',
    'general.confirm_desc': 'Будут удалены все дети, задания, награды, шаблоны, валидаторы и приглашения.',
    'general.confirm_yes': 'Да, удалить всё',
    'general.confirm_no': 'Отмена',
    'general.clear_db_hint': 'Удаляет все данные семьи: детей, задания, награды, шаблоны, валидаторов и приглашения. Действие необратимо.',
    'general.clear_db': 'Почистить базу данных',

    // PIN settings
    'pin.title': 'PIN родителя',
    'pin.hint_set': 'PIN защищает переход в режим редактирования и открытие награды.',
    'pin.hint_unset': 'PIN не задан. Сейчас переход в режим редактирования происходит в один клик. Задайте PIN, чтобы защитить эти действия.',
    'pin.old_placeholder': 'Старый PIN',
    'pin.new_placeholder': 'Новый PIN',
    'pin.create_placeholder': 'PIN (минимум 4 цифры)',
    'pin.current_placeholder': 'Текущий PIN',
    'pin.change': 'Изменить PIN',
    'pin.set': 'Установить PIN',
    'pin.delete': 'Удалить PIN',
    'pin.delete_confirm': 'Введите текущий PIN, чтобы подтвердить удаление:',
    'pin.cancel': 'Отмена',
    'pin.delete_btn': 'Удалить',
    'pin.changed': 'PIN изменён',
    'pin.set_success': 'PIN установлен',
    'pin.deleted': 'PIN удалён',
    'pin.err_wrong_old': 'Неверный старый PIN',
    'pin.err_wrong': 'Неверный PIN',
    'pin.err_too_short': 'PIN должен содержать минимум 4 цифры',
    'pin.err_not_set': 'PIN не задан',
    'pin.err_generic': 'Не удалось выполнить операцию',

    // Invites
    'invites.title': 'Пригласить через Telegram',
    'invites.hint': 'Создайте ссылку и отправьте её любому пользователю Telegram.',
    'invites.empty': 'Пока нет приглашений.',
    'invites.no_url': '(нет URL: бот не запущен)',
    'invites.created_at': 'Создано: {date}',
    'invites.copy': 'Копировать',
    'invites.share': 'Поделиться',
    'invites.revoke_title': 'Отозвать',
    'invites.revoke_confirm': 'Отозвать приглашение? После отзыва ссылка перестанет работать.',
    'invites.copied': 'Ссылка скопирована',
    'invites.create': 'Создать ссылку-приглашение',
    'invites.share_msg': 'Приглашение в Happy Kids: подтверждайте выполнение заданий моего ребёнка',
    'invites.validator_title': 'Пригласить валидатора',
    'invites.validator_hint': 'Открыв ссылку, пользователь Telegram станет валидатором в вашей семье — сможет подтверждать выполнение заданий. Ссылка постоянная и многоразовая.',
    'invites.admin_title': 'Пригласить администратора',
    'invites.admin_hint': 'Открыв ссылку, пользователь Telegram получит права администратора — сможет полностью управлять детьми, заданиями и наградами. Ссылка постоянная и многоразовая.',
    'invites.admin_share_msg': 'Приглашение в Happy Kids: управляйте заданиями и наградами нашего ребёнка',
    'invites.create_validator': 'Создать ссылку для валидатора',
    'invites.create_admin': 'Создать ссылку для администратора',

    // Validators / Users
    'validators.add_title': 'Добавить пользователя по логину и паролю',
    'validators.add_hint': 'Альтернатива приглашению через Telegram: создайте аккаунт с логином/паролем. Подходит, если пользователь будет заходить из браузера.',
    'validators.login_placeholder': 'Логин',
    'validators.password_placeholder': 'Пароль',
    'validators.add': 'Добавить',
    'validators.role_validator': 'Валидатор',
    'validators.role_admin': 'Администратор',
    'validators.list_title': 'Валидаторы',
    'validators.empty': 'Пока нет валидаторов.',
    'validators.admins_section': 'Администраторы',
    'validators.admins_empty': 'Пока нет администраторов.',
    'validators.tg_guest': 'Гость через Telegram',
    'validators.tg_linked': 'Telegram привязан',
    'validators.tg_not_linked': 'Telegram не привязан',
    'validators.change_password_title': 'Сменить пароль',
    'validators.change_password_prompt': 'Новый пароль для {name}:',
    'validators.password_changed': 'Пароль изменён',
    'validators.revoke_title': 'Отозвать доступ',
    'validators.delete_title': 'Удалить',
    'validators.revoke_confirm': 'Отозвать доступ у {name}?',
    'validators.delete_confirm': 'Удалить {name}?',

    // Telegram block
    'telegram.title': 'Telegram',
    'telegram.already_linked': 'Аккаунт уже привязан к Telegram.',
    'telegram.open_in_tg': 'Откройте приложение через Telegram, чтобы привязать аккаунт.',
    'telegram.linked_success': '✅ Аккаунт привязан. В следующий раз вход будет автоматическим.',
    'telegram.link_hint': 'Привяжите этот аккаунт к Telegram, чтобы входить без пароля.',
    'telegram.link_btn': 'Привязать Telegram',
    'telegram.link_ok': 'Telegram успешно привязан',
    'telegram.link_err': 'Не удалось привязать. Возможно, этот Telegram уже занят другим аккаунтом.',

    // Family switcher
    'family.my': 'Моя семья',
    'family.validator_suffix': ' (Валидатор)',
    'family.admin_suffix': ' (Администратор)',

    // Pending tasks
    'pending.title': 'На проверке',
    'pending.logout': 'Выйти',
    'pending.empty': 'Нет заданий, ждущих подтверждения. Можно отдохнуть! ✨',
    'pending.approve': 'Подтвердить',
    'pending.reject': 'Отклонить',

    // Setup family
    'setup.title': 'Как называется ваша семья?',
    'setup.hint': 'Это имя увидят приглашённые валидаторы. Его можно изменить позже в Настройках.',
    'setup.placeholder': 'Введите имя семьи',
    'setup.submit': 'Продолжить',
    'setup.error': 'Не удалось сохранить',

    // Misc
    'invite.redeem_error': 'Не удалось принять приглашение: ',
    'photo.read_error': 'Не удалось прочитать файл',
    'photo.load_error': 'Не удалось загрузить изображение',

    // Language setting (in General settings)
    'lang.section_title': 'Язык',
    'lang.label_ru': 'Русский',
    'lang.label_en': 'English',

    // Language toggle (shows the language you will SWITCH TO)
    'lang.toggle': 'EN',
  },

  en: {
    // App
    'app.title': 'Happy Kids',

    // Login
    'login.hint_inside_tg': 'Parents — tap «Sign in with Telegram». Validators — enter the login and password provided by the parent.',
    'login.hint_outside_tg': 'Parents sign in via Telegram. Validators — enter the login and password provided by the parent.',
    'login.tg_button': 'Sign in with Telegram',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.tg_error': 'Failed to sign in with Telegram',

    // Kids list
    'kids.title': 'Board',
    'kids.settings': 'Settings',
    'kids.logout': 'Log out',
    'kids.tab_kids': 'Kids',
    'kids.tab_tasks': 'Tasks',
    'kids.tab_rewards': 'Rewards',
    'kids.add_kid': 'Add kid',
    'kids.add_kid_title': 'Add kid',
    'kids.name_placeholder': 'Name',
    'kids.age_placeholder': 'Age',
    'kids.boy': 'Boy',
    'kids.girl': 'Girl',
    'kids.no_photo': 'No photo',
    'kids.choose_photo': 'Choose photo',
    'kids.change_photo': 'Change photo',
    'kids.remove_photo': 'Remove photo',
    'kids.cancel': 'Cancel',
    'kids.add_button': 'Add',
    'kids.save': 'Save',
    'kids.name_age_required': 'Please fill in name and age',
    'kids.list_title': 'List',
    'kids.empty_admin': 'No kids yet. Add the first one above.',
    'kids.empty_view': 'Kids list is empty. Switch to Parent mode to add.',
    'kids.today_progress': 'Today: {done}/{total} ({pct}%)',
    'kids.no_tasks_today': 'No tasks for today',
    'kids.edit_title': 'Edit',
    'kids.delete_title': 'Delete',
    'kids.delete_confirm': 'Delete {name}\'s profile? All tasks and rewards will be deleted.',

    // Templates
    'templates.task.section': 'Task list',
    'templates.task.add_title': 'Add task',
    'templates.task.empty': 'No tasks yet. Add one below.',
    'templates.task.placeholder': 'Task name',
    'templates.reward.section': 'Reward list',
    'templates.reward.add_title': 'Add reward',
    'templates.reward.empty': 'No rewards yet. Add one below.',
    'templates.reward.placeholder': 'Reward name',
    'templates.edit': 'Edit',
    'templates.delete': 'Delete',
    'templates.save': 'Save',
    'templates.cancel': 'Cancel',
    'templates.add': 'Add',

    // Calendar
    'cal.dow_short': ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    'cal.dow_full': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    'cal.month_short': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    'cal.month_gen': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    'cal.date_format': '{month} {day}, {year}, {dow}',

    // Kid page
    'kid.back': '‹ Back',
    'kid.delete': 'Delete',
    'kid.delete_confirm': 'Delete {name}\'s profile?',
    'kid.age_gender': '{age} y.o., {gender}',
    'kid.gender_m': 'boy',
    'kid.gender_f': 'girl',

    // Tasks
    'tasks.empty_today_admin': 'No tasks for today. Add one below.',
    'tasks.empty_today_view': 'No tasks for today yet.',
    'tasks.empty_past': 'No tasks on this day.',
    'tasks.empty_future_admin': 'No tasks yet. Add one below.',
    'tasks.empty_future_view': 'This day hasn\'t come yet.',
    'tasks.new_today': 'New task for today',
    'tasks.new_date': 'New task for {date}',
    'tasks.add': 'Add',
    'tasks.pending_badge': 'Pending',

    // Stats & history
    'stats.title': 'Statistics',
    'stats.days_with_tasks': 'Days with tasks: {n}',
    'stats.total_tasks': 'Total tasks: {total}, completed: {done}',
    'stats.rewards_claimed': 'Rewards received: {n}',
    'history.title': 'History',
    'history.empty': 'Nothing yet',
    'history.tasks': '{done}/{total} tasks',
    'history.reward': ' · reward: {title}',
    'history.reward_claimed': ' ✓',

    // Reward section
    'reward.title_trophy': '🏆 Reward',
    'reward.title_gift': '🎁 Reward',
    'reward.claimed_label': 'Reward received',
    'reward.not_claimed': 'Not received',
    'reward.day_title': '🎁 Reward for {date}',
    'reward.not_assigned_yet': 'No reward assigned yet.',
    'reward.assign': 'Assign',
    'reward.new_placeholder': 'New reward name',
    'reward.opens_on_day': 'Will be revealed when all tasks are done',
    'reward.edit_title': 'Change reward',
    'reward.save': 'Save',
    'reward.daily_title': '🎁 Daily reward',
    'reward.not_selected': 'No reward for today yet',
    'reward.surprise': 'Surprise!',
    'reward.surprise_opens': 'A reward is set — it will be revealed on this day',
    'reward.not_assigned_today': 'No reward assigned for today yet.',
    'reward.locked_until_done': 'Will be revealed when all tasks are done',
    'reward.trophy_daily': '🏆 Daily reward',
    'reward.received': 'Reward received!',
    'reward.enter_pin': 'Enter parent PIN',
    'reward.wrong_pin': 'Wrong PIN',
    'reward.cancel': 'Cancel',
    'reward.open': 'Open',
    'reward.all_done': 'All tasks done!',
    'reward.parent_opens': 'Parent opens the reward',
    'reward.open_reward': 'Open reward',
    'reward.ready_to_give': 'All tasks done — time to give the reward!',
    'reward.surprise_ready': 'Surprise is ready!',
    'reward.give_reward': 'Give reward',
    'reward.all_done_admin': 'All tasks done — time to give the reward!',

    // Mode toggle
    'mode.view': 'View 👀',
    'mode.switch_title': 'Switch mode',
    'mode.parent_title': 'Sign in as parent',
    'mode.validator_title': 'Sign in as validator',

    // Mode auth modal
    'auth.validator_title': 'Validator login',
    'auth.pin_title': 'Parent PIN',
    'auth.validator_sub': 'Enter the validator login and password to confirm task completion.',
    'auth.pin_sub': 'Enter the parent PIN to switch to edit mode.',
    'auth.login_placeholder': 'Username',
    'auth.password_placeholder': 'Password',
    'auth.pin_placeholder': 'PIN',
    'auth.submit': 'Sign in',
    'auth.cancel': 'Cancel',
    'auth.wrong_creds': 'Wrong username or password',
    'auth.wrong_pin': 'Wrong PIN',

    // Settings
    'settings.title': 'Settings',
    'settings.back': '‹ Back',
    'settings.tab_general': 'General',
    'settings.tab_pin': 'PIN',
    'settings.tab_invites': 'Invites',
    'settings.tab_validators': 'Users',
    'settings.tab_users': 'Users',

    // General settings
    'general.family_name_title': 'Family name',
    'general.family_name_hint': 'Invited validators will see this name instead of your ID.',
    'general.family_name_placeholder': 'Enter family name',
    'general.saved': 'Saved',
    'general.save_error': 'Failed to save',
    'general.save': 'Save',
    'general.danger_title': 'Danger zone',
    'general.confirm_title': 'Are you sure? This is irreversible.',
    'general.confirm_desc': 'All kids, tasks, rewards, templates, validators and invites will be deleted.',
    'general.confirm_yes': 'Yes, delete everything',
    'general.confirm_no': 'Cancel',
    'general.clear_db_hint': 'Deletes all family data: kids, tasks, rewards, templates, validators and invites. This action is irreversible.',
    'general.clear_db': 'Clear database',

    // PIN settings
    'pin.title': 'Parent PIN',
    'pin.hint_set': 'PIN protects switching to edit mode and opening the reward.',
    'pin.hint_unset': 'No PIN set. Switching to edit mode is one click away. Set a PIN to protect these actions.',
    'pin.old_placeholder': 'Old PIN',
    'pin.new_placeholder': 'New PIN',
    'pin.create_placeholder': 'PIN (at least 4 digits)',
    'pin.current_placeholder': 'Current PIN',
    'pin.change': 'Change PIN',
    'pin.set': 'Set PIN',
    'pin.delete': 'Delete PIN',
    'pin.delete_confirm': 'Enter current PIN to confirm deletion:',
    'pin.cancel': 'Cancel',
    'pin.delete_btn': 'Delete',
    'pin.changed': 'PIN changed',
    'pin.set_success': 'PIN set',
    'pin.deleted': 'PIN deleted',
    'pin.err_wrong_old': 'Wrong old PIN',
    'pin.err_wrong': 'Wrong PIN',
    'pin.err_too_short': 'PIN must be at least 4 digits',
    'pin.err_not_set': 'PIN not set',
    'pin.err_generic': 'Operation failed',

    // Invites
    'invites.title': 'Invite via Telegram',
    'invites.hint': 'Create a link and send it to any Telegram user.',
    'invites.empty': 'No invites yet.',
    'invites.no_url': '(no URL: bot not running)',
    'invites.created_at': 'Created: {date}',
    'invites.copy': 'Copy',
    'invites.share': 'Share',
    'invites.revoke_title': 'Revoke',
    'invites.revoke_confirm': 'Revoke this invite? The link will stop working.',
    'invites.copied': 'Link copied',
    'invites.create': 'Create invite link',
    'invites.share_msg': 'Invitation to Happy Kids: confirm my child\'s task completion',
    'invites.validator_title': 'Invite a validator',
    'invites.validator_hint': 'By opening this link, the Telegram user becomes a validator in your family — they can confirm task completion. The link is permanent and reusable.',
    'invites.admin_title': 'Invite an admin',
    'invites.admin_hint': 'By opening this link, the Telegram user gets admin rights — they can fully manage kids, tasks and rewards. The link is permanent and reusable.',
    'invites.admin_share_msg': 'Invitation to Happy Kids: manage our child\'s tasks and rewards',
    'invites.create_validator': 'Create validator invite link',
    'invites.create_admin': 'Create admin invite link',

    // Validators / Users
    'validators.add_title': 'Add user by login and password',
    'validators.add_hint': 'Alternative to Telegram invite: create an account with a login/password. Suitable for users who sign in from a browser.',
    'validators.login_placeholder': 'Username',
    'validators.password_placeholder': 'Password',
    'validators.add': 'Add',
    'validators.role_validator': 'Validator',
    'validators.role_admin': 'Admin',
    'validators.list_title': 'Validators',
    'validators.empty': 'No validators yet.',
    'validators.admins_section': 'Admins',
    'validators.admins_empty': 'No admins yet.',
    'validators.tg_guest': 'Guest via Telegram',
    'validators.tg_linked': 'Telegram linked',
    'validators.tg_not_linked': 'Telegram not linked',
    'validators.change_password_title': 'Change password',
    'validators.change_password_prompt': 'New password for {name}:',
    'validators.password_changed': 'Password changed',
    'validators.revoke_title': 'Revoke access',
    'validators.delete_title': 'Delete',
    'validators.revoke_confirm': 'Revoke access for {name}?',
    'validators.delete_confirm': 'Delete {name}?',

    // Telegram block
    'telegram.title': 'Telegram',
    'telegram.already_linked': 'Account already linked to Telegram.',
    'telegram.open_in_tg': 'Open the app in Telegram to link your account.',
    'telegram.linked_success': '✅ Account linked. Next time you\'ll sign in automatically.',
    'telegram.link_hint': 'Link this account to Telegram to sign in without a password.',
    'telegram.link_btn': 'Link Telegram',
    'telegram.link_ok': 'Telegram linked successfully',
    'telegram.link_err': 'Failed to link. This Telegram account may already be bound to another account.',

    // Family switcher
    'family.my': 'My family',
    'family.validator_suffix': ' (Validator)',
    'family.admin_suffix': ' (Admin)',

    // Pending tasks
    'pending.title': 'Pending review',
    'pending.logout': 'Log out',
    'pending.empty': 'No tasks pending confirmation. Take a break! ✨',
    'pending.approve': 'Approve',
    'pending.reject': 'Reject',

    // Setup family
    'setup.title': 'What is your family name?',
    'setup.hint': 'Invited validators will see this name. You can change it later in Settings.',
    'setup.placeholder': 'Enter family name',
    'setup.submit': 'Continue',
    'setup.error': 'Failed to save',

    // Misc
    'invite.redeem_error': 'Failed to accept invite: ',
    'photo.read_error': 'Failed to read the file',
    'photo.load_error': 'Failed to load the image',

    // Language setting (in General settings)
    'lang.section_title': 'Language',
    'lang.label_ru': 'Русский',
    'lang.label_en': 'English',

    // Language toggle (shows the language you will SWITCH TO)
    'lang.toggle': 'RU',
  },
};

// Current language: read from localStorage, default to 'en'.
// app.js overrides this with the Telegram language if no saved preference exists.
let _lang = (localStorage.getItem('lang') === 'ru') ? 'ru' : 'en';

/**
 * Get a translation for key. Array values (e.g. cal.dow_short) are returned as-is.
 * Falls back to English, then to the bare key string.
 */
function t(key) {
  const dict = TRANSLATIONS[_lang] || TRANSLATIONS.en;
  const val = (dict && dict[key] !== undefined) ? dict[key] : (TRANSLATIONS.en[key] !== undefined ? TRANSLATIONS.en[key] : key);
  return val;
}

function getLang() { return _lang; }

function setLang(lang) {
  _lang = (lang === 'ru' || lang === 'en') ? lang : 'en';
  localStorage.setItem('lang', _lang);
}
