# HearthPulse Changelog

## Unreleased

- В личном кабинете способы проверки подписки собраны в понятный вертикальный
  список с активным состоянием и адаптацией для мобильных экранов; выход из
  аккаунта вынесен в отдельную безопасную строку.

- Добавлена OAuth-привязка Patreon в профиле и серверная проверка активного
  уровня «Алмаз» или выше. Токены Patreon шифруются в базе; подписки на чужие
  кампании доступа не дают.

- Страница входа теперь имеет собственный пергаментный фон и цветовой запасной
  вариант: при задержке или ошибке загрузки общего оформления вокруг формы не
  появляется белый фон браузера.

- Sitemap HearthPulse теперь публикует отдельные проверяемые сегменты для
  Standard-карт, уникальных Wild-карт, существ и заклинаний Полей сражений
  (включая архив), а также героев. Каждая включённая карточка получает
  серверные title, description, canonical, Open Graph, WebPage/CreativeWork/
  BreadcrumbList и обычные ссылки на библиотеку и соответствующий тир-лист;
  production-monitor проверяет все сегменты и репрезентативные detail pages.

- Поисковые посадочные HearthPulse разведены по отдельным интентам: тир-лист
  Арены, тир-лист БГ со стратегиями, конструктор стратегий БГ и мета
  Hearthstone по данным HSGuru получили согласованные заголовки, полезные
  пояснения, честную структурированную разметку и описательные внутренние
  ссылки без новых дублирующих URL.

- Адаптивные баннеры разделов теперь используют один общий `h1` вместо двух
  скрываемых CSS-копий, поэтому поисковые роботы и экранные дикторы получают
  однозначную структуру заголовка на desktop и mobile.

- Публичные обложки статей, изображения карт и same-origin media теперь
  доступны поисковым роботам; все остальные API остаются закрытыми от обхода и
  получают серверный `noindex, nofollow`.

- Канонический edge `hearthpulse.net` больше не добавляет общий `no-store` ко
  всем ответам: публичные и immutable-ресурсы сохраняют политику приложения,
  при этом proxy-cache по-прежнему всегда обходится.

- Удалён чужой bare-домен `manacost.ru` из доверенных источников обложек,
  начальных подписей данных и генератора социальных изображений; legacy-домены
  экосистемы HearthPulse продолжают работать на время миграции.

- Добавлен read-only production observer: он обходит все зарегистрированные
  публичные страницы, в реальном Chromium проверяет отображение библиотек,
  тир-листов, статей, формы входа и paywall, поддерживает закрытый профиль с
  синтетической сессией и сохраняет очищенные JSONL/JSON-логи и публичные
  диагностические скриншоты без секретов и пользовательских данных. Гостевой
  запуск изолирован от секрета сессии, произвольные браузерные ошибки не
  копируются в отчёты, а проверка авторизации и переходы между доменами
  ограничены безопасными таймаутами и проверкой origin.

- Машиночитаемый архитектурный каталог теперь описывает первые шесть legacy-зон:
  отдельно фиксирует владельца физического файла и владельца маршрута, проверяет
  конфликты, показывает целевой модуль и минимальный набор тестов без изменения
  runtime-поведения.

- Добавлена компактная карта проекта для AI-агентов и новых участников:
  канонические имя HearthPulse и домен `hearthpulse.net`, точки входа,
  модульные границы, команды поиска владельца и проверки теперь защищены
  контрактными тестами без изменения runtime-поведения.

- Для HSReplay стратегий сохранены безопасные признаки публикации и свежести в
  HeartPulse API; LKG/unknown/non-stable/future снимки теперь получают честный
  `stale`/`LKG`, а не маскируются свежей датой загрузки.
- Обновлены `browserslist`, `sanitize-html`, `fast-uri` и `qs` до исправленных
  совместимых версий; проверки npm и OSV больше не находят известных
  High/Medium уязвимостей.
- Заголовки разделов общего подвала переведены на последовательный уровень
  `h2`, чтобы экранные дикторы получали корректную структуру каждой страницы.
- Увеличены до 44 px зоны нажатия в фильтрах библиотеки Полей сражений и в
  поиске, тегах и голосовании раздела статей; полный responsive-ratchet теперь
  сокращает накопленный mobile touch-долг без ослабления лимитов.
- Добавлен контракт аудита стратегий Battlegrounds для агента «Контроль
  HearthPulse»: снимок HSReplay со всеми стратегиями в D без метрик теперь
  отклоняется до публикации.
- Публичный маршрут с авторизацией теперь отмечается как `access_protected`,
  чтобы агент не принимал гостевой ответ 401/403 за поломку данных или UI.
- Исправлен путь HSReplay стратегий: HeartPulse получает опубликованный каталог
  напрямую из `api.kolodahearthstone.com`, сохраняет исходные S/A/B-тиры и карты,
  а устаревший legacy-кэш больше не подменяет данные снимком «всё в D».

- Added a deterministic local clean-code gate for authored TypeScript and TSX:
  new files have a hard size limit, 77 legacy files have exact non-growing
  ceilings, and existing source/function debt budgets are reused. Full,
  changed, module, report and reduction-only baseline modes have behavioral
  tests; only the changed-file mode is release-blocking in this first slice.
- Started the modular-monolith safety program with repository-wide test
  discovery, checked HTTP and module catalogs, and ratchets for dependency,
  source-debt and oversized-function growth.
- Added bounded process shutdown for HTTP traffic and the subscription refresh
  job; shutdown now gates new subscription callbacks, drains the active refresh
  without overlap, preserves the lifecycle deadline and propagates cron stop
  failures. Rejected ecosystem route promises reach Express error handling, and
  the application-connect request/validation boundary lives in its owning
  frontend module without changing public URLs or authorization behavior.
- Repaired the license-broken Gitleaks CI job by reusing the repository's
  pinned, redacting scanner. The production scraper now uses `puppeteer-core`
  with the host Chrome while full Puppeteer stays QA-only. Runtime compatibility
  now comes from sequential candidate launch and a real browser smoke instead
  of an exact-major pin, and a clean production-only install/import/browser
  smoke guards the release graph. The
  deploy pre-switch imports the built scraper and performs a bounded local-page
  browser smoke as the service user, and every third-party Action in the
  production runner job is pinned to an immutable SHA.
- Made deploy validation portable across GitHub's Node toolcache, added a
  fail-closed privileged deployer capability manifest and verified installer,
  then bound that manifest to the selected deployer's path, reported version,
  SHA-256 checksum and actual capability output so partial upgrades and
  rollbacks fail before deployment. Synchronized the scraper service and
  pre-switch browser configuration, and used Puppeteer's downloaded browser
  for manual diagnostics.
- Replaced brittle triple-click clearing in authenticated browser QA with
  explicit cross-platform keyboard selection for React-controlled inputs.
- Made full browser QA a production deployment gate and added exact-SHA
  post-deploy verification under the deployment lock, while reporting dataset
  freshness separately so honest LKG degradation cannot masquerade as green or
  trigger a frontend rollback by itself.
- Corrected the visible Russian mini-set label to «В розыске» while keeping
  the stable `most_wanted` API identifier unchanged.
- Added HSGuru's active «Azeroth's Most Wanted» mini-set window to Standard
  and Wild meta filters, made it the default fresh slice independently of the
  latest numbered patch, and retained strict runtime validation plus legacy
  fallback for older parser responses.
- Migrated the existing Plausible site records to `hearthpulse.net` and
  `kolodahearthstone.com` without changing their site IDs, preserving
  historical analytics, goals and access while new visits use the canonical
  domains.
- Switched HearthPulse article, VIP, analytics and network links to
  `kolodahearthstone.com`, while retaining `.ru` as an accepted compatibility
  source for previously saved article and image URLs. Legacy article URLs
  returned by the API are now canonicalized to `.com` without changing their
  path, query, or fragment.
- Pointed the scheduled production monitor, GitHub production environment and
  new bug-report links at the canonical `hearthpulse.net` host.

- Completed the full Arena cutover to `hearthpulse.net`: switched canonical,
  sitemap, structured data, OAuth URLs and the public image CDN; added
  path-preserving legacy application/CDN redirects and upgraded the five-minute
  monitor to verify Limburg, Moscow and Novosibirsk independently.

- Started the reversible Arena domain migration: added noindex shadow hosts for
  `hearthpulse.net` and its public-only CDN, packaged their Nginx contracts in
  releases, and added a strict apex/www/CDN DNS/TLS/privacy monitor running
  every five minutes plus a TTL-safe rollback runbook, without changing the
  existing canonical domain or production traffic.

- Cleaned up the repository root without touching runtime behavior: removed the
  dead Vercel serverless layer (ten `api/*.js` functions, `vercel.json` and the
  `@vercel/blob` dependency) that production has not used since the move to
  Nginx and systemd, and deleted seven stale asset directories whose files were
  already served from `public/`. The rebuilt `dist` is byte-identical before and
  after, so no public URL, asset or page changed.
- Retired the duplicate root `Design.md` into `docs/design/`, so the repository
  no longer carries two files whose names differ only by case and can be cloned
  on case-insensitive filesystems.
- Canonicalized the repository URLs in the README badges, `CONTRIBUTING.md`,
  `LICENSE` and the issue template after the move to `Manacost-Labs/HeartPulse`,
  and pointed the post-push review hook at the current repository so it keeps
  publishing instead of silently skipping on an unexpected origin.
- Documented the Puppeteer split: only `puppeteer-core` is a runtime dependency
  because the production service installs with `npm ci --omit=dev`; full
  Puppeteer remains development-only browser QA tooling.
- Added contributor and agent skills under `.claude/skills/` that encode the
  existing `app -> modules -> shared` contract from ADR 002, so future work
  follows the accepted module boundaries instead of rediscovering them.

- Rebuilt the administrator workspace shell with an original TailAdmin-inspired
  React layout: a clean command header, grouped navigation, consistent cards,
  responsive drawer and accessible status states, while preserving all access,
  URL, focus-management and section workflows; its assets now load only inside
  the authenticated admin workspace, making the public contests route lighter.

- Prevented the Limburg edge cache from exhausting its disk, bounded all
  regional caches with an absolute free-space reserve, added rollback-release
  retention, and made the dedicated CDN host compress frontend assets in
  Europe as well as Russia without changing card-image quality.
- Expanded production edge monitoring to verify Limburg IPv4/IPv6, Moscow,
  Novosibirsk, Timeweb card fallback, active release parity, disk reserve,
  compressed asset integrity and the private CDN path boundary.
- Removed Timeweb's global seven-day browser-cache override so HTML, runtime
  configuration and APIs can preserve their safe origin cache policies while
  card images keep the provider edge cache and full original resolution.

- Migrated Arena datasets, Battlegrounds libraries, cosmetics and card media
  from the retiring `api.hs-manacost.ru` and `db.kolodahs.ru` hosts to the
  unified `api.kolodahearthstone.com` API, with a same-origin compatibility
  alias for historical media records.
- Synchronized both Battlegrounds builders with the current live hero pool,
  including Nightmare Lord Xavius and Tras'tath, Soul Parasite, while retaining
  the bundled roster as an outage fallback and full-resolution hero portraits.
- Safely encoded builder image URLs so current hero portraits remain intact
  when browsing the pool or adding a card to a board.
- Prioritized the first responsive row of constructed-card thumbnails and
  deferred off-screen image URLs until they approach the viewport, cutting the
  initial catalog image burst without reducing the existing WebP resolution or
  quality and retaining the CDN-to-origin fallback.
- Aligned the Standard Meta filters and public API with the ranks that the data
  service actually supports, preventing invalid rank requests from surfacing as
  empty sections or upstream errors.
