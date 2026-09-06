export function applyBoostyGrace(input: { boosty: Record<string, unknown>; previous: { checkedAt: string | null; boosty: Record<string, unknown> } | null; graceMs: number; normalize: (value: Record<string, unknown>) => Record<string, unknown>; normalizeEntitlements: (value: unknown) => Record<string, boolean>; hasAny: (value: Record<string, boolean>) => boolean; empty: () => Record<string, boolean> }): Record<string, unknown> {
  const current = input.normalize(input.boosty);
  if (!current.stale && current.checked !== false && !current.providerUnavailable) return current;
  if (!input.previous?.checkedAt) return { ...current, hasAccess: false, entitlements: input.empty(), message: current.message || 'Boosty временно недоступен, последней успешной проверки нет.' };
  const previousBoosty = input.normalize(input.previous.boosty);
  const entitlements = input.normalizeEntitlements(previousBoosty.entitlements);
  if (!previousBoosty.hasAccess || !input.hasAny(entitlements)) return { ...current, hasAccess: false, entitlements: input.empty() };
  const startedAt = String(previousBoosty.graceStartedAt || input.previous.checkedAt);
  const until = Date.parse(startedAt) + input.graceMs;
  if (!Number.isFinite(until)) return current;
  if (Date.now() > until) return { ...current, hasAccess: false, entitlements: input.empty(), graceExpiredAt: new Date(until).toISOString(), message: 'Boosty временно недоступен, 24-часовой резервный доступ истёк.' };
  return { ...previousBoosty, hasAccess: true, entitlements, stale: true, grace: true, graceStartedAt: startedAt, graceUntil: new Date(until).toISOString(), providerMessage: current.message || '', message: 'Boosty временно недоступен, доступ сохранён на 24 часа по последней успешной проверке.' };
}
