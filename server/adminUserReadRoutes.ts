import { Router, type Request, type Response } from 'express';

type QueryValue = string | number;
export type AdminUserReadRepository = {
  get: (sql: string, ...params: QueryValue[]) => Record<string, unknown> | null;
  all: (sql: string, ...params: QueryValue[]) => Record<string, unknown>[];
};

export type AdminUserReadDependencies = {
  adminAuth: (request: Request) => unknown | null;
  repository: AdminUserReadRepository;
  subscriptionForUser: (
    row: Record<string, unknown>,
    manualAccess: { enabled: boolean; expiresAt: string | null },
  ) => unknown;
  subscriptionForSearchUser: (row: Record<string, unknown>) => unknown;
  setPrivateNoStore: (response: Response) => void;
};

const detailedUser = (row: Record<string, unknown>, dependencies: AdminUserReadDependencies) => {
  const manualAccessEnabled = Boolean(row.manual_access);
  const manualAccess = {
    enabled: manualAccessEnabled,
    expiresAt: manualAccessEnabled && row.manual_access_expires_at ? String(row.manual_access_expires_at) : null,
  };
  const lifetimeAccess = manualAccess.enabled && manualAccess.expiresAt === null;
  return {
    id: String(row.id), profileId: String(row.id), name: String(row.name || ''), email: String(row.email || ''),
    role: String(row.role || 'user'), country: String(row.country || ''), newsletterOptIn: Boolean(row.newsletter_opt_in),
    avatarInitials: String(row.avatar_initials || ''), telegramId: String(row.telegram_id || ''),
    telegramUsername: String(row.telegram_username || ''), telegramOidcId: String(row.telegram_oidc_id || ''),
    photoUrl: String(row.telegram_photo_url || ''), contactVkUrl: String(row.contact_vk_url || ''),
    contactTelegram: String(row.contact_telegram || ''), contactEmail: String(row.contact_email || ''),
    blockedAt: String(row.blocked_at || ''), manualAccess, lifetimeAccess,
    lifetimeGrantedAt: String(row.manual_access_granted_at || ''),
    subscription: dependencies.subscriptionForUser(row, manualAccess),
    contestEntriesCount: Number(row.contest_entries_count || 0), createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
};

const searchUser = (row: Record<string, unknown>, dependencies: AdminUserReadDependencies) => ({
  id: String(row.id), profileId: String(row.id), name: String(row.name || ''), email: String(row.email || ''),
  role: String(row.role || 'user'), country: String(row.country || ''), telegramUsername: String(row.telegram_username || ''),
  contactVkUrl: String(row.contact_vk_url || ''), contactTelegram: String(row.contact_telegram || ''),
  contactEmail: String(row.contact_email || ''), subscription: dependencies.subscriptionForSearchUser(row),
  createdAt: String(row.created_at || ''), updatedAt: String(row.updated_at || ''),
});

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const integer = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
};

const SEARCH_SELECT = `
  SELECT
    u.*,
    tg.username AS telegram_username,
    s.has_access,
    s.source AS subscription_source,
    s.checked_at AS subscription_checked_at,
    s.boosty_json,
    s.telegram_json,
    s.patreon_json
  FROM users u
  LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
  LEFT JOIN subscriptions s ON s.user_id = u.id
`;