- Made archetype analysis distinguish a failed or partial HSGuru refresh from a
  first-time load, so cached data stays visible with an honest recovery status.
- Made archetype DeckView previews evict a persisted 30-day URL and request one
  fresh render after both the WebP preview and full JPEG disappear, while
  keeping the recovery bounded to prevent request loops.
- Replaced silent mulligan CSS backgrounds with lazy, dimensioned image
  elements served by Arena's resilient same-origin card tile cache, so every
  available card illustration can load and expose failures to browser tests.
- Made `cdn.arena.hs-manacost.ru` serve synchronized card images directly from
  each regional edge before Timeweb, removing the external cold-cache hop from
  constructed-card catalog loads.
- Rebuilt edge card-image publication as an atomic generation and made the
  sync skip path verify raw/served counts plus manifest freshness, preventing
  newly generated cards from remaining outside the fast local mirror.
- Added release, Nginx and publication regression contracts plus an operations
  runbook for local-first card delivery, verification and rollback.
- Restored true Battlegrounds hero portraits for the complete hero tier list:
  verified stats/library portraits now take precedence over the generic card
  cache, which renders several legacy hero IDs as hero-power card frames.
- Added regression coverage for both current `BG36_HERO_*` and legacy
  `TB_BaconShop_HERO_*` identifiers and audited all 116 current hero portrait
  URLs through Arena's same-origin media proxy.
- Made constructed-card details, related cards and generated pools prefer the
  canonical Hearthstone card ID over DBF for image delivery, restoring event
  card renders that are present in HearthstoneJSON but absent from Blizzard's
  DBF image catalog.
- Restored patch 36.2 event cards while Blizzard's Game Data API is lagging,
  using a strict August 4–25 HearthstoneJSON fallback for Watfin, Soul
  Immolation and Desperate Bribe in Standard and Wild.
- Added wiki-card and full-art fallbacks to the local card image pipeline so
  newly released Battlegrounds heroes no longer cache a “Нет изображения”
  placeholder while localized HearthstoneJSON renders are still unavailable.
- Made Battlegrounds hero grids and tables prefer Arena's verified same-origin
  card image cache, preventing new heroes from rendering as broken images when
  an upstream image URL is stale or blocked.
- Reduced the trinket hover preview to 320px and the click lightbox to a 672px frame with a 288px card render.
- Added pick rate, average placement and the 1–8 placement histogram to every trinket gallery card, and reduced the trinket hover preview and lightbox footprint.
- Refined the Battlegrounds trinket tier list with white costs, darkened full-art row backdrops, large card-only transparent tooltips, and a shareable table/gallery switch using the supplied Hearthstone controls.
- Routed trinket full art and localized transparent card renders through Arena's same-origin media proxy so the new views remain reliable in restricted networks.
- Prepared the constructed-card catalog, related cards and lightbox for the
  self-hosted `cdn.arena.hs-manacost.ru` delivery endpoint with a deploy-safe
  runtime switch, strict origin allow-list and automatic same-origin retry.
- Kept full-quality downloads on the application origin so browser downloads
  remain reliable while normal card rendering can use the CDN.
- Routed generated Deckview images through Arena's same-origin cached media
  boundary, so Fun Deck galleries also load where `api.blizzcore.ru` is
  unavailable to the visitor, including affected users in Russia.
- Added immutable 720px WebP derivatives for Deckview galleries while keeping
  the full JPEG for the lightbox, reducing measured catalog image transfer by
  about 92% on the canonical 30- and 40-card Reno fixtures.
- Coalesced duplicate deck renders, limited the browser to three concurrent
  requests, and added a two-worker background prewarmer with a persisted image
  manifest so cold Fun Deck galleries progressively become instant warm loads.
- Exposed preview-prewarm queue telemetry in Standard operations and retained
  the existing card-list fallback for real render or delivery failures.
- Bounded failed preview and full-image delivery retries, preventing a network
  outage from turning three gallery cards into an unbounded request storm.
- Made Deckview previews recover automatically from short-lived render API and
  generated-image delivery failures, so individual Fun Decks no longer remain
  stuck on the fallback card list after a cold render.
- Changed the Fun Decks desktop gallery from six narrow cards to three readable
  deck cards per row, while retaining two-column tablet and one-column mobile
  layouts.
- Restored a persistent “Скопировать код колоды” action below every Fun Deck
  preview, including successfully rendered Deckview images and clipboard
  success feedback.
- Replaced the brief fallback-card-list flash in Deckview galleries with a
  stable parchment-sized loading surface; the list now appears only after a
  real render error, so newly revealed decks no longer jump while loading.
- Fixed intermittent full-page React recovery screens after deployments by
  baking the Git SHA into the Vite entry chunk instead of query-versioning the
  module URL, which could make browsers evaluate the entry module twice.
- Restored a persistent “Скопировать код колоды” action below every rendered
  archetype deck, including clipboard success feedback and mobile-sized targets.
- Added a read-only data monitoring card to the parser admin panel with an
  overall health state, source freshness, stable-fallback visibility, bounded
  error details, manual refresh and visibility-aware 60-second auto-refresh.
- Removed the duplicated deck-builder and HSGuru action footer from rendered
  archetype decks and made each parchment preview open in an accessible,
  full-viewport lightbox with keyboard and focus restoration support.
- Limited constructed-card catalog pagination to a small worker pool. The
  large Wild catalog no longer bursts every page at `db.kolodahs.ru` at once
  and is less likely to fall back to LKG during a cache refresh.
- Extended `/health/data` and `/api/health/data` with the cached aggregate
  health of all `api.hs-manacost.ru` parser datasets, including stale and
  failed source names, without adding upstream latency to visitor requests.
- Kept the upstream parser monitor outside the process-readiness gate so a
  cold-start health probe cannot block a validated Arena release.

## v1.0.105 - 2026-08-01

- Applied the `25px` compact HSReplay-derived deck row profile to every
  non-interactive `DeckListView`, including archetype galleries and details,
  Standard meta composition and constructed-card deck details.
- Centralized the 90% right-anchored artwork crop and compact fade so pale
  source-tile edges cannot reappear when new read-only deck lists are added.
- Kept interactive deck-builder rows at `44px` and added archetype browser
  coverage for row, mana block, artwork offset and minimum artwork coverage.

## v1.0.104 - 2026-08-01

- Reduced complete Fun Deck rows from `29px` to `25px`, including proportional
  mana, count and typography sizing.
- Removed the pale transition strips exposed by HearthstoneJSON tile images:
  compact art now covers 90% of its frame, placing the source image's light
  left edge safely beneath the opaque part of the HSReplay fade.
- Added browser coverage for the denser row height and minimum artwork coverage.

## v1.0.103 - 2026-08-01

- Restored every main-deck and sideboard row in Fun Decks while keeping the
  six-column desktop comparison grid and removing the reveal control.
- Added a Fun Decks-only compact profile with `29px` rows, a proportional mana
  and count scale, a narrow header and footer, and a smooth narrow-card artwork
  fade modelled on the supplied HSGuru reference.
- Added browser assertions for complete 17-row fixture decks, sideboards, row
  density, card height, six-column layout and narrow-screen overflow.

## v1.0.102 - 2026-08-01

- Arranged Fun Decks in a six-column wide-screen comparison grid with
  responsive four-, three-, two- and one-column fallbacks.
- Kept each Fun Deck card to five composition rows and removed its full-deck
  reveal control so the gallery stays compact.

## v1.0.101 - 2026-08-01

- Limited side-by-side archetype builds and fan-deck cards to five visible card
  rows by default, with an accessible `44px` control that expands and collapses
  the complete composition while keeping the copy action available.
- Changed the default Fun Decks order to recently added first, retained
  fun-score sorting as an explicit option, and added a “Новая” badge for decks
  first observed within 72 hours of the dataset refresh. The page header now
  exposes the dataset's exact refresh time.
- Fixed the guest preview so its three cards follow the selected order instead
  of always hiding fresh additions behind the highest historical fun scores.
- Added browser coverage for five-row expansion, freshness ordering, the sort
  control and the guest/mobile layouts.

## v1.0.100 - 2026-08-01

- Added a proportional compact scale for side-by-side archetype builds: card
  rows and rarity blocks are now `40px`, count blocks are `30px`, artwork uses
  a `27px` offset, and names/counts scale with the row.
- Reduced the embedded deck header and body spacing while retaining `44px`
  footer actions, the HSReplay rarity palette and the original artwork fade.
- Kept standalone deck presentations at the source geometry and expanded the
  desktop/mobile browser assertions for the gallery-specific scale.

## v1.0.99 - 2026-08-01

- Replaced the custom forged constructed-deck rows with the exact visual and
  markup contract from vendored `Zulut30/hsreplay-deck-view` commit
  `a2860ee286e4f85adbbaf007003bfcab23800318`.
- Restored the upstream `486×62px` desktop and `52px` mobile geometry, rarity
  colors, `65deg` artwork fade, outlined names and separate count/star block.
- Kept the deck builder at `44px` for its interactive controls while preserving
  the same HSReplay tile structure, and added browser regression coverage for
  the exact source geometry and styling.

## v1.0.98 - 2026-07-31

- Tightened read-only deck rows to `28px` on desktop and `27px` on narrow
  screens with a `1px` rhythm, reducing a 40-card list by another 15% while
  preserving card art, names and the class-tinted mana spine.
- Reduced deck-header padding and its supporting type scale without changing
  the surrounding public-page layout.
- Kept interactive builder rows and their add/remove controls at `44px` and
  updated desktop/mobile browser geometry checks.

## v1.0.97 - 2026-07-31

- Replaced the dark gutter beneath transparent mana-crystal corners with one
  continuous class-tinted mana spine that softly merges into the warm deck
  well without per-row polygons or seams.
- Reduced read-only deck rows to `32px` on desktop and `31px` on narrow screens
  with a `2px` rhythm, making long 40-card decks about 13% shorter.
- Preserved `44px` interactive builder rows and added desktop/mobile browser
  regression checks for the mana spine, compact density and touch targets.

## v1.0.90 - 2026-07-31

- Temporarily removed the `/arena/draft` page, its administrator navigation
  entry, prerender/SEO registration and dedicated nginx route. The URL now
  resolves as an unknown page with a real `404`.
- Preserved the draft recommendation model, refresh pipeline, history and
  protected admin APIs so the feature can be restored later without losing
  its accumulated data or backend integration.

## v1.0.89 - 2026-07-30

- Moved the Arena draft assistant from the admin workspace to its own
  `/arena/draft` public-shell route while keeping navigation, rendering and
  server data restricted to administrators.
- Added automatic three-card recommendations from the selected class's current
  Arena pool, including the opening Legendary phase, 30-card completion guard,
  duplicate eligibility without the constructed-style copy cap, explicit
  seasonal-rule caveats and manual replacement with the real in-game offer.
- Added deterministic base-strength, sample, curve and proven-synergy scoring
  for generated offers plus explicit current-pool and draft-rule context.

## v1.0.88 - 2026-07-30

- Added an administrator-only Arena draft workbench that compares three
  offered cards against the current deck and explains the recommendation.
- Added a persistent local draft, class and curve context, card addition,
  undo and new-draft controls, plus explicit low-data warnings.
- Added a parchment-and-timber responsive interface using only same-origin
  Arena and card assets, with a locally scrollable 390 px card rail.

## v1.0.87 - 2026-07-30

- Added an hourly and startup refresh pipeline that rebuilds the Arena draft
  model from the newest winning decks and publishes all eligible classes as
  one quality-gated atomic snapshot.
- Added administrator-only refresh status and manual-run endpoints, in-process
  overlap deduplication, bounded durable run history and safe interruption
  recovery while preserving the last-known-good model after rejected data.
- Added bounded Prometheus refresh counters, duration, freshness and
  publication-size metrics plus an operations runbook and production settings.

