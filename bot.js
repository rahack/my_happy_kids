const { Telegraf, Markup } = require('telegraf');

async function startBot() {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) {
    console.warn('[bot] TELEGRAM_TOKEN is not set; bot is disabled');
    return;
  }

  const bot = new Telegraf(token);

  // Read WEBAPP_URL dynamically each time, so a tunnel that comes up after
  // the bot has launched can still be picked up.
  const getWebAppUrl = () => process.env.WEBAPP_URL || '';

  bot.start(async (ctx) => {
    const webAppUrl = getWebAppUrl();
    // Always remove any leftover reply keyboard from previous sessions —
    // we use the Menu Button (left of input) as the primary entry point now.
    if (webAppUrl) {
      await ctx.reply(
        'Привет! Это панель администратора Happy Kids. Откройте Mini App кнопкой «Открыть» слева от поля ввода (или /open).',
        Markup.removeKeyboard()
      );
    } else {
      await ctx.reply(
        'Бот запущен, но публичный URL ещё не получен. Подождите пару секунд и пришлите /start снова, либо задайте WEBAPP_URL в .env.',
        Markup.removeKeyboard()
      );
    }
  });

  bot.command('open', async (ctx) => {
    const webAppUrl = getWebAppUrl();
    if (!webAppUrl) return ctx.reply('Публичный URL ещё не готов. Попробуйте через несколько секунд.');
    await ctx.reply(
      'Открыть админку:',
      Markup.inlineKeyboard([[Markup.button.webApp('Открыть', webAppUrl)]])
    );
  });

  console.log('[bot] starting...');
  bot.launch().catch(err => console.error('[bot] runtime error:', err.message));
  bot.telegram.getMe().then(me => {
    console.log(`[bot] @${me.username} ready`);
  }).catch(err => {
    console.error('[bot] getMe failed (token invalid?):', err.message);
  });

  // Configure the global Menu Button (the one to the LEFT of the input field).
  // Append a cache-busting query so Telegram treats every server restart as
  // a fresh URL and reloads the Mini App instead of serving a stale copy.
  const initialUrl = getWebAppUrl();
  if (initialUrl) {
    const cacheBustedUrl = initialUrl + (initialUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
    bot.telegram.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: 'Открыть',
        web_app: { url: cacheBustedUrl }
      }
    }).then(() => {
      console.log(`[bot] menu button set → ${cacheBustedUrl}`);
    }).catch(err => {
      console.error('[bot] setChatMenuButton failed:', err.message);
    });
  } else {
    console.warn('[bot] WEBAPP_URL not set; menu button not configured');
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = { startBot };