export function createAdminUserReadRouter(dependencies: AdminUserReadDependencies): Router {
  const router = Router();
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) response.status(403).json({ error: 'Недостаточно прав' });
    return Boolean(admin);
  };

  router.get('/admin/users/search', (request, response) => {
    if (!authorize(request, response)) return;
    const q = text(request.query.q, 120).toLowerCase();
    if (!q) return response.json({ users: [] });
    const like = `%${q}%`;
    try {
      const rows = dependencies.repository.all(`${SEARCH_SELECT}
        WHERE lower(u.id) LIKE ?
          OR lower(u.email) LIKE ?
          OR lower(u.name) LIKE ?
          OR lower(COALESCE(u.contact_vk_url, '')) LIKE ?
          OR lower(COALESCE(u.contact_telegram, '')) LIKE ?
          OR lower(COALESCE(u.contact_email, '')) LIKE ?
          OR lower(COALESCE(tg.username, '')) LIKE ?
        ORDER BY u.updated_at DESC
        LIMIT 40
      `, like, like, like, like, like, like, like);
      return response.json({ users: rows.map(row => searchUser(row, dependencies)) });
    } catch {
      return response.status(500).json({ error: 'Не удалось найти пользователей' });
    }
  });

  router.get('/admin/users', (request, response) => {
    if (!authorize(request, response)) return;
    const q = text(request.query.q, 120).toLowerCase();
    const role = text(request.query.role, 40);
    const subscription = text(request.query.subscription, 40);
    if (role && role !== 'admin' && role !== 'user') return response.status(400).json({ error: 'Некорректный фильтр роли' });
    if (subscription && subscription !== 'active' && subscription !== 'inactive') {
      return response.status(400).json({ error: 'Некорректный фильтр подписки' });
    }
    const limit = integer(request.query.limit, 100, 10, 200);
    const offset = integer(request.query.offset, 0, 0, 1_000_000);
    const where: string[] = [];
    const params: QueryValue[] = [];
    if (q) {
      const like = `%${q}%`;
      where.push(`(
        lower(u.id) LIKE ? OR lower(u.email) LIKE ? OR lower(u.name) LIKE ?
        OR lower(COALESCE(u.contact_vk_url, '')) LIKE ?
        OR lower(COALESCE(u.contact_telegram, '')) LIKE ?
        OR lower(COALESCE(u.contact_email, '')) LIKE ?
        OR lower(COALESCE(tg.username, '')) LIKE ?
        OR lower(COALESCE(tg.provider_user_id, '')) LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like, like);
    }
    if (role) { where.push('u.role = ?'); params.push(role); }
    const activeManualGrant = `(COALESCE(g.active, 0) = 1 AND (
      g.expires_at IS NULL OR g.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ))`;
    if (subscription === 'active') where.push(`(COALESCE(s.has_access, 0) = 1 OR ${activeManualGrant})`);
    if (subscription === 'inactive') where.push(`(COALESCE(s.has_access, 0) = 0 AND NOT ${activeManualGrant})`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    try {
      const total = Number(dependencies.repository.get(`
        SELECT COUNT(*) AS count
        FROM users u
        LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
        LEFT JOIN subscriptions s ON s.user_id = u.id
        LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
        ${whereSql}
      `, ...params)?.count ?? 0);
      const rows = dependencies.repository.all(`
        SELECT
          u.*,
          tg.provider_user_id AS telegram_id,
          tg.username AS telegram_username,
          tg.photo_url AS telegram_photo_url,
          oidc.provider_user_id AS telegram_oidc_id,
          s.has_access,
          s.source AS subscription_source,
          s.message AS subscription_message,
          s.checked_at AS subscription_checked_at,
          s.updated_at AS subscription_updated_at,
          s.boosty_json,
          s.telegram_json,
          s.patreon_json,
          CASE WHEN COALESCE(g.active, 0) = 1 AND (
            g.expires_at IS NULL OR g.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          ) THEN 1 ELSE 0 END AS manual_access,
          g.expires_at AS manual_access_expires_at,
          g.granted_at AS manual_access_granted_at,
          (SELECT COUNT(*) FROM contest_entries e WHERE e.user_id = u.id) AS contest_entries_count
        FROM users u
        LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
        LEFT JOIN identities oidc ON oidc.user_id = u.id AND oidc.provider = 'telegram_oidc'
        LEFT JOIN subscriptions s ON s.user_id = u.id
        LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
        ${whereSql}
        ORDER BY u.updated_at DESC, u.created_at DESC
        LIMIT ? OFFSET ?
      `, ...params, limit, offset);
      return response.json({ users: rows.map(row => detailedUser(row, dependencies)), total, limit, offset });
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить пользователей' });
    }
  });

  return router;
}