## v1.0.86 - 2026-07-30

- Added the administrator-only `POST /api/admin/arena-draft-advice` contract for
  same-origin application integrations, with bounded input, CSRF protection,
  cohort metadata and redacted upstream failures.
- Changed draft ranking weights by draft stage, kept early curve estimates
  close to neutral and exposed the active model weights in every result.
- Added current-cohort copy profiles and a bounded penalty only when the next
  copy exceeds the typical count observed in successful decks.

## v1.0.85 - 2026-07-30

- Added an administrator-only shadow draft advisor that ranks three offered
  Arena cards against the current deck without sending the draft to the server.
- Separated every recommendation into standalone card strength, only
  confirmed/promising pair interactions, and class-specific successful-deck
  curve fit; merely popular pairs contribute no synergy bonus.
- Added bounded current-cohort card catalogs, confidence and limitation
  explanations, equal-win-rate handling, tests, Storybook interaction coverage,
  and responsive accessibility verification.

## v1.0.84 - 2026-07-30

- Compared every Arena pair with similar same-class, same-patch control decks
  after excluding the investigated cards from deck-similarity features.
- Added conservative matched-control interaction effects and confirmed,
  promising or merely popular verdicts with player/day diversity safeguards.
- Exposed the control sample, similarity and diversity evidence in the
  administrator UI while keeping older last-known-good snapshots readable.

## v1.0.83 - 2026-07-30

- Separated individual card strength from pair interaction by comparing actual
  12-win run quality with a class-stratified, shrinkage-adjusted expectation.
- Added versioned Arena cohorts with bounded historical weighting for unchanged
  cards, automatic pool invalidation and administrator-visible patch history.
- Added upstream schema, duplication, freshness, volume and population-skew
  checks plus atomic last-known-good snapshots for safe degraded operation.

## v1.0.82 - 2026-07-30

- Rebuilt the Battlegrounds trinket tier list as a complete responsive
  statistical ledger with mirrored full art in the game frame, localized
  descriptions, pick and placement metrics, eight-place distributions,
  keyboard/hover tooltips, and no progressive `Show more` gate.
- Added the administrator-only «Сочетания в Арене» workspace with
  class-stratified lift, support thresholds and forced legendary-package
  filtering across the latest 500 twelve-win Arena runs.
- Added per-card redraft rankings for additions, discards, net copies and
  decision share, with class filtering and transparent methodology notes.
- Isolated analytics by the latest Arena-affecting patch and current card-pool
  fingerprint, with a protected no-store API, bounded upstream normalization,
  tests, Storybook states and responsive browser verification.

## v1.0.81 - 2026-07-30

- Added the complete collectible Standard and Wild card catalogs to Public API
  v1 with bounded filters, deterministic cursor pagination and conditional
  `ETag` responses.
- Added allowlisted card details, related tokens and generated-card pools;
  their images use the existing same-origin API instead of external CDN or
  wiki hosts.
- Extended the OpenAPI contract and public developer page with the card list
  and detail resources, stable error codes and catalog availability metadata.

## v1.0.80 - 2026-07-29

- Added OAuth 2.0 device authorization for Manacost Tracker: browser approval,
  short-lived access tokens, rotating refresh tokens and family-wide replay
  revocation without exposing the website password to the desktop app.
- Added `/api/v1/me` with a deliberately minimal profile and normalized
  subscription entitlements; administrative fields and raw Boosty/Telegram
  provider data stay behind dedicated allowlist serializers.
- Added the responsive `/connect` approval experience, bearer-token support for
  catalog and cached images, OpenAPI contracts, rate limits, CSRF protection,
  security tests and an architecture decision with the client threat model.

## v1.0.79 - 2026-07-29

- Added the first Public API media module: authenticated applications can fetch
  `thumb`, `full` and `tile` card renders from stable same-origin v1 URLs.
- Reused the production Blizzard-first persistent image cache, including WebP
  conversion, path containment, placeholders, validators and conditional
  `304` responses instead of adding a second media pipeline.
- Added the `images.read` API-key scope, OpenAPI contract, catalog discovery and
  negative coverage for invalid ids and under-scoped keys.

## v1.0.78 - 2026-07-29

- Added the first production slice of Manacost Public API under `/api/v1` with
  a committed OpenAPI 3.1 contract and a protected catalog manifest.
- Added administrator-issued, scoped and revocable application keys; raw
  secrets are shown once while SQLite stores only their prefix and SHA-256
  digest.
- Added a public developer documentation page, a global footer link and a
  dedicated Public API workspace in the administrator panel.
- Added route, persistence, security, UI, SEO, sitemap and Storybook coverage
  for API documentation and key lifecycle states.

## v1.0.77 - 2026-07-29

- Extracted constructed-card catalog request building, filter defaults and
  adjacent-navigation policy from the route component into a typed, directly
  testable feature model.
- Limited idle catalog warming to the adjacent period, adjacent rank and other
  format instead of fetching every combination after each filter change,
  reducing worst-case background JSON transfer by more than 60%.
- Added an incremental modularization plan and CI line-budget ratchets for the
  six largest application hotspots so future features extract focused modules
  instead of growing the existing monoliths.
- Defined one-way domain-module boundaries and an incremental extraction
  workflow so client and server monoliths are split into reviewable vertical
  slices instead of arbitrary helper files.
- Made documentation impact an enforced agent and review contract: architecture
  decisions, public specifications, operational runbooks, changelog entries and
  non-obvious code invariants now ship with the source they describe.
- Split the public gallery out of the shared Arena route bundle: gallery
  navigation now downloads about 7 kB of route JavaScript instead of the
  previous 115 kB all-in-one module, while hover and focus preloading continue
  to target its dedicated chunk.
- Reused the shared focus-trapped modal surface for gallery lightboxes so
  keyboard focus, Escape handling and scroll locking follow one tested
  implementation.
- Fixed the isolated browser-observatory job so it builds the current commit
  before starting the Vite preview instead of waiting on an absent `dist`
  directory.
- Started decomposing the server composition root by moving the protected
  ecosystem user and subscription endpoints behind a focused domain router
  with explicit authentication, serialization and persistence dependencies.
- Added direct compatibility coverage for the extracted endpoints and lowered
  the `server/index.ts` growth ratchet from 9,966 to 9,953 lines.

## v1.0.76 - 2026-07-29

- Kept card results visible while rank, period and format filters refresh,
  cached recent filter responses in memory and warmed adjacent filter slices
  during browser idle time on capable connections.
- Started lazy-route downloads on pointer-down as well as hover and keyboard
  focus, reducing the remaining delay for touch navigation.
- Reserved viewport space for the cold card-catalog loader so a slow first API
  response no longer shifts the footer into and out of view.
- Warmed card-detail data and immutable full-size renders when a catalog visitor
  shows intent to open a card, while keeping the in-memory response cache
  bounded and separated by subscription access.
- Made constructed-card, Arena legendary and deck lightboxes display their
  already-loaded preview immediately, then replace it with the full render as
  soon as decoding completes.
- Prefetched adjacent gallery media and full legendary/deck renders on hover,
  focus or pointer-down so keyboard, mouse and touch navigation all benefit.
- Revalidated the public sitemap pointer, XML index and its 29 static plus 1,152
  standard-card URLs, and aligned the production monitor with the current
  29-page static segment.
- Taught the external sitemap monitor to accept nginx's standards-compliant
  weak form of the same SHA-256 validator on gzip and Brotli responses.
- Identified the global card/article search field for browser form tooling,
  removing the remaining console issue on card-detail pages.

## v1.0.75 - 2026-07-29

- Completed the same-origin media rollout on the Arena home page and global
  article search: remote editorial covers now use the cached `/api/article-cover`
  endpoint instead of loading directly from the publication host.
- Reused the same URL policy in article management previews and added a
  regression test for approved HTTPS hosts, local uploads and rejected origins.
- Isolated cached image traffic from the 120-request data API budget and added
  a separate bounded media allowance, preventing normal multi-page browsing
  from turning card and cosmetic images into `429` responses.
- Routed global-search card thumbnails through Arena's local Blizzard image
  cache instead of exposing the Blizzard CloudFront URL to the browser.

## v1.0.74 - 2026-07-29

- Routed required card, cosmetic, Battlegrounds, Wiki-art and public JSON media
  through a strict same-origin Arena endpoint so browsers in Russia and Europe
  no longer depend directly on the upstream asset hosts.
- Added persistent edge caching, stale delivery and compact WebP thumbnails;
  sampled cosmetic previews transfer about 85% fewer bytes while full-quality
  originals remain available through the same endpoint.
- Hardened the resource boundary with a fixed host/path allowlist, manual
  redirect validation, credential stripping, MIME and size limits, blocked SVG
  execution and safe handling of transparently decompressed responses.
- Updated client-rendered and server-rendered card, cosmetic and Battlegrounds
  pages so required image URLs remain on `arena.hs-manacost.ru`.
- Removed optional CDN-loaded image-processing libraries from the browser path
  and added regression coverage for redirects, compressed bodies, SSR media,
  image transforms and the production Nginx cache contract.

## v1.0.73 - 2026-07-29

- Fixed the constructed-card download action so clicking it no longer leaves
  the whole card visually stuck in its hover state; keyboard focus remains
  visible without lifting the card unintentionally.
- Added automatic production deployment for every validated push to `main`
  using an immutable exact-SHA artifact, a dedicated self-hosted runner,
  serialized releases and the existing readiness-gated automatic rollback.
- Added a cross-session agent preflight that keeps task work in isolated
  branches/worktrees, reports dirty sibling sessions, blocks overlapping
  uncommitted paths and refuses stale or dirty integrations.
- Restricted the production runner to one root-owned deployment gate and
  restored the CSS no-growth CI ratchet to the already deployed main baseline.
- Made the pinned Gitleaks history and working-tree scans work from linked
  Codex worktrees while excluding only generated build and Storybook outputs.
- Stabilized the progressive Vicious Gold browser contract by asserting the
  response ordering directly instead of depending on hosted-runner timing.

## v1.0.72 - 2026-07-29

- Reworked the constructed-card catalog search into a dedicated, accessible
  control with clear result feedback, keyboard clearing and room for Russian,
  English or card-ID queries.
- Debounced remote filtering so a completed phrase sends one request while the
  current card grid remains visible during refreshes.
- Added a compact full-quality download action to every gallery card, revealed
  on hover or keyboard focus and kept available on touch devices.

## v1.0.71 - 2026-07-29

- Added an accessible normal/golden selector to Battlegrounds minion detail
  pages when the catalog provides an exact golden pair.
- Switched the card image, rules text, attack, health, DBF and wiki source from
  the selected API record without synthesizing golden values.
- Kept pages without a reliable golden image unchanged and limited lookups to
  the current card pair instead of loading the full archive.

## v1.0.70 - 2026-07-28

- Hid the Standard statistics option on explicitly Wild-only card pages and
  moved card-statistics history into a collapsed, keyboard-accessible disclosure
  that loads its data only when opened.
- Added stable, cryptographically random public profile IDs and shareable
  `/profiles/:id/` pages for every existing and future account.
- Backfilled profile IDs with an idempotent SQLite migration and restricted the
  public profile API to an explicit privacy-safe field allowlist without account
  IDs, contacts, roles, subscription data or authentication details.
- Added an administrator analytics workspace that compares observed Boosty
  payment increases with KolodaHearthstone publication intervals and summarizes
  inferred subscriptions, renewals, RUB totals, plan mix and retention cohorts.
- Added transactional subscriber history with change-only snapshots, tombstones
  and a PII-free aggregate API; exact tracking starts from the 2026-07-28
  baseline and explicitly marks gaps in historical observations.
