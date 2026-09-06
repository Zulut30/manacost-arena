export async function fetchBoostyServiceStatus(apiUrl: string, graceMs: number): Promise<Record<string, unknown>> {
  const graceHours = Math.round(graceMs / 3_600_000);
  if (!apiUrl) return { configured: false, ok: false, importStatus: 'not-configured', source: 'none', stale: true, checkedAt: new Date().toISOString(), graceHours, message: 'Boosty API не настроен.' };
  try {
    const response = await fetch(`${apiUrl}/api/audit`, { signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    const importStatus = String(data?.importStatus || '');
    const stale = Boolean(data?.subscriberStale ?? data?.stale ?? importStatus === 'stale');
    return { configured: true, ok: !stale && importStatus !== 'stale' && importStatus !== 'quarantined', importStatus: importStatus || (stale ? 'stale' : 'unknown'), source: String(data?.subscriberSource || data?.source || ''), stale, snapshotAgeSeconds: data?.snapshotAgeSeconds ?? null, lastErrorCategory: data?.lastErrorCategory || null, lastErrorMessage: data?.lastErrorMessage || null, warnings: Array.isArray(data?.warnings) ? data.warnings : [], summary: data?.summary && typeof data.summary === 'object' ? data.summary : {}, checkedAt: new Date().toISOString(), graceHours };
  } catch (error: unknown) {
    return { configured: true, ok: false, importStatus: 'error', source: 'unavailable', stale: true, snapshotAgeSeconds: null, lastErrorCategory: 'request-failed', lastErrorMessage: error instanceof Error ? error.message : 'Boosty API временно недоступен.', warnings: ['boosty-api-unavailable'], summary: {}, checkedAt: new Date().toISOString(), graceHours };
  }
}
