# Patreon: привязка и доступ

## Назначение

Patreon является способом подтвердить доступ к закрытым разделам HearthPulse.
Он не создаёт и не заменяет аккаунт HearthPulse: пользователь сначала входит в
существующий профиль, а затем явно привязывает Patreon в разделе подписки.

## Конфигурация

Сервер включает интеграцию только когда заданы все значения:

- `PATREON_CLIENT_ID` и `PATREON_CLIENT_SECRET` — OAuth-клиент Patreon API v2;
- `PATREON_CAMPAIGN_ID` — идентификатор кампании Манакоста;
- `PATREON_FULL_ACCESS_TIER_IDS` — ID уровня «Алмаз» и каждого уровня выше через запятую;
- `PATREON_TOKEN_ENCRYPTION_KEY` — отдельный секрет длиной не менее 32 символов.

В приложении Patreon зарегистрирован только callback
`https://hearthpulse.net/api/auth/patreon/callback`. Запрашиваются минимальные
scopes `identity` и `identity.memberships`.

## Правило доступа

После OAuth сервер запрашивает Patreon API v2 identity с текущими
`memberships.currently_entitled_tiers`. Полный набор HearthPulse-entitlements
выдаётся лишь если одновременно:

1. membership относится к `PATREON_CAMPAIGN_ID`;
2. `patron_status` равен `active_patron`;
3. у текущего entitled tier ID входит в `PATREON_FULL_ACCESS_TIER_IDS`.

Подписки на другие кампании, старые/отменённые уровни, бесплатные участники и
неполные ответы API доступа не дают. При недоступности Patreon новый доступ не
выдаётся; плановая проверка повторяет запрос позднее.

## Хранение и приватность

Access/refresh tokens пользователя сохраняются только в таблице
`patreon_connections` в AES-256-GCM ciphertext с отдельным ключом. В таблице
подписок и в ответе профиля сохраняется только безопасный итог: подключён ли
Patreon, состояние проверки, название активного уровня и entitlement. Внешние
ID, email и токены не отправляются в браузер и не попадают в журнал проверок.