- Added signed, idempotent Tribute subscription webhooks with PII-free storage
  for subscriptions, renewals, cancellations, net RUB receipts and retention.
- Combined Boosty and Tribute in the administrator article analytics while
  keeping platform totals, collection semantics and partial-source coverage
  visible.
- Added a non-destructive Boosty sales ledger and administrator breakdowns for
  donations and paid-post purchases, including article intervals, RUB totals,
  recent operations, import freshness and reconciliation warnings.
- Kept the PII-bearing Boosty source loopback-only and exposed the ledger solely
  through the existing authenticated, private and no-store administrator route.

## v1.0.69 - 2026-07-27

- Expanded recommended deck compositions to their full natural height on card
  pages, removing the nested desktop and mobile scroll areas.
- Kept loading and retry states stable while making the page itself the only
  vertical scrolling surface for deck recommendations.

## v1.0.68 - 2026-07-27

- Unified the Standard/Wild and matchup-section controls into one compact
  parchment toolbar with clear labels and consistent active states.
- Kept section navigation available on mobile and made the picker and summary
  controls return correctly from the full-matrix view.

## v1.0.67 - 2026-07-27

- Replaced generated DeckView images in the card-page recommendations with the
  native deck-list interface shared with the site's deck builder.
- Kept direct deck-code copying below every recommendation and aligned all
  native deck lists in responsive, scrollable cards.
- Routed the native deck-row artwork through Arena's persistent same-origin
  image cache so restricted regional networks do not depend on HearthstoneJSON.

## v1.0.66 - 2026-07-27

- Restored the direct deck-code copy action on constructed card pages so users
  can import recommended decks without leaving the current card.

## v1.0.65 - 2026-07-27

- Replaced the card-page deck-code copy action with a direct link to the
  existing internal deck builder, preserving the Standard or Wild format and
  loading the complete recommended deck code.

## v1.0.64 - 2026-07-27

- Added a dedicated regional edge-cache route for versioned card images so
  repeated catalog, filter and card-page requests are served directly from the
  Moscow or Novosibirsk proxy instead of crossing back to the origin.
- Preserved origin cache-control for missing artwork and restricted edge
  storage to successful image responses.

## v1.0.63 - 2026-07-27

- Added a daily server-side preloader for both catalog thumbnails and card-page
  renders across Standard and Wild, eliminating cold Blizzard fetches while
  searching, filtering and opening constructed card pages.
- Added an atomic source-URL manifest so scheduled refreshes download only new
  cards or cards whose official Blizzard render changed.
- Versioned browser and edge image requests from the official Blizzard image
  hash, with bounded background concurrency and persistent systemd scheduling.

## v1.0.62 - 2026-07-27

- Switched constructed card renders to the official localized Blizzard
  Hearthstone API, with server-side OAuth, validated image responses and the
  existing HearthstoneJSON source retained only as a resilience fallback.
- Versioned the browser and server image caches and routed catalog, related
  cards and generated pools by Blizzard numeric card ID so previously cached
  black-background renders are replaced immediately.
- Removed lock icons and the `Алмаз` suffix from statistical sorting options
  when the server confirms subscription access, while preserving the locked
  labels and disabled state for visitors without access.

## v1.0.61 - 2026-07-27

- Restored all three localized Titan abilities and the related Primus token
  for `TTN_737`, including cached card renders and original Wiki full art.
- Routed related-card renders through Arena's same-origin WebP cache so they
  no longer require a direct browser request to `db.kolodahs.ru`.
- Changed the rolling constructed-card Wiki refresh to a daily oldest-first
  schedule so stale companion sections are eventually revisited instead of
  repeatedly selecting the same cards.
- Replaced the Arena favicon in client and server-rendered pages with the
  supplied Hearthstone artwork in 16, 32 and 96 px sizes, plus ICO, application
  and Apple touch fallbacks.

## v1.0.60 - 2026-07-27

- Replaced browser-native constructed-card filters with a keyboard-accessible
  parchment listbox for sorting, classes, sets, stats, mechanics, types and
  rarity in both Standard and Wild.
- Added local class, set, mana, attack, health and rarity artwork to matching
  filters, removed numeric counters from class choices and kept text-only
  mechanics compact.
- Added an optimized, reproducible Hearthstone Wiki asset sync for all 45
  current set emblems plus responsive 320 px alignment and Storybook coverage.

## v1.0.59 - 2026-07-27

- Extended constructed-card companion discovery to Wild card-page sections
  such as modules, art pieces, quest rewards and additional hero powers, with
  Russian card data and original Wiki art synchronization for both formats.
- Added all nine Zilliax Deluxe 3000 companion cards, localized names and the
  highest-resolution uncropped originals available on Hearthstone Wiki.
- Reworked generated-card pools into a stable responsive grid with at most five
  larger cards per row, aligned labels and a keyboard-accessible lightbox.
- Routed normal constructed-card renders through the same-origin cached WebP
  endpoint and verified the Moscow and Novosibirsk proxy paths, Brotli delivery
  and static cache hits.

## v1.0.58 - 2026-07-27

- Improved related-card tiles with larger artwork, complete readable card text
  without game layout markers, and a keyboard-accessible lightbox.
- Removed the redundant mana badge and Hearthstone Wiki link from each
  related-card tile while keeping attack, health and card IDs visible.

## v1.0.57 - 2026-07-26

- Added in-game release dates and source insertion timestamps to the compact
  cosmetics contract without loading any heavy detail media.
- Ordered hero skins, cosmetic coins and pet families from newest to oldest by
  release date, then by insertion time in `db.kolodahs.ru`, with deterministic
  DBF/card ID fallback ordering.
- Preserved pet colorway order from level 1 through 4 and added regression
  coverage for missing dates and stable fallbacks.

## v1.0.56 - 2026-07-26

- Fixed the cosmetics media lightbox so its dimmed backdrop covers the full
  viewport and portrait or landscape media uses the available desktop/mobile
  height instead of shrinking to its intrinsic size.
- Replaced the collapsed coin-relation counters with two always-visible,
  responsive card galleries for all 44 coin-generating cards and all three
  coin-related cards, using localized names, full card artwork, lazy loading
  and direct links to card details.
- Added regression contracts and Storybook states for the fullscreen lightbox
  and both related-card gallery sizes.

## v1.0.55 - 2026-07-26

- Reworked the hero-skin, coin and pet catalogs into frameless transparent
  galleries on the shared parchment surface, with names beneath the artwork
  and a restrained gold hover/focus highlight without movement or video.
- Moved hero full art and animation into a dark, keyboard-accessible lightbox
  with focus restoration, mobile viewport support and reduced-motion handling.
- Added an allowlisted same-origin media proxy with range requests and
  week-long stale caching so Hearthstone Wiki art, animation, gallery media and
  voice tracks load reliably instead of being blocked by cross-origin policy.
- Added focused UI, route and Storybook coverage for the transparent gallery,
  no-hover-animation contract and both lightbox media modes.

## v1.0.54 - 2026-07-26

- Added a public Hearthstone cosmetics library under “Разное” with 726 localized
  hero portraits, class/rarity/acquisition filters, lazy hover animation,
  cosmetic coins and 32 pet variants grouped into eight families.
- Added authoritative hero, coin and pet detail pages with stable IDs and DBF,
  full art, animation, voice tracks, End Screen media, related cards and
  alternate pet colorways.
- Added bounded cached cosmetics API aggregation, source URL allowlisting,
  prerendered catalog SEO pages, server-rendered detail responses and canonical
  nginx routing with real 404/503 behavior.
- Added Storybook 10 with the official MCP addon, authored component stories,
  accessibility checks and a tested shared workflow for Codex and Claude.
- Improved the cosmetics request lifecycle, responsive navigation and media
  loading; local browser measurements reached 241 ms LCP and 0.03 CLS.

## v1.0.53 - 2026-07-26

- Added localized token, quest-reward and Fabled hero-form groups to
  constructed card details, with exact Hearthstone Wiki full-art originals in
  an uncropped gallery/lightbox, source and resolution metadata, shared-art
  deduplication, and no fallback to game crop images.
- Direct public card URLs include the same related-card groups and full-art
  gallery in server-rendered HTML.

## v1.0.52 - 2026-07-26

- Added an icon-based class filter to the constructed archetype catalog,
  including shareable URL state, keyboard-accessible controls and mobile
  horizontal scrolling.
- Updated the archetype page tour and responsive browser coverage for the new
  class filtering workflow.

## v1.0.51 - 2026-07-26

- Reduced the shared traditional-mode banner height across desktop and mobile
  layouts while keeping the approved artwork, readable summary metrics and
  existing navigation unchanged.

## v1.0.50 - 2026-07-26

- Restored the full React card-detail experience on versioned production
  releases, including card artwork variants and voice lines, while preserving
  the strict local asset allowlist.
- Unified the opening banners across Matchups, Meta, Fun Decks, Archetypes and
  Vicious Syndicate Gold with the approved tavern artwork, quieter copy and
  compact live summary metrics.
- Preserved all desktop, mobile and page navigation while moving the Matchups
  format selector below its new banner.
- Added a focused UI contract covering all five banners, their responsive
  artwork and the protected navigation boundary.

## v1.0.49 - 2026-07-25

- Made the Vicious Syndicate Gold statistics render before slower HSGuru deck
  enrichment, with a separate protected build endpoint, bounded cache and
  honest progressive loading states.
- Reworked the archetype catalog tour around its real format, search, sorting
  and result controls, and added a dedicated tour for individual archetype
  pages.
- Added subscriber-path performance contracts plus desktop/mobile browser,
  responsive and accessibility coverage for progressive Vicious Gold loading
  and the refreshed archetype tours.
- Replaced the full-screen Standard paywall on Meta and constructed archetype
  routes with contextual parchment prompts after real, useful teaser data.
- Added public, cacheable teaser contracts that expose three meta leaders, the
  complete archetype catalog and a safe archetype hero/build summary without
  deck codes, history, matchups or mulligan data.
- Preserved server-side Diamond entitlement checks for every full dataset and
  added route, UI-contract, responsive browser and accessibility coverage.
## v1.0.48 - 2026-07-24

- Added responsive per-card trend charts for usage, deck win rate, games and
  played win rate, with 30, 90 and 180-day ranges plus loading, accumulating
  and unavailable states.
- Added durable per-card Legend statistics history with idempotent SQLite
  snapshots, bounded retention and an entitlement-aware history API for
  popularity, win-rate, play-rate and mulligan charts.
- Added a responsive card-statistics period filter for the last 1, 3, 7 and
  14 days and patch 36.0.3, preserving the selection in list, card-detail and
  generated-card navigation.
- Added a period-aware constructed-card statistics contract for the last
  1, 3, 7 and 14 days plus the current patch, with isolated caches and
  validation for list, detail and deck-preview requests.
- Simplified the constructed-meta filters: removed duplicate season plaques,
  made the current patch and Diamond-to-Legend the defaults, moved patch and
  expansion periods to the top, added the local Standard/Wild game assets, and
  collapsed the meta map on first load.
- Made the installed design, React, browser, performance, observability,
  specification, implementation, testing, review, security, documentation,
  Git and release skills mandatory through a tested task-routing contract,
  with `AGENTS.md` as the shared source of truth for Codex and Claude.
- Added idle-loaded, batched real-user Web Vitals collection for LCP, CLS, INP,
  FCP and TTFB through the existing server-side Sentry SDK without loading the
  large browser SDK on ordinary page views.
- Restricted Sentry metric attributes to bounded rating/navigation values,
  added configurable RUM sampling, and expanded privacy and telemetry tests.
- Activated the production Sentry project and corrected the shared Codex/Claude
  MCP contract to use Sentry's canonical OAuth endpoint without stale query
  parameters.

