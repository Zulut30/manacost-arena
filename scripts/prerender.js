import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

const SITE_URL = 'https://manacost-arena.vercel.app';

const PAGES = {
  '/': {
    title: 'HS-Arena — Тир-лист и Винрейты для Арены Hearthstone',
    description: 'Актуальная статистика Арены Hearthstone: тир-лист карт по классам, винрейты, легендарные группы. Данные обновляются автоматически 4 раза в сутки.',
    h1: 'HS-Arena — Статистика Арены Hearthstone',
    canonical: '/',
    ogType: 'website',
    structuredData: [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        "url": SITE_URL,
        "name": "Manacost Arena",
        "description": "Актуальная статистика режима Арена в Hearthstone",
        "inLanguage": "ru",
        "publisher": {
          "@type": "Organization",
          "name": "Manacost",
          "url": "https://t.me/manacost_ru",
          "logo": { "@type": "ImageObject", "url": `${SITE_URL}/assets/arena_icon.webp` }
        }
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        "name": "Manacost Arena",
        "url": SITE_URL,
        "description": "Актуальная статистика режима Арена в Hearthstone: тир-лист карт по классам, винрейты, легендарные группы.",
        "applicationCategory": "GameApplication",
        "operatingSystem": "Web",
        "inLanguage": "ru",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "RUB" },
        "featureList": [
          "Тир-лист карт Арены Hearthstone по всем классам",
          "Винрейты классов с актуального патча",
          "Группы легендарных карт для первого выбора",
          "Автоматическое обновление данных 4 раза в сутки"
        ]
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Какой класс лучший на Арене Hearthstone?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Актуальные винрейты всех классов обновляются автоматически на странице «Классы». Данные берутся с миллионов реальных Арена-партий."
            }
          },
          {
            "@type": "Question",
            "name": "Как пользоваться тир-листом карт для Арены?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Выберите класс в шапке тир-листа, затем используйте поиск и фильтр по редкости. Карты ранжированы от S (авто-пик) до F (не брать никогда)."
            }
          },
          {
            "@type": "Question",
            "name": "Как выбрать легендарку на Арене Hearthstone?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "На вкладке «Легендарки» показаны все возможные группы первого выбора с процентом побед. Выбирайте группу с наибольшим винрейтом для вашего класса."
            }
          },
          {
            "@type": "Question",
            "name": "Как часто обновляются данные Арены?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Данные обновляются автоматически 4 раза в сутки: в 00:15, 06:15, 12:15 и 18:15 UTC."
            }
          }
        ]
      }
    ],
    noscript: `
      <h1>HS-Arena — Статистика Арены Hearthstone</h1>
      <p>Актуальная статистика режима Арена в Hearthstone: тир-лист карт, винрейты классов, легендарные группы.</p>
      <ul>
        <li><a href="/classes">Винрейты классов</a> — рейтинг классов на Арене</li>
        <li><a href="/tierlist">Тир-лист карт</a> — оценки карт от S до F по классам</li>
        <li><a href="/legendaries">Легендарные группы</a> — лучшие легендарки для первого выбора</li>
        <li><a href="/articles">Статьи и гайды</a> — разборы и советы по Арене</li>
      </ul>`
  },
  '/classes': {
    title: 'Винрейт классов — Арена Hearthstone | HS-Arena',
    description: 'Актуальные винрейты всех 11 классов в режиме Арена Hearthstone. Рейтинг на основе миллионов партий с HSReplay и Firestone, обновляется автоматически 4 раза в сутки.',
    h1: 'Винрейт классов на Арене Hearthstone',
    canonical: '/classes',
    ogType: 'website',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Классы", "item": `${SITE_URL}/classes` }
        ]
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}/classes#dataset`,
        "name": "Винрейт классов Арены Hearthstone",
        "description": "Актуальные винрейты 11 классов в режиме Арена Hearthstone на основе данных HSReplay и Firestone.",
        "url": `${SITE_URL}/classes`,
        "creator": { "@type": "Organization", "name": "Manacost" },
        "temporalCoverage": "P7D",
        "about": {
          "@type": "VideoGame",
          "name": "Hearthstone",
          "gameMode": "Arena"
        }
      }
    ],
    noscript: `
      <h1>Винрейт классов на Арене Hearthstone</h1>
      <p>Актуальные винрейты всех 11 классов в режиме Арена. Данные с HSReplay и Firestone обновляются автоматически 4 раза в сутки.</p>
      <p>Классы: Рыцарь смерти, Паладин, Шаман, Охотник, Маг, Разбойник, Чернокнижник, Друид, Воин, Жрец, Охотник на демонов.</p>
      <p><a href="/">На главную</a> | <a href="/tierlist">Тир-лист карт</a> | <a href="/legendaries">Легендарки</a></p>`
  },
  '/tierlist': {
    title: 'Тир-лист карт — Арена Hearthstone | HS-Arena',
    description: 'Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S (авто-пик) до F. Данные с HearthArena и HSReplay.',
    canonical: '/tierlist',
    ogType: 'website',
    h1: 'Тир-лист карт Арены Hearthstone',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Тир-лист", "item": `${SITE_URL}/tierlist` }
        ]
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}/tierlist#tierlist`,
        "name": "Тир-лист карт Арены Hearthstone",
        "description": "Оценки карт для режима Арена Hearthstone по всем классам от S до F.",
        "numberOfItems": 500,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Тир S — Отлично (авто-пик)", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 2, "name": "Тир A — Хорошо", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 3, "name": "Тир B — Выше среднего", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 4, "name": "Тир C — Средне", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 5, "name": "Тир D — Ниже среднего", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 6, "name": "Тир E — Плохо", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 7, "name": "Тир F — Ужасно", "url": `${SITE_URL}/tierlist` }
        ]
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}/tierlist#dataset`,
        "name": "Тир-лист карт Арены Hearthstone",
        "description": "Полный тир-лист карт для каждого класса в режиме Арена Hearthstone с оценками от S до F.",
        "url": `${SITE_URL}/tierlist`,
        "creator": { "@type": "Organization", "name": "Manacost" },
        "about": {
          "@type": "VideoGame",
          "name": "Hearthstone",
          "gameMode": "Arena"
        }
      }
    ],
    noscript: `
      <h1>Тир-лист карт Арены Hearthstone</h1>
      <p>Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S (авто-пик) до F.</p>
      <p>Классы: Рыцарь смерти, Охотник на демонов, Друид, Охотник, Маг, Паладин, Жрец, Разбойник, Шаман, Чернокнижник, Воин, Нейтральные.</p>
      <p>Тиры: S — Отлично, A — Хорошо, B — Выше среднего, C — Средне, D — Ниже среднего, E — Плохо, F — Ужасно.</p>
      <p>Данные обновляются автоматически с HearthArena и HSReplay.</p>
      <p><a href="/">На главную</a> | <a href="/classes">Винрейты классов</a> | <a href="/legendaries">Легендарки</a></p>`
  },
  '/legendaries': {
    title: 'Легендарки на Арене Hearthstone — Лучшие группы | HS-Arena',
    description: 'Какую легендарную карту выбрать на Арене? Все группы первого выбора с процентом побед для каждого класса. Обновляется автоматически с Manacost.',
    canonical: '/legendaries',
    ogType: 'website',
    h1: 'Легендарные карты на Арене Hearthstone',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Легендарки", "item": `${SITE_URL}/legendaries` }
        ]
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}/legendaries#legendaries`,
        "name": "Легендарные группы для Арены Hearthstone",
        "description": "Наборы карт для выбора первой легендарки на Арене Hearthstone с винрейтом каждой группы.",
        "numberOfItems": 30,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Группы легендарных карт — Рыцарь смерти", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 2, "name": "Группы легендарных карт — Паладин", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 3, "name": "Группы легендарных карт — Шаман", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 4, "name": "Группы легендарных карт — Охотник", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 5, "name": "Группы легендарных карт — Маг", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 6, "name": "Группы легендарных карт — Разбойник", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 7, "name": "Группы легендарных карт — Чернокнижник", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 8, "name": "Группы легендарных карт — Друид", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 9, "name": "Группы легендарных карт — Воин", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 10, "name": "Группы легендарных карт — Жрец", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 11, "name": "Группы легендарных карт — Охотник на демонов", "url": `${SITE_URL}/legendaries` }
        ]
      }
    ],
    noscript: `
      <h1>Легендарные карты на Арене Hearthstone</h1>
      <p>Все группы первого выбора легендарных карт на Арене с винрейтом. Выбирайте группу с наибольшим процентом побед для вашего класса.</p>
      <p>Данные обновляются автоматически с Manacost.ru.</p>
      <p><a href="/">На главную</a> | <a href="/tierlist">Тир-лист карт</a> | <a href="/classes">Винрейты классов</a></p>`
  },
  '/articles': {
    title: 'Статьи и гайды по Арене Hearthstone | HS-Arena',
    description: 'Гайды, разборы мета и советы по режиму Арена в Hearthstone от команды Manacost. Актуальные статьи для игроков всех уровней.',
    canonical: '/articles',
    ogType: 'website',
    h1: 'Статьи и гайды по Арене Hearthstone',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Статьи", "item": `${SITE_URL}/articles` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/articles#collection`,
        "name": "Статьи и гайды по Арене Hearthstone",
        "description": "Гайды, разборы и советы по режиму Арена в Hearthstone от команды Manacost.",
        "url": `${SITE_URL}/articles`
      }
    ],
    noscript: `
      <h1>Статьи и гайды по Арене Hearthstone</h1>
      <p>Гайды, разборы мета и советы по режиму Арена от команды Manacost.</p>
      <p><a href="/">На главную</a> | <a href="/tierlist">Тир-лист карт</a> | <a href="/classes">Винрейты классов</a></p>`
  },
  '/jobs': {
    title: 'Вакансии — Работа автором | HS-Arena',
    description: 'Открытые вакансии авторов по Арене и Полям Сражений Hearthstone. Присоединяйтесь к команде Manacost и создавайте контент для сообщества.',
    canonical: '/jobs',
    ogType: 'website',
    h1: 'Вакансии в команде Manacost',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Работа", "item": `${SITE_URL}/jobs` }
        ]
      },
      {
        "@type": "JobPosting",
        "@id": `${SITE_URL}/jobs#arena-author`,
        "title": "Автор по режиму Арена",
        "description": "Ищем автора для создания контента по режиму Арена в Hearthstone.",
        "hiringOrganization": { "@type": "Organization", "name": "Manacost", "sameAs": "https://t.me/manacost_ru" },
        "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressCountry": "RU" } },
        "employmentType": "CONTRACT",
        "url": `${SITE_URL}/jobs`
      },
      {
        "@type": "JobPosting",
        "@id": `${SITE_URL}/jobs#battlegrounds-author`,
        "title": "Автор по режиму Поля Сражений",
        "description": "Ищем автора для создания контента по режиму Поля Сражений в Hearthstone.",
        "hiringOrganization": { "@type": "Organization", "name": "Manacost", "sameAs": "https://t.me/manacost_ru" },
        "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressCountry": "RU" } },
        "employmentType": "CONTRACT",
        "url": `${SITE_URL}/jobs`
      }
    ],
    noscript: `
      <h1>Вакансии в команде Manacost</h1>
      <p>Открытые вакансии авторов по Арене и Полям Сражений Hearthstone.</p>
      <h2>Автор по режиму Арена</h2>
      <p>Требуется стабильный результат 5-7 побед, знание кривой маны, умение объяснять логику выбора карт.</p>
      <h2>Автор по режиму Поля Сражений</h2>
      <p>Требуется MMR 8000+, знание всех архетипов, умение адаптироваться к сезонным механикам.</p>
      <p><a href="/">На главную</a></p>`
  }
};

