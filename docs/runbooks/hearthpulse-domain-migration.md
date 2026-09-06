# Перенос Arena на hearthpulse.net

## Финальный контракт

- `https://hearthpulse.net` — единственный публичный canonical приложения;
- `https://www.hearthpulse.net/**` — `301` на apex с сохранением пути и query;
- `https://cdn.hearthpulse.net` — публичный CDN с закрытым private API;
- `https://arena.hs-manacost.ru/**` — `301` на тот же путь `hearthpulse.net`;
- `https://cdn.arena.hs-manacost.ru/**` — `301` на тот же путь нового CDN.

Старый origin-host остаётся внутренним транспортным контрактом между edge и
основным сервером. Его нельзя заменять редиректом на origin: иначе новый
публичный домен попадёт в цикл. Redirect-only конфигурации устанавливаются
только на узлах с ролью `edge`.

Cookies нельзя перенести между разными registrable domains. После перехода
пользователь входит один раз заново; аккаунт, подписка и серверные сессии не
удаляются. Сессионные токены запрещено передавать через URL.

## DNS и регионы

Зона Cloudflare остаётся DNS-only с TTL 120:

- apex: `162.19.220.14`, `194.67.92.242`, `186.246.28.244`;
- `cdn`: тот же набор A;
- `www`: CNAME на apex;
- AAAA отсутствуют до отдельного IPv6 rollout.

Узлы: Limburg, Москва и Новосибирск. Москва (`194.67.92.242`) является
отдельной обязательной проверкой, а не побочным результатом общего DNS-smoke.

## Порядок переключения

1. Запустить `npm run verify:release`, security-проверки и браузерную матрицу.
2. Установить в root-only runtime environment `APP_URL=https://hearthpulse.net`.
3. Развернуть immutable release с новым canonical, sitemap, robots, JSON-LD,
   OAuth callback и `cdn.hearthpulse.net`.
4. На каждом edge установить проверенные release-контрактом файлы:
   `hearthpulse-shadow-app.conf`, `hearthpulse-shadow-cdn.conf`,
   `arena-legacy-app-redirect.conf`, `arena-legacy-cdn-redirect.conf`.
   Историческое `shadow` в имени двух файлов сохраняется на время миграции,
   чтобы обновить существующие symlink без параллельных `server_name`.
5. На каждом узле выполнить `nginx -t`; reload разрешён только после успеха.
6. Запустить `deploy/monitor-hearthpulse-shadow.sh` и браузерные проверки.
7. Добавить новый sitemap в поисковые панели; старый домен оставить с `301`
   минимум на год и продолжать продлевать его сертификат.

Certbot deploy hook использует versioned
`deploy/deploy-hearthpulse-cert.sh`: после renewal он синхронизирует сертификат
на все три edge, проверяет `nginx -t` и только затем выполняет reload.

Telegram OIDC должен разрешать callback
`https://hearthpulse.net/api/auth/telegram/callback`. Проверка считается
полной, когда `/api/auth/telegram/config` возвращает новый URL, старт входа
ставит host-only Secure cookie на HearthPulse, а callback не возвращает ошибку
redirect URI.

Для входа через внешние сервисы зарегистрируйте ровно следующие redirect URI:

- Google: `https://hearthpulse.net/api/auth/google/callback`
- Discord: `https://hearthpulse.net/api/auth/discord/callback`
- Яндекс ID: `https://hearthpulse.net/api/auth/yandex/callback`

В Google также разрешите JavaScript origin `https://hearthpulse.net`. В Яндекс
ID поле Suggest Hostname оставьте пустым. Не добавляйте ключи в репозиторий:
сервер показывает кнопку конкретного провайдера только после задания пары
переменных окружения `*_OAUTH_CLIENT_ID` и `*_OAUTH_CLIENT_SECRET`.

## Проверка

```bash
npm run test:hearthpulse-shadow
npm run test:hearthpulse-monitor
sudo /bin/bash /var/www/koloda/data/www/hs-arena.ru/current/deploy/monitor-hearthpulse-shadow.sh
```

Дополнительно в desktop и mobile браузере проверить главную, каталог, detail,
login/logout, отсутствие console errors, failed network requests и старых
resource URL. `robots.txt`, sitemap, canonical, OpenGraph и JSON-LD должны
указывать только на `hearthpulse.net`.

## Откат

1. Восстановить резервные копии четырёх edge-vhost и выполнить `nginx -t`.
2. Вернуть `APP_URL=https://arena.hs-manacost.ru` и предыдущий immutable release.
3. Вернуть `X-Robots-Tag: noindex, nofollow` и короткий HSTS на HearthPulse.
4. Проверить старое приложение и CDN на каждом российском edge.

DNS нового домена при обычном rollback не удаляется: это предотвращает NXDOMAIN
для уже открытых ссылок. Удаление DNS — отдельная аварийная мера после TTL 120
плюс не менее 60 секунд запаса.