## v1.0.47 - 2026-07-24

- Added immutable Trivy repository scanning for high/critical dependency
  vulnerabilities and configuration errors, with SARIF publication to GitHub
  Code Scanning.
- Added GitHub Dependency Review with vulnerability, dependency-scope,
  license-allowlist and OpenSSF package-health checks for pull requests.
- Rebuilt the GitHub project presentation with a complete toolchain inventory,
  security badges, contribution guidance, structured issue forms and a pull
  request checklist.

## v1.0.46 - 2026-07-24

- Rebuilt the constructed deck-builder flow around one format choice and compact
  class selection, with responsive card/deck tabs, a mana curve and 44px touch
  targets from 320px through desktop.
- Fixed deck legality so ordinary decks stay capped at 30 cards, XL cards alone
  enable 40, and each catalog includes the selected class plus legal neutral and
  multiclass cards.
- Added validated local drafts, one-step undo, confirmed reset, explicit copy
  controls and clearer completion/error feedback, with TypeScript, React Doctor,
  route, browser and accessibility regression coverage.

## v1.0.45 - 2026-07-24

- Added immutable GitHub security workflows for CodeQL, full-history Gitleaks,
  OSV dependency scanning and OpenSSF Scorecard, plus grouped Dependabot
  updates and a private vulnerability reporting policy.
- Added reproducible fast-check parser-boundary properties and a blocking Knip
  dependency gate; removed six confirmed unused packages from the install.
- Cleared the initial OSV baseline by overriding vulnerable transitive
  `postcss` and `js-yaml` releases to their fixed compatible versions.
- Integrated opt-in Sentry React/Node SDKs and a limited OAuth Sentry MCP with
  PII-disabled defaults, zero tracing by default, event redaction and focused
  privacy/contract tests.

## v1.0.44 - 2026-07-24

- Added a project-scoped Chrome DevTools MCP integration with an isolated
  temporary profile, disabled telemetry and CrUX, redacted network headers,
  bounded WebP screenshots, and a strict Manacost/local-development URL
  allowlist.
- Added a pinned, telemetry-free Semgrep CE changed-file scanner with
  nonblocking baseline and explicit strict modes, plus contract tests and
  agent-facing operating documentation.
- Verified the MCP against the production Battlegrounds trinket page and ran
  the complete typecheck, test, build, recovery, budget, browser, accessibility,
  and documentation pipeline.

## v1.0.43 - 2026-07-24

- Added responsive archetype-specific hero artwork chosen from the archetype card sample, with a high-resolution local Vicious Voidscale treatment for Void Soul DH.
- Removed the duplicate format/patch eyebrow and English/source captions from the hero, retaining the same context in the breadcrumb and page data while reducing visual noise.
- Added browser coverage for representative hero art selection and the simplified identity block.

## v1.0.42 - 2026-07-24

- Simplified mulligan mana costs into compact flat tokens, removed the redundant «Карта» badge, and let desktop statistic columns expand to the full panel width without a blank strip.
- Added browser regression coverage for the mana token dimensions, removed badge, and full-width desktop table.

## v1.0.41 - 2026-07-24

- Added a pinned, telemetry-free React Doctor regression gate for changed
  authored frontend code, with deterministic Git-base resolution for local,
  pull-request, and push runs.
- Recorded the 773-finding historical baseline without making it a CI failure,
  and added contract tests plus an intentional failing fixture check for new
  React errors.
- Updated CI checkout depth so changed-scope analysis can resolve the correct
  base commit while leaving historical warnings available for separate triage.

## v1.0.40 - 2026-07-24

- Localized HSGuru mulligan card rows through the live Russian HearthstoneJSON catalog and added mana, card art, hover previews, and full Russian card sheets.
- Replaced the 1110px mobile mulligan table with readable sortable card panels while retaining the dense sticky-column table on larger screens.
- Hardened the complete archetype catalog and detail layout across 320, 375, 768, 1024, and 1440px viewports with overflow, touch-target, accessibility, and browser coverage.

## v1.0.39 - 2026-07-24

- Replaced the Windows-only Claude post-push review agent with a deterministic Linux command hook that validates standalone successful pushes, the GitHub origin, and the exact published SHA before reviewing; it uses Claude when an Anthropic runtime is configured and falls back to the authenticated Codex commit reviewer otherwise.
- Added secret-path/content guards, duplicate-comment prevention, bounded review output, and a no-post dry-run test integrated into the project test suite.

## v1.0.38 - 2026-07-24

- Connected the shared Miro board as mandatory visual context for AI-agent work on layouts, UX, navigation, mockups, and project diagrams.
- Added a read-only-by-default policy: agents may change board content only after an explicit user request and must track unavailable Miro context as a blocker in Notion.

## v1.0.37 - 2026-07-24

- Added mandatory shared Notion task tracking for every AI-agent change to arena.hs-manacost.ru and its parser pipelines, including priority, status, acceptance criteria, blockers, commits, and production revisions.
- Removed the task assignee field and replaced the Codex-only queue with a shared priority view so Codex and Claude use the same source of truth.

## v1.0.36 - 2026-07-24

- Replaced the tall one-column matchup ledger with a compact responsive tile grid: three columns on wide screens, two on tablets, and one on phones.
- Fixed unavailable HSGuru matchup sample sizes being rendered as fabricated zero-game values; unknown game counts are now omitted while real samples remain visible.

## v1.0.35 - 2026-07-24

- Replaced the horizontal archetype matchup matrix with a compact full-width opponent list that places every matchup on its own row without repeating the selected archetype.
- Deduplicated Standard catalog entries by canonical HSGuru identity, retained the most representative HSReplay snapshot, and removed rows without complete win-rate, game-count, and meta-share statistics.
- Updated the archetype directory header with a clear description of builds, popularity and win-rate history, mulligan analytics, and subscriber-only HSReplay data.

## v1.0.34 - 2026-07-24

- Added bounded same-origin WebP optimization and immutable caching for Battlegrounds tier-list thumbnails while retaining full-resolution images in the lightbox.
- Reduced the initial cards rendered per tier and deferred off-screen tier layout work, cutting first-view image and DOM pressure without removing access to the remaining entries.
- Reserved the tier-list loading/result height to prevent the footer shift, and added real image compression, URL, responsive, accessibility, release, and recovery coverage.

## v1.0.33 - 2026-07-24

- Rebuilt administrator archetype details with a keyboard-sortable mulligan table, retained full-card previews, and converted matchups into a horizontally scrollable HSGuru matrix.
- Replaced expandable two-column build folios with compact responsive deck columns and direct deck-builder/source actions, removing the oversized explanatory panel.
- Fixed Linux-sensitive class icon paths and now resolves HSReplay snapshots to canonical HSGuru archetype names by deck code before applying the Manacost translation dictionary.

## v1.0.32 - 2026-07-24

- Replaced raw HSGuru build-code rows on constructed archetype pages with responsive Hearthstone deck lists resolved by the site's own deck-builder catalog, including Russian card names, mana, rarity, art, sideboards, and full-card previews.
- Added one-click code copying, HSGuru source links, direct deck-builder loading from the «Разное» section, recoverable per-deck loading states, and desktop/mobile accessibility coverage.
- Preserved and jointly validated the concurrent Battlegrounds trinket MMR and period filters.

## v1.0.31 - 2026-07-24

- Rebuilt administrator archetype details with card-art mulligan rows and full-card hover previews, readable favored/even/difficult matchup ledgers, expandable deck compositions, and one-click deep links that load the selected build directly in the deck builder.
- Added responsive and accessibility browser coverage for desktop/mobile detail views, card previews, matchup labels, deck expansion, generated deck codes, and constructor auto-loading.

## v1.0.30 - 2026-07-24

- Restored `/standard/meta/` as the full HSGuru meta tier-list with rank, period, sample-size, chart, card/table, and recommended-deck controls.
- Moved the Standard/Wild archetype catalog and its build/statistics history pages to `/standard/archetypes/`, with direct navigation between both sections and backward-compatible legacy detail URLs.
- Extended route, SEO, prerender, responsive, page-tour, and nginx contracts for the split while preserving the concurrent administrator archetype redesign.

## v1.0.29 - 2026-07-24

- Rebuilt the subscriber «Архетипы» page as a responsive Standard/Wild HSGuru catalog with searchable sortable rows, dedicated detail routes, deck-code copying, complete build lists, and 12-hour history charts for win rate, popularity, and games.
- Preserved the concurrently deployed administrator archetype directory, fun/off-meta parser panel, completed deck builder, and expanded Battlegrounds hero/trinket tooling while merging the release lines.
- Restored the combined release gates, upgraded vulnerable image/document tooling, and added canonical one-hop routing for `/deck-builder` and archetype detail URLs.

## v1.0.28 - 2026-07-24

- Made Solo/Duos and MMR switching near-instant by deduplicating requests and preloading every rating slice in the background; reused one compact composition reference so alternate MMR and Duos rows no longer lose their best-composition labels.

## v1.0.27 - 2026-07-24

- Replaced per-hero Battleground composition requests with one cached compact response and rebuilt the hero table layout for phones and tablets without horizontal scrolling.

## v1.0.26 - 2026-07-23

- Improved the Battlegrounds hero table with a redesigned tier emblem, real best-composition data, interactive placement distribution, and sorting by tier, pick rate, or average placement on desktop and mobile.

## v1.0.25 - 2026-07-23

- Removed the empty “All ranks” Standard meta filter and made Diamond the default slice so the page opens with populated HSGuru data.

## v1.0.24 - 2026-07-23

- Reworked the Battlegrounds heroes page with Solo/Duos and MMR controls, Russian/English hero search, card/table views, fully localized Duos names, and dedicated Madam Goya, Cho and Gall pages.

## v1.0.22 - 2026-07-23

- Replaced the deck-builder rarity filter's CSS gems with the existing Hearthstone rarity image assets already shared by the tier list and card details.

## v1.0.21 - 2026-07-23

- Replaced the circular mana crystals in the deck-builder catalog with compact rectangular mana buttons while preserving clear selected and keyboard-focus states.

## v1.0.20 - 2026-07-23

- Rebuilt deck-builder filters as Hearthstone controls: mana crystals including 10+, rarity gems, card-type segments, and compatible selectors for spell school, minion type and translated card mechanics; extended the catalog API with additive filters and facets for those attributes.

## v1.0.19 - 2026-07-23

- Enlarged the Standard meta deck modal again and replaced the composition/image tabs with a simultaneous split view: the generated deck image stays on the left, while the shared deck-builder composition stays visible on the right.

## v1.0.18 - 2026-07-23

- Prevented deck-builder card previews from sticking after clicks, scrolling, resizing or rapid card changes, and rebuilt the card catalog controls as a compact search-first command menu with a filter summary, one-click reset and bounded mobile gallery.

## v1.0.17 - 2026-07-23

- Enlarged and simplified the Standard meta deck modal: the raw deck code is hidden, the copy action sits below a centered preview, and the composition tab now reuses the live DeckListView component from the deck builder.

## v1.0.16 - 2026-07-23

- Added frame-safe spacing to every deck-builder class plaque so long class names and both Standard/Wild actions remain fully visible inside the gold frame on desktop, tablet and mobile.

## v1.0.15 - 2026-07-23

- Reduced the visible `<CODE/> → Hearthstone` deck image substantially in the Standard meta chart, cards and table while retaining a 44px interactive target where space is tight.

## v1.0.14 - 2026-07-23

- Replaced every Standard meta deck text action with the supplied `<CODE/> → Hearthstone` image while preserving the existing accessible button behavior and responsive chart/table/card sizing.

## v1.0.13 - 2026-07-23

- Added visible spacing between deck-builder class plaques and simplified the format actions to full-height Standard/Wild buttons that remain unobstructed by the gold frame on desktop and mobile.