function generatePageHtml(baseHtml, pageData, path) {
  const { title, description, canonical, ogType, structuredData, noscript, h1 } = pageData;
  const fullCanonical = `${SITE_URL}${canonical}`;
  const ogImage = `${SITE_URL}/assets/og-preview.png`;

  const sdJson = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": structuredData
  });

  let html = baseHtml;

  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${title}</title>`
  );

  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${description}"`
  );

  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${fullCanonical}"`
  );

  html = html.replace(
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${fullCanonical}"`
  );

  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${title}"`
  );

  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${description}"`
  );

  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${title}"`
  );

  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${description}"`
  );

  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n    ${sdJson}\n    </script>`
  );

  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><noscript>${noscript}</noscript></div>`
  );

  return html;
}

function main() {
  const distDir = resolve(process.cwd(), 'dist');

  if (!existsSync(distDir)) {
    console.error('[prerender] dist/ not found. Run "vite build" first.');
    process.exit(1);
  }

  const indexPath = resolve(distDir, 'index.html');
  const baseHtml = readFileSync(indexPath, 'utf-8');

  const today = new Date().toISOString().split('T')[0];

  console.log('[prerender] Generating per-route HTML...');

  for (const [path, pageData] of Object.entries(PAGES)) {
    const routeDir = path === '/' ? distDir : resolve(distDir, path.slice(1));
    const filePath = resolve(routeDir, 'index.html');

    if (!existsSync(routeDir)) {
      mkdirSync(routeDir, { recursive: true });
    }

    const pageHtml = generatePageHtml(baseHtml, pageData, path);
    writeFileSync(filePath, pageHtml, 'utf-8');
    console.log(`[prerender] ✓ ${path} → ${filePath}`);
  }

  const sitemapPath = resolve(distDir, 'sitemap.xml');
  if (existsSync(sitemapPath)) {
    let sitemap = readFileSync(sitemapPath, 'utf-8');
    sitemap = sitemap.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${today}</lastmod>`);
    if (!sitemap.includes('<lastmod>')) {
      sitemap = sitemap.replace(/<\/url>/g, `</url>`); // already has lastmod from source
    }
    writeFileSync(sitemapPath, sitemap, 'utf-8');
    console.log('[prerender] ✓ Updated sitemap.xml lastmod dates');
  }

  console.log('[prerender] Done! All routes pre-rendered.');
}

main();