## v1.0.11 - 2026-07-23

- Audited every HSGuru Standard rank across all periods and minimum-game filters, redesigned the deck action as a gold-edged tavern button with clearer copy and accessible responsive states, and corrected the guided-tour spotlight for the expanded rank selector.

## v1.0.10 - 2026-07-23

- Replaced the deck builder's light interior with red tavern cloth, restored parchment only to the outer page canvas and rebuilt every class choice as an in-game profile plaque with a real crest and asset-backed deck frame.

## v1.0.8 - 2026-07-23

- Rebuilt the administrator deck builder as a parchment workshop: real Hearthstone class crests, direct Standard/Wild actions, a clearer import flow, sticky deck ledger, paper card catalog, responsive two-column mobile class picker and accessible high-contrast controls.

## v1.0.7 - 2026-07-23

- Expanded the HSGuru rank selector to the requested eight slices: all ranks, Diamond, Diamond 1–4, Diamond–Legend, Legend, Top-1000, Top-500 and Top-100. The page now opens on the populated all-ranks slice.

## v1.0.6 - 2026-07-23

- Added the HSGuru `Diamond–Legend` rank slice to the Standard meta filter under the Russian label «Алмаз — Легенда».

## v1.0.5 - 2026-07-23

- Restored the administrator-only deck builder at `/deck-builder`: class/format selection, card catalog filters, deck-code import/export and archetype resolution are active again, while navigation, page state and mutation endpoints remain restricted to administrators.

## v1.0.4 - 2026-07-23

- Fixed sparse meta slices: valid responses with fewer than five archetypes now show the empty/limited result instead of a false server-unavailable error.

## v1.0.3 - 2026-07-23

- Renamed Standard meta rank «Топ-1000 легенда» to «Топ-1000» and ordered top ranks as 5000 → 1000 → 500 → 100.

## v1.0.2 - 2026-07-23

- Renamed Standard meta rank «Высшая легенда» to «Топ-1000 легенда», made it the default rank, and lowered the default minimum-games filter to 100.

## v1.0.1 - 2026-07-23

- Expanded Standard/Wild meta rank filters with HSGuru profile ranks **Топ-100** and **Топ-500**, wired through the unified Firecrawl meta matrix API.

## v1.0.0 - 2026-07-05

- Repeated opponent archetype headers at the bottom of the matchup matrix, removed aggregate `Other <class>` rows and columns, and refreshed the page tour to explain interactive cells and both horizontal controls.
- Added synchronized horizontal controls above and below the full matchup matrix, plus keyboard-accessible, mobile-safe matchup cards on every cell using the Arena parchment, timber and red-cloth visual language.
- Kept filtered matchup cards compact in responsive columns and removed the redundant lower matrix scrollbar.
- Hardened the Fun/off-meta admin panel: local hs-data-api fetch, dedicated styles, and concept-v4 card-package detection (Reno/Quest/Yogg/Mecha’thun and related markers) with a refreshed 40+ deck list.
- Added an administrator Fun/off-meta decks panel under «Данные и парсеры» with deck codes, format filters, copy buttons and hourly refresh cadence from `hsguru_fun_decks`.
- Added an administrator-only «Конструктор колоды» page under Разное (`/deck-builder`): Russian HSGuru-style class/format picker and deck workspace, wooden timber/deck frames from `assets.md`, constructed-card catalog browsing, deck-code paste/copy and 30-card editing, with noindex SEO and nav visibility limited to admins.
- Fixed the Standard/Wild matchup switch after an older API image dropped the Wild source, made format changes visibly stateful with actionable retry errors, and rebuilt the responsive page around a lightweight archetype overview, strength/search filters and an on-demand searchable full matrix.
- Replaced the stale Standard-only matchup slices with daily Firecrawl-backed HSGuru Legend matrices for both Standard and Wild, using minimum samples of 100 archetype games and 25 matchup games; the Matchups page now switches formats while preserving cached, translated and responsive matrix views.
- Fixed Standard meta deck recommendations that waited up to a minute and then cached a false “not found” result: exact HSGuru lookups now use the cached Firecrawl path with a bounded request, and transient upstream failures remain retryable instead of being treated as missing decks.
- Added aggregate `ALL` rank and `Any Player` HSGuru meta filters for Standard and Wild, made the aggregate slice the default, and hardened statistics ingestion by mapping every metric by its source column heading and rejecting incomplete or invalid rows.
- Expanded HSGuru meta filters for Standard and Wild with four daily-to-two-week periods, Going First/On Coin splits and local 100–5000 game thresholds backed by one atomic daily Firecrawl matrix; removed the 3/6-hour and 7500-game choices.
- Fixed transient administrator user-access failures by making the shared SQLite connection wait briefly for concurrent writers; a real lock-contention regression test now covers the production failure mode.
- Installed a versioned five-minute production SEO/stability workflow. Its bounded, privacy-safe monitor now aggregates failures across health, dataset freshness, public routes, robots, exact sitemap segments, deterministic Standard card SSR samples, canonical/JSON-LD contracts and unknown-card noindex behavior; an operator runbook documents triage and rollback while paging integration remains explicitly open.
- Added a durable Standard/Wild constructed-card raw catalog with checksum-derived dataset versions, a primary-authoritative atomic mirrored LKG protocol and durable degraded marker, strict page/total/format/identity/continuity/size/privacy gates, five-minute singleflight refresh and a bounded 48-hour stale policy. Cold production Wild always requires a conservative 3,000-card minimum because per-card Standard/Wild membership does not prove that the full Wild catalog was returned; recognized string/object format evidence (the upstream `slug`/name/id envelope) is still validated for contradictions. Warm candidates must retain at least 50% ID overlap relative to the smaller membership set, while normal growth is capped at 50% and larger legitimate releases require a server-internal controlled-expansion flag. Card lists now return coherent fresh/LKG headers or retryable 503 instead of 502/empty data; known-card and secondary deck/patch outages synthesize a safe partial dossier (or reuse in-memory enriched content with only current statistics), deck pagination requires exact offsets/counts/totals and unique stable identities, only an upstream-confirmed unknown card becomes a bounded negatively cached 404, subscriber fields are redacted after fallback composition, simultaneous Russian stale/stats/partial notices remain visible, health preserves both formats' cache state, stale SEO absence fails retryably, and the external monitor verifies list, complete known-detail and unknown-detail behavior for Standard and Wild.
- Added a runtime sitemap index with isolated static and Standard-card segments. The static feed preserves the 23 registry-owned canonical pages, while Standard URLs come from the exact authoritative SSR catalog/public projection; a checksum-validated atomic LKG store records entity `lastmod` only after semantic public changes, rejects invalid, duplicate, partial and collapsed candidates, and keeps verified XML available through upstream outages with exact ETag/Last-Modified validators.
- Added authoritative public SSR for base Battlegrounds minion and spell details: exact DBF lookup spans validated active and archive catalogs, canonical slugs redirect once, real noindex 404 and retryable 503 responses replace the generic shell, and Russian metadata/schema expose only a strict public projection. A five-minute per-kind singleflight cache prevents duplicate catalog loads without serving an expired snapshot after a failed refresh.
- Added authoritative public SSR for Battlegrounds hero details: the server resolves each numeric DBF ID against the real 114-hero catalog, emits Russian canonical/OG/Twitter/JSON-LD metadata without subscriber statistics, and returns real noindex 404 or retryable 503 HTML without a client bundle. Nginx now preserves those statuses and headers instead of serving the generic SPA shell.
- Bound every immutable release to its versioned nginx contract: artifacts now include a read-only origin/edge drift verifier, and deployment stops before lock, staging, shared-data initialization, symlink switching or restart when the verifier, artifact or installed configuration is missing or modified. Bootstrap and genuine contract changes require an explicit N/N-1 compatibility acknowledgement that cannot bypass drift.
- Hardened the full-admin parser panel with private no-store headers on every response, real systemd timer health, restart-safe manual-run reconciliation, and a responsive lazy-loaded audit journal with actor, action, revision, request correlation, timestamp and change context without exposing the data-API key.
- Expanded Arena controls to a tested 44×44 mobile target across 320/390/768 widths, made tier-list and legendary cards keyboard-native buttons, covered every class in browser fixtures, and reduced the all-P0 undersized-target ratchet from 478 to 320 while reaching zero findings on subscriber Classes, Tier List and Legendaries pages.
- Added authoritative server-rendered Standard/Wild card detail HTML with public-only catalog projection, unique Russian metadata and schema, strict route validation, real noindex 404/503 responses, client-safe bootstrap handling, and nginx detail proxying while format listings remain static.
- Added an explicit post-patch early-statistics state to Arena tier lists: provisional upstream metadata survives normalization, receives a five-minute cache policy and metadata-aware ETags, and displays a compact Russian low-sample notice without changing subscription access. A loopback-only, proxy-rejecting POST endpoint can now refresh each tier-list cache immediately after upstream publication without storing another secret or exposing the subscriber API.
- Refined the dedicated FAQ into a tighter responsive help center with a calmer hierarchy, compact two-column mobile navigation, framed topic sections and clearer expanded answers. Removed the browser-native rounded search-field appearance and conflicting editorial focus ring so global search keeps a rectangular wooden frame while retaining an accessible focus state.
- Polished the global search field with a compact wooden frame, clearer prompt, `/` keyboard focus and additional spacing before page content. Replaced the FAQ popover with a dedicated responsive `/faq` help center covering registration, email and Telegram login, Boosty verification, subscription levels, paywall behavior, statistics and troubleshooting. Restored golden, signature and diamond card variants by falling back to premium wiki media when catalog image fields are empty.
- Added a compact secondary header in the existing top content strip with deep search across article titles/excerpts and Standard/Wild card names, rules text, mechanics and metadata. Search results preserve article subscription locks and Diamond statistic labels, while a responsive FAQ panel exposes the shared help content on every public page.
- Fixed article cards so cover artwork is displayed in full without being cropped at the top and bottom.
- Fixed article cover creation from external links: the administrator form now has an explicit “Загрузить по ссылке” action, validates the remote response, imports supported images into local `/uploads/admin` storage and reports actionable errors. The server rejects local/private destinations, unsafe protocols, credential-bearing URLs, non-image responses, redirect abuse and oversized files before processing.
- Added “Стандарт” and “Вольный” article access modes for Boosty «Алмаз» subscribers and higher, with matching administrator labels and entitlement checks. Extended administrator user controls from forever-only access to audited full-site grants for 7/30/90 days, one year, a custom future date or forever; expired grants now stop affecting protected routes, subscription filters and mailing lifecycle automatically, while revocation preserves the user's normal subscription.
- Centralized constructed-card terminology around current official Russian Hearthstone wording, including mechanics, tribes, spell schools, common wiki tags, gallery labels and technical sound captions; card dossiers now reuse localized db.kolodahs terms, hide internal engine/VFX tags, and keep administrator overrides authoritative. Expanded the admin translation workspace to mechanics and tags, added representative cards for common wiki terms, and introduced an idempotent repair for known legacy typos without overwriting custom editor translations.
- Moved every Traditional-mode analytics page behind the existing Boosty «Алмаз» entitlement while keeping the card catalog and card dossiers public: Meta, Matchups and Vicious Syndicate Gold are protected in both the shell and API; guest card responses redact every statistical field and statistical deck value; card statistics render as an accessible blurred lock with Diamond actions; popularity, win-rate and games sorting are locked; and the library now defaults to newest-expansion-first ordering.
- Refined every constructed DeckView tile across Meta, Vicious Gold and the card table: crop art now covers the full tile without pale seams, compact 36px rows and 2px row gaps keep the final deck row visible, table rows no longer add a separate English subtitle band, and pointer/keyboard focus opens the complete Russian card as a floating preview.
- Removed misleading 75–100% constructed-card leaders from tiny one-day samples by requiring 100 observed games before percentage metrics participate in the UI or win-rate sorting; repaired the DeckView composition grid so card art renders in two compact columns and reduced the Standard meta deck dialog footprint.
- Kept the complete constructed-card catalog available when an upstream statistics refresh is malformed or unavailable: invalid popularity values are removed, users see a clear degraded-data notice, and deck composition hydration continues instead of turning the whole Cards API into a 502 response.
- Released Meta, Vicious Syndicate Gold and Cards as public Traditional-mode pages with public server contracts, prerendered metadata and sitemap coverage; replaced automatic DeckView image generation with immediate Russian deck lists plus on-demand images, added expandable Vicious builds, and introduced administrator monitoring/reset controls for Standard caches and the DeckView queue together with separate mechanic/tag translation filtering.
- Hardened the constructed-card beta against malformed 97–100% popularity snapshots, made every gallery caption follow the active sort metric, vendored the pinned hsreplay-deck-view renderer for real `data-deck-cards` table rows, added smooth rarity-aware hover light, and rebuilt the mobile filters and table as compact accessible card records without horizontal scrolling.
- Stabilized and polished containing-deck previews in card dossiers: DeckView renders are serialized and retried after transient failures, failed images expose a manual retry, wide layouts use centered image-sized columns, deck art opens in the shared keyboard-accessible lightbox, and archetype headings now use the existing Russian translation catalog with current Wild Warlock fallbacks.
- Completed card dossier relationships: empty related-card placeholders are removed and missing token metadata is enriched from db.kolodahs.ru, sound panels now disappear when no clips exist, and cards expose real containing decks matched by decoded DBF IDs with three-column DeckView previews, protected incremental “Показать больше” loading and deck-code copying.
- Refined the administrator card library and dossier: removed redundant coverage/result strips, rebuilt the detail header and Legend statistics as a compact wood-and-velvet ledger, collapsed every generated-card pool to one responsive row with a working “Показать все” control, deduplicated localized mechanics, and replaced unsorted English patch labels with newest-first Russian HS-Manacost articles sourced from the shared patches API.
- Cleaned numeric catalog values out of card class/mechanic filters, removed expansion counters, replaced format text tabs with local Standard/Wild emblems, restyled card hover statistics with the Arena wood-and-velvet treatment, made generated pools wrap within the page, and added an administrator mechanic-translation workspace with card examples and live library overrides.
- Fixed Standard card popularity by consuming only HSReplay's all-decks `ALL` series instead of class-relative inclusion values, and added generated-card pool sections to constructed card dossiers with Russian catalog names, local card art and navigation.
- Renamed the Cards beta popularity metric to the clearer “В % колод” across sorting, gallery, table, hover statistics and card details, and replaced the cramped two-number gallery caption with a focused labelled percentage while retaining the Standard/Wild split.
- Completed the administrator-only “Карты” beta: Standard and Wild now expose verified full-catalog coverage and complete translated expansion filters, retain cards during independent source refreshes, support 60/120-card pages with explicit totals, open every available artwork variant in an accessible lightbox, and correctly render grouped card voice lines from the nested wiki payload.
- Added the administrator-only “Карты” beta under Standard: the full Standard/Wild constructed catalog is merged with the existing one-day Legend datasets, supports server-side search/filter/sort/pagination plus gallery/table modes and hover statistics, and opens complete card dossiers from db.kolodahs.ru with variants, mechanics, patch history, related cards, gallery, sounds and external sources.
- Rebuilt the Standard meta deck modal as a viewport-safe body portal with a fully visible preview, persistent deck code and accessible focus/scroll handling; corrected `*lock` archetypes to Warlock, added same-class representative builds for complete code coverage, and persisted KolodaHS preview hashes for 30 days so releases and repeated opens do not regenerate images.
- Fixed the Vicious Syndicate Gold build resolver so Blood Warrior uses a valid current Standard Lo’Gosh Warrior fallback from the constructed-decks API instead of MetaStats' invalid short Control Warrior code, restoring real 26/26 deck-code coverage.
- Added the administrator-only Standard meta beta with HSGuru rank/format slices, translated archetypes, exact-match recommended decks, KolodaHS image previews, deck-code copying, and a direct entry point from the authenticated profile.
- Fixed administrator navigation compatibility so admin-only Standard links, including “Vicious Syndicate Gold,” remain visible whether `/api/auth/me` returns permission flags inside `user` or at the response top level.
- Added the administrator-only “Vicious Syndicate Gold” Standard page with live class and deck distributions, a strict 0.5% deck cutoff, API-backed deck codes, and class-filtered Power Tier rankings for all six available rank brackets; both navigation visibility and the private no-store server endpoint enforce administrator access.
- Reduced main CSS from 322.7 KB to 285.7 KB and permanently lowered its CI ceiling to 300 KB by moving the fully scoped Battlegrounds parchment skin out of the global entry and into its tier/hero/builder and library route owners; deterministic desktop/mobile QA now verifies both chunks load the parchment, wooden sign and zero-violation UI.
- Reduced initial JavaScript from 266.8 KB to 249.2 KB and permanently lowered its CI budget to 250 KB by splitting below-fold home directories, FAQ/paywall UI and the delayed support prompt into route-safe chunks; browser QA now proves the lazy home sections and support flow load, interact and pass axe.
- Added a required real-Chromium axe-core WCAG 2.2 A/AA gate against the locally served production build across critical subscriber desktop/mobile routes, the guest paywall, open mobile menu and open lightbox; fixed the resulting legendary win-rate badge contrast issue and established a zero-violation CI baseline.
- Isolated Puppeteer scraping from the web process: a dedicated non-overlapping systemd service now handles the six-hour schedule and queued admin requests, validates supported document shapes, rejects empty/incomplete upstream data, durably stages with file/directory `fsync` and atomic rename, publishes a cache-invalidation marker only after success, and exits non-zero on any critical dataset failure.
- Added encrypted mutable-data recovery tooling and systemd schedules: daily atomic GnuPG AES-256 archives now cover shared datasets/uploads and a consistent ecosystem SQLite snapshot, while a weekly isolated restore drill verifies archive and per-file checksums, required snapshots and SQLite integrity; CI rejects a deliberately tampered archive.
- Added an uncached Prometheus metrics contract for bounded-route request counts, status classes, latency histograms, active requests, readiness, dataset freshness/age and immutable release identity, with explicit warning and paging thresholds and tests proving URL/query/user values cannot become metric labels.
- Added privacy-safe structured HTTP telemetry: each response now exposes a request ID, normalized JSON request logs include status/latency/size and aborted requests, unhandled errors return the correlation ID, and regression tests prove that query data, cookies, authorization values, request bodies, emails and raw error messages never reach logs.
- Completed the immutable production switch: systemd now runs compiled Node from `current`, nginx serves the versioned frontend, mutable datasets/uploads live in shared storage, and a real rollback from `bc19b2b` to `43c8722` completed in one second before the latest release was restored.
- Added tested immutable release tooling and an operator runbook: artifacts carry commit/lockfile/checksum manifests, mutable data is shared, production dependencies install unprivileged and are cached by lockfile, releases become root-owned/read-only, `current` and `previous` switch atomically, and failed readiness automatically restores the last healthy release.
- Added a production Node compilation target and mandatory compiled-server smoke test. CI now starts `build/server/index.js` against isolated temporary snapshots and SQLite, verifies direct/proxied health plus legacy status, and normalizes artifact permissions; runtime data and asset roots are explicit so immutable releases no longer depend on TypeScript source paths.
- Added dedicated uncached `/health/live`, `/health/ready` and `/health/data` contracts, mirrored externally at `/api/health/*`: deployments can distinguish a live process from valid snapshots, while monitoring receives `503` when Arena data is missing, malformed, future-dated or older than the eight-hour SLO. The evaluator, both proxy mount paths and Express router have unit and real HTTP contract tests.
- Extracted the old-guide HTML sanitizer from the server monolith, added security regression tests and deterministic subscriber E2E coverage for Guides Archive on desktop/mobile, then removed eight now-unnecessary image `!important` declarations and lowered the permanent CSS debt ceiling to 2,716.
- Established the CSS stabilization ratchet: all global design variables now live in one canonical token stylesheet, while CI rejects new `:root` owners, duplicate global tokens and any increase above the measured legacy `!important` baseline.
- Completed the frontend single-owner ratchet: removed the unreachable retired deck page and every remaining dead cross-bundle component copy, reduced `App.tsx` to 3,677 lines, and changed CI from a 12-copy allowance to a permanent zero-duplicate gate.
- Removed six unreachable full-page implementations from `App.tsx`; Arena data, profile, admin and article screens now have only their lazy route owners, ratcheting duplicate components from 18 to 12.
- Consolidated route navigation, grouping, subscription entitlements and SEO metadata into one typed registry with invariant tests for every public path.
- Replaced duplicate paywall purchase controls in the main and deferred bundles with one shared, accessible subscription component.
- Unified the subscriber gate used by main and deferred routes, preserving inert private previews while removing incorrect modal semantics and another 4 KB from the deferred bundle.
- Unified profile avatars across the shell and deferred profile, with deterministic initials when an external photo is missing or broken.
- Added a CI architecture budget that blocks any increase in duplicate named components between the main and deferred route bundles.
- Removed the unused deferred route-transition copy and ratcheted the duplicate-component budget from 25 to 24.
- Deleted both unreachable legacy avatar implementations and their unused helpers, ratcheting the duplicate-component budget from 24 to 23.
- Deleted both unreachable legacy paywall implementations, removing 293 source lines and ratcheting the duplicate-component budget from 23 to 22.
- Removed unused deferred profile-button, footer and retired deck code; moved the still-active FAQ into one accessible shared component, ratcheting duplicate components from 22 to 18.
- Added deterministic authenticated browser QA for Arena subscriber pages at desktop and mobile widths, including paywall isolation, viewport dimming, horizontal overflow, grouped mobile navigation and lightbox background scroll locking.
- Added required application validation on pushes and pull requests: locked install, critical production audit, typecheck, autonomous unit tests, production build, honest no-growth bundle budgets and documentation lint.
- Added the stabilization source of truth with the route/access inventory, measurable SLOs, mandatory Definition of Done and stop-the-line release rules.
- Added a portable `assets.md` containing the full HS-Arena visual language, reusable CSS recipes and verified absolute production URLs for all 299 public visual assets.
- Fixed the actual mobile Arena dimming source by containing the section banner's absolute decorative layers inside the banner instead of letting them cover the full page.
- Removed the route wrapper's failure-prone `0.72` base opacity so iOS tab restoration can no longer leave Arena pages permanently dimmed.
- Removed the remaining mobile Arena dimming by keeping a single parchment paint layer on iOS instead of compositing translucent root, workspace and main backgrounds; source refreshes now show only a compact loading badge without tinting the class list.
- Restored Arena legendary groups by rejecting empty memory/Redis/upstream datasets, falling back to the fresh local scraper snapshot, and rotating the browser cache key so previously stored empty results are discarded immediately.
- Consolidated the public navigation: both Battlegrounds builders now live under “Конструкторы”, while Gallery, Guides Archive and Contests live under the final “Разное” disclosure; desktop hover/focus, keyboard activation and mobile tap are supported, and the mobile support prompt no longer blocks menu controls.
- Extended the canonical timber-framed red tavern paywall to every Battlegrounds route, removing the remaining legacy white-and-blue subscription dialog on desktop and mobile.
- Fixed the mobile experience across Arena, profile and Battlegrounds routes: subscription gates no longer leave a partially dimmed scrollable page, profile badges and long labels stay inside their containers, the menu login frame is compact, and drawers/lightboxes now lock and restore background scrolling on iOS.
- Shifted the home-page hero character left on desktop to match the intended focal point while keeping the mobile crop unchanged.
- Added timber framing to the Battlegrounds tier navigation and main tier ledger, introduced `#4A2F66` for selected states, and added a locally served Hearthstone heading ornament for concise labels.
- Rebuilt the Battlegrounds library navigation and filters with real timber, red-cloth and deck-border assets, replacing the cold stacked dashboard panels with one compact tavern catalogue.
- Localized the remaining Battlegrounds library mechanic labels (`В следующих обновлениях`, `Кровавые самоцветы`, `Неуязвимость`) and removed `BACON_PASS_TOOLTIP` and `SECRET` from filters and card metadata.
- Moved the home-page Latest articles block above the Battlegrounds and Arena directories and synchronized the quick-navigation order.
- Applied the canonical red tavern-cloth footer with its wooden top rule, cream navigation and muted-gold legal copy to every public route, including all Battlegrounds pages that still showed the legacy blue footer.
- Simplified the Battlegrounds heroes introduction by combining metric guidance and search in one quiet parchment panel and removing the two redundant wooden bottom rails.
- Shifted the home-page Paladin farther left so the character remains visible beside the Arena class board without moving the data or controls.
- Unified Arena card, deck-card, Battlegrounds strategy, Battlegrounds hero-media and gallery lightboxes with responsive wooden frames, red tavern-cloth surfaces and cream/gold controls while preserving close, keyboard, swipe and navigation behavior.
- Removed the home-page “Мета в цифрах” aggregate with class leaders, best cards, legendary groups and the matching quick-navigation link.
- Shifted the home-page Paladin mural slightly left and removed the duplicate freshness/source/leader strip from the bottom of the hero frame.
- Rebuilt Battlegrounds library card details as overflow-safe timber-framed dossiers, replaced the plain black strategy/card lightbox with a red tavern-cloth wooden frame, and fixed tier-entry theming so minion and spell cards stay warm honey parchment after “Show more.”
- Added a locally optimized Paladin character mural to the home-page live dashboard, with a wine-red readability mask, preserved statistics and a dedicated mobile panorama treatment.
- Connected the production Arena service to the server's shared Blizzard credentials, accepted the canonical `BLIZZARD_REGION` setting and Blizzard CDN's binary image MIME type, exposed a safe image-source response header, and rotated the card-image cache so existing HearthstoneJSON fallbacks are replaced immediately.
- Refactored the home page into a compact utility-first dashboard: live freshness and Arena leaders now appear before the Battlegrounds and Arena directories, followed by neatly grouped cross-mode statistics and a real eight-place Battlegrounds hero distribution chart with an honest unavailable-data state.
- Removed the generic violet side rails from Battlegrounds heroes, library, tier-list panels, mobile sections, and home-directory entries; retained wooden frames and horizontal wood rules for meaningful separation.
- Rebuilt Battlegrounds hero details as a wood-framed tavern dossier with dark aubergine identity and media surfaces, thin framed content ledgers, warmer inner cards, and fully wrapping hero-power and companion copy while preserving media lightboxes and golden artwork behavior.
- Expanded the Battlegrounds strategy and tier-list builders into a wide 32/68 workbench with a slimmer wiki frame and container-responsive annotation rail; replaced the remaining cold BG tier-list surfaces with walnut, aubergine and honey parchment; and corrected the profile plaque, surface isolation, artwork crop and avatar balance without changing protected animations, drag/drop or export logic.
- Added the official Blizzard Hearthstone Game Data API as the primary Arena card-render source when server credentials are configured, with server-only OAuth, shared token/catalog caching, local WebP conversion, automatic token refresh, and a HearthstoneJSON fallback so temporary upstream failures do not leave broken cards.
- Replaced the remaining white and cool-blue Arena source/filter controls with readable parchment and wine-red states, rebuilt card hover statistics as a wooden ledger, and restyled the shared Tier List/Legendary card lightbox as a responsive tavern frame without changing its data or interactions.
- Unified the home-page Arena board with the exact Battlegrounds tavern-frame asset, border slicing, frame width, parchment fill, and responsive mobile treatment while retaining Arena-specific links and red accents.
- Matched the home-page Arena sign to the Battlegrounds tavern plaque and moved the Arena Tier List and Legendary Groups onto the shared parchment-and-wood canvas while preserving source switches, class/search/rarity/mana filters, gallery/table modes, card animations, modals, and subscription gates.
- Added a dedicated framed Arena directory and a live latest-articles showcase to the home page, with responsive wood-and-parchment layouts, lazy article artwork, resilient image fallbacks, direct tool navigation, and one cached article request shared with the full archive.
- Restyled Standard Matchups as a wood-bound scouting ledger with a red framed masthead, accessible rank and archetype switches, a cleaner matchup picker, framed sticky matrix, and responsive subscription gate while preserving all live interactions; also vertically aligned the Battlegrounds tavern sign.
- Turned the home-page Battlegrounds directory into a responsive tavern noticeboard using optimized local Hearthstone frame and bartender-sign assets, with compact mobile rows and no changes to navigation behavior.
- Moved the Arena Classes page onto the shared parchment canvas with a red wood-framed masthead, numbered ranking ledger, champion plaque, full-width mobile meters, and matching subscription and FAQ surfaces while preserving live data and bar animations.
- Fixed the editorial card cascade so every article now renders inside a clearly visible nine-pixel Hearthstone wooden frame on desktop and mobile without reducing readable content width.
- Started the editorial redesign by moving Articles, Gallery, Guides Archive, and Contests onto one open parchment canvas with red textured mastheads, substantial wooden framing, warm controls and cards, a matching subscription gate, and preserved search, filters, downloads, voting, entry, and access flows.
- Strengthened the Hearthstone material language with thicker wooden frames around desktop and mobile navigation, the live class board, and the profile plaque; upgraded menu labels to the expressive HS display face while preserving narrow-screen fit and scrolling.
- Wrapped the signed-in profile badge in desktop and mobile navigation with a locally hosted Hearthstone deck frame while preserving the existing profile link, focus behavior, and compact responsive layout.
- Restyled the signed-in profile and login screen as a Manacost player passport using the same parchment canvas, red textured panels, wooden framing, warm forms, responsive layout, and preserved authentication, contact, subscription, Telegram, Boosty, and contest-history flows.
- Removed the legacy fixed blue vignette, oversized navigation drop shadow, and transparent backdrop blur that produced dark compositing bands along the page edges while scrolling the parchment home page.
- Added the Hearthstone Wiki wooden rail frame as a locally hosted, lightweight border for the fixed navigation, mobile header, and live class board on the home page.
- Simplified the public brand to the text-only “Manacost Stats” wordmark and removed the remaining cool-blue and violet UI remnants from rankings, draft tools, Battlegrounds navigation, and FAQ surfaces.
- Reworked the public shell and home page into a unified Hearthstone archive: a continuous parchment canvas, fixed red textured navigation, thin wood dividers, a live class board, quick in-page navigation, resilient empty states, and matching mobile menu, FAQ, community strip, and footer.
- Rebuilt the public home page as an animated Arena draft table: a compact live-class orbit, a true three-step draft path with Hearthstone artwork, larger card shelves, a distinct Battlegrounds tavern, staged scroll reveals, responsive micro-interactions, and a complete reduced-motion fallback.
- Reorganized the signed-in profile around the jobs users actually perform: identity and access first, one editable contacts form, clearer Boosty/Telegram verification, compact contest history, and nearby account actions on desktop and mobile.
- Removed the outer parchment-style card from the home and profile routes, introduced a consistent open canvas with container-aware layouts, and kept the existing auth, subscription, navigation, lazy card loading, and card animation engines unchanged.
- Added a dedicated admin mailing workspace with HTML composition, exact desktop/mobile preview, test delivery, recipient segments, campaign history, and ready-made templates for the latest article and tier-list updates.
- Added a durable consent ledger that retains former subscribers without re-enabling unsubscribed addresses, signed one-click unsubscribe links, per-recipient queued delivery, restart-safe status tracking, HTML sanitization, and administrative audit records.
- Moved every user action into an accessible three-dot menu and added auditable lifetime access grants that override provider status without being overwritten by later Boosty or Telegram refreshes.
- Rebuilt the live admin workspace with a standalone WordPress-inspired shell, desktop sidebar, mobile drawer, compact dashboard, persistent action feedback, and accessible focus states.
- Fixed the admin command bar and navigation to the viewport, removed nested list scrolling, tightened every admin page into one consistent layout, and added compact pagination for users, articles, Boosty, Telegram, and contest entries.
- Split contest work into clear management and editor views, reduced mobile page length, and polished article, gallery, referral, audience, and user cards for faster scanning on desktop and phone.
- Fixed admin deep links and browser history, contest-admin permissions, duplicate contest requests, destructive-action confirmations, contest schedule presets, and Telegram error reporting; added searchable paginated article/user lists plus article excerpts and explicit access modes.
- Rebuilt the public home page as a task-first Arena draft workspace with clear primary actions, live data freshness, responsive layouts, and the new Mana Beacon status element.
- Removed the heavy promotional hero and wallpaper downloads from the critical path, added compact class icons, and deferred below-the-fold card art until it approaches the viewport.
- Stopped speculative idle loading of unrelated route bundles, made the home route available without an extra request chain, and delayed Yandex Metrika until the page is loaded and idle.
- Replaced the intrusive support overlay with a delayed collapsed control that loads its QR code only after the user opens it.
- Updated the cool blue navigation shell and corrected responsive/full-width layouts for the narrower desktop sidebar.
- Moved Telegram auth bot API calls to the local Bot API server with public API fallback, reducing response latency for link and subscription checks.
- Restricted `@kolodahearthstoneauthbot` webhook handling to private chats only so the auth bot never answers in groups or supergroups.
- Fixed the Battlegrounds strategy canvas layout so the 5x5 board keeps enough vertical space and placed cards no longer collapse into overlapping rows on wide screens.
- Fixed PNG/WebP export in the Battlegrounds strategy builder by loading board card art through same-origin `/api/card-art` URLs and shipping cache-busted legacy builder assets.
- Fixed the production profile route so the Telegram ID-code button and generated code are rendered in the visible Telegram subscription card.
- Moved the Telegram bot ID-code control directly into the profile Telegram subscription card so it is visible without scrolling past the subscription sources.
- Restored Boosty email binding through `@kolodahearthstoneauthbot`: `/email name@example.com` sends a verification code, writes the verified email to the shared KHA/VIP profile store, and syncs the linked site account.
- Added Redis-backed API caches for arena winrates, class matchups, standard matchups, and Battlegrounds proxy responses so tier/content tables survive Node restarts and warm faster.
- Added manual Telegram binding through `@kolodahearthstoneauthbot`: a logged-in user can generate a short ID-code in the profile, send it to the bot, and trigger Telegram subscription verification.
- Hardened identity binding: the same Telegram account or Boosty email can no longer be attached to two different site accounts.
- Improved client-side route switching: route chunks are preloaded on idle and on navigation hover/focus, profile navigation no longer forces a full page reload, and route transitions use a short GPU-friendly enter animation.
- Added a public changelog workflow for `arena.hs-manacost.ru`: every AI agent must post project changes to `@changelogarena`.
- Added a Telegram changelog helper that posts through `@kolodahearthstoneauthbot` using the server env file.
- Improved Telegram login behavior: OAuth opens in a separate tab and the original tab polls the session after confirmation.
- Hardened Telegram OIDC state handling by keeping several recent auth states and clearing only the matched state.
- Checked page integrity and performance for the main public routes.
- Cleared stale swap usage on the server.
