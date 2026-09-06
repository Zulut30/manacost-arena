import {
  captureServerWebVital,
  installSentryExpressErrorHandler,
} from './sentry.js';
import express from 'express';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import sharp from 'sharp';
import sanitizeHtml from 'sanitize-html';
import { createClient } from 'redis';
import { chmodSync, copyFileSync, mkdirSync, renameSync, unlinkSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { createHash, createHmac, createPublicKey, randomBytes, randomInt, scryptSync, timingSafeEqual, verify } from 'crypto';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { configureWritableSqliteConnection } from './sqliteConnection.js';
import {
  ARCHETYPE_DECK_CODES_TABLE_SQL,
  ensureArchetypeDeckCodesAllRank,
} from './archetypeDeckCodesSchema.js';
import { loadSnapshot } from './snapshots.js';
import { HSREPLAY_NO_ARENASMITH_TIER, normalizeArenasmithTier, tierFromArenasmithScore } from './hsreplayArenasmith.js';
import { createHealthRouter } from './healthRoutes.js';
import { createUpstreamDataHealthMonitor } from './upstreamDataHealth.js';
import { createCriticalDataHealth } from './criticalDataHealth.js';
import { createMetricsRouter, HttpMetrics } from './metrics.js';
import { createWebVitalsRouter } from './webVitalsRoutes.js';
import { createClientErrorRouter } from './clientErrorRoutes.js';
import { requestLoggingMiddleware, structuredErrorMiddleware } from './observability.js';
import { createScrapeQueueHandler } from './scrapeQueue.js';
import { decodeSignedStateCookie, encodeSignedStateCookie, safeAuthReturnTo } from './authRedirect.js';
import { SOCIAL_PROVIDERS, createSocialAuthorizationUrl, fetchSocialProfile, isSocialProvider, type SocialProvider, type SocialProfile } from './socialOAuth.js';
import { csrfRequestAllowed } from './csrf.js';
import { configureLoopbackProxyTrust, corsOriginAllowed, getTrustedClientIp } from './networkBoundary.js';
import { isPublicMediaApiRequest } from './apiRateLimitPolicy.js';
import { createRouteAwareJsonParser, createUploadAuthorizationGuard } from './jsonBody.js';
import { createReferralRedirectHandler, createReferralRouter } from './referralRoutes.js';
import { createGalleryRouter } from './galleryRoutes.js';
import { createCosmeticsDataService, createCosmeticsRouter } from './cosmeticsRoutes.js';
import { createPublicResourceRouter } from './publicResourceRoutes.js';
import { articleImageSrc, canonicalArticleUrl } from '../shared/articleImageSrc.js';
import { createCosmeticsSeoRouter } from './cosmeticsSeoRoutes.js';
import { createBattlegroundProxyRouter } from './battlegroundProxyRoutes.js';
import { proxyHsReplayStrategyPayload } from './modules/publicApi/hsreplayStrategySource.js';
import {
  battlegroundImageTransformCacheKey,
  battlegroundImageTransformFromQuery,
  optimizeBattlegroundImage,
} from './battlegroundImageOptimization.js';
import { createArticleCoverRouter } from './articleCoverRoutes.js';
import { createGuidesArchiveRouter } from './guidesArchiveRoutes.js';
import { createArticleRouter } from './articleRoutes.js';
import { articleAccessEntitlement, type ArticleAccessMode } from './articleAccess.js';
import { createGlobalSearchRouter } from './globalSearchRoutes.js';
import { createOperationalRouter } from './operationalRoutes.js';
import { createArenaDecksRouter, type ArenaDecksCacheStore } from './arenaDeckRoutes.js';
import {
  createStandardMatchupRouter,
  excludeOtherStandardMatchups,
  type StandardMatchupFormat,
} from './standardMatchupRoutes.js';
import {
  ConstructedCardUpstreamError,
  createConstructedCardDataService,
  createConstructedCardRouter,
  type ConstructedCardDeck,
} from './constructedCardRoutes.js';
import {
  createConstructedCardSeoRouter,
  extractConstructedCardFrontendAssets,
} from './constructedCardSeoRoutes.js';
import { createBattlegroundHeroSeoRouter } from './battlegroundSeoRoutes.js';
import { createBattlegroundLibrarySeoRouter } from './battlegroundLibrarySeoRoutes.js';
import { createEntitySitemapRouter, loadStaticSitemapArtifact } from './entitySitemapRoutes.js';
import { createEntitySitemapRuntimeOptions } from './entitySitemapSources.js';
import {
  createStandardMetaRouter,
  type StandardMetaFormat,
  type StandardMetaCoin,
  type StandardMetaMinGames,
  type StandardMetaPeriod,
  type StandardMetaPreview,
  type StandardMetaRank,
  type StandardMetaRecommendation,
} from './standardMetaRoutes.js';
import {
  createConstructedArchetypeRouter,
  constructedArchetypeSlug,
  type ConstructedArchetypeCatalog,
  type ConstructedArchetypeAnalysis,
  type ConstructedArchetypeFormat,
  type ConstructedArchetypeHistoryPoint,
} from './constructedArchetypeRoutes.js';
import {
  cacheSuccessfulRecommendation,
  type StandardMetaRecommendationCacheEntry,
} from './standardMetaRecommendationCache.js';
import {
  resolveStandardMetaPublication,
  selectStandardMetaCandidate,
  type StandardMetaPublication,
} from './standardMetaDataset.js';
import {
  deckviewPreviewCacheKey,
  deckviewPreviewConfigFromEnv,
  isTrustedDeckviewPreview,
  renderDeckviewPreview,
} from './deckviewPreview.js';
import { createDeckRenderRouter } from './deckRenderRoutes.js';
import { standardMetaPreviewCacheAction } from './standardMetaPreviewCachePolicy.js';
import { buildDeckCardData } from './deckCardData.js';
import {
  hsguruStreamerArchetype,
  hsguruStreamerDeckCodes,
  hsguruStreamerRows,
  type HsguruDeckInfo,
} from './hsguruDeckInfo.js';
import {
  inferStandardMetaClass,
  normalizeStandardMetaClass,
} from './standardMetaClasses.js';
import {
  findSupplementalViciousGoldBuild,
  resolveViciousGoldArchetype,
} from './viciousGoldBuilds.js';
import { createClassMatchupRouter, type ClassMatchupCacheStore } from './classMatchupRoutes.js';
import { createLegendaryRouter } from './legendaryRoutes.js';
import { createTierlistRouter } from './tierlistRoutes.js';
import {
  normalizeTierlistEarlyStatsMetadata,
  tierlistEarlyStatsEtagToken,
  tierlistRedisTtlSeconds,
} from './tierlistEarlyStats.js';
import { createTierlistCacheBustRouter } from './tierlistCacheBustRoutes.js';
import { createWinrateRouter } from './winrateRoutes.js';
import { createHomeSummaryRouter, type HomeSummaryCacheStore } from './homeSummaryRoutes.js';
import { createCardImageRouter, normalizeCardImageId } from './cardImageRoutes.js';
import { createCardImageDependencies } from './app/createCardImageDependencies.js';
import { installProcessLifecycle } from './app/lifecycle/processLifecycle.js';
import { registerApplicationAuth } from './app/registerApplicationAuth.js';
import { serializeApplicationProfileUser, serializeApplicationSubscription } from './app/applicationAuthProfile.js';
import { createBlizzardCardImageClient, downloadBlizzardCardImage } from './blizzardCards.js';
import { resolveConstructedCardImageSourceUrl } from './constructedCardImageOverrides.js';
import {
  CARD_IMAGE_CACHE_VERSION,
  CARD_IMAGE_VARIANTS,
  cardImageCachePath as sharedCardImageCachePath,
  type CardImageSource,
} from './cardImageCache.js';
import { downloadFallbackCardImage } from './cardImageRemote.js';
import { createAdminClassPositionRouter, writeClassPositionsFile } from './adminClassPositionRoutes.js';
import {
  createAdminArchetypeTranslationRouter,
  normalizeBlizzcoreArchetypes,
  syncBlizzcoreArchetypes,
  type ObservedArchetype,
  type UntranslatedArchetype,
} from './adminArchetypeTranslationRoutes.js';
import { createAdminArchetypesRouter } from './adminArchetypesRoutes.js';
import { createDeckBuilderRouter } from './deckBuilderRoutes.js';
import {
  loadArchetypeDeckCandidates,
  resolveArchetypeDeckIdentity,
} from './archetypeDeckIdentity.js';
import {
  createAdminMechanicTranslationRouter,
  loadConstructedMechanicOverrideMap,
  loadConstructedMechanicTranslationMap,
  repairLegacyConstructedMechanicTranslations,
} from './adminMechanicTranslationRoutes.js';
import { createAdminFunDecksRouter, createPublicFunDecksRouter } from './adminFunDecksRoutes.js';
import { createFunDeckPreviewCoordinator } from './funDeckPreviewPrewarmer.js';
import { createAdminArenaSynergyServiceRouter } from './adminArenaSynergyService.js';
import { createAdminStandardOperationsRouter, type StandardCacheTarget } from './adminStandardOperationsRoutes.js';
import { createAdminParserControlRouter } from './adminParserControlRoutes.js';
import { createHsDataParserControlClient } from './hsDataParserControlClient.js';
import { invalidateParserDataCaches as clearParserDataCaches } from './parserDataCacheInvalidation.js';
import {
  createParserRunReconciler,
  createParserRunReconciliationFileStore,
  startParserRunRecoveryLoop,
} from './parserRunReconciler.js';
import { createAdminArticleRouter, writeArticlesFile } from './adminArticleRoutes.js';
import { createAdminContestMutationRouter } from './adminContestMutationRoutes.js';
import {
  createAdminUserMutationRouter,
  mutateAdminUser,
  type AdminUserMutationStore,
} from './adminUserMutationRoutes.js';
import {
  AdminMailingValidationError,
  createAdminMailingPreviewRouter,
} from './adminMailingPreviewRoutes.js';
import {
  AdminMailingDeliveryError,
  createAdminMailingDeliveryRouter,
} from './adminMailingDeliveryRoutes.js';
import { createAdminMailingReadRouter } from './adminMailingReadRoutes.js';
import {
  createNewsletterUnsubscribeRouter,
  unsubscribeNewsletterContact,
  type NewsletterUnsubscribeStore,
} from './newsletterUnsubscribeRoutes.js';
import { createAdminUserReadRouter } from './adminUserReadRoutes.js';
import { createAdminBoostyRouter } from './adminBoostyRoutes.js';
import {
  createAdminBoostyAnalyticsRouter,
  createBoostyAnalyticsLoader,
} from './adminBoostyAnalyticsRoutes.js';
import { createAdminTelegramReadRouter } from './adminTelegramReadRoutes.js';
import { createAdminContestReadRouter } from './adminContestReadRoutes.js';
import { createAdminImageUploadRouter } from './adminImageUploadRoutes.js';
import { fetchRemoteAdminImage } from './adminRemoteImage.js';
import { createAdminImageGenerationRouter } from './adminImageGenerationRoutes.js';
import { createPublicApiCardSources, registerPublicApi } from './app/registerPublicApi.js';
import { startSubscriptionRefreshJob } from './modules/subscription/public.js';
import {
  firestoneArenaMatchupsDataset,
  normalizeFirestoneArenaClassRows,
  normalizeHsReplayArenaClassRows,
} from './modules/arena/classStatisticsNormalizer.js';
import { createContestRouter } from './contestRoutes.js';
import { createSubscriptionRouter } from './subscriptionRoutes.js';
import { createEcosystemInternalRouter } from './modules/ecosystem/public.js';
import { createAuthProfileRouter, type AuthProfilePatch } from './authProfileRoutes.js';
import {
  ensurePublicProfileIds,
  resolveUserPublicProfileId,
} from './publicProfileIdentity.js';
import {
  createPublicProfileRouter,
  type PublicProfileRecord,
} from './publicProfileRoutes.js';
import { completePasswordReset, createPasswordResetRouter } from './passwordResetRoutes.js';
import { authenticatedUserPayload, createAuthVerificationRouter } from './authVerificationRoutes.js';
import { createAuthCredentialRouter, deliverCredentialCode } from './authCredentialRoutes.js';
import { addBoundedAuthSession, authTokenCandidates } from './authSessions.js';
import { sendLocalSmtpMessage } from './localSmtp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DEFAULT_APP_ROOT_DIR = existsSync(join(__dirname, '..', '..', 'package.json'))
  ? join(__dirname, '..', '..')
  : join(__dirname, '..');
const APP_ROOT_DIR = resolve(process.env.APP_ROOT_DIR || DEFAULT_APP_ROOT_DIR);
const DATA_DIR = resolve(process.env.SERVER_DATA_DIR || join(APP_ROOT_DIR, 'server', 'data'));
const SNAPSHOT_PUBLICATION_FILE = join(DATA_DIR, '.snapshots-published');
const loadData = (filename: string): any | null => loadSnapshot(DATA_DIR, filename);
const RELEASE_SHA = (() => {
  const configured = process.env.RELEASE_SHA || process.env.GITHUB_SHA;
  if (configured) return configured;
  try {
    const manifest = JSON.parse(readFileSync(join(APP_ROOT_DIR, 'release.json'), 'utf8'));
    return /^[a-f0-9]{7,40}$/i.test(manifest?.sha) ? String(manifest.sha).toLowerCase() : 'development';
  } catch {
    return 'development';
  }
})();
const CARD_IMAGE_CACHE_DIR = join(DATA_DIR, 'card-images');
const ADMIN_UPLOAD_SOURCE_DIR = process.env.ADMIN_UPLOAD_SOURCE_DIR || join(DATA_DIR, 'uploads', 'admin');
const ADMIN_UPLOAD_DIR = process.env.ADMIN_UPLOAD_DIR || ADMIN_UPLOAD_SOURCE_DIR;
const GALLERY_UPLOAD_DIR = process.env.GALLERY_UPLOAD_DIR || join(DATA_DIR, 'uploads', 'gallery');
const MAX_CARD_IMAGE_JOBS = 4;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BG_DATA_CACHE_MS = Math.max(60_000, Number(process.env.BG_DATA_CACHE_MS || ONE_DAY_MS));
const BG_DATA_STALE_MS = Math.max(60_000, Number(process.env.BG_DATA_STALE_MS || 7 * ONE_DAY_MS));
const BG_JSON_CACHE_CONTROL = `public, max-age=${Math.floor(BG_DATA_CACHE_MS / 1000)}, stale-while-revalidate=${Math.floor(BG_DATA_STALE_MS / 1000)}`;
const BG_IMAGE_CACHE_CONTROL = 'public, max-age=2592000, immutable';

function ensureAdminUploadDirs() {
  mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
  mkdirSync(ADMIN_UPLOAD_SOURCE_DIR, { recursive: true });

  for (const fileName of readdirSync(ADMIN_UPLOAD_SOURCE_DIR)) {
    if (!/^[a-z0-9-]+\.(?:webp|png|jpe?g|gif)$/i.test(fileName)) continue;
    const sourcePath = join(ADMIN_UPLOAD_SOURCE_DIR, fileName);
    const distPath = join(ADMIN_UPLOAD_DIR, fileName);
    try {
      if (!existsSync(distPath)) copyFileSync(sourcePath, distPath);
      chmodSync(distPath, 0o644);
    } catch (err) {
      console.warn('[admin-upload] failed to restore public upload', fileName, err);
    }
  }
}

// ─── In-memory data cache (avoids disk I/O on every request) ──────────────────
interface CacheEntry { data: any; etag: string; mtime: number }
const dataCache = new Map<string, CacheEntry>();
interface MemoryCacheEntry { data: any; etag: string; expiresAt: number }
interface ProxyBodyCacheEntry {
  body: Buffer;
  contentType: string;
  status: number;
  etag: string;
  expiresAt: number;
}
const classMatchupsCache: ClassMatchupCacheStore = { current: null };
const winratesApiCache = new Map<string, MemoryCacheEntry>();
const tierlistApiCache = new Map<string, MemoryCacheEntry>();
const legendariesApiCache = new Map<string, MemoryCacheEntry>();
const standardMatchupsApiCache = new Map<string, MemoryCacheEntry>();
const standardMetaApiCache = new Map<string, MemoryCacheEntry>();
const constructedArchetypeCatalogCache = new Map<string, MemoryCacheEntry>();
const constructedArchetypeHistoryCache = new Map<string, MemoryCacheEntry>();
const constructedArchetypeAnalysisCache = new Map<string, MemoryCacheEntry>();
const viciousSyndicateGoldApiCache = new Map<string, MemoryCacheEntry>();
const viciousSyndicateGoldBuildsApiCache = new Map<string, MemoryCacheEntry>();
let viciousSyndicateGoldBuildsJob: Promise<ViciousGoldBuildCollection> | null = null;
let viciousSyndicateGoldBuildsGeneration = 0;
const standardMetaRecommendationCache = new Map<string, StandardMetaRecommendationCacheEntry<StandardMetaRecommendation>>();
const standardMetaRecommendationJobs = new Map<string, Promise<StandardMetaRecommendation | null>>();
const standardMetaStreamerDeckInfoCache = new Map<string, HsguruDeckInfo>();
let standardMetaStreamerDeckInfoExpiresAt = 0;
let standardMetaStreamerDeckInfoJob: Promise<Map<string, HsguruDeckInfo>> | null = null;
const standardMetaPreviewCache = new Map<string, { preview: StandardMetaPreview; expiresAt: number }>();
const standardMetaPreviewJobs = new Map<string, Promise<StandardMetaPreview>>();
let parserDataCacheGeneration = 0;
let deckviewPreviewActive = 0;
let deckviewPreviewSucceeded = 0;
let deckviewPreviewFailed = 0;
let standardMetaDeckRowsCache: { rows: any[]; expiresAt: number } | null = null;
const STANDARD_META_PREVIEW_CACHE_FILE = join(DATA_DIR, 'standard-meta-preview-cache.json');

function hydrateStandardMetaPreviewCache() {
  try {
    const parsed = JSON.parse(readFileSync(STANDARD_META_PREVIEW_CACHE_FILE, 'utf8'));
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const now = Date.now();
    for (const entry of entries) {
      const key = String(entry?.key ?? '');
      const hash = String(entry?.hash ?? '');
      const expiresAt = Number(entry?.expiresAt);
      if (/^[a-f0-9]{64}$/.test(key) && /^[a-zA-Z0-9_-]{8,96}$/.test(hash) && expiresAt > now) {
        standardMetaPreviewCache.set(key, {
          preview: {
            hash,
            state: String(entry?.state ?? 'queued'),
            ready: Boolean(entry?.ready),
            imageUrl: typeof entry?.imageUrl === 'string' && entry.imageUrl.startsWith('https://') ? entry.imageUrl : null,
            previewImageUrl: typeof entry?.previewImageUrl === 'string' && entry.previewImageUrl.startsWith('https://')
              ? entry.previewImageUrl
              : null,
            error: entry?.error ? String(entry.error).slice(0, 300) : null,
          },
          expiresAt,
        });
      }
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn('[standard-meta] preview cache load failed:', error?.message ?? error);
  }
}

function persistStandardMetaPreviewCache() {
  try {
    mkdirSync(dirname(STANDARD_META_PREVIEW_CACHE_FILE), { recursive: true });
    const now = Date.now();
    const entries = [...standardMetaPreviewCache.entries()]
      .filter(([, value]) => value.expiresAt > now)
      .map(([key, value]) => ({ key, ...value.preview, expiresAt: value.expiresAt }));
    const temporary = `${STANDARD_META_PREVIEW_CACHE_FILE}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, { mode: 0o640 });
    renameSync(temporary, STANDARD_META_PREVIEW_CACHE_FILE);
  } catch (error: any) {
    console.warn('[standard-meta] preview cache save failed:', error?.message ?? error);
  }
}

hydrateStandardMetaPreviewCache();
const battlegroundAppProxyCache = new Map<string, ProxyBodyCacheEntry>();
const MAX_BG_OPTIMIZED_IMAGE_CACHE_ENTRIES = 320;
const homeSummaryApiCache: HomeSummaryCacheStore = { current: null };
const arenaDecksCache: ArenaDecksCacheStore = { current: null };
type CachedCardImage = { path: string; source: CardImageSource };
const cardImageJobs = new Map<string, Promise<CachedCardImage>>();
let activeCardImageJobs = 0;
const cardImageQueue: Array<() => void> = [];
const blizzardCardImageClient = createBlizzardCardImageClient({
  clientId: process.env.BLIZZARD_CLIENT_ID,
  clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
  region: process.env.BLIZZARD_REGION,
});

interface KolodahsCardIndexCache {
  mtime: number;
  byCardId: Map<string, string>;
  byDbf: Map<string, string>;
  fullArtByCardId: Map<string, string>;
  fullArtByDbf: Map<string, string>;
}

let kolodahsCardIndexCache: KolodahsCardIndexCache | null = null;

function loadDataCached(filename: string): CacheEntry | null {
  const filePath = join(DATA_DIR, filename);
  try {
    const mtime = statSync(filePath).mtimeMs;
    const cached = dataCache.get(filename);
    if (cached && cached.mtime === mtime) return cached;
    const data = loadData(filename);
    if (!data) return null;
    const entry: CacheEntry = { data, etag: `"${mtime.toString(36)}-${filename}"`, mtime };
    dataCache.set(filename, entry);
    return entry;
  } catch { return null; }
}

/** Call after scrape to invalidate stale cache entries */
function invalidateDataCache() {
  dataCache.clear();
  winratesApiCache.clear();
  tierlistApiCache.clear();
  legendariesApiCache.clear();
  standardMatchupsApiCache.clear();
  battlegroundAppProxyCache.clear();
  homeSummaryApiCache.current = null;
  classMatchupsCache.current = null;
  arenaDecksCache.current = null;
  void clearRedisDataCache();
}
let observedSnapshotPublicationMtime = 0;

function observeSnapshotPublication(): void {
  try {
    const mtime = statSync(SNAPSHOT_PUBLICATION_FILE).mtimeMs;
    if (mtime <= observedSnapshotPublicationMtime) return;
    observedSnapshotPublicationMtime = mtime;
    invalidateDataCache();
    console.log('[snapshots] activated newly published validated data');
  } catch {
    // The marker is optional until the first atomic publication.
  }
}
const AUTH_FILE = join(DATA_DIR, 'admin_auth.json');
const ECOSYSTEM_DIR = process.env.ECOSYSTEM_DIR || '/var/lib/manacost-ecosystem';
const ECOSYSTEM_DB_FILE = process.env.ECOSYSTEM_DB_FILE || join(ECOSYSTEM_DIR, 'users.sqlite');
const ECOSYSTEM_INTERNAL_KEY = process.env.ECOSYSTEM_INTERNAL_KEY || '';
const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || 'user_42368c85b8de')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
);
const APP_URL = (process.env.APP_URL || 'https://hearthpulse.net').replace(/\/$/, '');
const KOLODAHS_DB_ROOT = process.env.KOLODAHS_DB_ROOT || '/var/www/koloda/data/www/db.kolodahs.ru';
const KOLODAHS_WIKI_CARD_INDEX_FILE = join(KOLODAHS_DB_ROOT, 'var/wiki-hs-cache/wiki-card-index-card.json');
const DECKVIEW_ARCHETYPES_API_URL = (process.env.DECKVIEW_ARCHETYPES_API_URL || process.env.DECKVIEW_API_URL || '').trim();
const DECKVIEW_ARCHETYPES_CSV_URL = process.env.DECKVIEW_ARCHETYPES_CSV_URL
  || 'https://raw.githubusercontent.com/Zulut30/deckview-telegram-bot/main/%D0%90%D1%80%D1%85%D0%B5%D1%82%D0%B8%D0%BF%D1%8B.csv';
const BLIZZCORE_ARCHETYPES_API_URL = process.env.BLIZZCORE_ARCHETYPES_API_URL
  || 'https://api.blizzcore.ru/archetypes?limit=500';
const STANDARD_ARCHETYPE_TRANSLATION_CACHE_MS = Math.max(60_000, Number(process.env.STANDARD_ARCHETYPE_TRANSLATION_CACHE_MS || 6 * 60 * 60 * 1000));
const KOLODAHS_RELATED_CARD_PAGES_DIR = join(KOLODAHS_DB_ROOT, 'var/wiki-hs-cache/related-card-pages');
const AUTH_COOKIE_NAME = 'manacost_auth_token';
const AUTH_FROM = process.env.AUTH_FROM || 'noreply@hs-manacost.ru';
const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM || AUTH_FROM;
const NEWSLETTER_FROM_NAME = (process.env.NEWSLETTER_FROM_NAME || 'Manacost').trim();
const NEWSLETTER_UNSUBSCRIBE_SECRET = (process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || ECOSYSTEM_INTERNAL_KEY).trim();
const LOCAL_SMTP_HOST = (process.env.LOCAL_SMTP_HOST || '127.0.0.1').trim();
const LOCAL_SMTP_PORT = Math.max(1, Math.min(65_535, Number(process.env.LOCAL_SMTP_PORT || 25)));
const NEWSLETTER_HTML_MAX_LENGTH = Math.max(10_000, Number(process.env.NEWSLETTER_HTML_MAX_LENGTH || 120_000));
const LOCAL_SMTP_TIMEOUT_MS = Math.max(1_000, Math.min(120_000, Number(process.env.LOCAL_SMTP_TIMEOUT_MS || 30_000)));
const NEWSLETTER_LEGACY_MIGRATION_KEY = 'mailing_contacts_legacy_consent_migrated_v1';
const AUTH_SESSION_TTL_MS = Math.max(
  14 * ONE_DAY_MS,
  Number(process.env.AUTH_SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000),
);
const AUTH_MAX_SESSIONS_PER_USER = Math.max(2, Math.floor(Number(process.env.AUTH_MAX_SESSIONS_PER_USER || 8)));
const AUTH_SESSION_REFRESH_WINDOW_MS = Math.max(
  60 * 60 * 1000,
  Math.min(
    AUTH_SESSION_TTL_MS / 2,
    Number(process.env.AUTH_SESSION_REFRESH_WINDOW_MS || 7 * 24 * 60 * 60 * 1000),
  ),
);
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_MAX_ATTEMPTS = 5;
const AUTH_CODE_REQUEST_COOLDOWN_MS = Math.max(30_000, Number(process.env.AUTH_CODE_REQUEST_COOLDOWN_MS || 60_000));
const AUTH_CODE_ISSUE_WINDOW_MS = Math.max(5 * 60_000, Number(process.env.AUTH_CODE_ISSUE_WINDOW_MS || 60 * 60 * 1000));
const AUTH_CODE_MAX_ISSUES_PER_WINDOW = Math.max(1, Number(process.env.AUTH_CODE_MAX_ISSUES_PER_WINDOW || 5));
const TELEGRAM_AUTH_BOT_TOKEN = process.env.TELEGRAM_AUTH_BOT_TOKEN || '';
const TELEGRAM_AUTH_BOT_USERNAME = (process.env.TELEGRAM_AUTH_BOT_USERNAME || '').trim().replace(/^@/, '');
const TELEGRAM_BOT_API_BASE = (process.env.TELEGRAM_BOT_API_BASE || process.env.TELEGRAM_AUTH_BOT_API_BASE || 'http://127.0.0.1:8081').replace(/\/+$/, '');
const TELEGRAM_PUBLIC_BOT_API_BASE = 'https://api.telegram.org';
const TELEGRAM_AUTH_BOT_WEBHOOK_SECRET = (process.env.TELEGRAM_AUTH_BOT_WEBHOOK_SECRET || (TELEGRAM_AUTH_BOT_TOKEN
  ? createHash('sha256').update(`auth-bot:${TELEGRAM_AUTH_BOT_TOKEN}`).digest('hex').slice(0, 32)
  : '')).trim();
const TELEGRAM_AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_LINK_CODE_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.TELEGRAM_LINK_CODE_TTL_MS || 15 * 60 * 1000));
const TELEGRAM_OIDC_CLIENT_ID = (process.env.TELEGRAM_OIDC_CLIENT_ID || process.env.TELEGRAM_AUTH_CLIENT_ID || '').trim();
const TELEGRAM_OIDC_CLIENT_SECRET = (process.env.TELEGRAM_OIDC_CLIENT_SECRET || process.env.TELEGRAM_AUTH_CLIENT_SECRET || '').trim();
const TELEGRAM_OIDC_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_OIDC_DISCOVERY_URL = `${TELEGRAM_OIDC_ISSUER}/.well-known/openid-configuration`;
const TELEGRAM_OIDC_COOKIE_NAME = 'manacost_tg_oidc';
const TELEGRAM_OIDC_STATE_TTL_MS = 10 * 60 * 1000;
const SOCIAL_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SOCIAL_OAUTH_CLIENTS: Record<SocialProvider, { clientId: string; clientSecret: string }> = {
  discord: { clientId: (process.env.DISCORD_OAUTH_CLIENT_ID || '').trim(), clientSecret: (process.env.DISCORD_OAUTH_CLIENT_SECRET || '').trim() },
  google: { clientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(), clientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim() },
  yandex: { clientId: (process.env.YANDEX_OAUTH_CLIENT_ID || '').trim(), clientSecret: (process.env.YANDEX_OAUTH_CLIENT_SECRET || '').trim() },
};
const BOOSTY_AUTH_API_URL = (process.env.BOOSTY_AUTH_API_URL || 'http://127.0.0.1:18082').replace(/\/$/, '');
const loadBoostyArticleAnalytics = createBoostyAnalyticsLoader({
  boostyBaseUrl: BOOSTY_AUTH_API_URL,
});
const BOOSTY_MIN_PRICE = Number(process.env.BOOSTY_MIN_PRICE || 99);
const BOOSTY_MIN_LEVEL_NAME = (process.env.BOOSTY_MIN_LEVEL_NAME || 'Любитель Арены').trim();
const BOOSTY_LEVEL_ORDER = (process.env.BOOSTY_LEVEL_ORDER || 'Любитель Арены,Алмаз')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const BOOSTY_ARENA_LEVEL_NAMES = (process.env.BOOSTY_ARENA_LEVEL_NAMES || 'Любитель Арены')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const BOOSTY_BATTLEGROUNDS_LEVEL_NAMES = (process.env.BOOSTY_BATTLEGROUNDS_LEVEL_NAMES || 'Таверна Боба')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const BOOSTY_ALL_ACCESS_LEVEL_NAMES = (process.env.BOOSTY_ALL_ACCESS_LEVEL_NAMES || 'Алмаз,Легенда,Топ-1 Легенды,Топ-1000 Легенды')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const KHA_VIP_BOT_TOKEN = process.env.KHA_VIP_BOT_TOKEN || '';
const KHA_VIP_PROFILES_FILE = process.env.KHA_VIP_PROFILES_FILE || '/var/lib/docker/volumes/kha-vip-bot_bot_cache/_data/profiles.json';
const KHA_VIP_WP_BASE_URL = (process.env.KHA_VIP_WP_BASE_URL || process.env.WP_BASE_URL || 'https://kolodahearthstone.com').replace(/\/$/, '');
const KHA_VIP_WP_BEARER = process.env.KHA_VIP_WP_BEARER || process.env.WP_BEARER || '';
const KHA_VIP_LOCKERS_CACHE_MS = Math.max(60_000, Number(process.env.KHA_VIP_LOCKERS_CACHE_MS || 5 * 60 * 1000));
const KHA_VIP_ARTICLE_HOSTS = new Set([
  'kolodahearthstone.com',
  'www.kolodahearthstone.com',
  'kolodahearthstone.ru',
  'www.kolodahearthstone.ru',
]);
const KOLODAHS_API_BASE_URL = (process.env.KOLODAHS_API_BASE_URL || 'https://api.kolodahearthstone.com/api/v1').replace(/\/$/, '');
const HEARTHSTONE_RU_CARDS_URL = process.env.HEARTHSTONE_RU_CARDS_URL
  || 'https://api.hearthstonejson.com/v1/latest/ruRU/cards.json';
const OLD_GUIDES_DB_FILE = process.env.OLD_GUIDES_DB_FILE || '/var/www/koloda/data/old-sites/kolodahearthstone.ru_old/db/guides.sqlite';
const OLD_GUIDES_PUBLIC_URL = (process.env.OLD_GUIDES_PUBLIC_URL || 'https://old.kolodahearthstone.ru').replace(/\/$/, '');
const EXTRA_BG_LIBRARY_ENDPOINTS: Record<string, string> = {
  heroes: '/heroes',
  anomaly: '/anomalies',
  dark_gift: '/dark-gifts',
  quest: '/quests',
  darkmoon_prize: '/darkmoon-prizes',
  reward: '/rewards',
  trinket: '/trinkets',
  timewarped: '/timewarped-cards',
};
const SUBSCRIPTION_TELEGRAM_CHAT_IDS = (process.env.SUBSCRIPTION_TELEGRAM_CHAT_IDS || '-5001968053,-1002311131780,-5077378176')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const SUBSCRIPTION_REFRESH_MS = 30 * 60 * 1000;
const SUBSCRIPTION_STALE_RETRY_MS = Math.max(
  60_000,
  Number(process.env.SUBSCRIPTION_STALE_RETRY_MS || 5 * 60 * 1000),
);
const BOOSTY_ACCESS_GRACE_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.BOOSTY_ACCESS_GRACE_MS || 24 * 60 * 60 * 1000),
);
const REDIS_URL = (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim();
const REDIS_ENABLED = process.env.REDIS_ENABLED !== '0' && REDIS_URL !== '';
const REDIS_CACHE_PREFIX = process.env.REDIS_CACHE_PREFIX || 'hs-arena:v2';
const REDIS_DATASET_TTL_SECONDS = Math.max(60, Number(process.env.REDIS_DATASET_TTL_SECONDS || 6 * 60 * 60));
const REDIS_HOME_SUMMARY_TTL_SECONDS = Math.max(60, Number(process.env.REDIS_HOME_SUMMARY_TTL_SECONDS || 5 * 60));
const DATASET_MEMORY_CACHE_MS = Math.max(60_000, Number(process.env.DATASET_MEMORY_CACHE_MS || 5 * 60 * 1000));
const HOME_SUMMARY_CACHE_MS = REDIS_HOME_SUMMARY_TTL_SECONDS * 1000;
const CONTEST_ADMIN_USER_ID = 'user_42368c85b8de';
const CONTEST_PUBLIC_ID_SECRET = process.env.CONTEST_PUBLIC_ID_SECRET || ECOSYSTEM_INTERNAL_KEY || 'manacost-contest-public-winner-v2';
const CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES = Number.isFinite(Number(process.env.CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES))
  ? Number(process.env.CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES)
  : 180;
const ADMIN_UPLOAD_MAX_BYTES = Math.max(1024 * 1024, Number(process.env.ADMIN_UPLOAD_MAX_BYTES || 12 * 1024 * 1024));
const ADMIN_UPLOAD_MAX_PIXELS = Math.max(1_000_000, Number(process.env.ADMIN_UPLOAD_MAX_PIXELS || 16_000_000));
const ADMIN_UPLOAD_MAX_WIDTH = Math.max(1000, Number(process.env.ADMIN_UPLOAD_MAX_WIDTH || 6000));
const ADMIN_UPLOAD_MAX_HEIGHT = Math.max(1000, Number(process.env.ADMIN_UPLOAD_MAX_HEIGHT || 6000));
const GALLERY_UPLOAD_MAX_BYTES = Math.max(5 * 1024 * 1024, Number(process.env.GALLERY_UPLOAD_MAX_BYTES || 32 * 1024 * 1024));
const GALLERY_UPLOAD_MAX_PIXELS = Math.max(4_000_000, Number(process.env.GALLERY_UPLOAD_MAX_PIXELS || 80_000_000));
const GALLERY_PREVIEW_MAX_WIDTH = Math.max(1200, Number(process.env.GALLERY_PREVIEW_MAX_WIDTH || 2400));
const GALLERY_THUMB_MAX_WIDTH = Math.max(360, Number(process.env.GALLERY_THUMB_MAX_WIDTH || 720));

interface AdminUser {
  id: string;
  publicProfileId?: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  country?: string;
  newsletterOptIn?: boolean;
  avatarInitials?: string;
  telegramId?: string;
  telegramUsername?: string;
  photoUrl?: string;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
  blockedAt?: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface SubscriptionStatus {
  hasAccess: boolean;
  source: string;
  checkedAt: string | null;
  stale: boolean;
  message: string;
  entitlements: SubscriptionEntitlements;
  boosty: Record<string, any>;
  telegram: Record<string, any>;
}

type SubscriptionEntitlementKey =
  | 'arena'
  | 'battlegrounds'
  | 'standard'
  | 'contests'
  | 'guidesArchive'
  | 'arenaArticles'
  | 'battlegroundsArticles';

type SubscriptionEntitlements = Record<SubscriptionEntitlementKey, boolean>;

interface PendingCode {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

interface AdminSession {
  tokenHash: string;
  userId?: string;
  email: string;
  expiresAt: number;
  createdAt: string;
}

interface AdminAuthStore {
  users: AdminUser[];
  pendingCodes: PendingCode[];
  sessions: AdminSession[];
  updatedAt: string;
}

interface RedisCachePayload<T = any> {
  data: T;
  etag: string;
  cachedAt: string;
}

interface RedisProxyCachePayload {
  bodyBase64: string;
  contentType: string;
  status: number;
  etag: string;
  cachedAt: string;
}

interface KhaVipLocker {
  post_id: number;
  code: string;
  title: string;
  url: string;
  image?: string;
  excerpt?: string;
  date?: string;
  type?: string;
}

let redisClientPromise: Promise<any | null> | null = null;
let redisDisabledUntil = 0;
let redisWarningPrinted = false;
let khaVipLockersCache: { items: KhaVipLocker[]; expiresAt: number } | null = null;
let oldGuidesDb: DatabaseSync | null = null;

function redisDataKey(kind: string, source = 'default'): string {
  return `${REDIS_CACHE_PREFIX}:data:${kind}:${source}`;
}

async function getRedisClient(): Promise<any | null> {
  if (!REDIS_ENABLED || Date.now() < redisDisabledUntil) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({ url: REDIS_URL });
      client.on('error', (err: any) => {
        if (!redisWarningPrinted) {
          console.warn('[redis] client error:', err?.message ?? err);
          redisWarningPrinted = true;
        }
      });
      client.on('end', () => {
        redisClientPromise = null;
      });
      await client.connect();
      return client;
    })().catch((err: any) => {
      console.warn('[redis] unavailable, falling back to memory cache:', err?.message ?? err);
      redisClientPromise = null;
      redisDisabledUntil = Date.now() + 60_000;
      return null;
    });
  }
  return redisClientPromise;
}

async function redisGetCache<T = any>(key: string): Promise<RedisCachePayload<T> | null> {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RedisCachePayload<T>;
    if (!parsed?.etag || parsed.data === undefined) return null;
    return parsed;
  } catch (err: any) {
    console.warn('[redis] read failed:', err?.message ?? err);
    return null;
  }
}

async function redisSetCache(key: string, data: any, etag: string, ttlSeconds: number): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;
    const payload: RedisCachePayload = { data, etag, cachedAt: new Date().toISOString() };
    await client.set(key, JSON.stringify(payload), { EX: ttlSeconds });
  } catch (err: any) {
    console.warn('[redis] write failed:', err?.message ?? err);
  }
}

async function redisGetProxyCache(key: string): Promise<{
  body: Buffer;
  contentType: string;
  status: number;
  etag: string;
} | null> {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RedisProxyCachePayload;
    if (!parsed?.bodyBase64 || !parsed.etag || !parsed.contentType || !parsed.status) return null;
    return {
      body: Buffer.from(parsed.bodyBase64, 'base64'),
      contentType: parsed.contentType,
      status: parsed.status,
      etag: parsed.etag,
    };
  } catch (err: any) {
    console.warn('[redis] proxy read failed:', err?.message ?? err);
    return null;
  }
}

async function redisSetProxyCache(
  key: string,
  entry: { body: Buffer; contentType: string; status: number; etag: string },
  ttlSeconds: number,
): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;
    const payload: RedisProxyCachePayload = {
      bodyBase64: entry.body.toString('base64'),
      contentType: entry.contentType,
      status: entry.status,
      etag: entry.etag,
      cachedAt: new Date().toISOString(),
    };
    await client.set(key, JSON.stringify(payload), { EX: ttlSeconds });
  } catch (err: any) {
    console.warn('[redis] proxy write failed:', err?.message ?? err);
  }
}

function redisHashedDataKey(kind: string, value: string): string {
  return redisDataKey(kind, createHash('sha1').update(value).digest('hex').slice(0, 32));
}

async function clearRedisDataCache(options: { throwOnError?: boolean } = {}): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) {
      if (options.throwOnError && REDIS_ENABLED) throw new Error('Redis недоступен для очистки кеша');
      return;
    }
    const keys = await client.keys(`${REDIS_CACHE_PREFIX}:data:*`);
    if (keys.length) await client.del(keys);
  } catch (err: any) {
    console.warn('[redis] clear failed:', err?.message ?? err);
    if (options.throwOnError) throw err;
  }
}

function normalizeKolodahsCardIdFromImage(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const file = decodeURIComponent(url.pathname.split('/').pop() || '');
    return file.replace(/\.(png|jpe?g|webp)$/i, '');
  } catch {
    const file = decodeURIComponent(raw.split('?')[0].split('/').pop() || '');
    return file.replace(/\.(png|jpe?g|webp)$/i, '');
  }
}

function kolodahsRelatedPageFilename(pageTitle: string): string {
  return `${pageTitle
    .replace(/[\/\s]+/g, '_')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')}.json`;
}

function kolodahsFullImageFromGalleryItem(item: any): string {
  const fileUrl = String(item?.file_url || '').trim();
  if (fileUrl) return fileUrl;

  const thumbUrl = String(item?.thumb_url || '').trim();
  if (!thumbUrl) return '';
  const match = thumbUrl.match(/^(.*?\/images\/)thumb\/(.+?)\/[^/?]+(\?.*)?$/);
  return match ? `${match[1]}${match[2]}${match[3] || ''}` : thumbUrl;
}

function loadKolodahsCardIndex(): KolodahsCardIndexCache | null {
  try {
    const fileStat = statSync(KOLODAHS_WIKI_CARD_INDEX_FILE);
    if (kolodahsCardIndexCache?.mtime === fileStat.mtimeMs) return kolodahsCardIndexCache;

    const parsed = JSON.parse(readFileSync(KOLODAHS_WIKI_CARD_INDEX_FILE, 'utf8'));
    const byCardId = new Map<string, string>();
    const byDbf = new Map<string, string>();
    const fullArtByCardId = new Map<string, string>();
    const fullArtByDbf = new Map<string, string>();
    const fullArtByPageTitle = new Map<string, string>();
    for (const entry of Array.isArray(parsed?.entries) ? parsed.entries : []) {
      const pageTitle = String(entry?.page_title || '').trim();
      if (!pageTitle) continue;
      const cardId = String(entry?.card_id || '').trim();
      if (cardId) byCardId.set(cardId, pageTitle);
      const dbf = entry?.dbf_id;
      if (dbf !== null && dbf !== undefined && String(dbf).trim()) {
        byDbf.set(String(dbf), pageTitle);
      }

      let fullArt = fullArtByPageTitle.get(pageTitle);
      if (fullArt === undefined) {
        fullArt = kolodahsFullArtFromRelatedPage(pageTitle);
        fullArtByPageTitle.set(pageTitle, fullArt);
      }
      if (fullArt && cardId) fullArtByCardId.set(cardId, fullArt);
      if (fullArt && dbf !== null && dbf !== undefined && String(dbf).trim()) {
        fullArtByDbf.set(String(dbf), fullArt);
      }
    }

    kolodahsCardIndexCache = { mtime: fileStat.mtimeMs, byCardId, byDbf, fullArtByCardId, fullArtByDbf };
    return kolodahsCardIndexCache;
  } catch (err: any) {
    console.warn('[kolodahs full-art] card index unavailable:', err?.message ?? err);
    return null;
  }
}

function kolodahsFullArtFromRelatedPage(pageTitle: string): string {
  try {
    const file = join(KOLODAHS_RELATED_CARD_PAGES_DIR, kolodahsRelatedPageFilename(pageTitle));
    if (!existsSync(file)) return '';
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const gallery = Array.isArray(parsed?.gallery_images) ? parsed.gallery_images : [];
    const fullArt = gallery.find((item: any) => {
      const haystack = `${item?.caption || ''} ${item?.file_title || ''} ${item?.file_name || ''}`.toLowerCase();
      return kolodahsFullImageFromGalleryItem(item) && haystack.includes('full');
    }) || gallery.find((item: any) => kolodahsFullImageFromGalleryItem(item));
    return kolodahsFullImageFromGalleryItem(fullArt);
  } catch (err: any) {
    console.warn('[kolodahs full-art] related page unavailable:', pageTitle, err?.message ?? err);
    return '';
  }
}

function kolodahsFullArtForCard(card: any, fallbackDbf?: unknown): string {
  const index = loadKolodahsCardIndex();
  if (!index || !card) return '';
  const explicitCardId = String(card?.card_id || card?.cardId || '').trim();
  const imageCardId = normalizeKolodahsCardIdFromImage(card?.image || card?.image_gold || card?.crop_image);
  const dbf = card?.dbf ?? card?.dbf_id ?? card?.dbfId ?? fallbackDbf;
  return (explicitCardId && index.fullArtByCardId.get(explicitCardId))
    || (imageCardId && index.fullArtByCardId.get(imageCardId))
    || (dbf !== null && dbf !== undefined && index.fullArtByDbf.get(String(dbf)))
    || '';
}

function enrichBattlegroundHeroPayload(payload: any): any {
  const heroPower = payload?.libraryHero?.hero_power;
  const card = heroPower?.card;
  if (!card || card.full_art || card.fullArt) return payload;
  const fullArt = kolodahsFullArtForCard(card, heroPower?.dbf);
  if (!fullArt) return payload;

  return {
    ...payload,
    libraryHero: {
      ...payload.libraryHero,
      hero_power: {
        ...heroPower,
        card: {
          ...card,
          full_art: fullArt,
        },
      },
    },
  };
}

const kolodahsPrewarmTimer = setTimeout(() => {
  loadKolodahsCardIndex();
}, 1_000);
kolodahsPrewarmTimer.unref?.();

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmacSha256(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqualHex(leftHex: string, rightHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(leftHex) || !/^[a-f0-9]+$/i.test(rightHex)) return false;
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function safeEqualString(leftValue: unknown, rightValue: string): boolean {
  const left = Buffer.from(String(leftValue ?? ''));
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hashSecret(secret: string, salt = randomBytes(16).toString('hex')): string {
  const hash = scryptSync(secret, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifySecret(secret: string, stored: string): boolean {
  const [, salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(secret, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let ecosystemDb: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (ecosystemDb) return ecosystemDb;
  mkdirSync(ECOSYSTEM_DIR, { recursive: true });
  ecosystemDb = new DatabaseSync(ECOSYSTEM_DB_FILE);
  configureWritableSqliteConnection(ecosystemDb);
  ecosystemDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      public_profile_id TEXT,
      public_numeric_id INTEGER,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      country TEXT,
      newsletter_opt_in INTEGER NOT NULL DEFAULT 0,
      avatar_initials TEXT,
      contact_vk_url TEXT,
      contact_telegram TEXT,
      contact_email TEXT,
      blocked_at TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      username TEXT,
      photo_url TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_user_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS telegram_link_tokens (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT,
      telegram_id TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user ON telegram_link_tokens(user_id, expires_at);
    CREATE TABLE IF NOT EXISTS telegram_email_codes (
      telegram_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      has_access INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'none',
      message TEXT NOT NULL DEFAULT '',
      checked_at TEXT,
      stale INTEGER NOT NULL DEFAULT 0,
      boosty_json TEXT NOT NULL DEFAULT '{}',
      telegram_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS subscription_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      has_access INTEGER NOT NULL DEFAULT 0,
      detail_json TEXT NOT NULL DEFAULT '{}',
      checked_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS manual_subscription_grants (
      user_id TEXT PRIMARY KEY,
      active INTEGER NOT NULL DEFAULT 1,
      entitlements_json TEXT NOT NULL DEFAULT '{}',
      granted_by TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      expires_at TEXT,
      revoked_by TEXT,
      revoked_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS contests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      prize TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      starts_at TEXT,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      winners_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contest_entries (
      id TEXT PRIMARY KEY,
      contest_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      contact_json TEXT NOT NULL DEFAULT '{}',
      subscription_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      UNIQUE(contest_id, user_id),
      FOREIGN KEY(contest_id) REFERENCES contests(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS referral_links (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      campaign TEXT NOT NULL DEFAULT '',
      target_path TEXT NOT NULL DEFAULT '/',
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS referral_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_id TEXT NOT NULL,
      clicked_at TEXT NOT NULL,
      ip_hash TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      landing_path TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(referral_id) REFERENCES referral_links(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS article_votes (
      article_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vote INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(article_id, user_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS mailing_contacts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      user_id TEXT,
      name TEXT NOT NULL DEFAULT '',
      consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK(consent_status IN ('unknown', 'subscribed', 'unsubscribed', 'suppressed')),
      consent_source TEXT NOT NULL DEFAULT '',
      consented_at TEXT,
      verified_at TEXT,
      unsubscribed_at TEXT,
      suppressed_reason TEXT NOT NULL DEFAULT '',
      account_state TEXT NOT NULL DEFAULT 'current' CHECK(account_state IN ('current', 'former')),
      former_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS mailing_campaigns (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      preheader TEXT NOT NULL DEFAULT '',
      html_body TEXT NOT NULL,
      text_body TEXT NOT NULL DEFAULT '',
      template_key TEXT NOT NULL DEFAULT 'custom',
      segment TEXT NOT NULL DEFAULT 'all-consented',
      status TEXT NOT NULL DEFAULT 'queued',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS mailing_deliveries (
      campaign_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      email_snapshot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      accepted_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(campaign_id, contact_id),
      FOREIGN KEY(campaign_id) REFERENCES mailing_campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id) REFERENCES mailing_contacts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS archetype_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blizzcore_id INTEGER UNIQUE,
      name_en TEXT NOT NULL,
      name_en_key TEXT NOT NULL UNIQUE,
      name_ru TEXT NOT NULL,
      name_ru_key TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'blizzcore' CHECK(source IN ('blizzcore', 'manual')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      updated_by TEXT
    );
    ${ARCHETYPE_DECK_CODES_TABLE_SQL};
    CREATE TABLE IF NOT EXISTS mechanic_translations (
      mechanic_key TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  ensureArchetypeDeckCodesAllRank(ecosystemDb);
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_referral_clicks_referral_time ON referral_clicks(referral_id, clicked_at DESC);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_article_votes_article ON article_votes(article_id);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_contacts_status ON mailing_contacts(consent_status, account_state);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_contacts_user ON mailing_contacts(user_id);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_campaigns_created ON mailing_campaigns(created_at DESC);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_deliveries_status ON mailing_deliveries(campaign_id, status, attempts);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_archetype_translations_source ON archetype_translations(source, updated_at DESC);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_archetype_deck_codes_updated ON archetype_deck_codes(updated_at DESC);');
  repairLegacyConstructedMechanicTranslations(ecosystemDb);
  const userColumns = new Set((ecosystemDb.prepare('PRAGMA table_info(users)').all() as any[]).map(row => String(row.name)));
  if (!userColumns.has('contact_vk_url')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_vk_url TEXT');
  if (!userColumns.has('contact_telegram')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_telegram TEXT');
  if (!userColumns.has('contact_email')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_email TEXT');
  if (!userColumns.has('blocked_at')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN blocked_at TEXT');
  ensurePublicProfileIds(ecosystemDb, { preferredUserIds: [...ADMIN_USER_IDS] });
  const manualGrantColumns = new Set((ecosystemDb.prepare('PRAGMA table_info(manual_subscription_grants)').all() as any[]).map(row => String(row.name)));
  if (!manualGrantColumns.has('expires_at')) ecosystemDb.exec('ALTER TABLE manual_subscription_grants ADD COLUMN expires_at TEXT');
  migrateLegacyAuthStore(ecosystemDb);
  syncKhaVipProfiles(ecosystemDb);
  syncExistingMailingContacts(ecosystemDb);
  return ecosystemDb;
}

function dbGet<T = any>(sql: string, ...params: any[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

function dbAll<T = any>(sql: string, ...params: any[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

function dbRun(sql: string, ...params: any[]) {
  db().prepare(sql).run(...params);
}

function identityOwner(provider: string, providerUserId: string): { user_id: string } | undefined {
  const normalized = providerUserId.trim();
  if (!provider || !normalized) return undefined;
  return dbGet<{ user_id: string }>(
    'SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?',
    provider,
    normalized,
  );
}

function identityBelongsToAnotherUser(provider: string, providerUserId: string, userId: string): boolean {
  const owner = identityOwner(provider, providerUserId);
  return Boolean(owner?.user_id && owner.user_id !== userId);
}

function assertIdentityAvailable(provider: string, providerUserId: string, userId: string, label: string) {
  if (identityBelongsToAnotherUser(provider, providerUserId, userId)) {
    throw new Error(`${label} уже привязан к другому аккаунту`);
  }
}

function migrateLegacyAuthStore(database: DatabaseSync) {
  const migrated = database.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_auth_migrated') as { value?: string } | undefined;
  if (migrated?.value === '1') return;

  const legacy = existsSync(AUTH_FILE) ? loadData('admin_auth.json') as Partial<AdminAuthStore> | null : null;
  const nowIso = new Date().toISOString();
  try {
    database.exec('BEGIN IMMEDIATE');
    for (const user of Array.isArray(legacy?.users) ? legacy!.users as AdminUser[] : []) {
      upsertUserRow(database, user);
    }
    for (const code of Array.isArray(legacy?.pendingCodes) ? legacy!.pendingCodes as PendingCode[] : []) {
      if (code.expiresAt > Date.now() && code.attempts < AUTH_CODE_MAX_ATTEMPTS) {
        database.prepare(`
          INSERT INTO pending_codes (email, code_hash, expires_at, attempts)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = excluded.attempts
        `).run(code.email, code.codeHash, code.expiresAt, code.attempts);
      }
    }
    for (const session of Array.isArray(legacy?.sessions) ? legacy!.sessions as AdminSession[] : []) {
      if (session.expiresAt <= Date.now()) continue;
      const user = database.prepare('SELECT id FROM users WHERE email = ?').get(session.email) as { id?: string } | undefined;
      if (!user?.id) continue;
      database.prepare(`
        INSERT OR REPLACE INTO sessions (token_hash, user_id, email, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(session.tokenHash, user.id, session.email, session.expiresAt, session.createdAt);
    }
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('legacy_auth_migrated', '1');
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('legacy_auth_migrated_at', nowIso);
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function mailingContactId(email: string): string {
  return `mail_${sha256(normalizeEmail(email)).slice(0, 24)}`;
}

function syncMailingContactForUser(database: DatabaseSync, user: AdminUser, options: { confirmConsent?: boolean; source?: string } = {}) {
  const email = normalizeEmail(user.email);
  if (!isRealEmail(email)) return;
  const nowIso = new Date().toISOString();
  const source = normalizeOptionalText(options.source, 80) || 'user-sync';
  const consentKnown = Boolean(options.confirmConsent);
  const desiredStatus = user.newsletterOptIn ? (consentKnown ? 'subscribed' : 'unknown') : 'unsubscribed';
  const confirmedAt = options.confirmConsent && user.newsletterOptIn ? nowIso : null;

  database.prepare(`
    UPDATE mailing_contacts
    SET user_id = NULL,
        consent_status = 'suppressed',
        suppressed_reason = 'email-replaced',
        updated_at = ?
    WHERE user_id = ? AND lower(email) <> lower(?)
  `).run(nowIso, user.id, email);

  database.prepare(`
    INSERT INTO mailing_contacts (
      id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
      unsubscribed_at, suppressed_reason, account_state, former_at, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'current', NULL, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      consent_status = CASE
        WHEN excluded.consent_status = 'unknown' THEN mailing_contacts.consent_status
        WHEN mailing_contacts.consent_status IN ('unsubscribed', 'suppressed') AND excluded.verified_at IS NULL
          THEN mailing_contacts.consent_status
        ELSE excluded.consent_status
      END,
      consent_source = CASE
        WHEN excluded.consent_status = 'unknown' THEN mailing_contacts.consent_source
        WHEN mailing_contacts.consent_status IN ('unsubscribed', 'suppressed') AND excluded.verified_at IS NULL
          THEN mailing_contacts.consent_source
        ELSE excluded.consent_source
      END,
      consented_at = CASE
        WHEN excluded.consent_status = 'subscribed' AND (excluded.verified_at IS NOT NULL OR mailing_contacts.consented_at IS NULL)
          THEN COALESCE(excluded.consented_at, mailing_contacts.consented_at)
        ELSE mailing_contacts.consented_at
      END,
      verified_at = COALESCE(excluded.verified_at, mailing_contacts.verified_at),
      unsubscribed_at = CASE WHEN excluded.verified_at IS NOT NULL THEN NULL ELSE mailing_contacts.unsubscribed_at END,
      suppressed_reason = CASE WHEN excluded.verified_at IS NOT NULL THEN '' ELSE mailing_contacts.suppressed_reason END,
      account_state = 'current',
      former_at = NULL,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `).run(
    mailingContactId(email),
    email,
    user.id,
    normalizeOptionalText(user.name, 120),
    desiredStatus,
    source,
    desiredStatus === 'subscribed' ? (confirmedAt || user.createdAt || nowIso) : null,
    confirmedAt,
    user.newsletterOptIn ? null : nowIso,
    user.createdAt || nowIso,
    nowIso,
    nowIso,
  );
}

function syncExistingMailingContacts(database: DatabaseSync) {
  const migrated = database.prepare('SELECT value FROM meta WHERE key = ?').get(NEWSLETTER_LEGACY_MIGRATION_KEY) as { value?: string } | undefined;
  if (migrated?.value === '1') return;

  try {
    database.exec('BEGIN IMMEDIATE');
    const rows = database.prepare('SELECT * FROM users').all() as any[];
    for (const row of rows) {
      const user = authUserFromRow(row);
      syncMailingContactForUser(database, user, {
        confirmConsent: Boolean(user.newsletterOptIn),
        source: 'legacy-registration',
      });
    }
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(NEWSLETTER_LEGACY_MIGRATION_KEY, '1');
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(`${NEWSLETTER_LEGACY_MIGRATION_KEY}_at`, new Date().toISOString());
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function updateMailingConsent(user: AdminUser, subscribed: boolean, source: string) {
  user.newsletterOptIn = subscribed;
  syncMailingContactForUser(db(), user, { confirmConsent: subscribed, source });
  if (!subscribed) {
    const nowIso = new Date().toISOString();
    dbRun(`
      UPDATE mailing_contacts
      SET consent_status = 'unsubscribed', unsubscribed_at = ?, suppressed_reason = 'user-unsubscribed', updated_at = ?
      WHERE lower(email) = lower(?)
    `, nowIso, nowIso, normalizeEmail(user.email));
  }
}

function rememberBoostyMailingContact(emailValue: unknown, nameValue: unknown, active: boolean, formerAt?: unknown) {
  const email = normalizeEmail(emailValue);
  if (!isRealEmail(email)) return;
  const nowIso = new Date().toISOString();
  const formerAtIso = formerAt ? String(formerAt) : active ? null : nowIso;
  dbRun(`
    INSERT INTO mailing_contacts (
      id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
      unsubscribed_at, suppressed_reason, account_state, former_at, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'unknown', 'boosty-observed', NULL, NULL, NULL, '', 'former', ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = CASE WHEN mailing_contacts.name = '' THEN excluded.name ELSE mailing_contacts.name END,
      former_at = CASE WHEN mailing_contacts.user_id IS NULL AND ? = 0 THEN COALESCE(mailing_contacts.former_at, excluded.former_at) ELSE mailing_contacts.former_at END,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `, mailingContactId(email), email, normalizeOptionalText(nameValue, 120), formerAtIso, nowIso, nowIso, nowIso, active ? 1 : 0);
}

function upsertUserRow(database: DatabaseSync, user: AdminUser) {
  const nowIso = new Date().toISOString();
  const createdAt = user.createdAt || nowIso;
  const updatedAt = user.updatedAt || nowIso;
  const publicProfileId = resolveUserPublicProfileId(database, user);
  user.publicProfileId = publicProfileId;
  database.prepare(`
    INSERT INTO users (
      id, public_numeric_id, email, name, role, country, newsletter_opt_in, avatar_initials, contact_vk_url, contact_telegram, contact_email, blocked_at, password_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      public_numeric_id = excluded.public_numeric_id,
      email = excluded.email,
      name = excluded.name,
      role = excluded.role,
      country = excluded.country,
      newsletter_opt_in = excluded.newsletter_opt_in,
      avatar_initials = excluded.avatar_initials,
      contact_vk_url = excluded.contact_vk_url,
      contact_telegram = excluded.contact_telegram,
      contact_email = excluded.contact_email,
      blocked_at = excluded.blocked_at,
      password_hash = excluded.password_hash,
      updated_at = excluded.updated_at
  `).run(
    user.id,
    publicProfileId,
    user.email,
    user.name,
    user.role,
    user.country ?? '',
    user.newsletterOptIn ? 1 : 0,
    user.avatarInitials ?? '',
    user.contactVkUrl ?? '',
    user.contactTelegram ?? '',
    user.contactEmail ?? '',
    user.blockedAt ?? '',
    user.passwordHash,
    createdAt,
    updatedAt,
  );

  database.prepare("DELETE FROM identities WHERE user_id = ? AND provider = 'email' AND provider_user_id <> ?").run(user.id, user.email);
  database.prepare(`
    INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, 'email', ?, ?, ?, '', ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      email = excluded.email,
      username = excluded.username,
      updated_at = excluded.updated_at
      WHERE identities.user_id = excluded.user_id
  `).run(user.id, user.email, user.email, user.email, createdAt, createdAt, updatedAt);

  if (user.telegramId) {
    database.prepare(`
      INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'telegram', ?, '', ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        username = excluded.username,
        photo_url = excluded.photo_url,
        updated_at = excluded.updated_at
        WHERE identities.user_id = excluded.user_id
    `).run(user.id, user.telegramId, user.telegramUsername ?? '', user.photoUrl ?? '', createdAt, createdAt, updatedAt);
  }
  syncMailingContactForUser(database, user);
}

function authUserFromRow(row: any): AdminUser {
  return {
    id: String(row.id),
    publicProfileId: String(row.public_numeric_id ?? ''),
    email: String(row.email),
    name: String(row.name),
    role: row.role === 'admin' ? 'admin' : 'user',
    country: String(row.country ?? ''),
    newsletterOptIn: Boolean(row.newsletter_opt_in),
    avatarInitials: String(row.avatar_initials ?? ''),
    telegramId: row.telegram_id ? String(row.telegram_id) : undefined,
    telegramUsername: row.telegram_username ? String(row.telegram_username) : undefined,
    photoUrl: row.telegram_photo_url ? String(row.telegram_photo_url) : undefined,
    contactVkUrl: String(row.contact_vk_url ?? ''),
    contactTelegram: String(row.contact_telegram ?? ''),
    contactEmail: String(row.contact_email ?? ''),
    blockedAt: row.blocked_at ? String(row.blocked_at) : undefined,
    passwordHash: String(row.password_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function loadAuthStore(): AdminAuthStore {
  const now = Date.now();
  dbRun('DELETE FROM pending_codes WHERE expires_at <= ? OR attempts >= ?', now, AUTH_CODE_MAX_ATTEMPTS);
  dbRun('DELETE FROM sessions WHERE expires_at <= ?', now);
  const users = dbAll(`
    SELECT
      u.*,
      tg.provider_user_id AS telegram_id,
      tg.username AS telegram_username,
      tg.photo_url AS telegram_photo_url
    FROM users u
    LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
    ORDER BY u.created_at ASC
  `).map(authUserFromRow);
  const pendingCodes = dbAll<any>('SELECT email, code_hash, expires_at, attempts FROM pending_codes')
    .map(row => ({
      email: String(row.email),
      codeHash: String(row.code_hash),
      expiresAt: Number(row.expires_at),
      attempts: Number(row.attempts),
    }));
  const sessions = dbAll<any>('SELECT token_hash, user_id, email, expires_at, created_at FROM sessions')
    .map(row => ({
      tokenHash: String(row.token_hash),
      userId: String(row.user_id || ''),
      email: String(row.email),
      expiresAt: Number(row.expires_at),
      createdAt: String(row.created_at),
    }));
  return { users, pendingCodes, sessions, updatedAt: new Date().toISOString() };
}

function saveAuthStore(store: AdminAuthStore) {
  const database = db();
  try {
    database.exec('BEGIN IMMEDIATE');
    const keepIds = store.users.map(user => user.id);
    if (keepIds.length) {
      const nowIso = new Date().toISOString();
      database.prepare(`
        UPDATE mailing_contacts
        SET user_id = NULL, account_state = 'former', former_at = COALESCE(former_at, ?), updated_at = ?
        WHERE user_id IS NOT NULL AND user_id NOT IN (${keepIds.map(() => '?').join(',')})
      `).run(nowIso, nowIso, ...keepIds);
      database.prepare(`DELETE FROM users WHERE id NOT IN (${keepIds.map(() => '?').join(',')})`).run(...keepIds);
    }
    for (const user of store.users) upsertUserRow(database, user);
    database.prepare('DELETE FROM pending_codes').run();
    for (const code of store.pendingCodes) {
      if (code.expiresAt <= Date.now() || code.attempts >= AUTH_CODE_MAX_ATTEMPTS) continue;
      database.prepare(`
        INSERT OR REPLACE INTO pending_codes (email, code_hash, expires_at, attempts)
        VALUES (?, ?, ?, ?)
      `).run(code.email, code.codeHash, code.expiresAt, code.attempts);
    }
    database.prepare('DELETE FROM sessions').run();
    for (const session of store.sessions) {
      if (session.expiresAt <= Date.now()) continue;
      const user = store.users.find(item => item.id === session.userId || item.email === session.email);
      if (!user) continue;
      database.prepare(`
        INSERT OR REPLACE INTO sessions (token_hash, user_id, email, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(session.tokenHash, user.id, session.email, session.expiresAt, session.createdAt);
    }
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('auth_updated_at', new Date().toISOString());
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

const authCodeIssueHistory = new Map<string, number[]>();

function prepareAuthCode(store: AdminAuthStore, email: string): { ok: true; code: string } | { ok: false; status: number; error: string } {
  const now = Date.now();
  const windowStart = now - AUTH_CODE_ISSUE_WINDOW_MS;
  const recent = (authCodeIssueHistory.get(email) || []).filter(timestamp => timestamp > windowStart);
  const lastIssuedAt = recent.at(-1) || 0;
  if (lastIssuedAt && now - lastIssuedAt < AUTH_CODE_REQUEST_COOLDOWN_MS) {
    return { ok: false, status: 429, error: 'Код уже отправлен. Подождите минуту перед повторной отправкой.' };
  }
  if (recent.length >= AUTH_CODE_MAX_ISSUES_PER_WINDOW) {
    return { ok: false, status: 429, error: 'Слишком много кодов для этой почты. Попробуйте позже.' };
  }

  const code = randomInt(100000, 1000000).toString();
  const existing = store.pendingCodes.find(item => item.email === email && item.expiresAt > now);
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email && item.expiresAt > now);
  store.pendingCodes.push({
    email,
    codeHash: sha256(code),
    expiresAt: now + AUTH_CODE_TTL_MS,
    attempts: existing ? existing.attempts : 0,
  });
  authCodeIssueHistory.set(email, [...recent, now]);
  return { ok: true, code };
}

function verifyPendingCode(pending: PendingCode, code: string): boolean {
  return safeEqualHex(pending.codeHash, sha256(code));
}

function normalizeTelegramLinkCode(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase();
  const compact = raw.replace(/\s+/g, '').replace(/^\/(?:START|LINK)/, '').replace(/[^A-Z0-9-]/g, '');
  const match = compact.match(/(?:TG-?)?(\d{6})/);
  return match ? `TG-${match[1]}` : '';
}

function createTelegramLinkCode(userId: string): { code: string; expiresAt: number } {
  const database = db();
  const now = Date.now();
  const expiresAt = now + TELEGRAM_LINK_CODE_TTL_MS;
  database.prepare('DELETE FROM telegram_link_tokens WHERE user_id = ? OR expires_at <= ? OR used_at IS NOT NULL').run(userId, now);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `TG-${randomInt(100000, 1000000)}`;
    try {
      database.prepare(`
        INSERT INTO telegram_link_tokens (code, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(code, userId, expiresAt, new Date().toISOString());
      return { code, expiresAt };
    } catch {
      // Retry on a rare code collision.
    }
  }
  throw new Error('Не удалось создать Telegram-код');
}

function telegramLinkCodeFromMessage(text: unknown): string {
  const raw = String(text ?? '');
  const startPayload = raw.match(/^\/start\s+(.+)$/i)?.[1];
  const linkPayload = raw.match(/^\/link\s+(.+)$/i)?.[1];
  return normalizeTelegramLinkCode(startPayload || linkPayload || raw);
}

function extractEmailFromTelegramMessage(text: unknown): string {
  const raw = String(text ?? '').trim();
  const payload = raw.match(/^\/email\s+(.+)$/i)?.[1] || raw;
  const match = payload.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/);
  return match ? normalizeEmail(match[0]) : '';
}

function telegramEmailCodeFromMessage(text: unknown): string {
  return String(text ?? '').replace(/\D/g, '').slice(0, 6);
}

function telegramEmailCodeHash(telegramId: string, email: string, code: string): string {
  return sha256(`telegram-email:${telegramId}:${normalizeEmail(email)}:${code}:${TELEGRAM_AUTH_BOT_TOKEN}`);
}

function pendingTelegramEmailCode(telegramId: string): { telegram_id: string; email: string; code_hash: string; expires_at: number; attempts: number } | undefined {
  return dbGet<{ telegram_id: string; email: string; code_hash: string; expires_at: number; attempts: number }>(
    'SELECT telegram_id, email, code_hash, expires_at, attempts FROM telegram_email_codes WHERE telegram_id = ?',
    telegramId,
  );
}

async function requestTelegramEmailCode(telegramId: string, email: string) {
  const normalizedTelegramId = String(telegramId || '').replace(/\D/g, '');
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedTelegramId) throw new Error('Telegram не передал ID пользователя');
  if (!isRealEmail(normalizedEmail)) throw new Error('Пришлите реальную почту в формате name@example.com');

  const existingTelegramId = findKhaVipTelegramByEmail(normalizedEmail);
  if (existingTelegramId && existingTelegramId !== normalizedTelegramId) {
    throw new Error('Эта почта уже привязана к другому Telegram');
  }
  const telegramIdentity = identityOwner('telegram', normalizedTelegramId);
  if (telegramIdentity?.user_id && identityBelongsToAnotherUser('boosty-email', normalizedEmail, telegramIdentity.user_id)) {
    throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
  }

  const code = randomInt(100000, 1000000).toString();
  const nowIso = new Date().toISOString();
  dbRun(`
    INSERT INTO telegram_email_codes (telegram_id, email, code_hash, expires_at, attempts, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      email = excluded.email,
      code_hash = excluded.code_hash,
      expires_at = excluded.expires_at,
      attempts = 0,
      created_at = excluded.created_at
  `, normalizedTelegramId, normalizedEmail, telegramEmailCodeHash(normalizedTelegramId, normalizedEmail, code), Date.now() + AUTH_CODE_TTL_MS, nowIso);
  await sendAuthCodeEmail(normalizedEmail, code);
}

async function confirmTelegramEmailCode(telegramId: string, code: string): Promise<{ email: string; linkedUser?: AdminUser; status?: SubscriptionStatus }> {
  const normalizedTelegramId = String(telegramId || '').replace(/\D/g, '');
  const normalizedCode = telegramEmailCodeFromMessage(code);
  const pending = pendingTelegramEmailCode(normalizedTelegramId);
  if (!pending) throw new Error('Активного кода нет. Отправьте /email ваша@почта');
  if (pending.expires_at <= Date.now()) {
    dbRun('DELETE FROM telegram_email_codes WHERE telegram_id = ?', normalizedTelegramId);
    throw new Error('Код истёк. Отправьте /email ещё раз.');
  }
  const attempts = Number(pending.attempts || 0) + 1;
  if (attempts > AUTH_CODE_MAX_ATTEMPTS || !safeEqualHex(pending.code_hash, telegramEmailCodeHash(normalizedTelegramId, pending.email, normalizedCode))) {
    dbRun('UPDATE telegram_email_codes SET attempts = ? WHERE telegram_id = ?', attempts, normalizedTelegramId);
    throw new Error(attempts >= AUTH_CODE_MAX_ATTEMPTS
      ? 'Слишком много неверных попыток. Отправьте /email ещё раз.'
      : `Неверный код. Осталось попыток: ${AUTH_CODE_MAX_ATTEMPTS - attempts}.`);
  }

  const existingTelegramId = findKhaVipTelegramByEmail(pending.email);
  if (existingTelegramId && existingTelegramId !== normalizedTelegramId) {
    throw new Error('Эта почта уже привязана к другому Telegram');
  }

  const store = loadAuthStore();
  const linkedUser = store.users.find(item => item.telegramId === normalizedTelegramId);
  setKhaVipVerifiedEmail(normalizedTelegramId, pending.email);
  if (linkedUser) {
    const existingEmailUser = store.users.find(item => item.email === pending.email && item.id !== linkedUser.id);
    if (existingEmailUser || identityBelongsToAnotherUser('boosty-email', pending.email, linkedUser.id)) {
      throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
    }
    const oldEmail = linkedUser.email;
    linkedUser.email = pending.email;
    linkedUser.contactEmail = linkedUser.contactEmail || pending.email;
    linkedUser.updatedAt = new Date().toISOString();
    store.sessions = store.sessions.map(session => session.email === oldEmail ? { ...session, email: pending.email } : session);
    saveAuthStore(store);
    const nowIso = new Date().toISOString();
    dbRun(`
      INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'boosty-email', ?, ?, ?, '', ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        email = excluded.email,
        username = excluded.username,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
        WHERE identities.user_id = excluded.user_id
    `, linkedUser.id, pending.email, pending.email, pending.email, nowIso, nowIso, nowIso);
  }

  dbRun('DELETE FROM telegram_email_codes WHERE telegram_id = ?', normalizedTelegramId);
  const status = linkedUser ? await refreshSubscriptionForUser(linkedUser, true) : undefined;
  return { email: pending.email, linkedUser, status };
}

function publicUser(user: AdminUser) {
  return {
    id: user.id,
    profileId: user.id,
    publicProfileId: user.publicProfileId ?? '',
    email: user.email,
    name: user.name,
    role: user.role,
    country: user.country ?? '',
    newsletterOptIn: Boolean(user.newsletterOptIn),
    avatarInitials: user.avatarInitials ?? user.name.slice(0, 2).toUpperCase(),
    telegramUsername: user.telegramUsername ?? '',
    photoUrl: user.photoUrl ?? '',
    contactVkUrl: user.contactVkUrl ?? '',
    contactTelegram: user.contactTelegram ?? '',
    contactEmail: user.contactEmail ?? '',
    blockedAt: user.blockedAt ?? '',
    adminAllowed: isAdminUser(user),
    contestAdminAllowed: isContestAdminUser(user),
  };
}

function normalizeOptionalText(value: unknown, maxLength = 240): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeDateOnlyInput(value: unknown): string {
  const raw = normalizeOptionalText(value, 40);
  if (!raw) return '';
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return raw;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateTimeInput(value: unknown): string | null {
  const raw = normalizeOptionalText(value, 40);
  if (!raw) return null;
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (localMatch) {
      const [, year, month, day, hour, minute, second = '0', millis = '0'] = localMatch;
      const utcMs = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        Number(millis.padEnd(3, '0')),
      ) - CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
      if (Number.isFinite(utcMs)) return new Date(utcMs).toISOString();
    }
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeContactTelegram(value: unknown): string {
  return normalizeOptionalText(value, 80).replace(/^@+/, '');
}

function normalizeContactEmail(value: unknown): string {
  const email = normalizeEmail(value);
  return email && isRealEmail(email) ? email : '';
}

function normalizeContactVkUrl(value: unknown): string {
  const raw = normalizeOptionalText(value, 240);
  if (!raw) return '';
  if (/^https?:\/\/(vk\.com|www\.vk\.com)\//i.test(raw)) return raw;
  if (/^[a-z0-9_.]{3,80}$/i.test(raw.replace(/^@/, ''))) return `https://vk.com/${raw.replace(/^@/, '')}`;
  return '';
}

function normalizeContestImageUrl(value: unknown): string {
  const raw = normalizeOptionalText(value, 500);
  if (!raw) return '';
  if (/^\/uploads\/admin\/[a-z0-9-]+\.(?:webp|png|jpe?g|gif)$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const appHost = new URL(APP_URL).host;
    if ((url.protocol === 'https:' || url.protocol === 'http:')
      && (url.host === appHost || url.hostname === 'arena.hs-manacost.ru')
      && /^\/uploads\/admin\/[a-z0-9-]+\.(?:webp|png|jpe?g|gif)$/i.test(url.pathname)) {
      return url.pathname;
    }
  } catch {
    return '';
  }
  return '';
}

function contestAdminAuth(req: import('express').Request): AdminUser | null {
  const user = userAuth(req);
  return user && isContestAdminUser(user) ? user : null;
}

function parseJsonArray(value: unknown): any[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function contestStatusFromDates(status: string, startsAt?: string | null, endsAt?: string | null): string {
  if (status === 'draft' || status === 'cancelled' || status === 'completed') return status;
  const now = Date.now();
  const startMs = startsAt ? Date.parse(startsAt) : Number.NaN;
  const endMs = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (Number.isFinite(endMs) && now > endMs) return 'completed';
  if (Number.isFinite(startMs) && now < startMs) return 'planned';
  return 'active';
}

function publicWinnerId(contestId: string, value: string): string {
  const id = String(value || '').trim();
  if (!id) return '';
  const digest = hmacSha256(`${contestId}:${id}`, CONTEST_PUBLIC_ID_SECRET).slice(0, 12);
  return `win_${digest}`;
}

function contestFromRow(row: any, userEntry?: any, options: { includeRawWinners?: boolean } = {}) {
  const status = contestStatusFromDates(String(row.status || 'draft'), row.starts_at, row.ends_at);
  const winners = parseJsonArray(row.winners_json).map(String);
  return {
    id: String(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    prize: String(row.prize || ''),
    imageUrl: String(row.image_url || ''),
    startsAt: row.starts_at ? String(row.starts_at) : '',
    endsAt: row.ends_at ? String(row.ends_at) : '',
    status,
    winners: options.includeRawWinners ? winners : winners.map(id => publicWinnerId(String(row.id), id)).filter(Boolean),
    createdBy: String(row.created_by || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    entry: userEntry ? {
      status: String(userEntry.status || 'pending'),
      createdAt: String(userEntry.created_at || ''),
    } : null,
  };
}

function isRealEmail(email: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
    && !email.endsWith('@telegram.local')
    && !email.endsWith('.local');
}

function readKhaVipProfile(telegramId: string): Record<string, any> | null {
  try {
    if (!telegramId || !existsSync(KHA_VIP_PROFILES_FILE)) return null;
    const data = JSON.parse(readFileSync(KHA_VIP_PROFILES_FILE, 'utf-8'));
    const profile = data?.[telegramId];
    return profile && typeof profile === 'object' ? profile : null;
  } catch (err: any) {
    console.warn('[ecosystem] KHA VIP profile read failed:', err?.message ?? err);
    return null;
  }
}

function readKhaVipProfiles(): Record<string, any> {
  try {
    if (!existsSync(KHA_VIP_PROFILES_FILE)) return {};
    const data = JSON.parse(readFileSync(KHA_VIP_PROFILES_FILE, 'utf-8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (err: any) {
    console.warn('[ecosystem] KHA VIP profiles read failed:', err?.message ?? err);
    return {};
  }
}

function writeKhaVipProfiles(profiles: Record<string, any>) {
  mkdirSync(dirname(KHA_VIP_PROFILES_FILE), { recursive: true });
  const tmpFile = `${KHA_VIP_PROFILES_FILE}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpFile, `${JSON.stringify(profiles, null, 2)}\n`);
  renameSync(tmpFile, KHA_VIP_PROFILES_FILE);
}

function khaVerifiedEmail(profile: Record<string, any> | null): string {
  if (!profile?.email_verified_at) return '';
  const email = normalizeEmail(profile.email);
  return isRealEmail(email) ? email : '';
}

function findKhaVipTelegramByEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  const profiles = readKhaVipProfiles();
  for (const [telegramIdRaw, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== 'object') continue;
    if (khaVerifiedEmail(profile as Record<string, any>) === normalized) {
      return String(telegramIdRaw).replace(/\D/g, '');
    }
  }
  return '';
}

function setKhaVipVerifiedEmail(telegramId: string, email: string) {
  const normalizedTelegramId = String(telegramId || '').replace(/\D/g, '');
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedTelegramId || !isRealEmail(normalizedEmail)) throw new Error('Некорректные данные Telegram/email');

  const profiles = readKhaVipProfiles();
  const existingTelegramId = findKhaVipTelegramByEmail(normalizedEmail);
  if (existingTelegramId && existingTelegramId !== normalizedTelegramId) {
    throw new Error('Эта почта уже привязана к другому Telegram');
  }

  const profile = profiles[normalizedTelegramId] && typeof profiles[normalizedTelegramId] === 'object'
    ? profiles[normalizedTelegramId]
    : {};
  profile.email = normalizedEmail;
  profile.email_verified_at = new Date().toISOString();
  delete profile.boosty_access;
  delete profile.boosty_checked_at;
  profiles[normalizedTelegramId] = profile;
  writeKhaVipProfiles(profiles);
}

function khaProfileHasBoostyAccess(profile: Record<string, any> | null): boolean {
  if (!profile || profile.boosty_access !== true) return false;
  return hasBoostyContentAccess(String(profile.boosty_level || ''), Number(profile.boosty_price || 0));
}

function khaBoostySubscriptionDetail(user: AdminUser, profile: Record<string, any> | null): Record<string, any> | null {
  if (!khaProfileHasBoostyAccess(profile)) return null;
  const levelName = String(profile?.boosty_level || '');
  const rawPrice = Number(profile?.boosty_price || 0);
  const entitlements = boostyEntitlementsForLevel(levelName);
  const hasAccess = hasAnyEntitlement(entitlements);
  return {
    configured: true,
    checked: true,
    found: true,
    hasAccess,
    email: khaVerifiedEmail(profile) || user.email,
    levelName,
    price: rawPrice,
    entitlements,
    source: 'kha-vip-bot',
    message: hasAccess
      ? 'Boosty подписка подтверждена через Telegram-бот Манакоста.'
      : 'Boosty уровень найден, но он не открывает разделы HS-Arena.',
  };
}

function findKhaVipProfileForUser(user: AdminUser): Record<string, any> | null {
  if (user.telegramId) {
    const byTelegram = readKhaVipProfile(user.telegramId);
    if (byTelegram) return byTelegram;
  }
  if (!isRealEmail(user.email)) return null;
  const email = normalizeEmail(user.email);
  const profiles = readKhaVipProfiles();
  for (const profile of Object.values(profiles)) {
    if (!profile || typeof profile !== 'object') continue;
    if (khaVerifiedEmail(profile as Record<string, any>) === email) return profile as Record<string, any>;
  }
  return null;
}

function syncKhaVipProfiles(database: DatabaseSync) {
  const profiles = readKhaVipProfiles();
  const now = new Date().toISOString();
  for (const [telegramIdRaw, profile] of Object.entries(profiles)) {
    const telegramId = String(telegramIdRaw).replace(/\D/g, '');
    const email = khaVerifiedEmail(profile as Record<string, any>);
    if (!telegramId || !email) continue;

    const telegramIdentity = database.prepare("SELECT user_id FROM identities WHERE provider = 'telegram' AND provider_user_id = ?")
      .get(telegramId) as { user_id?: string } | undefined;
    const emailUser = database.prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id?: string } | undefined;

    if (telegramIdentity?.user_id && emailUser?.id && telegramIdentity.user_id !== emailUser.id) {
      console.warn('[ecosystem] skipped KHA VIP identity merge because Telegram and email belong to different users', {
        telegramId,
        telegramUserId: telegramIdentity.user_id,
        emailUserId: emailUser.id,
      });
      continue;
    }

    if (telegramIdentity?.user_id && !emailUser?.id) {
      database.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?')
        .run(email, now, telegramIdentity.user_id);
      database.prepare("DELETE FROM identities WHERE user_id = ? AND provider = 'email'")
        .run(telegramIdentity.user_id);
      database.prepare(`
        INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
        VALUES (?, 'email', ?, ?, ?, '', ?, ?, ?)
      `).run(telegramIdentity.user_id, email, email, email, now, now, now);
      database.prepare('UPDATE sessions SET email = ? WHERE user_id = ?').run(email, telegramIdentity.user_id);
      const user = loadAuthStore().users.find(item => item.id === telegramIdentity.user_id);
      if (user) applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
      continue;
    }

    if (!telegramIdentity?.user_id && emailUser?.id) {
      database.prepare(`
        INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
        VALUES (?, 'telegram', ?, '', '', '', ?, ?, ?)
        ON CONFLICT(provider, provider_user_id) DO UPDATE SET
          updated_at = excluded.updated_at
          WHERE identities.user_id = excluded.user_id
      `).run(emailUser.id, telegramId, now, now, now);
      const user = loadAuthStore().users.find(item => item.id === emailUser.id);
      if (user) applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
      continue;
    }

    if (!telegramIdentity?.user_id && !emailUser?.id && khaProfileHasBoostyAccess(profile as Record<string, any>)) {
      const displayName = normalizeOptionalText((profile as Record<string, any>).boosty_name, 80)
        || email.split('@')[0]
        || `Telegram ${telegramId}`;
      const user: AdminUser = {
        id: `tg_${sha256(telegramId).slice(0, 12)}`,
        email,
        name: displayName,
        role: 'user',
        country: '',
        newsletterOptIn: false,
        avatarInitials: displayName.slice(0, 2).toUpperCase(),
        telegramId,
        telegramUsername: '',
        photoUrl: '',
        contactVkUrl: '',
        contactTelegram: '',
        contactEmail: email,
        passwordHash: hashSecret(randomBytes(24).toString('hex')),
        createdAt: now,
        updatedAt: now,
      };
      upsertUserRow(database, user);
      applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
    }
  }
}

function normalizeBoostyLevelName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
}

function emptyEntitlements(): SubscriptionEntitlements {
  return {
    arena: false,
    battlegrounds: false,
    standard: false,
    contests: false,
    guidesArchive: false,
    arenaArticles: false,
    battlegroundsArticles: false,
  };
}

function allEntitlements(): SubscriptionEntitlements {
  return {
    arena: true,
    battlegrounds: true,
    standard: true,
    contests: true,
    guidesArchive: true,
    arenaArticles: true,
    battlegroundsArticles: true,
  };
}

function mergeEntitlements(...items: Array<Partial<SubscriptionEntitlements> | null | undefined>): SubscriptionEntitlements {
  const merged = emptyEntitlements();
  for (const item of items) {
    if (!item) continue;
    for (const key of Object.keys(merged) as SubscriptionEntitlementKey[]) {
      merged[key] ||= Boolean(item[key]);
    }
  }
  return merged;
}

function hasAnyEntitlement(entitlements: Partial<SubscriptionEntitlements> | null | undefined): boolean {
  return Boolean(entitlements && Object.values(entitlements).some(Boolean));
}

function boostyNameMatches(levelName: string, candidates: string[]): boolean {
  const normalized = normalizeBoostyLevelName(levelName);
  if (!normalized) return false;
  return candidates.some(candidate => {
    const normalizedCandidate = normalizeBoostyLevelName(candidate);
    return Boolean(normalizedCandidate && (normalized === normalizedCandidate || normalized.includes(normalizedCandidate)));
  });
}

function boostyEntitlementsForLevel(levelName: string): SubscriptionEntitlements {
  if (boostyNameMatches(levelName, BOOSTY_ALL_ACCESS_LEVEL_NAMES)) return allEntitlements();

  const entitlements = emptyEntitlements();
  if (boostyNameMatches(levelName, BOOSTY_ARENA_LEVEL_NAMES)) {
    entitlements.arena = true;
    entitlements.contests = true;
    entitlements.guidesArchive = true;
    entitlements.arenaArticles = true;
  }
  if (boostyNameMatches(levelName, BOOSTY_BATTLEGROUNDS_LEVEL_NAMES)) {
    entitlements.battlegrounds = true;
    entitlements.contests = true;
    entitlements.guidesArchive = true;
    entitlements.battlegroundsArticles = true;
  }
  return entitlements;
}

function normalizeEntitlements(value: unknown): SubscriptionEntitlements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyEntitlements();
  const source = value as Record<string, unknown>;
  const entitlements = emptyEntitlements();
  for (const key of Object.keys(entitlements) as SubscriptionEntitlementKey[]) {
    entitlements[key] = Boolean(source[key]);
  }
  return entitlements;
}

function normalizeBoostySubscriptionDetail(detail: Record<string, any>): Record<string, any> {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const levelName = String(detail.levelName || '');
  const levelEntitlements = levelName ? boostyEntitlementsForLevel(levelName) : emptyEntitlements();
  const entitlements = hasAnyEntitlement(levelEntitlements)
    ? levelEntitlements
    : normalizeEntitlements(detail.entitlements);
  return {
    ...detail,
    entitlements,
    hasAccess: Boolean(detail.hasAccess) && hasAnyEntitlement(entitlements),
  };
}

function normalizeTelegramSubscriptionDetail(detail: Record<string, any>): Record<string, any> {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const entitlements = mergeEntitlements(
    normalizeEntitlements(detail.entitlements),
    detail.hasAccess ? allEntitlements() : emptyEntitlements(),
  );
  return {
    ...detail,
    entitlements,
    hasAccess: Boolean(detail.hasAccess) && hasAnyEntitlement(entitlements),
  };
}

function boostyLevelRank(levelName: string): number {
  const normalized = normalizeBoostyLevelName(levelName);
  if (!normalized) return -1;
  return BOOSTY_LEVEL_ORDER.findIndex(item => {
    const candidate = normalizeBoostyLevelName(item);
    return normalized === candidate || normalized.includes(candidate);
  });
}

function hasRequiredBoostyLevel(levelName: string): boolean {
  const minRank = boostyLevelRank(BOOSTY_MIN_LEVEL_NAME);
  const rank = boostyLevelRank(levelName);
  return minRank >= 0 && rank >= minRank;
}

function hasBoostyContentAccess(levelName: string, price: number): boolean {
  void price;
  return hasAnyEntitlement(boostyEntitlementsForLevel(levelName));
}

function applyKhaSubscriptionSnapshot(user: AdminUser, profile: Record<string, any> | null) {
  const boosty = khaBoostySubscriptionDetail(user, profile);
  if (!boosty) return;
  const now = new Date().toISOString();
  const entitlements = normalizeEntitlements(boosty.entitlements);
  const hasAccess = hasAnyEntitlement(entitlements);
  const status: SubscriptionStatus = {
    hasAccess,
    source: 'boosty',
    checkedAt: now,
    stale: false,
    message: hasAccess
      ? 'Boosty подписка подтверждена через Telegram-бот Манакоста.'
      : 'Boosty уровень найден, но он не открывает разделы HS-Arena.',
    entitlements,
    boosty,
    telegram: {},
  };
  writeSubscriptionStatus(user, status);
  writeSubscriptionCheck(user, 'boosty:kha-vip-bot', hasAccess, boosty);
}

function mergeAuthUsers(store: AdminAuthStore, sourceUser: AdminUser, targetUser: AdminUser, patch: Partial<AdminUser> = {}): AdminUser {
  const mergedRoleWantsAdmin = targetUser.role === 'admin' || sourceUser.role === 'admin';
  const targetCanBeAdmin = ADMIN_USER_IDS.size === 0 || ADMIN_USER_IDS.has(targetUser.id);
  targetUser.role = mergedRoleWantsAdmin && targetCanBeAdmin ? 'admin' : 'user';
  targetUser.country = targetUser.country || sourceUser.country || '';
  targetUser.newsletterOptIn = Boolean(targetUser.newsletterOptIn || sourceUser.newsletterOptIn);
  targetUser.telegramId = patch.telegramId ?? targetUser.telegramId ?? sourceUser.telegramId;
  targetUser.telegramUsername = patch.telegramUsername ?? targetUser.telegramUsername ?? sourceUser.telegramUsername;
  targetUser.photoUrl = patch.photoUrl ?? targetUser.photoUrl ?? sourceUser.photoUrl;
  targetUser.avatarInitials = targetUser.avatarInitials || sourceUser.avatarInitials || targetUser.name.slice(0, 2).toUpperCase();
  targetUser.updatedAt = new Date().toISOString();
  store.sessions = store.sessions.map(session =>
    session.email === sourceUser.email ? { ...session, email: targetUser.email } : session
  );
  dbRun('UPDATE identities SET user_id = ?, updated_at = ? WHERE user_id = ?', targetUser.id, targetUser.updatedAt, sourceUser.id);
  dbRun('UPDATE subscription_checks SET user_id = ? WHERE user_id = ?', targetUser.id, sourceUser.id);
  dbRun('DELETE FROM subscriptions WHERE user_id = ?', sourceUser.id);
  dbRun(`
    UPDATE contest_entries
    SET user_id = ?
    WHERE user_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM contest_entries existing
        WHERE existing.contest_id = contest_entries.contest_id
          AND existing.user_id = ?
      )
  `, targetUser.id, sourceUser.id, targetUser.id);
  dbRun(`
    DELETE FROM contest_entries
    WHERE user_id = ?
      AND EXISTS (
        SELECT 1 FROM contest_entries existing
        WHERE existing.contest_id = contest_entries.contest_id
          AND existing.user_id = ?
      )
  `, sourceUser.id, targetUser.id);
  store.users = store.users.filter(user => user.id !== sourceUser.id);
  return targetUser;
}

function telegramAuthEnabled(): boolean {
  return Boolean(telegramOidcEnabled() || (TELEGRAM_AUTH_BOT_TOKEN && TELEGRAM_AUTH_BOT_USERNAME));
}

function telegramLegacyWidgetEnabled(): boolean {
  return Boolean(TELEGRAM_AUTH_BOT_TOKEN && TELEGRAM_AUTH_BOT_USERNAME);
}

function telegramOidcEnabled(): boolean {
  return Boolean(TELEGRAM_OIDC_CLIENT_ID && TELEGRAM_OIDC_CLIENT_SECRET);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecodeJson(value: string): any {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function verifyTelegramAuthPayload(payload: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  if (!TELEGRAM_AUTH_BOT_TOKEN || !TELEGRAM_AUTH_BOT_USERNAME) return { ok: false, error: 'Telegram-вход пока не настроен' };

  const hash = String(payload.hash ?? '');
  const authDate = Number(payload.auth_date ?? 0);
  if (!/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: 'Некорректные данные Telegram' };
  }
  if (Date.now() - authDate * 1000 > TELEGRAM_AUTH_MAX_AGE_MS) {
    return { ok: false, error: 'Сессия Telegram устарела. Попробуйте ещё раз.' };
  }

  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');

  const secretKey = createHash('sha256').update(TELEGRAM_AUTH_BOT_TOKEN).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'Telegram не подтвердил вход' };
  }

  return { ok: true };
}

type TelegramOidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type TelegramOidcState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
};

let telegramOidcDiscoveryCache: { data: TelegramOidcDiscovery; expiresAt: number } | null = null;
let telegramOidcJwksCache: { keys: any[]; expiresAt: number } | null = null;

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error_description || data?.error || `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTelegramBotApi(token: string, method: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<Response> {
  const bases = TELEGRAM_BOT_API_BASE
    ? [TELEGRAM_BOT_API_BASE, TELEGRAM_PUBLIC_BOT_API_BASE]
    : [TELEGRAM_PUBLIC_BOT_API_BASE];
  let lastError: unknown;

  for (const base of bases) {
    try {
      const response = await fetch(`${base}/bot${token}/${method}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || base === TELEGRAM_PUBLIC_BOT_API_BASE) return response;
      const data = await response.json().catch(() => ({}));
      lastError = new Error(data?.description || `HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Telegram Bot API unavailable');
}

async function telegramOidcDiscovery(): Promise<TelegramOidcDiscovery> {
  if (telegramOidcDiscoveryCache && telegramOidcDiscoveryCache.expiresAt > Date.now()) return telegramOidcDiscoveryCache.data;
  const data = await fetchJsonWithTimeout(TELEGRAM_OIDC_DISCOVERY_URL);
  if (data?.issuer !== TELEGRAM_OIDC_ISSUER || !data.authorization_endpoint || !data.token_endpoint || !data.jwks_uri) {
    throw new Error('Telegram OIDC discovery вернул неполные данные');
  }
  telegramOidcDiscoveryCache = { data, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  return data;
}

async function telegramOidcJwks(force = false): Promise<any[]> {
  if (!force && telegramOidcJwksCache && telegramOidcJwksCache.expiresAt > Date.now()) return telegramOidcJwksCache.keys;
  const discovery = await telegramOidcDiscovery();
  const data = await fetchJsonWithTimeout(discovery.jwks_uri);
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  if (!keys.length) throw new Error('Telegram JWKS пустой');
  telegramOidcJwksCache = { keys, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  return keys;
}

function createAuthSession(store: AdminAuthStore, user: AdminUser): string {
  if (user.blockedAt) throw new Error('Пользователь заблокирован');
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  store.sessions = addBoundedAuthSession({
    sessions: store.sessions,
    session: {
      tokenHash: sha256(token),
      userId: user.id,
      email: user.email,
      expiresAt: now + AUTH_SESSION_TTL_MS,
      createdAt: new Date().toISOString(),
    },
    now,
    maxSessionsPerUser: AUTH_MAX_SESSIONS_PER_USER,
  });
  return token;
}

function cookieValue(req: import('express').Request, name: string): string {
  const cookie = String(req.headers.cookie ?? '');
  for (const part of cookie.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('=') || '');
  }
  return '';
}

function authCookieDomain(req: import('express').Request): string {
  if (new URL(APP_URL).hostname !== 'arena.hs-manacost.ru') return '';
  const host = String(req.headers.host ?? '').split(':')[0].toLowerCase();
  return host === 'arena.hs-manacost.ru' || host.endsWith('.arena.hs-manacost.ru') ? 'Domain=.arena.hs-manacost.ru' : '';
}

function setAuthCookie(req: import('express').Request, res: import('express').Response, token: string) {
  const maxAgeSeconds = Math.floor(AUTH_SESSION_TTL_MS / 1000);
  const secure = String(req.headers['x-forwarded-proto'] ?? req.protocol).includes('https')
    || String(req.headers.host ?? '').includes('arena.hs-manacost.ru')
    || String(req.headers.host ?? '').includes('hearthpulse.net');
  const attributes = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean);
  const legacyDomain = authCookieDomain(req);
  if (legacyDomain) {
    res.append('Set-Cookie', [
      `${AUTH_COOKIE_NAME}=`,
      ...attributes,
      'Max-Age=0',
      legacyDomain,
    ].join('; '));
  }
  res.append('Set-Cookie', [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...attributes,
    `Max-Age=${maxAgeSeconds}`,
  ].join('; '));
}

function clearAuthCookie(req: import('express').Request, res: import('express').Response) {
  const secure = String(req.headers['x-forwarded-proto'] ?? req.protocol).includes('https')
    || String(req.headers.host ?? '').includes('arena.hs-manacost.ru')
    || String(req.headers.host ?? '').includes('hearthpulse.net');
  const attributes = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    'Max-Age=0',
  ].filter(Boolean);
  res.append('Set-Cookie', [
    `${AUTH_COOKIE_NAME}=`,
    ...attributes,
  ].join('; '));
  const legacyDomain = authCookieDomain(req);
  if (legacyDomain) {
    res.append('Set-Cookie', [
      `${AUTH_COOKIE_NAME}=`,
      ...attributes,
      legacyDomain,
    ].join('; '));
  }
}

function telegramOidcCookieSecure(req: import('express').Request): boolean {
  return String(req.headers['x-forwarded-proto'] ?? req.protocol).includes('https')
    || String(req.headers.host ?? '').includes('arena.hs-manacost.ru')
    || String(req.headers.host ?? '').includes('hs-manacost.ru')
    || String(req.headers.host ?? '').includes('hearthpulse.net');
}

function telegramOidcStateFromValue(value: any): TelegramOidcState | null {
  if (!value?.state || !value?.nonce || !value?.codeVerifier || !value?.expiresAt) return null;
  if (Number(value.expiresAt) <= Date.now()) return null;
  return {
    state: String(value.state),
    nonce: String(value.nonce),
    codeVerifier: String(value.codeVerifier),
    returnTo: safeAuthReturnTo(value.returnTo),
    expiresAt: Number(value.expiresAt),
  };
}

function readTelegramOidcStates(req: import('express').Request): TelegramOidcState[] {
  const raw = cookieValue(req, TELEGRAM_OIDC_COOKIE_NAME);
  if (!raw) return [];
  try {
    const parsed = decodeSignedStateCookie(raw, TELEGRAM_OIDC_CLIENT_SECRET) as any;
    if (!parsed) return [];
    const values = Array.isArray(parsed?.states) ? parsed.states : [parsed];
    return values
      .map(telegramOidcStateFromValue)
      .filter((state): state is TelegramOidcState => Boolean(state));
  } catch {
    return [];
  }
}

function writeTelegramOidcStates(req: import('express').Request, res: import('express').Response, states: TelegramOidcState[]) {
  const validStates = states
    .map(telegramOidcStateFromValue)
    .filter((state): state is TelegramOidcState => Boolean(state))
    .slice(-5);
  if (!validStates.length) {
    clearTelegramOidcCookie(req, res);
    return;
  }
  const maxAgeSeconds = Math.max(1, Math.ceil((Math.max(...validStates.map(state => state.expiresAt)) - Date.now()) / 1000));
  const cookie = [
    `${TELEGRAM_OIDC_COOKIE_NAME}=${encodeURIComponent(encodeSignedStateCookie({ states: validStates }, TELEGRAM_OIDC_CLIENT_SECRET))}`,
    'Path=/api/auth/telegram',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    telegramOidcCookieSecure(req) ? 'Secure' : '',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function setTelegramOidcCookie(req: import('express').Request, res: import('express').Response, state: TelegramOidcState) {
  const states = readTelegramOidcStates(req).filter(item => item.state !== state.state);
  states.push(state);
  writeTelegramOidcStates(req, res, states);
}

function clearTelegramOidcCookie(req: import('express').Request, res: import('express').Response, stateValue?: string) {
  if (stateValue) {
    writeTelegramOidcStates(req, res, readTelegramOidcStates(req).filter(item => item.state !== stateValue));
    return;
  }
  const cookie = [
    `${TELEGRAM_OIDC_COOKIE_NAME}=`,
    'Path=/api/auth/telegram',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    telegramOidcCookieSecure(req) ? 'Secure' : '',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function readTelegramOidcState(req: import('express').Request, stateValue = ''): TelegramOidcState | null {
  const states = readTelegramOidcStates(req);
  if (stateValue) return states.find(item => item.state === stateValue) ?? null;
  return states[states.length - 1] ?? null;
}

type SocialOauthState = { state: string; codeVerifier: string; returnTo: string; linkUserId: string; expiresAt: number };
type SocialOauthCookie = { states?: unknown } & Partial<SocialOauthState>;

function socialOauthEnabled(provider: SocialProvider): boolean {
  const client = SOCIAL_OAUTH_CLIENTS[provider];
  return Boolean(client.clientId && client.clientSecret);
}

function socialOauthCallbackUrl(provider: SocialProvider): string {
  return `${APP_URL}/api/auth/${provider}/callback`;
}

function socialOauthCookieName(provider: SocialProvider): string {
  return `manacost_${provider}_oauth`;
}

function readSocialOauthStates(req: import('express').Request, provider: SocialProvider): SocialOauthState[] {
  const client = SOCIAL_OAUTH_CLIENTS[provider];
  const raw = cookieValue(req, socialOauthCookieName(provider));
  if (!raw || !client.clientSecret) return [];
  try {
    const value = decodeSignedStateCookie(raw, client.clientSecret) as SocialOauthCookie | null;
    const candidates = Array.isArray(value?.states) ? value.states : [value];
    return candidates.flatMap(candidate => {
      if (!candidate || typeof candidate !== 'object') return [];
      const item = candidate as Partial<SocialOauthState>;
      if (typeof item.state !== 'string' || !item.codeVerifier || Number(item.expiresAt) <= Date.now()) return [];
      return [{
        state: item.state,
        codeVerifier: String(item.codeVerifier),
        returnTo: safeAuthReturnTo(item.returnTo),
        linkUserId: typeof item.linkUserId === 'string' ? item.linkUserId : '',
        expiresAt: Number(item.expiresAt),
      }];
    });
  } catch { return []; }
}

function readSocialOauthState(req: import('express').Request, provider: SocialProvider, requestedState: string): SocialOauthState | null {
  return readSocialOauthStates(req, provider).find(item => item.state === requestedState) ?? null;
}

function clearSocialOauthCookie(req: import('express').Request, res: import('express').Response, provider: SocialProvider) {
  res.append('Set-Cookie', [
    `${socialOauthCookieName(provider)}=`, 'Path=/api/auth', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax',
    telegramOidcCookieSecure(req) ? 'Secure' : '', authCookieDomain(req),
  ].filter(Boolean).join('; '));
}

function consumeSocialOauthState(req: import('express').Request, res: import('express').Response, provider: SocialProvider, state: SocialOauthState) {
  const client = SOCIAL_OAUTH_CLIENTS[provider];
  const states = readSocialOauthStates(req, provider).filter(item => item.state !== state.state);
  if (!states.length) return clearSocialOauthCookie(req, res, provider);
  const value = encodeSignedStateCookie({ states }, client.clientSecret);
  res.append('Set-Cookie', [
    `${socialOauthCookieName(provider)}=${encodeURIComponent(value)}`, 'Path=/api/auth',
    `Max-Age=${Math.ceil(SOCIAL_OAUTH_STATE_TTL_MS / 1000)}`, 'HttpOnly', 'SameSite=Lax',
    telegramOidcCookieSecure(req) ? 'Secure' : '', authCookieDomain(req),
  ].filter(Boolean).join('; '));
}

function writeSocialOauthState(req: import('express').Request, res: import('express').Response, provider: SocialProvider, state: SocialOauthState) {
  const client = SOCIAL_OAUTH_CLIENTS[provider];
  const states = [...readSocialOauthStates(req, provider), state].slice(-4);
  const value = encodeSignedStateCookie({ states }, client.clientSecret);
  res.append('Set-Cookie', [
    `${socialOauthCookieName(provider)}=${encodeURIComponent(value)}`, 'Path=/api/auth',
    `Max-Age=${Math.ceil(SOCIAL_OAUTH_STATE_TTL_MS / 1000)}`, 'HttpOnly', 'SameSite=Lax',
    telegramOidcCookieSecure(req) ? 'Secure' : '', authCookieDomain(req),
  ].filter(Boolean).join('; '));
}

async function verifyTelegramOidcIdToken(idToken: string, expectedNonce: string): Promise<Record<string, any>> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Telegram вернул некорректный id_token');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64UrlDecodeJson(encodedHeader);
  const payload = base64UrlDecodeJson(encodedPayload);
  if (header?.alg !== 'RS256') throw new Error('Telegram id_token подписан неподдерживаемым алгоритмом');

  let keys = await telegramOidcJwks(false);
  let jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) {
    keys = await telegramOidcJwks(true);
    jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  }
  if (!jwk) throw new Error('Не найден ключ Telegram для проверки id_token');

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, Buffer.from(encodedSignature, 'base64url'));
  if (!ok) throw new Error('Telegram id_token не прошёл проверку подписи');

  const now = Math.floor(Date.now() / 1000);
  const aud = (Array.isArray(payload.aud) ? payload.aud : [payload.aud]).map(String);
  if (payload.iss !== TELEGRAM_OIDC_ISSUER) throw new Error('Некорректный issuer Telegram');
  if (!aud.includes(TELEGRAM_OIDC_CLIENT_ID)) throw new Error('Некорректный audience Telegram');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Telegram id_token устарел');
  if (typeof payload.iat === 'number' && payload.iat > now + 300) throw new Error('Telegram id_token из будущего');
  if (payload.nonce !== expectedNonce) throw new Error('Telegram nonce не совпал');
  if (!payload.sub) throw new Error('Telegram не передал ID пользователя');
  return payload;
}

function encodeMailHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

function sendAuthCodeEmail(to: string, code: string): Promise<void> {
  const recipient = normalizeEmail(to);
  if (!isRealEmail(recipient)) {
    return Promise.reject(new Error('Некорректный email получателя'));
  }
  const brandName = 'Экосистема Манакоста';
  const subject = 'Код входа в Экосистему Манакоста';
  const avatarUrl = 'https://hearthpulse.net/assets/manacost-avatar.jpeg';
  const artUrl = 'https://hearthpulse.net/wallpaper/wallpaper.jpg';
  const codeCells = code.split('').map(char => `
                    <td align="center" style="padding:0 3px;">
                      <div style="width:42px;height:50px;line-height:50px;background:#f8faff;border:1px solid #cbd7ea;border-radius:10px;color:#0f172a;font-size:25px;font-weight:800;font-family:Arial,Helvetica,sans-serif;text-align:center;box-shadow:0 6px 18px rgba(15,23,42,.10);">${char}</div>
                    </td>`).join('');
  const textBody = [
    `${brandName}`,
    '',
    `Ваш код входа: ${code}`,
    '',
    'Код действует 10 минут.',
    'Если вы не запрашивали вход, просто проигнорируйте это письмо.',
  ].join('\n');
  const htmlBody = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#040a14;color:#1e293b;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Ваш код входа: ${code}. Он действует 10 минут.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#040a14;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:separate;border-spacing:0;background:#f8faff;border:1px solid #223655;border-radius:18px;overflow:hidden;box-shadow:0 24px 54px rgba(0,0,0,.34);">
            <tr>
              <td style="height:128px;background:#081020;">
                <img src="${artUrl}" width="560" height="128" alt="" style="display:block;width:100%;height:128px;object-fit:cover;object-position:center 47%;">
              </td>
            </tr>
            <tr>
              <td style="background:#081020;padding:18px 22px;border-bottom:1px solid #1d3557;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="58" valign="middle">
                      <img src="${avatarUrl}" width="46" height="46" alt="" style="display:block;width:46px;height:46px;border-radius:12px;border:1px solid rgba(56,189,248,.55);object-fit:cover;">
                    </td>
                    <td valign="middle" style="padding-left:14px;">
                      <div style="font-size:12px;line-height:1.2;color:#93c5fd;text-transform:uppercase;letter-spacing:1px;">Manacost ID</div>
                      <div style="margin-top:4px;font-size:20px;line-height:1.15;font-weight:700;color:#e5eefc;">${brandName}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;background:#f8faff;">
                <div style="font-size:20px;line-height:1.3;color:#1e293b;font-weight:700;">Код подтверждения</div>
                <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#475569;">Введите его на сайте, чтобы завершить вход или восстановление пароля.</div>
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:24px auto 22px;">
                  <tr>${codeCells}
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;background:#ebf1fc;border:1px solid #cbd7ea;border-radius:14px;">
                  <tr>
                    <td style="padding:13px 15px;font-size:13px;line-height:1.55;color:#334155;">
                      Код действует <b>10 минут</b>. Никому его не передавайте, даже если человек представляется поддержкой.
                    </td>
                  </tr>
                </table>
                <div style="margin-top:15px;font-size:12px;line-height:1.55;color:#64748b;">Если запрос был не ваш, просто проигнорируйте письмо.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;background:#f8faff;">
                <div style="height:1px;background:#dbe6f5;margin:8px 0 14px;font-size:0;line-height:0;">&nbsp;</div>
                <div style="font-size:12px;line-height:1.5;color:#64748b;">HS-Arena · Hearthstone statistics · Manacost</div>
              </td>
            </tr>
            <tr>
              <td style="padding:13px 20px;background:#081020;border-top:1px solid #1d3557;font-size:11px;line-height:1.45;color:#9fb1ca;text-align:center;">
                Автоматическое письмо. Отвечать на него не нужно.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const boundary = `hsarena_${randomBytes(12).toString('hex')}`;
  const message = [
    `From: ${encodeMailHeader(brandName)} <${AUTH_FROM}>`,
    `To: ${recipient}`,
    `Subject: ${encodeMailHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
    '',
  ].join('\n');

  return sendLocalSmtpMessage({
    envelopeFrom: AUTH_FROM,
    recipients: [recipient],
    message,
    host: LOCAL_SMTP_HOST,
    port: LOCAL_SMTP_PORT,
    timeoutMs: LOCAL_SMTP_TIMEOUT_MS,
  });
}

type MailingSegment = 'all-consented' | 'active' | 'former';

interface NewsletterDraft {
  subject: string;
  preheader: string;
  htmlBody: string;
  textBody: string;
  segment: MailingSegment;
  templateKey: string;
}

function escapeNewsletterHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNewsletterUrl(value: unknown, fallback = `${APP_URL}/`): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '#') return fallback;
  try {
    const url = raw.startsWith('/') ? new URL(raw, APP_URL) : new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeNewsletterFragment(value: unknown): string {
  const raw = String(value ?? '').slice(0, NEWSLETTER_HTML_MAX_LENGTH);
  return sanitizeHtml(raw, {
    allowedTags: [
      'p', 'h1', 'h2', 'h3', 'a', 'img', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i',
      'blockquote', 'br', 'hr', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan', 'align'],
      th: ['colspan', 'rowspan', 'align'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  }).trim();
}

function newsletterTextFromHtml(htmlBody: string): string {
  return sanitizeHtml(htmlBody, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeNewsletterDraft(value: any): NewsletterDraft {
  const subject = normalizeOptionalText(value?.subject, 160);
  const preheader = normalizeOptionalText(value?.preheader, 220);
  const segmentRaw = normalizeOptionalText(value?.segment, 40);
  const segment: MailingSegment = segmentRaw === 'active' || segmentRaw === 'former' ? segmentRaw : 'all-consented';
  const templateKey = normalizeOptionalText(value?.templateKey, 60) || 'custom';
  const htmlBody = sanitizeNewsletterFragment(value?.htmlBody ?? value?.html);
  const suppliedText = normalizeOptionalText(value?.textBody, 100_000);
  const textBody = suppliedText || newsletterTextFromHtml(htmlBody);
  if (!subject) throw new AdminMailingValidationError('Укажите тему письма');
  if (!htmlBody) throw new AdminMailingValidationError('HTML письма пуст');
  return { subject, preheader, htmlBody, textBody, segment, templateKey };
}

function newsletterPreviewDigest(draft: NewsletterDraft, contacts: Array<{ id?: unknown }>): string {
  if (!NEWSLETTER_UNSUBSCRIBE_SECRET) throw new Error('NEWSLETTER_UNSUBSCRIBE_SECRET не настроен');
  const audienceIds = contacts.map(contact => String(contact.id || '')).filter(Boolean).sort();
  const normalized = JSON.stringify({
    subject: draft.subject,
    preheader: draft.preheader,
    htmlBody: draft.htmlBody,
    textBody: draft.textBody,
    segment: draft.segment,
    templateKey: draft.templateKey,
    recipientCount: audienceIds.length,
    audienceHash: sha256(audienceIds.join('\n')),
  });
  return hmacSha256(`newsletter-preview:${normalized}`, NEWSLETTER_UNSUBSCRIBE_SECRET);
}

function newsletterUnsubscribeToken(contactId: string): string {
  if (!NEWSLETTER_UNSUBSCRIBE_SECRET) throw new Error('NEWSLETTER_UNSUBSCRIBE_SECRET не настроен');
  const payload = Buffer.from(contactId, 'utf8').toString('base64url');
  const signature = hmacSha256(`newsletter-unsubscribe:${payload}`, NEWSLETTER_UNSUBSCRIBE_SECRET);
  return `${payload}.${signature}`;
}

function mailingContactFromUnsubscribeToken(token: unknown): any | null {
  if (!NEWSLETTER_UNSUBSCRIBE_SECRET) return null;
  const [payload, signature] = String(token ?? '').trim().split('.');
  if (!payload || !signature) return null;
  const expected = hmacSha256(`newsletter-unsubscribe:${payload}`, NEWSLETTER_UNSUBSCRIBE_SECRET);
  if (!safeEqualHex(signature, expected)) return null;
  let contactId = '';
  try { contactId = Buffer.from(payload, 'base64url').toString('utf8'); } catch { return null; }
  if (!/^mail_[a-f0-9]{24}$/.test(contactId)) return null;
  return dbGet<any>('SELECT * FROM mailing_contacts WHERE id = ?', contactId) ?? null;
}

function renderNewsletterHtml(draft: NewsletterDraft, unsubscribeUrl: string, preview = false): string {
  const csp = preview
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">`
    : '';
  const safeSubject = escapeNewsletterHtml(draft.subject);
  const safePreheader = escapeNewsletterHtml(draft.preheader);
  const safeUnsubscribeUrl = escapeNewsletterHtml(unsubscribeUrl);
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${csp}
    <title>${safeSubject}</title>
    <style>
      body{margin:0;padding:0;background:#eef3f8;color:#1d2c3a;font-family:Arial,Helvetica,sans-serif}
      .mail-wrap{width:100%;padding:24px 10px;background:#eef3f8}
      .mail-card{width:100%;max-width:640px;margin:0 auto;border:1px solid #cad7e4;border-radius:14px;background:#fff;overflow:hidden}
      .mail-head{padding:22px 28px;background:#0b1f36;color:#fff}
      .mail-head small{display:block;color:#80dff3;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      .mail-head strong{display:block;margin-top:5px;font-size:22px}
      .mail-content{padding:28px;color:#26394c;font-size:16px;line-height:1.65}
      .mail-content h1,.mail-content h2,.mail-content h3{margin:0 0 14px;color:#162b40;line-height:1.25}
      .mail-content p{margin:0 0 16px}.mail-content a{color:#087fbd;font-weight:700}.mail-content img{display:block;max-width:100%;height:auto;margin:18px auto;border-radius:10px}
      .mail-content blockquote{margin:18px 0;padding:14px 18px;border-left:4px solid #22b6db;background:#f1f8fc}
      .mail-content table{max-width:100%;border-collapse:collapse}.mail-content td,.mail-content th{padding:8px;border:1px solid #d7e0ea}
      .mail-foot{padding:20px 28px;border-top:1px solid #d7e0ea;background:#f7f9fb;color:#687888;font-size:12px;line-height:1.55}
      .mail-foot a{color:#526d83}
      @media(max-width:520px){.mail-wrap{padding:0}.mail-card{border-radius:0;border-left:0;border-right:0}.mail-head,.mail-content,.mail-foot{padding-left:18px;padding-right:18px}}
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${safePreheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mail-wrap"><tr><td>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mail-card">
        <tr><td class="mail-head"><small>HS-Arena · Manacost</small><strong>${safeSubject}</strong></td></tr>
        <tr><td class="mail-content">${draft.htmlBody}</td></tr>
        <tr><td class="mail-foot">Вы получили письмо, потому что согласились на рассылку Manacost. <a href="${safeUnsubscribeUrl}">Отписаться от рассылки</a>.</td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
}

function sendMimeEmail(input: { to: string; subject: string; text: string; html: string; messageId: string; headers?: string[] }): Promise<void> {
  const recipient = normalizeEmail(input.to);
  if (!isRealEmail(recipient)) return Promise.reject(new Error('Некорректный email получателя'));
  const subject = normalizeOptionalText(input.subject, 160);
  const boundary = `hsarena_${randomBytes(12).toString('hex')}`;
  const message = [
    `From: ${encodeMailHeader(NEWSLETTER_FROM_NAME)} <${NEWSLETTER_FROM}>`,
    `To: ${recipient}`,
    `Subject: ${encodeMailHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${input.messageId}>`,
    'MIME-Version: 1.0',
    ...(input.headers ?? []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return sendLocalSmtpMessage({
    envelopeFrom: NEWSLETTER_FROM,
    recipients: [recipient],
    message,
    host: LOCAL_SMTP_HOST,
    port: LOCAL_SMTP_PORT,
    timeoutMs: LOCAL_SMTP_TIMEOUT_MS,
  });
}

function mailingContactRows(): any[] {
  return dbAll<any>(`
    SELECT
      mc.*,
      u.blocked_at,
      COALESCE(s.has_access, 0) AS provider_access,
      CASE WHEN COALESCE(g.active, 0) = 1 AND (
        g.expires_at IS NULL OR g.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ) THEN 1 ELSE 0 END AS manual_access
    FROM mailing_contacts mc
    LEFT JOIN users u ON u.id = mc.user_id
    LEFT JOIN subscriptions s ON s.user_id = mc.user_id
    LEFT JOIN manual_subscription_grants g ON g.user_id = mc.user_id
    ORDER BY mc.updated_at DESC
  `).map(row => {
    const active = Boolean(row.provider_access || row.manual_access);
    const eligible = row.consent_status === 'subscribed'
      && Boolean(row.consented_at)
      && Boolean(row.verified_at)
      && isRealEmail(String(row.email || ''))
      && !row.blocked_at
      && !row.suppressed_reason;
    return {
      ...row,
      eligible,
      lifecycle: active ? 'active' : 'former',
    };
  });
}

function eligibleMailingContacts(segment: MailingSegment): any[] {
  return mailingContactRows().filter(row => row.eligible && (segment === 'all-consented' || row.lifecycle === segment));
}

function mailingSummary() {
  const contacts = mailingContactRows();
  const eligible = contacts.filter(row => row.eligible);
  return {
    total: contacts.length,
    eligible: eligible.length,
    active: eligible.filter(row => row.lifecycle === 'active').length,
    former: eligible.filter(row => row.lifecycle === 'former').length,
    excluded: contacts.length - eligible.length,
    unsubscribed: contacts.filter(row => row.consent_status === 'unsubscribed').length,
    pendingConsent: contacts.filter(row => row.consent_status === 'unknown').length,
    suppressed: contacts.filter(row => row.consent_status === 'suppressed' || Boolean(row.suppressed_reason)).length,
  };
}

function newsletterTemplates() {
  const articlesData: any = loadData('articles.json') ?? { articles: [] };
  const articles = Array.isArray(articlesData.articles) ? articlesData.articles : [];
  const latest = articles
    .slice()
    .sort((a: any, b: any) => articleDateMs(b) - articleDateMs(a) || String(b?.id || '').localeCompare(String(a?.id || '')))[0];
  const latestUrl = safeNewsletterUrl(latest?.url, `${APP_URL}/articles`);
  const latestImage = latest?.image ? safeNewsletterUrl(latest.image, '') : '';
  const latestTitle = normalizeOptionalText(latest?.title, 180) || 'Новая статья Manacost';
  const latestExcerpt = normalizeOptionalText(latest?.excerpt, 500) || 'Читайте новый материал на HS-Arena.';
  return [
    {
      id: 'blank',
      label: 'Пустое письмо',
      description: 'Начните с чистого текста и своей структуры.',
      subject: 'Новости Manacost',
      preheader: 'Свежие материалы и обновления HS-Arena.',
      htmlBody: '<h2>Заголовок письма</h2><p>Напишите здесь основной текст рассылки.</p>',
    },
    {
      id: 'latest-article',
      label: 'Последняя статья',
      description: latest ? latestTitle : 'Шаблон анонса нового материала.',
      subject: `Новая статья: ${latestTitle}`,
      preheader: latestExcerpt,
      htmlBody: sanitizeNewsletterFragment(`
        ${latestImage ? `<img src="${escapeNewsletterHtml(latestImage)}" alt="">` : ''}
        <h2>${escapeNewsletterHtml(latestTitle)}</h2>
        <p>${escapeNewsletterHtml(latestExcerpt)}</p>
        <p><a href="${escapeNewsletterHtml(latestUrl)}">Читать статью на HS-Arena →</a></p>
      `),
    },
    {
      id: 'tier-list-update',
      label: 'Обновился тир-лист',
      description: 'Короткое письмо об актуальных данных Арены.',
      subject: 'Тир-лист Арены обновлён',
      preheader: 'Свежие позиции классов и актуальные данные уже на HS-Arena.',
      htmlBody: sanitizeNewsletterFragment(`
        <h2>Тир-лист Арены обновлён</h2>
        <p>Мы пересчитали актуальные позиции классов по свежей статистике. Проверьте лидеров и подготовьтесь к следующему забегу.</p>
        <p><a href="${escapeNewsletterHtml(`${APP_URL}/tierlist`)}">Открыть новый тир-лист →</a></p>
      `),
    },
  ];
}

function mailingCampaignFromRow(row: any) {
  return {
    id: String(row.id),
    subject: String(row.subject || ''),
    preheader: String(row.preheader || ''),
    templateKey: String(row.template_key || 'custom'),
    segment: String(row.segment || 'all-consented'),
    status: String(row.status || 'queued'),
    recipientCount: Number(row.recipient_count || 0),
    acceptedCount: Number(row.accepted_count || 0),
    failedCount: Number(row.failed_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    createdAt: String(row.created_at || ''),
    startedAt: String(row.started_at || ''),
    completedAt: String(row.completed_at || ''),
    error: String(row.error || ''),
  };
}

function mailingOverviewPayload() {
  const contacts = mailingContactRows();
  const campaigns = dbAll<any>('SELECT * FROM mailing_campaigns ORDER BY created_at DESC LIMIT 20').map(mailingCampaignFromRow);
  return {
    summary: mailingSummary(),
    templates: newsletterTemplates(),
    contacts: contacts.slice(0, 50).map(row => ({
      id: String(row.id),
      email: String(row.email || ''),
      name: String(row.name || ''),
      consentStatus: String(row.consent_status || 'unknown'),
      consentSource: String(row.consent_source || ''),
      lifecycle: String(row.lifecycle || 'former'),
      accountState: String(row.account_state || 'current'),
      eligible: Boolean(row.eligible),
      updatedAt: String(row.updated_at || ''),
    })),
    campaigns,
    transport: {
      configured: Boolean(NEWSLETTER_FROM && NEWSLETTER_UNSUBSCRIBE_SECRET && LOCAL_SMTP_HOST),
      from: NEWSLETTER_FROM,
    },
  };
}

async function sendNewsletterToContact(campaign: any, contact: any) {
  const draft: NewsletterDraft = {
    subject: String(campaign.subject || ''),
    preheader: String(campaign.preheader || ''),
    htmlBody: sanitizeNewsletterFragment(campaign.html_body),
    textBody: String(campaign.text_body || ''),
    segment: campaign.segment as MailingSegment,
    templateKey: String(campaign.template_key || 'custom'),
  };
  const token = newsletterUnsubscribeToken(String(contact.id));
  const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  const html = renderNewsletterHtml(draft, unsubscribeUrl);
  const text = `${draft.textBody}\n\nОтписаться от рассылки: ${unsubscribeUrl}`;
  const host = new URL(APP_URL).hostname;
  const messageId = `${sha256(`${campaign.id}:${contact.id}`).slice(0, 32)}@${host}`;
  await sendMimeEmail({
    to: String(contact.email),
    subject: draft.subject,
    text,
    html,
    messageId,
    headers: [
      'Precedence: bulk',
      `List-Unsubscribe: <${unsubscribeUrl}>`,
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      `X-Campaign-ID: ${campaign.id}`,
    ],
  });
}

const newsletterCampaignJobs = new Set<string>();

function recordNewsletterCampaignTerminalAudit(campaign: any, action: string, details: Record<string, unknown>) {
  try {
    recordAdminAuditByActorId(String(campaign?.created_by || 'system'), action, 'mailing_campaign', String(campaign?.id || ''), details);
  } catch (err: any) {
    console.error('[mailing] failed to write terminal audit:', err?.message || err);
  }
}

async function runNewsletterCampaign(campaignId: string) {
  if (newsletterCampaignJobs.has(campaignId)) return;
  newsletterCampaignJobs.add(campaignId);
  const startedAt = new Date().toISOString();
  let campaign: any = null;
  try {
    campaign = dbGet<any>('SELECT * FROM mailing_campaigns WHERE id = ?', campaignId);
    if (!campaign || !['queued', 'sending'].includes(String(campaign.status))) return;
    dbRun("UPDATE mailing_campaigns SET status = 'sending', started_at = COALESCE(started_at, ?), error = '' WHERE id = ?", startedAt, campaignId);

    while (true) {
      const delivery = dbGet<any>(`
        SELECT d.*, mc.email, mc.consent_status, mc.consented_at, mc.verified_at, mc.suppressed_reason, u.blocked_at
        FROM mailing_deliveries d
        LEFT JOIN mailing_contacts mc ON mc.id = d.contact_id
        LEFT JOIN users u ON u.id = mc.user_id
        WHERE d.campaign_id = ? AND d.status IN ('pending', 'failed') AND d.attempts < 3
        ORDER BY d.updated_at ASC
        LIMIT 1
      `, campaignId);
      if (!delivery) break;
      const nowIso = new Date().toISOString();
      const stillEligible = delivery.consent_status === 'subscribed'
        && Boolean(delivery.consented_at)
        && Boolean(delivery.verified_at)
        && !delivery.suppressed_reason
        && !delivery.blocked_at
        && isRealEmail(String(delivery.email || ''));
      if (!stillEligible) {
        dbRun("UPDATE mailing_deliveries SET status = 'skipped', last_error = 'contact-suppressed', updated_at = ? WHERE campaign_id = ? AND contact_id = ?",
          nowIso, campaignId, delivery.contact_id);
        continue;
      }
      const claim = db().prepare(`
        UPDATE mailing_deliveries
        SET status = 'processing', attempts = attempts + 1, last_error = '', updated_at = ?
        WHERE campaign_id = ? AND contact_id = ? AND status = ? AND attempts = ? AND attempts < 3
      `).run(nowIso, campaignId, delivery.contact_id, String(delivery.status), Number(delivery.attempts || 0));
      if (Number(claim.changes || 0) !== 1) continue;
      let sendError: any = null;
      try {
        await sendNewsletterToContact(campaign, delivery);
      } catch (err: any) {
        sendError = err;
      }
      if (sendError) {
        const failedAt = new Date().toISOString();
        dbRun("UPDATE mailing_deliveries SET status = 'failed', last_error = ?, updated_at = ? WHERE campaign_id = ? AND contact_id = ? AND status = 'processing'",
          normalizeOptionalText(sendError?.message || 'sendmail failed', 500), failedAt, campaignId, delivery.contact_id);
        continue;
      }
      const acceptedAt = new Date().toISOString();
      const accepted = db().prepare("UPDATE mailing_deliveries SET status = 'accepted', last_error = '', accepted_at = ?, updated_at = ? WHERE campaign_id = ? AND contact_id = ? AND status = 'processing'")
        .run(acceptedAt, acceptedAt, campaignId, delivery.contact_id);
      if (Number(accepted.changes || 0) !== 1) {
        throw new Error('Локальный почтовый транспорт принял письмо, но его статус не удалось зафиксировать');
      }
    }

    const counts = dbGet<any>(`
      SELECT
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
        SUM(CASE WHEN status = 'uncertain' THEN 1 ELSE 0 END) AS uncertain_count,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count
      FROM mailing_deliveries WHERE campaign_id = ?
    `, campaignId) || {};
    if (Number(counts.processing_count || 0) > 0) return;
    const completedAt = new Date().toISOString();
    const acceptedCount = Number(counts.accepted_count || 0);
    const skippedCount = Number(counts.skipped_count || 0);
    const uncertainCount = Number(counts.uncertain_count || 0);
    const failedCount = Number(counts.failed_count || 0) + uncertainCount;
    const errorMessage = uncertainCount
      ? 'Состояние части писем после перезапуска неизвестно; они не были отправлены повторно.'
      : failedCount
        ? 'Часть писем не принята локальным почтовым транспортом.'
        : '';
    const finalStatus = failedCount ? 'completed-with-errors' : 'completed';
    dbRun(`
      UPDATE mailing_campaigns
      SET status = ?, completed_at = ?, accepted_count = ?, failed_count = ?, skipped_count = ?, error = ?
      WHERE id = ?
    `, finalStatus, completedAt, acceptedCount, failedCount, skippedCount, errorMessage, campaignId);
    recordNewsletterCampaignTerminalAudit(campaign, `mailing.${finalStatus}`, {
      acceptedCount,
      failedCount,
      skippedCount,
      uncertainCount,
    });
  } catch (err: any) {
    const errorMessage = normalizeOptionalText(err?.message || 'campaign failed', 500);
    try {
      dbRun(`
        UPDATE mailing_deliveries
        SET status = 'uncertain', last_error = 'delivery-state-unknown-after-worker-error', updated_at = ?
        WHERE campaign_id = ? AND status = 'processing'
      `, new Date().toISOString(), campaignId);
      dbRun("UPDATE mailing_campaigns SET status = 'failed', completed_at = ?, error = ? WHERE id = ?",
        new Date().toISOString(), errorMessage, campaignId);
    } catch (statusErr: any) {
      console.error('[mailing] failed to persist campaign failure:', statusErr?.message || statusErr);
    }
    if (campaign) recordNewsletterCampaignTerminalAudit(campaign, 'mailing.failed', { error: errorMessage });
  } finally {
    newsletterCampaignJobs.delete(campaignId);
  }
}

function resumeNewsletterCampaigns() {
  const resumedAt = new Date().toISOString();
  dbRun(`
    UPDATE mailing_deliveries
    SET status = 'uncertain', last_error = 'delivery-state-unknown-after-restart', updated_at = ?
    WHERE status = 'processing'
      AND campaign_id IN (
        SELECT id FROM mailing_campaigns WHERE status IN ('queued', 'sending', 'failed')
      )
  `, resumedAt);
  const rows = dbAll<any>("SELECT id FROM mailing_campaigns WHERE status IN ('queued', 'sending') ORDER BY created_at ASC");
  for (const row of rows) void runNewsletterCampaign(String(row.id));
}

function authTokenCandidatesFromReq(req: import('express').Request): string[] {
  return authTokenCandidates({
    authorization: String(req.headers.authorization ?? ''),
    cookieHeader: String(req.headers.cookie ?? ''),
    cookieName: AUTH_COOKIE_NAME,
    bodyToken: String(req.body?.token ?? ''),
  });
}

function adminTokenFromReq(req: import('express').Request): string {
  const candidates = authTokenCandidatesFromReq(req);
  return candidates.find(token => authenticatedSessionFromToken(token)) ?? candidates[0] ?? '';
}

function userAuth(req: import('express').Request): AdminUser | null {
  return authenticatedSessionFromRequest(req)?.user ?? null;
}

function authenticatedSessionFromToken(token: string): { store: AdminAuthStore; session: AdminSession; user: AdminUser } | null {
  if (!token) return null;
  const store = loadAuthStore();
  const tokenHash = sha256(token);
  const session = store.sessions.find(item => item.tokenHash === tokenHash && item.expiresAt > Date.now());
  if (!session) return null;
  const user = store.users.find(item => item.id === session.userId || item.email === session.email);
  if (user?.blockedAt) {
    store.sessions = store.sessions.filter(item => item.tokenHash !== tokenHash);
    saveAuthStore(store);
    return null;
  }
  return user ? { store, session, user } : null;
}

function authenticatedSessionFromRequest(req: import('express').Request): ({
  token: string;
  store: AdminAuthStore;
  session: AdminSession;
  user: AdminUser;
}) | null {
  for (const token of authTokenCandidatesFromReq(req)) {
    const activeSession = authenticatedSessionFromToken(token);
    if (activeSession) return { token, ...activeSession };
  }
  return null;
}

function refreshAuthSessionIfNeeded(store: AdminAuthStore, session: AdminSession): boolean {
  const nextExpiresAt = Date.now() + AUTH_SESSION_TTL_MS;
  if (session.expiresAt > nextExpiresAt - AUTH_SESSION_REFRESH_WINDOW_MS) return false;
  session.expiresAt = nextExpiresAt;
  return true;
}

function adminAuth(req: import('express').Request): AdminUser | null {
  const user = userAuth(req);
  return user && isAdminUser(user) ? user : null;
}

function recordAdminAuditByActorId(actorUserId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  dbRun(`
    INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, actorUserId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString());
}

function recordAdminAudit(actor: AdminUser, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  recordAdminAuditByActorId(actor.id, action, entityType, entityId, details);
}

function listParserControlAudit(limit: number) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 30));
  const rows = dbAll<{
    id: number;
    actor_user_id: string;
    actor_name: string | null;
    action: string;
    entity_id: string;
    details_json: string;
    created_at: string;
  }>(`
    SELECT
      audit.id,
      audit.actor_user_id,
      users.name AS actor_name,
      audit.action,
      audit.entity_id,
      audit.details_json,
      audit.created_at
    FROM admin_audit_log AS audit
    LEFT JOIN users ON users.id = audit.actor_user_id
    WHERE audit.entity_type = 'parser-control'
    ORDER BY audit.created_at DESC, audit.id DESC
    LIMIT ?
  `, safeLimit);
  return rows.map(row => ({
    id: String(row.id),
    actor: {
      id: String(row.actor_user_id || ''),
      name: String(row.actor_name || '').trim(),
    },
    action: String(row.action || ''),
    entityId: String(row.entity_id || ''),
    details: safeJsonObject(row.details_json),
    createdAt: String(row.created_at || ''),
  }));
}

function cookieMutationCsrfAllowed(req: import('express').Request): boolean {
  const requestPath = new URL(req.originalUrl, 'http://localhost').pathname;
  return csrfRequestAllowed({
    method: req.method,
    path: requestPath,
    authorization: req.headers.authorization,
    authCookiePresent: Boolean(cookieValue(req, AUTH_COOKIE_NAME)),
    csrfHeader: req.headers['x-csrf-request'],
    origin: req.headers.origin,
    referer: req.headers.referer,
    secFetchSite: req.headers['sec-fetch-site'],
    appUrl: APP_URL,
    allowLocalDevelopmentOrigins: process.env.NODE_ENV !== 'production',
  });
}

function isAdminUser(user: AdminUser | null | undefined): user is AdminUser {
  return Boolean(user && !user.blockedAt && user.role === 'admin');
}

function isContestAdminUser(user: AdminUser | null | undefined): user is AdminUser {
  if (!user) return false;
  const userId = user.id;
  return isAdminUser(user) || userId === CONTEST_ADMIN_USER_ID;
}

function rateLimitClientKey(req: import('express').Request): string {
  return ipKeyGenerator(getTrustedClientIp(req) || 'unknown');
}

function rateLimitEmailKey(req: import('express').Request): string {
  return `${rateLimitClientKey(req)}:${normalizeEmail(req.body?.email) || 'unknown'}`;
}

function newsletterAdminRateLimitKey(req: import('express').Request): string {
  const admin = adminAuth(req);
  return admin ? `admin:${admin.id}` : `unauthenticated:${rateLimitClientKey(req)}`;
}

function emptySubscriptionStatus(message = 'Подписка пока не подтверждена'): SubscriptionStatus {
  return {
    hasAccess: false,
    source: 'none',
    checkedAt: null,
    stale: true,
    message,
    entitlements: emptyEntitlements(),
    boosty: {},
    telegram: {},
  };
}

function deriveStoredEntitlements(
  hasAccess: boolean,
  source: string,
  boosty: Record<string, any>,
  telegram: Record<string, any>,
): SubscriptionEntitlements {
  void hasAccess;
  const normalizedBoosty = normalizeBoostySubscriptionDetail(boosty);
  const normalizedTelegram = normalizeTelegramSubscriptionDetail(telegram);
  const stored = mergeEntitlements(
    normalizeEntitlements(normalizedBoosty.entitlements),
    normalizeEntitlements(normalizedTelegram.entitlements),
  );
  if (hasAnyEntitlement(stored)) return stored;

  const derivedBoosty = normalizedBoosty.levelName ? boostyEntitlementsForLevel(String(normalizedBoosty.levelName)) : emptyEntitlements();
  const derivedTelegram = normalizedTelegram.hasAccess || source.includes('telegram') ? allEntitlements() : emptyEntitlements();
  const derived = mergeEntitlements(derivedBoosty, derivedTelegram);
  if (hasAnyEntitlement(derived)) return derived;

  return emptyEntitlements();
}

const subscriptionRefreshInFlight = new Map<string, Promise<SubscriptionStatus>>();

function activeManualSubscriptionGrant(userId: string): { grantedBy: string; grantedAt: string; expiresAt: string | null } | null {
  const row = dbGet<any>(`
    SELECT granted_by, granted_at, expires_at
    FROM manual_subscription_grants
    WHERE user_id = ? AND active = 1
      AND (expires_at IS NULL OR expires_at > ?)
  `, userId, new Date().toISOString());
  return row ? {
    grantedBy: String(row.granted_by || ''),
    grantedAt: String(row.granted_at || ''),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  } : null;
}

function applyManualSubscriptionGrant(userId: string, status: SubscriptionStatus | null): SubscriptionStatus | null {
  const grant = activeManualSubscriptionGrant(userId);
  if (!grant) return status;
  const base = status ?? emptySubscriptionStatus();
  const source = base.source && base.source !== 'none'
    ? `${base.source},manual-access`
    : 'manual-access';
  return {
    ...base,
    hasAccess: true,
    source,
    stale: false,
    message: grant.expiresAt
      ? `Полный доступ выдан администратором до ${new Date(grant.expiresAt).toLocaleDateString('ru-RU')}.`
      : 'Бессрочный доступ выдан администратором.',
    entitlements: allEntitlements(),
  };
}

function readSubscriptionStatus(userId: string): SubscriptionStatus | null {
  const row = dbGet<any>('SELECT * FROM subscriptions WHERE user_id = ?', userId);
  if (!row) return applyManualSubscriptionGrant(userId, null);
  const checkedAt = row.checked_at ? String(row.checked_at) : null;
  const age = checkedAt ? Date.now() - Date.parse(checkedAt) : Number.POSITIVE_INFINITY;
  const providerMarkedStale = Boolean(row.stale);
  const shouldRetryStaleProvider = providerMarkedStale && age > SUBSCRIPTION_STALE_RETRY_MS;
  const boosty = normalizeBoostySubscriptionDetail(safeJsonObject(row.boosty_json));
  const telegram = normalizeTelegramSubscriptionDetail(safeJsonObject(row.telegram_json));
  const hasAccess = Boolean(row.has_access);
  const source = String(row.source || 'none');
  const entitlements = deriveStoredEntitlements(hasAccess, source, boosty, telegram);
  return applyManualSubscriptionGrant(userId, {
    hasAccess: hasAnyEntitlement(entitlements),
    source,
    checkedAt,
    stale: age > SUBSCRIPTION_REFRESH_MS || shouldRetryStaleProvider,
    message: String(row.message || ''),
    entitlements,
    boosty,
    telegram,
  });
}

function safeJsonObject(value: unknown): Record<string, any> {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSubscriptionStatus(user: AdminUser, status: SubscriptionStatus) {
  const nowIso = new Date().toISOString();
  const boosty = normalizeBoostySubscriptionDetail(status.boosty);
  const telegram = normalizeTelegramSubscriptionDetail(status.telegram);
  const entitlements = mergeEntitlements(status.entitlements, boosty.entitlements, telegram.entitlements);
  const hasAccess = hasAnyEntitlement(entitlements);
  dbRun(`
    INSERT INTO subscriptions (
      user_id, has_access, source, message, checked_at, stale, boosty_json, telegram_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      has_access = excluded.has_access,
      source = excluded.source,
      message = excluded.message,
      checked_at = excluded.checked_at,
      stale = excluded.stale,
      boosty_json = excluded.boosty_json,
      telegram_json = excluded.telegram_json,
      updated_at = excluded.updated_at
  `, user.id, hasAccess ? 1 : 0, status.source, status.message, status.checkedAt, status.stale ? 1 : 0,
    JSON.stringify(boosty), JSON.stringify(telegram), nowIso);
}

function writeSubscriptionCheck(user: AdminUser, source: string, hasAccess: boolean, detail: Record<string, any>) {
  dbRun(`
    INSERT INTO subscription_checks (user_id, source, has_access, detail_json, checked_at)
    VALUES (?, ?, ?, ?, ?)
  `, user.id, source, hasAccess ? 1 : 0, JSON.stringify(detail), new Date().toISOString());
}

function boostyProviderUnavailable(boosty: Record<string, any>): boolean {
  return Boolean(boosty.stale || boosty.checked === false || boosty.providerUnavailable);
}

function applyBoostyGracePeriod(boosty: Record<string, any>, previous: SubscriptionStatus | null): Record<string, any> {
  const current = normalizeBoostySubscriptionDetail(boosty);
  if (!boostyProviderUnavailable(current)) return current;
  if (!previous?.checkedAt) {
    return {
      ...current,
      hasAccess: false,
      entitlements: emptyEntitlements(),
      message: current.message || 'Boosty временно недоступен, последней успешной проверки нет.',
    };
  }

  const previousBoosty = normalizeBoostySubscriptionDetail(previous.boosty);
  const previousEntitlements = normalizeEntitlements(previousBoosty.entitlements);
  if (!previousBoosty.hasAccess || !hasAnyEntitlement(previousEntitlements)) {
    return {
      ...current,
      hasAccess: false,
      entitlements: emptyEntitlements(),
    };
  }

  const graceStartedAt = String(previousBoosty.graceStartedAt || previous.checkedAt);
  const checkedAtMs = Date.parse(graceStartedAt);
  if (!Number.isFinite(checkedAtMs)) return current;
  const graceUntilMs = checkedAtMs + BOOSTY_ACCESS_GRACE_MS;
  if (Date.now() > graceUntilMs) {
    return {
      ...current,
      hasAccess: false,
      entitlements: emptyEntitlements(),
      graceExpiredAt: new Date(graceUntilMs).toISOString(),
      message: 'Boosty временно недоступен, 24-часовой резервный доступ истёк.',
    };
  }

  return {
    ...previousBoosty,
    hasAccess: true,
    entitlements: previousEntitlements,
    stale: true,
    grace: true,
    graceStartedAt,
    graceUntil: new Date(graceUntilMs).toISOString(),
    providerMessage: current.message || '',
    message: 'Boosty временно недоступен, доступ сохранён на 24 часа по последней успешной проверке.',
  };
}

async function fetchBoostyServiceStatus(): Promise<Record<string, any>> {
  if (!BOOSTY_AUTH_API_URL) {
    return {
      configured: false,
      ok: false,
      importStatus: 'not-configured',
      source: 'none',
      stale: true,
      checkedAt: new Date().toISOString(),
      graceHours: Math.round(BOOSTY_ACCESS_GRACE_MS / (60 * 60 * 1000)),
      message: 'Boosty API не настроен.',
    };
  }
  try {
    const response = await fetch(`${BOOSTY_AUTH_API_URL}/api/audit`, { signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    const importStatus = String(data?.importStatus || '');
    const stale = Boolean(data?.subscriberStale ?? data?.stale ?? importStatus === 'stale');
    return {
      configured: true,
      ok: !stale && importStatus !== 'stale' && importStatus !== 'quarantined',
      importStatus: importStatus || (stale ? 'stale' : 'unknown'),
      source: String(data?.subscriberSource || data?.source || ''),
      stale,
      snapshotAgeSeconds: data?.snapshotAgeSeconds ?? null,
      lastErrorCategory: data?.lastErrorCategory || null,
      lastErrorMessage: data?.lastErrorMessage || null,
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
      summary: data?.summary && typeof data.summary === 'object' ? data.summary : {},
      checkedAt: new Date().toISOString(),
      graceHours: Math.round(BOOSTY_ACCESS_GRACE_MS / (60 * 60 * 1000)),
    };
  } catch (err: any) {
    return {
      configured: true,
      ok: false,
      importStatus: 'error',
      source: 'unavailable',
      stale: true,
      snapshotAgeSeconds: null,
      lastErrorCategory: 'request-failed',
      lastErrorMessage: err?.message || 'Boosty API временно недоступен.',
      warnings: ['boosty-api-unavailable'],
      summary: {},
      checkedAt: new Date().toISOString(),
      graceHours: Math.round(BOOSTY_ACCESS_GRACE_MS / (60 * 60 * 1000)),
    };
  }
}

async function fetchBoostySubscribers(includeInactive = true): Promise<Record<string, any>> {
  if (!BOOSTY_AUTH_API_URL) {
    return {
      configured: false,
      source: 'none',
      stale: true,
      subscribers: [],
      summary: {},
      levels: {},
      message: 'Boosty API не настроен.',
    };
  }
  const url = `${BOOSTY_AUTH_API_URL}/api/subscribers?include_inactive=${includeInactive ? 'true' : 'false'}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
  const subscribers = Array.isArray(data?.subscribers) ? data.subscribers : [];
  const rows = subscribers.map((subscriber: Record<string, any>) => {
    const money = subscriber?.money && typeof subscriber.money === 'object' ? subscriber.money : {};
    const level = subscriber?.level && typeof subscriber.level === 'object' ? subscriber.level : {};
    const dates = subscriber?.dates && typeof subscriber.dates === 'object' ? subscriber.dates : {};
    const levelName = String(level.name || '');
    const levelEntitlements = boostyEntitlementsForLevel(levelName);
    const siteAccess = Boolean(subscriber.hasActivePaidAccess) && hasAnyEntitlement(levelEntitlements);
    return {
      id: String(subscriber.id || ''),
      name: String(subscriber.name || ''),
      email: String(subscriber.email || ''),
      hasEmail: Boolean(subscriber.hasEmail),
      avatarUrl: String(subscriber.avatarUrl || ''),
      status: String(subscriber.status || ''),
      subscribed: Boolean(subscriber.subscribed),
      active: Boolean(subscriber.active),
      paid: Boolean(subscriber.paid),
      hasActivePaidAccess: Boolean(subscriber.hasActivePaidAccess),
      willRenew: Boolean(subscriber.willRenew),
      blacklisted: Boolean(subscriber.blacklisted),
      canWrite: Boolean(subscriber.canWrite),
      audienceType: String(subscriber.audienceType || ''),
      contactStatus: String(subscriber.contactStatus || ''),
      mailingSegment: String(subscriber.mailingSegment || ''),
      level: {
        id: level.id ?? null,
        name: levelName,
        price: Number(level.price || 0),
        currency: String(level.currency || money.currency || 'RUB'),
      },
      money: {
        currentPrice: Number(money.currentPrice || 0),
        totalPayments: Number(money.totalPayments || 0),
        currency: String(money.currency || level.currency || 'RUB'),
      },
      dates: {
        subscribedAt: dates.subscribedAt || null,
        unsubscribedAt: dates.unsubscribedAt || null,
        nextPaymentAt: dates.nextPaymentAt || null,
      },
      entitlements: siteAccess ? levelEntitlements : emptyEntitlements(),
      siteAccess,
    };
  });
  for (const row of rows) {
    rememberBoostyMailingContact(row.email, row.name, Boolean(row.active || row.hasActivePaidAccess), row.dates?.unsubscribedAt);
  }
  const levels = rows.reduce((acc: Record<string, number>, row: any) => {
    const key = row.level.name || 'Без уровня';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    configured: true,
    source: String(data?.source || ''),
    stale: Boolean(data?.stale),
    summary: data?.summary && typeof data.summary === 'object' ? data.summary : {},
    levels,
    subscribers: rows,
    fetchedAt: new Date().toISOString(),
  };
}

async function checkBoostySubscription(user: AdminUser): Promise<Record<string, any>> {
  const khaBoosty = khaBoostySubscriptionDetail(user, findKhaVipProfileForUser(user));
  if (khaBoosty) return khaBoosty;

  if (!isRealEmail(user.email)) {
    return {
      configured: Boolean(BOOSTY_AUTH_API_URL),
      checked: false,
      hasAccess: false,
      found: false,
      message: 'Для проверки Boosty привяжите реальную почту в профиле.',
    };
  }
  try {
    const url = `${BOOSTY_AUTH_API_URL}/api/access/check?email=${encodeURIComponent(user.email)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    const subscriber = data?.subscriber && typeof data.subscriber === 'object' ? data.subscriber : null;
    const money = subscriber?.money && typeof subscriber.money === 'object' ? subscriber.money : {};
    const level = subscriber?.level && typeof subscriber.level === 'object' ? subscriber.level : {};
    const price = Number(money.currentPrice ?? level.price ?? 0) || 0;
    const active = Boolean(data?.hasAccess ?? subscriber?.hasActivePaidAccess);
    const levelName = String(level.name || '');
    const entitlements = data?.found && active ? boostyEntitlementsForLevel(levelName) : emptyEntitlements();
    const hasAccess = hasAnyEntitlement(entitlements);
    return {
      configured: true,
      checked: true,
      found: Boolean(data?.found),
      hasAccess,
      stale: Boolean(data?.stale),
      email: user.email,
      minPrice: BOOSTY_MIN_PRICE,
      minLevelName: BOOSTY_MIN_LEVEL_NAME,
      price,
      levelName,
      entitlements,
      message: hasAccess
        ? 'Boosty подписка подтверждена.'
        : data?.found
          ? 'Этот уровень Boosty не открывает разделы HS-Arena.'
          : 'Boosty не нашёл эту почту. Зайдите на Boosty и привяжите/откройте email, затем обновите проверку.',
    };
  } catch (err: any) {
    console.warn('[subscription] Boosty check failed:', err?.message ?? err);
    return {
      configured: true,
      checked: false,
      hasAccess: false,
      found: false,
      stale: true,
      providerUnavailable: true,
      email: user.email,
      message: err?.message ?? 'Boosty временно недоступен.',
    };
  }
}

async function checkTelegramSubscription(user: AdminUser): Promise<Record<string, any>> {
  if (!KHA_VIP_BOT_TOKEN) {
    return { configured: false, checked: false, hasAccess: false, message: 'VIP Telegram-бот не настроен.' };
  }
  if (!user.telegramId) {
    return { configured: true, checked: false, hasAccess: false, message: 'Для проверки Telegram войдите через Telegram.' };
  }

  const chats: Array<Record<string, any>> = [];
  let hasAccess = false;
  for (const chatId of SUBSCRIPTION_TELEGRAM_CHAT_IDS) {
    try {
      const method = `getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(user.telegramId)}`;
      const response = await fetchTelegramBotApi(KHA_VIP_BOT_TOKEN, method, {}, 5_000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.description || `HTTP ${response.status}`);
      const member = data?.result ?? {};
      const status = String(member.status || '');
      const isMember = ['member', 'administrator', 'creator'].includes(status)
        || (status === 'restricted' && Boolean(member.is_member));
      hasAccess ||= isMember;
      chats.push({ chatId, ok: true, status, isMember });
    } catch (err: any) {
      console.warn(`[subscription] Telegram chat check failed chat=${chatId} user=${user.telegramId}:`, err?.message ?? err);
      chats.push({ chatId, ok: false, isMember: false, error: err?.message ?? 'Telegram check failed' });
    }
  }

  return {
    configured: true,
    checked: true,
    hasAccess,
    entitlements: hasAccess ? allEntitlements() : emptyEntitlements(),
    telegramId: user.telegramId,
    username: user.telegramUsername ?? '',
    chats,
    message: hasAccess
      ? 'Telegram VIP-канал подтверждён.'
      : 'Пользователь не найден в VIP Telegram-каналах.',
  };
}

async function refreshSubscriptionForUserNow(user: AdminUser): Promise<SubscriptionStatus> {
  const previous = readSubscriptionStatus(user.id);
  const [rawBoosty, rawTelegram] = await Promise.all([
    checkBoostySubscription(user),
    checkTelegramSubscription(user),
  ]);
  const boosty = applyBoostyGracePeriod(rawBoosty, previous);
  const telegram = normalizeTelegramSubscriptionDetail(rawTelegram);
  writeSubscriptionCheck(user, 'boosty', Boolean(boosty.hasAccess), boosty);
  writeSubscriptionCheck(user, 'telegram', Boolean(telegram.hasAccess), telegram);

  const entitlements = mergeEntitlements(
    normalizeEntitlements(boosty.entitlements),
    normalizeEntitlements(telegram.entitlements),
  );
  const sources = [
    boosty.hasAccess ? 'boosty' : '',
    telegram.hasAccess ? 'telegram' : '',
  ].filter(Boolean);
  const hasAccess = hasAnyEntitlement(entitlements);
  const status: SubscriptionStatus = {
    hasAccess,
    source: hasAccess ? sources.join(',') : 'none',
    checkedAt: new Date().toISOString(),
    stale: Boolean(boosty.stale || telegram.stale),
    message: hasAccess
      ? boosty.grace
        ? 'Boosty временно недоступен, доступ сохранён на 24 часа.'
        : 'Подписка Манакоста подтверждена.'
      : boosty.message || telegram.message || 'Подписка пока не подтверждена.',
    entitlements,
    boosty,
    telegram,
  };
  writeSubscriptionStatus(user, status);
  return applyManualSubscriptionGrant(user.id, status) ?? status;
}

async function refreshSubscriptionForUser(user: AdminUser, force = false): Promise<SubscriptionStatus> {
  if (!force) {
    const cached = readSubscriptionStatus(user.id);
    if (cached && !cached.stale) return cached;
    const pending = subscriptionRefreshInFlight.get(user.id);
    if (pending) return pending;
  }

  const promise = refreshSubscriptionForUserNow(user)
    .finally(() => subscriptionRefreshInFlight.delete(user.id));
  if (!force) subscriptionRefreshInFlight.set(user.id, promise);
  return promise;
}

async function refreshSubscriptionAfterTelegramAuth(user: AdminUser): Promise<void> {
  try {
    await refreshSubscriptionForUser(user, true);
  } catch (err: any) {
    console.warn(`[subscription] Telegram auth refresh failed user=${user.id}:`, err?.message ?? err);
  }
}

async function requireSubscriptionAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  return requireEntitlementAccess(null)(req, res, next);
}

function requireEntitlementAccess(entitlement: SubscriptionEntitlementKey | null, label = 'этому разделу') {
  return async function subscriptionEntitlementGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  res.vary('Cookie');
  res.vary('Authorization');
  const user = userAuth(req);
  if (!user) {
    setPrivateNoStore(res);
    return res.status(401).json({ error: 'Требуется вход в профиль Манакоста' });
  }
  if (isAdminUser(user)) {
    res.locals.subscriptionGuarded = true;
    return next();
  }

  try {
    const subscription = await refreshSubscriptionForUser(user, false);
    const allowed = entitlement ? Boolean(subscription.entitlements?.[entitlement]) : subscription.hasAccess;
    if (!allowed) {
      setPrivateNoStore(res);
      return res.status(403).json({
        error: `Для доступа к ${label} нужна подходящая подписка Манакоста`,
        subscription,
      });
    }
    res.locals.subscriptionGuarded = true;
    return next();
  } catch (err: any) {
    console.error('[subscription] access guard failed:', err?.message ?? err);
    setPrivateNoStore(res);
    return res.status(502).json({ error: 'Не удалось проверить подписку' });
  }
  };
}

const requireArenaAccess = requireEntitlementAccess('arena', 'разделам Арены');
const requireBattlegroundsAccess = requireEntitlementAccess('battlegrounds', 'разделам Полей Сражений');
const requireStandardAccess = requireEntitlementAccess('standard', 'разделу Стандарт');
const requireGuidesArchiveAccess = requireEntitlementAccess('guidesArchive', 'архиву гайдов');

async function requestHasEntitlementAccess(
  request: express.Request,
  entitlement: SubscriptionEntitlementKey,
): Promise<boolean> {
  const user = userAuth(request);
  if (!user) return false;
  if (isAdminUser(user)) return true;
  try {
    const subscription = await refreshSubscriptionForUser(user, false);
    return Boolean(subscription.entitlements?.[entitlement]);
  } catch (error) {
    console.warn('[subscription] optional entitlement check failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

function parseHttpUrl(rawUrl: unknown): URL | null {
  try {
    const url = new URL(String(rawUrl ?? '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function normalizeArticleUrlKey(rawUrl: unknown): string {
  const url = parseHttpUrl(rawUrl);
  if (!url) return '';
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = decodeURIComponent(url.pathname)
    .replace(/\/index\.html?$/i, '')
    .replace(/\/+$/, '');
  return `${host}${pathname || '/'}`;
}

function articleSlug(rawUrl: unknown): string {
  const url = parseHttpUrl(rawUrl);
  if (!url) return '';
  const parts = url.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts.at(-1) || '').toLowerCase();
}

function normalizeArticleTitle(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isKhaVipArticleUrl(rawUrl: unknown): boolean {
  const url = parseHttpUrl(rawUrl);
  return Boolean(url && KHA_VIP_ARTICLE_HOSTS.has(url.hostname.toLowerCase()));
}

function dateOnly(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

async function fetchKhaVipLockers(force = false): Promise<KhaVipLocker[]> {
  if (!KHA_VIP_WP_BEARER) throw new Error('Koloda VIP API bearer is not configured');
  const now = Date.now();
  if (!force && khaVipLockersCache && khaVipLockersCache.expiresAt > now) {
    return khaVipLockersCache.items;
  }

  const response = await fetch(`${KHA_VIP_WP_BASE_URL}/wp-json/vip/v1/lockers`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${KHA_VIP_WP_BEARER}`,
      'User-Agent': 'HS-Arena VIP article bridge/1.0',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Koloda lockers unavailable: HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ''}`);
  }

  const data = await response.json().catch(() => null);
  if (!Array.isArray(data)) throw new Error('Koloda lockers returned invalid payload');
  const items = data
    .map((item: any): KhaVipLocker => ({
      post_id: Number(item?.post_id || 0),
      code: String(item?.code || ''),
      title: String(item?.title || ''),
      url: String(item?.url || ''),
      image: item?.image ? String(item.image) : '',
      excerpt: item?.excerpt ? String(item.excerpt) : '',
      date: item?.date ? String(item.date) : '',
      type: item?.type ? String(item.type) : '',
    }))
    .filter((item: KhaVipLocker) => item.post_id > 0 && item.code && item.url);

  khaVipLockersCache = { items, expiresAt: now + KHA_VIP_LOCKERS_CACHE_MS };
  return items;
}

async function findKhaVipLockerForArticle(rawUrl: unknown, title?: unknown): Promise<KhaVipLocker | null> {
  if (!isKhaVipArticleUrl(rawUrl)) return null;
  const lockers = await fetchKhaVipLockers();
  const wantedUrl = normalizeArticleUrlKey(rawUrl);
  const wantedSlug = articleSlug(rawUrl);
  const wantedTitle = normalizeArticleTitle(title);

  return lockers.find(item => normalizeArticleUrlKey(item.url) === wantedUrl)
    ?? lockers.find(item => wantedSlug && articleSlug(item.url) === wantedSlug)
    ?? lockers.find(item => wantedTitle && normalizeArticleTitle(item.title) === wantedTitle)
    ?? lockers.find(item => {
      const lockerTitle = normalizeArticleTitle(item.title);
      return Boolean(wantedTitle && lockerTitle && (lockerTitle.includes(wantedTitle) || wantedTitle.includes(lockerTitle)));
    })
    ?? null;
}

function wordpressIssueUserId(user: AdminUser): number {
  const telegramId = Number.parseInt(String(user.telegramId || ''), 10);
  if (Number.isFinite(telegramId) && telegramId > 0) return telegramId;
  const digest = Number.parseInt(sha256(user.id).slice(0, 8), 16);
  return 2_000_000_000 + (digest % 1_000_000_000);
}

async function issueKhaVipArticleLink(locker: KhaVipLocker, user: AdminUser): Promise<Record<string, any>> {
  if (!KHA_VIP_WP_BEARER) throw new Error('Koloda VIP API bearer is not configured');
  const response = await fetch(`${KHA_VIP_WP_BASE_URL}/wp-json/vip/v1/issue`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KHA_VIP_WP_BEARER}`,
      'User-Agent': 'HS-Arena VIP article bridge/1.0',
    },
    body: JSON.stringify({
      post_id: locker.post_id,
      code: locker.code,
      telegram_user_id: wordpressIssueUserId(user),
      ttl: 900,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Koloda issue failed: HTTP ${response.status}`);
  }
  if (!data?.url) throw new Error('Koloda issue did not return URL');
  return data;
}

async function resolveArticlePublishedDate(rawUrl: unknown, title?: unknown): Promise<string | null> {
  try {
    const locker = await findKhaVipLockerForArticle(rawUrl, title);
    const lockerDate = dateOnly(locker?.date);
    if (lockerDate) return lockerDate;
  } catch (err: any) {
    console.warn('[articles] Koloda publish date lookup failed:', err?.message ?? err);
  }

  const url = parseHttpUrl(rawUrl);
  if (!url) return null;
  try {
    const response = await fetch(url.href, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'HS-Arena article metadata lookup/1.0',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const patterns = [
      /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
      /itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/i,
      /<time[^>]+datetime=["']([^"']+)["']/i,
      /"datePublished"\s*:\s*"([^"]+)"/i,
    ];
    for (const pattern of patterns) {
      const matched = html.match(pattern);
      const resolved = dateOnly(matched?.[1]);
      if (resolved) return resolved;
    }
  } catch (err: any) {
    console.warn('[articles] publish date lookup failed:', err?.message ?? err);
  }
  return null;
}

async function refreshAllSubscriptions() {
  syncKhaVipProfiles(db());
  const store = loadAuthStore();
  for (const user of store.users) {
    try {
      await refreshSubscriptionForUser(user, true);
    } catch (err: any) {
      console.warn(`[subscription] scheduled refresh failed user=${user.id}:`, err?.message ?? err);
    }
  }
}

function internalApiGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (!ECOSYSTEM_INTERNAL_KEY) return res.status(503).json({ error: 'Internal ecosystem API is not configured' });
  if (!safeEqualString(req.headers['x-ecosystem-key'], ECOSYSTEM_INTERNAL_KEY)) {
    return res.status(401).json({ error: 'Invalid ecosystem key' });
  }
  next();
}

function manualScrapeGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (ECOSYSTEM_INTERNAL_KEY && safeEqualString(req.headers['x-ecosystem-key'], ECOSYSTEM_INTERNAL_KEY)) {
    return next();
  }
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход администратора' });
  if (!isAdminUser(user)) return res.status(403).json({ error: 'Доступ запрещён для этого ID' });
  return next();
}

function resolveUserFromRequest(req: import('express').Request): AdminUser | null {
  const userId = String(req.query.userId ?? req.body?.userId ?? '').trim();
  const email = normalizeEmail(req.query.email ?? req.body?.email);
  const telegramId = String(req.query.telegramId ?? req.body?.telegramId ?? '').replace(/\D/g, '');
  const store = loadAuthStore();
  return store.users.find(user =>
    (userId && user.id === userId)
    || (email && user.email === email)
    || (telegramId && user.telegramId === telegramId)
  ) ?? null;
}

function loadClassPositionsData() {
  return loadData('class_positions.json') ?? { positions: {}, updatedAt: null };
}

function withClassPositions(data: any) {
  const positionsData = loadClassPositionsData();
  const positions = positionsData?.positions ?? {};
  return {
    ...data,
    classPositions: positions,
    sections: (data?.sections ?? []).map((section: any) => ({
      ...section,
      classPosition: positions[section.id] ?? '',
    })),
  };
}

const HSREPLAY_ARENA_DATASET_URL = 'https://api.kolodahearthstone.com/datasets/hsreplay_arena';
const CLASS_MATCHUPS_CACHE_MS = 30 * 60 * 1000;
const CLASS_WINRATES_CACHE_MS = 5 * 60 * 1000;
const KOLODA_ARENA_DECKS_URL = 'https://kolodahs.ru/arena/winning';
const ARENA_DECKS_CACHE_MS = 30 * 60 * 1000;
const ARENA_DECKS_MAX_LIMIT = 500;
const HSREPLAY_CLASS_ID: Record<string, string> = {
  deathknight: 'death-knight',
  demonhunter: 'demon-hunter',
  druid: 'druid',
  hunter: 'hunter',
  mage: 'mage',
  paladin: 'paladin',
  priest: 'priest',
  rogue: 'rogue',
  shaman: 'shaman',
  warlock: 'warlock',
  warrior: 'warrior',
};
const HSREPLAY_CLASS_INFO: Record<string, { id: string; name: string; color: string; textDark?: boolean }> = {
  deathknight: { id: 'death-knight', name: 'Рыцарь смерти',     color: '#1f252d' },
  demonhunter: { id: 'demon-hunter', name: 'Охотник на демонов', color: '#224722' },
  druid:       { id: 'druid',        name: 'Друид',              color: '#704a16' },
  hunter:      { id: 'hunter',       name: 'Охотник',            color: '#1d5921' },
  mage:        { id: 'mage',         name: 'Маг',                color: '#2b5c85' },
  paladin:     { id: 'paladin',      name: 'Паладин',            color: '#a88a45' },
  priest:      { id: 'priest',       name: 'Жрец',               color: '#d1d1d1', textDark: true },
  rogue:       { id: 'rogue',        name: 'Разбойник',          color: '#333333' },
  shaman:      { id: 'shaman',       name: 'Шаман',              color: '#2a2e6b' },
  warlock:     { id: 'warlock',      name: 'Чернокнижник',       color: '#5c265c' },
  warrior:     { id: 'warrior',      name: 'Воин',               color: '#7a1e1e' },
};

function normalizeHsReplayClassId(value: unknown): string | null {
  const key = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return HSREPLAY_CLASS_ID[key] ?? null;
}

function parseWinrate(value: unknown): number | null {
  const raw = typeof value === 'string' ? value.replace('%', '').trim() : value;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const pct = num > 0 && num <= 1 ? num * 100 : num;
  return Math.round(pct * 100) / 100;
}

async function fetchClassWinratesData() {
  const upstream = await fetch(HSREPLAY_ARENA_DATASET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);

  const payload = await upstream.json() as any;
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const rawClasses = Array.isArray(structured?.classes) ? structured.classes : [];
  const classes = normalizeHsReplayArenaClassRows(
    rawClasses,
    HSREPLAY_CLASS_ID,
    HSREPLAY_CLASS_INFO,
  );

  if (!classes.length) throw new Error('No classes in HSReplay arena dataset');

  return {
    classes,
    updatedAt: payload?.fetched_at ?? payload?.data?.updatedAt ?? payload?.data?.updated_at ?? null,
    source: 'api.kolodahearthstone.com',
  };
}

async function fetchFirestoneClassWinratesData() {
  const upstream = await fetch(
    'https://static.zerotoheroes.com/api/arena/stats/classes/arena/last-patch/overview.gz.json',
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' } },
  );
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);
  const raw = await upstream.json() as any;
  const classes = normalizeFirestoneArenaClassRows(
    Array.isArray(raw.stats) ? raw.stats : [],
    HSREPLAY_CLASS_INFO,
  );
  if (!classes.length) throw new Error('No classes in Firestone arena dataset');
  return {
    classes,
    updatedAt: raw.lastUpdated ?? null,
    source: 'firestoneapp.com',
    dataPoints: Number.isFinite(Number(raw.dataPoints)) ? Number(raw.dataPoints) : null,
    timePeriod: typeof raw.timePeriod === 'string' ? raw.timePeriod : null,
  };
}

async function fetchFreshestClassWinratesData() {
  const liveData = await fetchClassWinratesData();
  const snapshotData = loadDataCached('winrates.json')?.data;
  const liveTime = liveData.updatedAt ? Date.parse(liveData.updatedAt) : 0;
  const snapshotTime = snapshotData?.updatedAt ? Date.parse(snapshotData.updatedAt) : 0;

  if (
    snapshotData
    && Array.isArray(snapshotData.classes)
    && Number.isFinite(snapshotTime)
    && snapshotTime > liveTime
  ) {
    return { ...snapshotData, source: snapshotData.source ?? 'cached' };
  }

  return liveData;
}

async function fetchClassMatchupsData() {
  const upstream = await fetch(HSREPLAY_ARENA_DATASET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);

  const payload = await upstream.json() as any;
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const rawMatchups = Array.isArray(structured?.matchups) ? structured.matchups : [];
  const matchups = rawMatchups
    .map((row: any) => {
      const classAId = normalizeHsReplayClassId(row.class_a ?? row.classA);
      const classBId = normalizeHsReplayClassId(row.class_b ?? row.classB);
      const winrate = parseWinrate(row.win_rate ?? row.winrate);
      if (!classAId || !classBId || winrate === null) return null;
      return {
        classAId,
        classBId,
        winrate,
        classA: row.class_a ?? row.classA ?? classAId,
        classB: row.class_b ?? row.classB ?? classBId,
      };
    })
    .filter(Boolean);

  const updatedAt = payload?.fetched_at ?? payload?.data?.fetched_at ?? null;
  return {
    matchups,
    updatedAt,
    source: 'api.kolodahearthstone.com',
  };
}

function decodeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function htmlText(value: unknown): string {
  return decodeHtml(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlAttr(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}=(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]).trim() : '';
}

function absoluteKolodaUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  try {
    return new URL(url, KOLODA_ARENA_DECKS_URL).toString();
  } catch {
    return url;
  }
}

function cardIdFromImageUrl(url: string): string {
  const match = url.match(/\/(?:256x|512x)\/([^/.?]+)\.png/i)
    ?? url.match(/\/cards\/[^/]+\/([^/.?]+)\.png(?:[?#].*)?$/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseDeckCards(block: string, ruCards: Record<string, any>) {
  const figures = block.match(/<figure\b[\s\S]*?<\/figure>/gi) ?? [];
  return figures
    .map((figure) => {
      const imgMatch = figure.match(/<img\b[\s\S]*?>/i);
      const img = imgMatch?.[0] ?? '';
      const sourceImage = absoluteKolodaUrl(htmlAttr(img, 'src'));
      const cardId = normalizeCardImageId(cardIdFromImageUrl(sourceImage)) ?? '';
      if (!cardId) return null;

      const fallbackName = htmlAttr(img, 'alt') || htmlAttr(figure, 'title') || cardId;
      const countMatch = figure.match(/<figcaption>\s*x?(\d+)\s*<\/figcaption>/i);
      const count = countMatch ? Math.max(1, Number(countMatch[1]) || 1) : 1;
      return {
        cardId,
        name: String(ruCards?.[cardId]?.name ?? htmlText(fallbackName) ?? cardId),
        cost: parseCount(ruCards?.[cardId]?.mana) ?? 0,
        count,
        image: cardImageProxyUrl(cardId),
      };
    })
    .filter(Boolean);
}

function sortDeckCardsByMana(cards: any[]) {
  return [...cards].sort((a, b) => {
    const aCost = typeof a?.cost === 'number' ? a.cost : 0;
    const bCost = typeof b?.cost === 'number' ? b.cost : 0;
    if (aCost !== bCost) return aCost - bCost;
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru');
  });
}

function parseKolodaUtcDate(value: string): string | null {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})\s+UTC/i);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))).toISOString();
}

function extractFirstBlock(html: string, className: string): string {
  return html.match(new RegExp(`<section[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>[\\s\\S]*?<\\/section>`, 'i'))?.[0] ?? '';
}

function parseArenaDeckArticle(article: string, index: number, ruCards: Record<string, any>) {
  const header = article.match(/<header[^>]*class=["'][^"']*arena-deck-head[^"']*["'][^>]*>[\s\S]*?<\/header>/i)?.[0] ?? '';
  const id = header.match(/\/arena\/generate\/(\d+)/i)?.[1] ?? `deck-${index + 1}`;
  const classIcons = (header.match(/<img\b[^>]*class=["'][^"']*arena-class-icon[^"']*["'][^>]*>/gi) ?? [])
    .map((img) => ({
      name: htmlAttr(img, 'alt'),
      icon: absoluteKolodaUrl(htmlAttr(img, 'src')),
    }))
    .filter(cls => cls.name);

  const resultMatch = header.match(/<strong>\s*(\d+)\s*[-–]\s*(\d+)\s*<\/strong>\s*<span>\s*([\s\S]*?)\s*<\/span>/i);
  const wins = resultMatch ? Number(resultMatch[1]) : null;
  const losses = resultMatch ? Number(resultMatch[2]) : null;
  const player = htmlText(resultMatch?.[3] ?? '');

  const finalBlock = extractFirstBlock(article, 'arena-section-final');
  const legendaryBlock = extractFirstBlock(article, 'arena-block-legendary');
  const removedBlock = extractFirstBlock(article, 'arena-block-remove');
  const addedBlock = extractFirstBlock(article, 'arena-block-add');
  const finalCards = sortDeckCardsByMana(parseDeckCards(finalBlock, ruCards));

  return {
    id,
    rank: index + 1,
    classes: classIcons,
    classNames: classIcons.map(cls => cls.name).join(' / '),
    wins,
    losses,
    score: wins !== null && losses !== null ? `${wins}-${losses}` : null,
    player,
    cardCount: finalCards.reduce((sum: number, card: any) => sum + (card?.count ?? 1), 0),
    sourceUrl: '',
    generateUrl: '',
    finalCards,
    legendaryCards: sortDeckCardsByMana(parseDeckCards(legendaryBlock, ruCards)),
    removedCards: sortDeckCardsByMana(parseDeckCards(removedBlock, ruCards)),
    addedCards: sortDeckCardsByMana(parseDeckCards(addedBlock, ruCards)),
  };
}

async function fetchArenaDecksData(limit = ARENA_DECKS_MAX_LIMIT) {
  const safeLimit = Math.min(ARENA_DECKS_MAX_LIMIT, Math.max(1, Math.round(limit)));
  const url = `${KOLODA_ARENA_DECKS_URL}?limit=${safeLimit}`;
  const [ruCards, upstream] = await Promise.all([
    ensureRuCardsData(),
    fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 ManacostArena/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
    }),
  ]);
  if (!upstream.ok) throw new Error(`KolodaHS HTTP ${upstream.status}`);

  const html = await upstream.text();
  const totalDecks = parseCount(html.match(/Колод:\s*([\d\s]+)/i)?.[1]) ?? null;
  const updatedAtText = htmlText(html.match(/<div[^>]*class=["'][^"']*arena-source[^"']*["'][^>]*>[\s\S]*?<span>\s*([\s\S]*?)\s*<\/span>/i)?.[1] ?? '');
  const updatedAt = updatedAtText ? parseKolodaUtcDate(updatedAtText) : null;
  const articles = html.match(/<article\b[^>]*class=["'][^"']*arena-deck[^"']*["'][^>]*>[\s\S]*?<\/article>/gi) ?? [];
  const decks = articles
    .map((article, index) => parseArenaDeckArticle(article, index, ruCards))
    .filter((deck: any) => deck.finalCards.length > 0);

  return {
    decks,
    totalDecks,
    updatedAt,
    source: 'arena-decks',
    sourceUrl: '',
  };
}

const DATASET_API_ORIGIN = 'https://api.kolodahearthstone.com';
const DATASET_API_BASE = `${DATASET_API_ORIGIN}/datasets`;
const hsDataParserControlClient = createHsDataParserControlClient({
  baseUrl: process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN,
  apiKey: process.env.HS_DATA_API_ADMIN_KEY || '',
  timeoutMs: Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 15_000),
});
const HEARTHSTONEJSON_RU_CARDS_URL = 'https://api.hearthstonejson.com/v1/latest/ruRU/cards.collectible.json';
const EXTERNAL_DATASET_CACHE_MS = DATASET_MEMORY_CACHE_MS;
const TIERLIST_API_CACHE_MS = DATASET_MEMORY_CACHE_MS;
const TIERLIST_DATASET_BY_SOURCE = {
  hsreplay: 'demo/view/hsreplay_arena_cards_advanced',
  heartharena: 'heartharena_tierlist',
  firestone: 'firestone_arena_cards_normal',
} as const;
const LEGENDARIES_DATASET_BY_SOURCE = {
  hsreplay: 'hsreplay_arena_legendaries',
  firestone: 'firestone_arena_legendaries_normal',
} as const;
const STANDARD_MATCHUPS_DATASET_BY_RANK = {
  legend: 'hsguru_matchups_legend',
  diamond: 'hsguru_matchups_diamond_4to1',
} as const;
const STANDARD_MATCHUPS_DATASET_BY_FORMAT: Record<StandardMatchupFormat, string> = {
  standard: 'hsguru_matchups_legend',
  wild: 'hsguru_matchups_wild_legend',
};
const STANDARD_MATCHUPS_FORMAT_LABEL: Record<StandardMatchupFormat, string> = {
  standard: 'Стандарт',
  wild: 'Вольный',
};
const STANDARD_MATCHUPS_RANK_LABEL: Record<keyof typeof STANDARD_MATCHUPS_DATASET_BY_RANK, string> = {
  legend: 'Легенда',
  diamond: 'Алмаз 4-1',
};
const CONSTRUCTED_CARDS_DATASET_BY_FORMAT = {
  standard: {
    legend: {
      '1d': 'hsreplay_cards_legend_1d',
      '3d': 'hsreplay_cards_legend_3d',
      '7d': 'hsreplay_cards_legend_7d',
      '14d': 'hsreplay_cards_legend_14d',
      patch: 'hsreplay_cards_legend_patch',
    },
    diamond_4_1: {
      '1d': 'hsreplay_cards_diamond_4_1_1d',
      '3d': 'hsreplay_cards_diamond_4_1_3d',
      '7d': 'hsreplay_cards_diamond_4_1_7d',
      '14d': 'hsreplay_cards_diamond_4_1_14d',
      patch: 'hsreplay_cards_diamond_4_1_patch',
    },
    diamond: {
      '1d': 'hsreplay_cards_diamond_1d',
      '3d': 'hsreplay_cards_diamond_3d',
      '7d': 'hsreplay_cards_diamond_7d',
      '14d': 'hsreplay_cards_diamond_14d',
      patch: 'hsreplay_cards_diamond_patch',
    },
    platinum: {
      '1d': 'hsreplay_cards_platinum_1d',
      '3d': 'hsreplay_cards_platinum_3d',
      '7d': 'hsreplay_cards_platinum_7d',
      '14d': 'hsreplay_cards_platinum_14d',
      patch: 'hsreplay_cards_platinum_patch',
    },
  },
  wild: {
    legend: {
      '1d': 'hsreplay_cards_wild_legend_1d',
      '3d': 'hsreplay_cards_wild_legend_3d',
      '7d': 'hsreplay_cards_wild_legend_7d',
      '14d': 'hsreplay_cards_wild_legend_14d',
      patch: 'hsreplay_cards_wild_legend_patch',
    },
    diamond_4_1: {
      '1d': 'hsreplay_cards_wild_diamond_4_1_1d',
      '3d': 'hsreplay_cards_wild_diamond_4_1_3d',
      '7d': 'hsreplay_cards_wild_diamond_4_1_7d',
      '14d': 'hsreplay_cards_wild_diamond_4_1_14d',
      patch: 'hsreplay_cards_wild_diamond_4_1_patch',
    },
    diamond: {
      '1d': 'hsreplay_cards_wild_diamond_1d',
      '3d': 'hsreplay_cards_wild_diamond_3d',
      '7d': 'hsreplay_cards_wild_diamond_7d',
      '14d': 'hsreplay_cards_wild_diamond_14d',
      patch: 'hsreplay_cards_wild_diamond_patch',
    },
    platinum: {
      '1d': 'hsreplay_cards_wild_platinum_1d',
      '3d': 'hsreplay_cards_wild_platinum_3d',
      '7d': 'hsreplay_cards_wild_platinum_7d',
      '14d': 'hsreplay_cards_wild_platinum_14d',
      patch: 'hsreplay_cards_wild_platinum_patch',
    },
  },
} as const;
const STANDARD_META_DATASET_BY_FORMAT_RANK: Record<StandardMetaFormat, Record<StandardMetaRank, string>> = {
  standard: {
    all: 'hsguru_meta_standard_legend',
    diamond_legend: 'hsguru_meta_standard_legend',
    legend: 'hsguru_meta_standard_legend',
    diamond: 'hsguru_meta_standard_diamond_4to1',
    top_5k: 'hsguru_meta_standard_top_5k',
    top_legend: 'hsguru_meta_standard_top_legend',
  },
  wild: {
    all: 'hsguru_meta_wild_legend',
    diamond_legend: 'hsguru_meta_wild_legend',
    legend: 'hsguru_meta_wild_legend',
    diamond: 'hsguru_meta_wild_diamond_4to1',
    top_5k: 'hsguru_meta_wild_top_5k',
    top_legend: 'hsguru_meta_wild_top_legend',
  },
};
const STANDARD_META_FORMAT_LABEL: Record<StandardMetaFormat, string> = {
  standard: 'Стандарт',
  wild: 'Вольный',
};
const STANDARD_META_RANK_LABEL: Record<StandardMetaRank, string> = {
  all: 'Все ранги',
  diamond: 'Алмаз 1–4',
  diamond_legend: 'Алмаз — Легенда',
  legend: 'Легенда',
  top_5k: 'Топ-5000',
  top_legend: 'Топ-1000',
};
const STANDARD_META_UPSTREAM_RANK: Record<StandardMetaRank, string> = {
  all: 'all',
  diamond: 'diamond_4to1',
  diamond_legend: 'diamond_to_legend',
  legend: 'legend',
  top_5k: 'top_5k',
  top_legend: 'top_legend',
};
const STANDARD_META_SUPPORTED_RANKS = new Set<StandardMetaRank>([
  'all', 'diamond', 'diamond_legend', 'legend', 'top_5k', 'top_legend',
]);
const HSGURU_STREAMER_DECKS_DATASET = 'hsguru_streamer_decks_legend_1000';
const VICIOUS_SYNDICATE_LIVE_DATASET = 'vicious_syndicate_live_beta';
const VICIOUS_GOLD_MIN_DECK_FREQUENCY = 0.5;
const VICIOUS_CLASS_RU: Record<string, string> = {
  DeathKnight: 'Рыцарь смерти',
  DemonHunter: 'Охотник на демонов',
  Druid: 'Друид',
  Hunter: 'Охотник',
  Mage: 'Маг',
  Paladin: 'Паладин',
  Priest: 'Жрец',
  Rogue: 'Разбойник',
  Shaman: 'Шаман',
  Warlock: 'Чернокнижник',
  Warrior: 'Воин',
};
const STANDARD_META_RECOMMENDATION_CACHE_MS = 6 * 60 * 60_000;
const STANDARD_META_PERSISTED_RECOMMENDATION_MAX_AGE_MS = 24 * 60 * 60_000;
const HSGURU_DECK_INFO_API_URL = 'https://api.hsguru.com/api/deck-info';
const STANDARD_META_PREVIEW_CACHE_MS = 30 * 24 * 60 * 60_000;
const DECKVIEW_RENDER = deckviewPreviewConfigFromEnv();
const STANDARD_ARCHETYPE_RU: Record<string, string> = {
  'Ace Hunter': 'Эйс Охотник',
  'Aggro Paladin': 'Агро Паладин',
  'Ashamane Rogue': 'Ашамейн Разбойник',
  'Aura Paladin': 'Аура Паладин',
  'Azshara Druid': 'Азшара Друид',
  'Briarspawn Warrior': 'Брайарспаун Воин',
  'Broxigar DH': 'Броксигар Охотник на демонов',
  'Burn Mage': 'Берн Маг',
  'Burn Rogue': 'Берн Разбойник',
  'Burn Warrior': 'Берн Воин',
  'Companion Hunter': 'Компаньон Охотник',
  'Control Priest': 'Контроль Жрец',
  'Chef Druid': 'Шеф-повар Друид',
  'Dino Egglock': 'Дино Кхелос Чернокнижник',
  'Divergence Warlock': 'Дивергенция Чернокнижник',
  'Dragon Druid': 'Дракон Друид',
  'Dragon Hunter': 'Дракон Охотник',
  'Dragon Warrior': 'Дракон Воин',
  'Egg Paladin': 'Кхелос Паладин',
  'Dude Paladin': 'Токен Паладин',
  'Egg Warrior': 'Кхелос Воин',
  'Egglock': 'Кхелос Чернокнижник',
  'Elemental Mage': 'Элементаль Маг',
  'End of Turnadin': 'Ноздорму Паладин',
  'Enrage Warrior': 'Исступление Воин',
  'Frost DK': 'Фрост Рыцарь смерти',
  'Glacial Shaman': 'Ледяной Шаман',
  'Gladiator Warrior': 'Гладиатор Воин',
  'Harold DH': 'Охотник на демонов на возвещении',
  'Harold DK': 'Рыцарь смерти на возвещении',
  'Harold Egglock': 'Кхелос Чернокнижник на возвещении',
  'Harold Rogue': 'Разбойник на возвещении',
  'Harold Shaman': 'Шаман на возвещении',
  'Harold Warrior': 'Воин на возвещении',
  'Herald DH': 'Охотник на демонов на возвещении',
  'Herald DK': 'Рыцарь смерти на возвещении',
  'Herald Rogue': 'Разбойник на возвещении',
  'Herald DeathKnight': 'Рыцарь смерти на возвещении',
  'Herald Shaman': 'Шаман на возвещении',
  'Herald Warrior': 'Воин на возвещении',
  'Hostage Druid': 'Заложник Друид',
  'Imbue Paladin': 'Паладин на силе героя',
  'Imbue Priest': 'Жрец на силе героя',
  'Imbue Rogue': 'Разбойник на силе героя',
  'Krona Druid': 'Крона Друид',
  'Leyline Mage': 'Лейлайн Маг',
  'Manastorm Mage': 'Манашторм Маг',
  'Mug Shaman': 'Кружечный Шаман',
  'Merithra Druid': 'Меритра Друид',
  'No Hand Hunter': 'Охотник без руки',
  'No Minion DH': 'Спелл Охотник на демонов',
  'Quest DH': 'Квест Охотник на демонов',
  'Quest Druid': 'Квест Друид',
  'Quest Hunter': 'Квест Охотник',
  'Quest Mage': 'Квест Маг',
  'Quest Rogue': 'Квест Разбойник',
  'Quest Shaman': 'Квест Шаман',
  'Quest Warrior': 'Квест Воин',
  'Pure Paladin': 'Чистый Паладин',
  'Rafaam Warlock': 'Рафаам Чернокнижник',
  'Soothsayer Priest': 'Предсказатель Жрец',
  'Thief Priest': 'Вор Жрец',
  'Two Rogue': 'Двухбитный Разбойник',
  'Unholy DeathKnight': 'Нечестивый Рыцарь смерти',
  'Void DemonHunter': 'Бездна Охотник на демонов',
  'Blood Warrior': 'Кровавый Воин',
  'Animancer Warlock': 'Анимансер Чернокнижник',
  'Ayaya Rogue': 'Ая Разбойник',
  'Face Hunter': 'Фейс Охотник',
  'Zee Shaman': 'Зи Шаман',
  'Rafaamlock': 'Рафаам Чернокнижник',
  'Token Druid': 'Токен Друид',
  'Unholy DK': 'Нечестивый Рыцарь смерти',
  'Vanessa Rogue': 'Ванесса Разбойник',
  'Wallow Warlock': 'Валлоу Чернокнижник',
};
interface StandardArchetypeTranslations {
  map: Record<string, string>;
  source: 'admin-db' | 'deckview-api' | 'deckview-csv' | 'fallback';
}
let standardArchetypeTranslationsCache: (StandardArchetypeTranslations & { expiresAt: number }) | null = null;
let standardArchetypeTranslationsPromise: Promise<StandardArchetypeTranslations> | null = null;
let archetypeTranslationSeedPromise: Promise<void> | null = null;
const TIER_SOURCE_LABEL: Record<keyof typeof TIERLIST_DATASET_BY_SOURCE, string> = {
  hsreplay: 'hsreplay.net',
  heartharena: 'heartharena.com',
  firestone: 'firestoneapp.com',
};
const LEGENDARY_SOURCE_LABEL: Record<keyof typeof LEGENDARIES_DATASET_BY_SOURCE, string> = {
  hsreplay: 'hsreplay.net',
  firestone: 'firestoneapp.com',
};

const ARENA_CLASSES = [
  { id: 'death-knight', name: 'Рыцарь смерти', color: '#1f252d', textDark: false },
  { id: 'demon-hunter', name: 'Охотник на демонов', color: '#224722', textDark: false },
  { id: 'druid', name: 'Друид', color: '#704a16', textDark: false },
  { id: 'hunter', name: 'Охотник', color: '#1d5921', textDark: false },
  { id: 'mage', name: 'Маг', color: '#2b5c85', textDark: false },
  { id: 'paladin', name: 'Паладин', color: '#a88a45', textDark: false },
  { id: 'priest', name: 'Жрец', color: '#d1d1d1', textDark: true },
  { id: 'rogue', name: 'Разбойник', color: '#333333', textDark: false },
  { id: 'shaman', name: 'Шаман', color: '#2a2e6b', textDark: false },
  { id: 'warlock', name: 'Чернокнижник', color: '#5c265c', textDark: false },
  { id: 'warrior', name: 'Воин', color: '#7a1e1e', textDark: false },
  { id: 'any', name: 'Нейтральные', color: '#4a4a4a', textDark: false },
];
const ARENA_CLASS_BY_ID = Object.fromEntries(ARENA_CLASSES.map(cls => [cls.id, cls]));
const CARD_CLASS_TO_ID: Record<string, string> = {
  DEATHKNIGHT: 'death-knight',
  DEATHKNIGHTCARD: 'death-knight',
  DEATH_KNIGHT: 'death-knight',
  DEMONHUNTER: 'demon-hunter',
  DEMON_HUNTER: 'demon-hunter',
  DRUID: 'druid',
  HUNTER: 'hunter',
  MAGE: 'mage',
  PALADIN: 'paladin',
  PRIEST: 'priest',
  ROGUE: 'rogue',
  SHAMAN: 'shaman',
  WARLOCK: 'warlock',
  WARRIOR: 'warrior',
  NEUTRAL: 'any',
  ALL: 'any',
};
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F', HSREPLAY_NO_ARENASMITH_TIER];
const HEARTHARENA_TIER_TO_LETTER: Record<string, string> = {
  great: 'S',
  good: 'A',
  'above-average': 'B',
  aboveaverage: 'B',
  average: 'C',
  'below-average': 'D',
  belowaverage: 'D',
  bad: 'E',
  terrible: 'F',
};
const TIER_LABEL_FULL: Record<string, string> = {
  S: 'Отлично',
  A: 'Хорошо',
  B: 'Выше среднего',
  C: 'Средне',
  D: 'Ниже среднего',
  E: 'Плохо',
  F: 'Ужасно',
  [HSREPLAY_NO_ARENASMITH_TIER]: 'Без тира',
};
const TIER_DESC_MAP: Record<string, string> = {
  S: 'Авто-пик — доминирующие карты текущего метагейма.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Ниже среднего — берите только если нет лучших карт.',
  E: 'Плохие карты — последний выбор.',
  F: 'Ужасные карты — никогда не стоит брать.',
  [HSREPLAY_NO_ARENASMITH_TIER]: 'Карты без Arenasmith Score в текущем срезе HSReplay.',
};
const TIER_ALIAS_TO_LETTER: Record<string, string> = {
  GREAT: 'S',
  EXCELLENT: 'S',
  'AUTO-PICK': 'S',
  'AUTO-PICKS': 'S',
  'TIER-1': 'S',
  'TIER-2': 'A',
  'TIER-3': 'B',
  'TIER-4': 'C',
  'TIER-5': 'D',
  'TIER-6': 'E',
  'TIER-7': 'F',
  GOOD: 'A',
  'ABOVE-AVERAGE': 'B',
  ABOVEAVERAGE: 'B',
  AVERAGE: 'C',
  'BELOW-AVERAGE': 'D',
  BELOWAVERAGE: 'D',
  BAD: 'E',
  TERRIBLE: 'F',
};
let hearthstoneJsonRuCards: Record<string, any> | null = null;
let hearthstoneJsonRuCardsPromise: Promise<Record<string, any>> | null = null;
let hearthstoneJsonRuCardsByDbf: Map<number, any> | null = null;

async function ensureRuCardsData(): Promise<Record<string, any>> {
  if (hearthstoneJsonRuCards) return hearthstoneJsonRuCards;
  if (!hearthstoneJsonRuCardsPromise) {
    hearthstoneJsonRuCardsPromise = fetch(HEARTHSTONEJSON_RU_CARDS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HearthstoneJSON HTTP ${res.status}`);
        const cards = await res.json() as any[];
        return Object.fromEntries((Array.isArray(cards) ? cards : []).map((card: any) => [card.id, {
          name: card.name,
          mana: card.cost,
          attack: card.attack,
          health: card.health,
          type: card.type,
          rarity: card.rarity,
          playerClass: card.cardClass,
          dbf: card.dbfId,
        }]));
      })
      .then((map) => {
        hearthstoneJsonRuCards = map;
        hearthstoneJsonRuCardsByDbf = new Map(
          Object.values(map).flatMap((card: any) => {
            const dbfId = Number(card?.dbf);
            return Number.isFinite(dbfId) ? [[dbfId, card]] : [];
          }),
        );
        return map;
      })
      .catch((err) => {
        hearthstoneJsonRuCardsPromise = null;
        console.error('[Server] Failed to load ru card dictionary:', err?.message ?? err);
        return {};
      });
  }
  return hearthstoneJsonRuCardsPromise;
}

function normalizeSource<T extends Record<string, string>>(source: string | undefined, known: T, fallback: keyof T): keyof T {
  return Object.prototype.hasOwnProperty.call(known, source ?? '') ? source as keyof T : fallback;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'string' ? value.replace('%', '').replace(/\s+/g, '').replace(',', '.') : value;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

function parsePercentish(value: unknown): number | null {
  return parseWinrate(value);
}

function parseCount(value: unknown): number | null {
  const num = parseNumber(value);
  if (num === null) return null;
  return Math.round(num);
}

function normalizeArenaClassId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (raw && ARENA_CLASS_BY_ID[raw]) return raw;
  const hsReplayId = normalizeHsReplayClassId(raw);
  if (hsReplayId) return hsReplayId;
  const compact = raw.toUpperCase().replace(/[^A-Z]/g, '');
  return CARD_CLASS_TO_ID[compact] ?? 'any';
}

function normalizeRarity(value: unknown): string {
  const rarity = String(value ?? '').toLowerCase().replace(/[^a-z-]/g, '');
  return rarity || 'common';
}

function normalizeType(value: unknown): string | undefined {
  const type = String(value ?? '').toLowerCase().replace(/[^a-z-]/g, '');
  return type || undefined;
}

function safeCardId(row: any): string {
  return String(row?.card_id ?? row?.cardId ?? row?.id ?? '').trim();
}

function getRuCard(cardId: string): any | null {
  if (!cardId) return null;
  return hearthstoneJsonRuCards?.[cardId] ?? loadDataCached('cards_ru.json')?.data?.[cardId] ?? null;
}

function cardImageProxyUrl(cardId: string, variant: 'thumb' | 'full' = 'thumb'): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp?v=${CARD_IMAGE_CACHE_VERSION}`;
}

function cardImageCachePath(cardId: string, variant: 'thumb' | 'full', source: CardImageSource): string {
  return sharedCardImageCachePath(CARD_IMAGE_CACHE_DIR, cardId, variant, source);
}

function cardTileCachePath(cardId: string, source: 'fallback' | 'placeholder'): string {
  const safeCardId = cardId.replace(/[^A-Za-z0-9_]/g, '').slice(0, 80) || 'unknown';
  return join(CARD_IMAGE_CACHE_DIR, `${safeCardId}-tile-${source}-card_tile_v1.webp`);
}

function normalizeResolvedCardId(cardId: string): string {
  return cardId.trim().replace(/^\/+/, '').replace(/\s+/g, '');
}

async function resolveCardImageId(cardId: string): Promise<string> {
  if (!/^\d+$/.test(cardId)) return cardId;

  const findByDbf = (cards: Record<string, any> | null | undefined) => {
    for (const [id, card] of Object.entries(cards ?? {})) {
      if (String(card?.dbf ?? card?.dbfId ?? '') === cardId) {
        const resolved = normalizeResolvedCardId(id);
        if (resolved) return resolved;
      }
    }
    return null;
  };

  return findByDbf(loadDataCached('cards_ru.json')?.data)
    ?? findByDbf(await ensureRuCardsData())
    ?? cardId;
}

function positiveDbfId(value: unknown): number | null {
  const dbfId = Number(value);
  return Number.isInteger(dbfId) && dbfId > 0 ? dbfId : null;
}

async function resolveCardImageDbfId(requestedCardId: string, resolvedCardId: string): Promise<number | null> {
  const numericRequest = positiveDbfId(requestedCardId);
  if (numericRequest) return numericRequest;

  const cachedCard = getRuCard(resolvedCardId);
  const cachedDbfId = positiveDbfId(cachedCard?.dbf ?? cachedCard?.dbfId);
  if (cachedDbfId) return cachedDbfId;

  const cards = await ensureRuCardsData();
  return positiveDbfId(cards?.[resolvedCardId]?.dbf ?? cards?.[resolvedCardId]?.dbfId);
}

async function ensureCardImagePlaceholder(cardId: string, variant: 'thumb' | 'full', message = 'Нет изображения'): Promise<CachedCardImage> {
  mkdirSync(CARD_IMAGE_CACHE_DIR, { recursive: true });
  const outPath = cardImageCachePath(`missing-${cardId}`, variant, 'placeholder');
  if (existsSync(outPath)) return { path: outPath, source: 'placeholder' };

  const { width, quality } = CARD_IMAGE_VARIANTS[variant];
  const height = Math.round(width * 1.516);
  const safeId = cardId.replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 32);
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#edf4ff"/>
          <stop offset="0.55" stop-color="#dbe8f8"/>
          <stop offset="1" stop-color="#fff4cf"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="${Math.round(width * 0.08)}" fill="url(#bg)"/>
      <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="${Math.round(width * 0.06)}" fill="none" stroke="#94a3b8" stroke-width="2"/>
      <circle cx="${width / 2}" cy="${height * 0.38}" r="${width * 0.18}" fill="#1f3654" opacity="0.92"/>
      <text x="50%" y="${height * 0.39}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.18)}" font-weight="700" fill="#f8fbff">?</text>
      <text x="50%" y="${height * 0.62}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.08)}" font-weight="700" fill="#1f3654">${message}</text>
      <text x="50%" y="${height * 0.72}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.07)}" fill="#64748b">${safeId}</text>
    </svg>`;

  await sharp(Buffer.from(svg))
    .webp({ quality, effort: 4 })
    .toFile(outPath);
  return { path: outPath, source: 'placeholder' };
}

async function ensureCardTilePlaceholder(cardId: string): Promise<CachedCardImage> {
  mkdirSync(CARD_IMAGE_CACHE_DIR, { recursive: true });
  const outPath = cardTileCachePath(cardId, 'placeholder');
  if (existsSync(outPath)) return { path: outPath, source: 'placeholder' };
  const safeId = cardId.replace(/[^A-Za-z0-9_]/g, '').slice(0, 24);
  const svg = `
    <svg width="256" height="59" viewBox="0 0 256 59" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#402820"/>
          <stop offset="1" stop-color="#765038"/>
        </linearGradient>
      </defs>
      <rect width="256" height="59" fill="url(#bg)"/>
      <text x="244" y="36" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#f4dfb0">${safeId}</text>
    </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 82, effort: 4 }).toFile(outPath);
  return { path: outPath, source: 'placeholder' };
}

async function withCardImageSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeCardImageJobs >= MAX_CARD_IMAGE_JOBS) {
    await new Promise<void>(resolve => cardImageQueue.push(resolve));
  }

  activeCardImageJobs += 1;
  try {
    return await task();
  } finally {
    activeCardImageJobs -= 1;
    const next = cardImageQueue.shift();
    if (next) next();
  }
}

async function fetchRemoteCardImage(
  cardId: string,
  dbfId: number | null,
  variant: 'thumb' | 'full',
): Promise<{ buffer: Buffer; source: Exclude<CardImageSource, 'placeholder'> }> {
  if (dbfId && blizzardCardImageClient.configured) {
    try {
      const officialImage = await downloadBlizzardCardImage({
        dbfId, client: blizzardCardImageClient, resolveImageUrl: resolveConstructedCardImageSourceUrl,
      });
      if (officialImage) return { buffer: officialImage, source: 'blizzard' };
    } catch (error: any) {
      console.warn('[api/card-image] Blizzard fallback:', cardId, error?.message ?? error);
    }
  }

  return {
    buffer: await downloadFallbackCardImage(cardId),
    source: 'fallback',
  };
}

async function ensureCardImage(cardId: string, variant: 'thumb' | 'full'): Promise<CachedCardImage> {
  mkdirSync(CARD_IMAGE_CACHE_DIR, { recursive: true });
  const requestedDbfId = positiveDbfId(cardId);
  const resolvedCardId = requestedDbfId ? cardId : await resolveCardImageId(cardId);
  const dbfId = requestedDbfId ?? await resolveCardImageDbfId(cardId, resolvedCardId);
  const preferredSource: CardImageSource = dbfId && blizzardCardImageClient.configured ? 'blizzard' : 'fallback';
  const preferredPath = cardImageCachePath(resolvedCardId, variant, preferredSource);
  if (existsSync(preferredPath)) return { path: preferredPath, source: preferredSource };
  const cachedFallbackPath = cardImageCachePath(resolvedCardId, variant, 'fallback');
  if (preferredSource === 'blizzard' && existsSync(cachedFallbackPath)) {
    return { path: cachedFallbackPath, source: 'fallback' };
  }

  const jobKey = `${resolvedCardId}:${variant}:${preferredSource}`;
  const existingJob = cardImageJobs.get(jobKey);
  if (existingJob) return existingJob;

  const job = (async () => {
    return withCardImageSlot(async () => {
      try {
        const remoteImage = await fetchRemoteCardImage(resolvedCardId, dbfId, variant);
        const outPath = cardImageCachePath(resolvedCardId, variant, remoteImage.source);
        const { width, quality } = CARD_IMAGE_VARIANTS[variant];
        await sharp(remoteImage.buffer)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .toFile(outPath);
        return { path: outPath, source: remoteImage.source };
      } catch (err: any) {
        console.warn('[api/card-image] fallback placeholder:', resolvedCardId, err?.message ?? err);
        return ensureCardImagePlaceholder(resolvedCardId, variant);
      }
    });
  })().finally(() => cardImageJobs.delete(jobKey));

  cardImageJobs.set(jobKey, job);
  return job;
}

async function ensureCardTile(cardId: string): Promise<CachedCardImage> {
  mkdirSync(CARD_IMAGE_CACHE_DIR, { recursive: true });
  const resolvedCardId = await resolveCardImageId(cardId);
  const outPath = cardTileCachePath(resolvedCardId, 'fallback');
  if (existsSync(outPath)) return { path: outPath, source: 'fallback' };

  const jobKey = `${resolvedCardId}:tile:fallback`;
  const existingJob = cardImageJobs.get(jobKey);
  if (existingJob) return existingJob;

  const job = withCardImageSlot(async () => {
    try {
      const upstream = await fetch(
        `https://art.hearthstonejson.com/v1/tiles/${encodeURIComponent(resolvedCardId)}.webp`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!upstream.ok) throw new Error(`Hearthstone tile HTTP ${upstream.status}`);
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (!buffer.length) throw new Error('Hearthstone tile is empty');
      await sharp(buffer)
        .resize({ width: 256, height: 59, fit: 'cover' })
        .webp({ quality: 86, effort: 4 })
        .toFile(outPath);
      return { path: outPath, source: 'fallback' as const };
    } catch (error: any) {
      console.warn('[api/card-image] tile placeholder:', resolvedCardId, error?.message ?? error);
      return ensureCardTilePlaceholder(resolvedCardId);
    }
  }).finally(() => cardImageJobs.delete(jobKey));

  cardImageJobs.set(jobKey, job);
  return job;
}

function displayCardName(row: any): string {
  const cardId = safeCardId(row);
  const ruCard = getRuCard(cardId);
  return String(ruCard?.name ?? row?.heartharena_name ?? row?.name ?? row?.card_name ?? cardId).trim();
}

function normalizeTierLetter(value: any): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (TIER_ORDER.includes(upper)) return upper;

  const normalized = upper
    .replace(/[._\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (TIER_ORDER.includes(normalized)) return normalized;
  if (TIER_ALIAS_TO_LETTER[normalized]) return TIER_ALIAS_TO_LETTER[normalized];
  if (TIER_ALIAS_TO_LETTER[normalized.replace(/-/g, '')]) return TIER_ALIAS_TO_LETTER[normalized.replace(/-/g, '')];

  const letterMatch = normalized.match(/(?:^|-)TIER-([SABCDEF])(?:-|$)/)
    ?? normalized.match(/(?:^|-)RANK-([SABCDEF])(?:-|$)/);
  if (letterMatch?.[1] && TIER_ORDER.includes(letterMatch[1])) return letterMatch[1];

  const numericMatch = normalized.match(/(?:^|-)TIER-([1-7])(?:-|$)/)
    ?? normalized.match(/(?:^|-)RANK-([1-7])(?:-|$)/)
    ?? normalized.match(/^([1-7])$/);
  if (numericMatch?.[1]) return TIER_ORDER[Number(numericMatch[1]) - 1] ?? null;

  return null;
}

function inferTier(row: any, deckWinrate: number | null, score: number | null, source: keyof typeof TIERLIST_DATASET_BY_SOURCE): string {
  if (source === 'hsreplay') {
    const directArenasmithTier = normalizeArenasmithTier(
      row?.arenasmith_tier
        ?? row?.arenasmithTier
        ?? row?.arenasmith_tier_position
        ?? row?.arenasmithTierPosition,
    );
    if (directArenasmithTier) return directArenasmithTier;
    return tierFromArenasmithScore(score) ?? HSREPLAY_NO_ARENASMITH_TIER;
  }

  const directTier = normalizeTierLetter(
    row?.tier
      ?? row?.tier_letter
      ?? row?.tierLetter
      ?? row?.card_tier
      ?? row?.cardTier
      ?? row?.hsreplay_tier
      ?? row?.hsreplayTier,
  );
  if (directTier) return directTier;

  if (source === 'heartharena') {
    const key = String(row?.tier_id ?? row?.tierName ?? row?.tier_name ?? '').trim().toLowerCase();
    const normalizedKey = key.replace(/\s+/g, '-');
    const tier = HEARTHARENA_TIER_TO_LETTER[normalizedKey] ?? HEARTHARENA_TIER_TO_LETTER[normalizedKey.replace(/-/g, '')];
    if (tier) return tier;
    if (score !== null) {
      if (score >= 85) return 'S';
      if (score >= 70) return 'A';
      if (score >= 55) return 'B';
      if (score >= 40) return 'C';
      if (score >= 25) return 'D';
      if (score >= 10) return 'E';
      return 'F';
    }
  }

  if (deckWinrate !== null) {
    if (deckWinrate >= 60) return 'S';
    if (deckWinrate >= 57) return 'A';
    if (deckWinrate >= 54) return 'B';
    if (deckWinrate >= 51) return 'C';
    if (deckWinrate >= 48) return 'D';
    if (deckWinrate >= 45) return 'E';
    return 'F';
  }
  return 'C';
}

function normalizeTierCard(row: any, source: keyof typeof TIERLIST_DATASET_BY_SOURCE): any | null {
  const cardId = safeCardId(row);
  if (!cardId) return null;
  const ruCard = getRuCard(cardId);
  const deckWinrate = parsePercentish(row?.win_rate ?? row?.deck_winrate ?? row?.deckWinrate);
  const arenaScore = source === 'hsreplay'
    ? parseNumber(row?.arenasmith_score ?? row?.arenasmithScore ?? row?.score)
    : parseNumber(row?.score ?? row?.arena_score ?? row?.arenaScore);
  const score = source === 'hsreplay'
    ? arenaScore
    : source === 'heartharena'
      ? arenaScore ?? 0
      : Math.round((deckWinrate ?? 0) * 10);
  return {
    name: displayCardName(row),
    score,
    rarity: normalizeRarity(ruCard?.rarity ?? row?.rarity),
    cardId,
    classKey: normalizeArenaClassId(row?.cardClass ?? row?.classKey ?? row?.arena_class),
    source,
    winrate: deckWinrate ?? undefined,
    deckWinrate,
    pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
    playedWinrate: parsePercentish(row?.winrate_when_played ?? row?.played_winrate ?? row?.playedWinrate),
    inDecks: parsePercentish(row?.popularity ?? row?.in_runs ?? row?.inDecks),
    totalGames: parseCount(row?.total_games ?? row?.totalGames ?? row?.times_played ?? row?.timesPlayed),
    arenaScore,
    arenaSmithTier: normalizeArenasmithTier(row?.arenasmith_tier ?? row?.arenasmithTier),
    arenaSmithTierPosition: normalizeArenasmithTier(row?.arenasmith_tier_position ?? row?.arenasmithTierPosition),
    arenaSmithRank: parseCount(row?.arenasmith_rank ?? row?.arenasmithRank),
    offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
    discardRate: parsePercentish(row?.discard_rate ?? row?.discardRate),
    drawnWinrate: parsePercentish(row?.winrate_when_drawn ?? row?.drawn_winrate ?? row?.drawnWinrate),
    mulliganWinrate: parsePercentish(row?.mulligan_winrate ?? row?.mulliganWinrate),
    keptRate: parsePercentish(row?.kept_rate ?? row?.keptRate),
    avgCopies: parseNumber(row?.avg_copies ?? row?.avgCopies),
  };
}

function normalizeCardLookup(row: any) {
  const cardId = safeCardId(row);
  const ruCard = getRuCard(cardId);
  const imageUrl = row?.image_url ?? row?.imageHa ?? row?.imageRu ?? '';
  const imageRu = cardId
    ? cardImageProxyUrl(cardId)
    : imageUrl && String(imageUrl).includes('/ruRU/')
      ? imageUrl
      : null;
  return {
    cost: parseCount(ruCard?.mana ?? row?.cost) ?? undefined,
    attack: parseCount(ruCard?.attack ?? row?.attack) ?? undefined,
    health: parseCount(ruCard?.health ?? row?.health) ?? undefined,
    type: normalizeType(ruCard?.type ?? row?.type),
    imageHa: imageUrl || '',
    imageRu,
    rarityDb: normalizeRarity(ruCard?.rarity ?? row?.rarity),
  };
}

function makeTierGroups(cards: any[], source: keyof typeof TIERLIST_DATASET_BY_SOURCE) {
  const grouped = new Map<string, any[]>();
  for (const card of cards) {
    const tier = inferTier(card.__raw ?? card, card.deckWinrate ?? null, card.arenaScore ?? null, source);
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier)!.push(card);
  }

  return TIER_ORDER
    .filter(tier => grouped.has(tier))
    .map(tier => ({
      tier,
      label: TIER_LABEL_FULL[tier],
      description: TIER_DESC_MAP[tier],
      cards: grouped.get(tier)!.sort((a, b) => {
        if (source === 'heartharena') return (b.score ?? 0) - (a.score ?? 0);
        if (source === 'hsreplay') {
          return (b.arenaScore ?? Number.NEGATIVE_INFINITY) - (a.arenaScore ?? Number.NEGATIVE_INFINITY)
            || (a.arenaSmithRank ?? Number.POSITIVE_INFINITY) - (b.arenaSmithRank ?? Number.POSITIVE_INFINITY)
            || (b.deckWinrate ?? 0) - (a.deckWinrate ?? 0)
            || (b.totalGames ?? 0) - (a.totalGames ?? 0);
        }
        return (b.deckWinrate ?? 0) - (a.deckWinrate ?? 0)
          || (b.totalGames ?? 0) - (a.totalGames ?? 0)
          || (b.arenaScore ?? 0) - (a.arenaScore ?? 0);
      }).map(({ __raw, ...card }) => card),
    }));
}

function buildClassSections(sectionCards: Map<string, any[]>, source: keyof typeof TIERLIST_DATASET_BY_SOURCE) {
  return ARENA_CLASSES
    .map(cls => {
      const cards = sectionCards.get(cls.id) ?? [];
      return {
        ...cls,
        tiers: makeTierGroups(cards, source),
        totalCards: cards.length,
      };
    })
    .filter(section => section.totalCards > 0);
}

function normalizeFlatTierlist(structured: any, source: keyof typeof TIERLIST_DATASET_BY_SOURCE, updatedAt: string | null) {
  const rawCards = Array.isArray(structured?.cards) ? structured.cards : [];
  const cardsLookup: Record<string, any> = {};
  const sectionCards = new Map<string, any[]>();

  for (const row of rawCards) {
    const card = normalizeTierCard(row, source);
    if (!card) continue;
    const cardId = card.cardId;
    cardsLookup[cardId] = normalizeCardLookup(row);
    const classId = card.classKey;
    if (!sectionCards.has(classId)) sectionCards.set(classId, []);
    sectionCards.get(classId)!.push({ ...card, __raw: row });
  }

  return {
    sections: buildClassSections(sectionCards, source),
    cards: cardsLookup,
    updatedAt,
    source: TIER_SOURCE_LABEL[source],
  };
}

function normalizeHearthArenaTierlist(structured: any, updatedAt: string | null) {
  const classes = structured?.classes && typeof structured.classes === 'object' ? structured.classes : {};
  const classEntries = Array.isArray(classes)
    ? classes.map((classData: any) => [classData?.class_id ?? classData?.id ?? classData?.class_name, classData] as [string, any])
    : Object.entries(classes) as Array<[string, any]>;
  const cardsLookup: Record<string, any> = {};
  const sectionCards = new Map<string, any[]>();

  for (const [classIdRaw, classData] of classEntries) {
    const classId = normalizeArenaClassId(classIdRaw);
    const rawCards = Array.isArray(classData?.cards) ? classData.cards : [];
    for (const row of rawCards) {
      const card = normalizeTierCard(row, 'heartharena');
      if (!card) continue;
      cardsLookup[card.cardId] = normalizeCardLookup(row);
      if (!sectionCards.has(classId)) sectionCards.set(classId, []);
      sectionCards.get(classId)!.push({ ...card, __raw: row });
    }
  }

  return {
    sections: buildClassSections(sectionCards, 'heartharena'),
    cards: cardsLookup,
    updatedAt,
    source: TIER_SOURCE_LABEL.heartharena,
  };
}

function normalizeTierlistDataset(payload: any, source: keyof typeof TIERLIST_DATASET_BY_SOURCE) {
  const structured = payload?.view ?? payload?.data?.structured ?? payload?.data?.hsreplay_extracted ?? payload?.structured ?? {};
  const updatedAt = payload?.fetched_at ?? payload?.data?.fetched_at ?? structured?.last_update_date ?? null;
  const normalized = source === 'heartharena'
    ? normalizeHearthArenaTierlist(structured, updatedAt)
    : normalizeFlatTierlist(structured, source, updatedAt);
  return {
    ...normalized,
    ...normalizeTierlistEarlyStatsMetadata(payload),
  };
}

function normalizeLegendaryCard(row: any) {
  const cardId = safeCardId(row);
  const ruCard = getRuCard(cardId);
  const imageUrl = row?.image_url ?? row?.imageHa ?? '';
  const imageRu = cardId
    ? cardImageProxyUrl(cardId)
    : imageUrl && String(imageUrl).includes('/ruRU/')
      ? imageUrl
      : null;
  return {
    cardId,
    name: displayCardName(row),
    cost: parseCount(ruCard?.mana ?? row?.cost) ?? undefined,
    type: normalizeType(ruCard?.type ?? row?.type),
    rarity: normalizeRarity(ruCard?.rarity ?? row?.rarity),
    classKey: normalizeArenaClassId(row?.cardClass ?? row?.classKey),
    count: parseCount(row?.count) ?? undefined,
    imageHa: imageUrl,
    imageRu: row?.imageRu ?? imageRu,
  };
}

function normalizeLegendaryGroupStats(row: any, source: keyof typeof LEGENDARIES_DATASET_BY_SOURCE) {
  const winRate = parsePercentish(row?.winrate ?? row?.win_rate ?? row?.deck_winrate);
  const arenaScore = parseNumber(row?.score ?? row?.arena_score ?? row?.arenaScore);
  return {
    source,
    winrate: winRate ?? undefined,
    deckWinrate: winRate,
    pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
    offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
    arenaScore: arenaScore ?? undefined,
    totalGames: parseCount(row?.total_games ?? row?.totalGames ?? row?.games),
    statsContext: 'legendary',
  };
}

function normalizeLegendaryClassMetrics(row: any) {
  if (!row || typeof row !== 'object') return null;
  const winRate = parsePercentish(row?.winrate ?? row?.win_rate);
  const pickRate = parsePercentish(row?.pick_rate ?? row?.pickRate);
  const offerRate = parsePercentish(row?.offer_rate ?? row?.offerRate);
  const score = parseNumber(row?.score ?? row?.arena_score ?? row?.arenaScore);
  if (winRate == null && pickRate == null && offerRate == null && score == null) return null;
  return { winRate, pickRate, offerRate, score };
}

function normalizeLegendaryByClass(raw: any) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, { winRate: number | null; pickRate: number | null; offerRate: number | null; score: number | null }> = {};
  for (const [key, value] of Object.entries(raw)) {
    const classKey = key === 'all' || key === 'ALL' ? 'all' : normalizeArenaClassId(key);
    const metrics = normalizeLegendaryClassMetrics(value);
    if (!metrics) continue;
    out[classKey] = metrics;
  }
  return Object.keys(out).length ? out : undefined;
}

function buildTierlistCardStatsMap(tierlistData: any) {
  const stats = new Map<string, any>();
  for (const section of tierlistData?.sections ?? []) {
    for (const tier of section?.tiers ?? []) {
      for (const card of tier?.cards ?? []) {
        if (!card?.cardId) continue;
        const lookup = tierlistData?.cards?.[card.cardId] ?? {};
        stats.set(card.cardId, {
          ...card,
          ...lookup,
          tier: tier.tier,
          source: 'hsreplay',
          statsContext: 'tierlist',
          rarity: lookup.rarityDb ?? card.rarity,
          classKey: card.classKey ?? section.id,
          imageHa: lookup.imageHa ?? card.imageHa ?? '',
          imageRu: lookup.imageRu ?? card.imageRu ?? null,
        });
      }
    }
  }
  return stats;
}

function enrichLegendaryCardWithTierlistStats(card: any, tierStatsByCardId: Map<string, any>) {
  const stats = card?.cardId ? tierStatsByCardId.get(card.cardId) : null;
  if (!stats) return card;
  return {
    ...card,
    ...stats,
    name: card.name ?? stats.name,
    cost: card.cost ?? stats.cost,
    imageHa: card.imageHa || stats.imageHa || '',
    imageRu: card.imageRu ?? stats.imageRu ?? null,
    pickRate: card.pickRate ?? stats.pickRate ?? null,
    offerRate: card.offerRate ?? stats.offerRate ?? null,
    arenaScore: card.arenaScore ?? stats.arenaScore ?? null,
  };
}

function enrichLegendariesWithTierlistStats(legendariesData: any, tierlistData: any) {
  const tierStatsByCardId = buildTierlistCardStatsMap(tierlistData);
  if (!tierStatsByCardId.size) return legendariesData;
  return {
    ...legendariesData,
    groups: (legendariesData?.groups ?? []).map((group: any) => {
      const keyCard = enrichLegendaryCardWithTierlistStats(group.keyCard, tierStatsByCardId);
      return {
        ...group,
        keyCard,
        cards: (group.cards ?? []).map((card: any) => enrichLegendaryCardWithTierlistStats(card, tierStatsByCardId)),
        pickRate: group.pickRate ?? keyCard?.pickRate ?? null,
        offerRate: group.offerRate ?? keyCard?.offerRate ?? null,
        score: group.score ?? keyCard?.arenaScore ?? null,
      };
    }),
  };
}

function normalizeLegendariesDataset(
  payload: any,
  source: keyof typeof LEGENDARIES_DATASET_BY_SOURCE,
  packageCardsByKey = new Map<string, any[]>(),
) {
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const updatedAt = payload?.fetched_at ?? payload?.data?.fetched_at ?? structured?.last_update_date ?? null;

  if (source === 'firestone') {
    const rawCards = Array.isArray(structured?.cards) ? structured.cards : [];
    return {
      groups: rawCards
        .map((row: any) => {
          const winRate = parsePercentish(row?.win_rate ?? row?.deck_winrate);
          const classKey = normalizeArenaClassId(row?.cardClass ?? row?.classKey);
          return {
            keyCard: {
              ...normalizeLegendaryCard(row),
              ...normalizeLegendaryGroupStats(row, source),
              winrate: winRate ?? undefined,
              deckWinrate: winRate,
              classKey,
            },
            cards: packageCardsByKey.get(safeCardId(row)) ?? [],
            winRate,
            pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
            offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
            score: parseNumber(row?.score ?? row?.arena_score ?? row?.arenaScore),
            classKey,
          };
        })
        .filter((group: any) => group.keyCard.cardId),
      updatedAt,
      source: LEGENDARY_SOURCE_LABEL.firestone,
    };
  }

  const rawGroups = Array.isArray(structured?.groups) ? structured.groups : [];
  return {
    groups: rawGroups
      .map((row: any) => {
        const keyCardRow = row?.key_card ?? row?.legendary_card ?? row?.keyCard;
        const winRate = parsePercentish(row?.winrate ?? row?.win_rate ?? row?.deck_winrate);
        const classKey = normalizeArenaClassId(row?.class ?? keyCardRow?.cardClass ?? row?.classKey);
        const keyCard = {
          ...normalizeLegendaryCard(keyCardRow),
          ...normalizeLegendaryGroupStats(row, source),
          winrate: winRate ?? undefined,
          deckWinrate: winRate,
          classKey,
        };
        return {
          keyCard,
          cards: (Array.isArray(row?.cards) ? row.cards : []).map(normalizeLegendaryCard).filter((card: any) => card.cardId),
          winRate,
          pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
          offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
          score: parseNumber(row?.score ?? row?.arena_score ?? row?.arenaScore),
          byClass: normalizeLegendaryByClass(row?.by_class ?? row?.byClass),
          classKey,
        };
      })
      .filter((group: any) => group.keyCard.cardId),
    updatedAt,
    source: LEGENDARY_SOURCE_LABEL.hsreplay,
  };
}

function buildLegendaryPackageMap(payload: any) {
  const hsReplayData = normalizeLegendariesDataset(payload, 'hsreplay');
  return new Map<string, any[]>(
    (hsReplayData.groups ?? []).map((group: any) => [group.keyCard.cardId, group.cards ?? []]),
  );
}

function hasLegendaryGroups(data: any): boolean {
  return Array.isArray(data?.groups) && data.groups.length > 0;
}

function compactHomeTopCards(tierlistData: any) {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const tier of ['S', 'A']) {
    for (const section of tierlistData?.sections ?? []) {
      const tierGroup = (section?.tiers ?? []).find((group: any) => group?.tier === tier);
      if (!tierGroup) continue;
      const cards = [...(tierGroup.cards ?? [])].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
      for (const card of cards) {
        if (!card?.cardId || seen.has(card.cardId)) continue;
        seen.add(card.cardId);
        const lookup = tierlistData?.cards?.[card.cardId] ?? {};
        result.push({
          cardId: card.cardId,
          name: card.name,
          score: card.score,
          rarity: card.rarity,
          tier,
          classKey: card.classKey,
          cost: lookup.cost,
          imageRu: lookup.imageRu ?? null,
          imageHa: lookup.imageHa ?? '',
        });
        if (result.length >= 10) return result;
      }
    }
  }
  return result;
}

function compactHomeTopLegendaries(legendariesData: any) {
  return [...(legendariesData?.groups ?? [])]
    .filter((group: any) => group?.keyCard?.cardId && group.winRate !== null && group.winRate !== undefined)
    .sort((a: any, b: any) => (b.winRate ?? 0) - (a.winRate ?? 0))
    .slice(0, 8)
    .map((group: any) => ({
      cardId: group.keyCard.cardId,
      name: group.keyCard.name,
      cost: group.keyCard.cost,
      imageRu: group.keyCard.imageRu ?? null,
      imageHa: group.keyCard.imageHa ?? '',
      winRate: group.winRate,
      classKey: group.classKey,
    }));
}

type ApiDataCacheSource = 'memory' | 'redis' | 'origin';

interface ApiDataResult<T = any> {
  data: T;
  etag: string;
  cacheSource: ApiDataCacheSource;
}

async function getTierlistApiData(
  source: keyof typeof TIERLIST_DATASET_BY_SOURCE,
  now: number,
  bypassCache = false,
): Promise<ApiDataResult> {
  const cached = tierlistApiCache.get(source);
  if (!bypassCache && cached && cached.expiresAt > now) {
    return { data: cached.data, etag: cached.etag, cacheSource: 'memory' };
  }

  const redisKey = redisDataKey('tierlist', source);
  if (!bypassCache) {
    const redisCached = await redisGetCache(redisKey);
    if (redisCached) {
      tierlistApiCache.set(source, {
        data: redisCached.data,
        etag: redisCached.etag,
        expiresAt: now + TIERLIST_API_CACHE_MS,
      });
      return { data: redisCached.data, etag: redisCached.etag, cacheSource: 'redis' };
    }
  }

  const [payload] = await Promise.all([
    fetchDataset(TIERLIST_DATASET_BY_SOURCE[source]),
    ensureRuCardsData(),
  ]);
  const data = normalizeTierlistDataset(payload, source);
  const etag = makeExternalEtag('tierlist', source, data, now);
  tierlistApiCache.set(source, { data, etag, expiresAt: now + TIERLIST_API_CACHE_MS });
  void redisSetCache(redisKey, data, etag, tierlistRedisTtlSeconds(data, REDIS_DATASET_TTL_SECONDS));
  return { data, etag, cacheSource: 'origin' };
}

async function getLegendariesApiData(
  source: keyof typeof LEGENDARIES_DATASET_BY_SOURCE,
  now: number,
  bypassCache = false,
): Promise<ApiDataResult> {
  const cached = legendariesApiCache.get(source);
  if (!bypassCache && cached && cached.expiresAt > now && hasLegendaryGroups(cached.data)) {
    return { data: cached.data, etag: cached.etag, cacheSource: 'memory' };
  }
  if (cached && !hasLegendaryGroups(cached.data)) legendariesApiCache.delete(source);

  const redisKey = redisDataKey('legendaries', source);
  if (!bypassCache) {
    const redisCached = await redisGetCache(redisKey);
    if (redisCached && hasLegendaryGroups(redisCached.data)) {
      legendariesApiCache.set(source, {
        data: redisCached.data,
        etag: redisCached.etag,
        expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
      });
      return { data: redisCached.data, etag: redisCached.etag, cacheSource: 'redis' };
    }
  }

  const dataBase = source === 'firestone'
    ? await (async () => {
        const [firestonePayload, hsReplayPayload] = await Promise.all([
          fetchDataset(LEGENDARIES_DATASET_BY_SOURCE.firestone),
          fetchDataset(LEGENDARIES_DATASET_BY_SOURCE.hsreplay),
          ensureRuCardsData(),
        ]);
        return normalizeLegendariesDataset(firestonePayload, source, buildLegendaryPackageMap(hsReplayPayload));
      })()
    : normalizeLegendariesDataset((await Promise.all([
        fetchDataset(LEGENDARIES_DATASET_BY_SOURCE[source]),
        ensureRuCardsData(),
      ]))[0], source);
  if (!hasLegendaryGroups(dataBase)) {
    throw new Error(`Empty legendaries dataset: ${source}`);
  }

  let data = dataBase;
  try {
    const tierlistData = (await getTierlistApiData('hsreplay', now)).data;
    data = enrichLegendariesWithTierlistStats(dataBase, tierlistData);
  } catch (err: any) {
    console.warn('[api/legendaries] tierlist stats enrichment failed:', err?.message ?? err);
  }
  const etag = makeExternalEtag('legendaries-v2', source, data, now);
  legendariesApiCache.set(source, { data, etag, expiresAt: now + EXTERNAL_DATASET_CACHE_MS });
  void redisSetCache(redisKey, data, etag, REDIS_DATASET_TTL_SECONDS);
  return { data, etag, cacheSource: 'origin' };
}

async function loadTierlistForHomeSummary(now: number) {
  const source = 'hsreplay' as const;
  try {
    return (await getTierlistApiData(source, now)).data;
  } catch (err: any) {
    console.warn('[api/home/summary] tierlist source failed:', err?.message ?? err);
    return loadDataCached('hsreplay_tierlist.json')?.data
      ?? loadDataCached('tierlist.json')?.data
      ?? { sections: [], cards: {}, updatedAt: null, source: 'unavailable' };
  }
}

async function loadLegendariesForHomeSummary(now: number) {
  const source = 'hsreplay' as const;
  try {
    return (await getLegendariesApiData(source, now)).data;
  } catch (err: any) {
    console.warn('[api/home/summary] legendaries source failed:', err?.message ?? err);
    return loadDataCached('legendaries.json')?.data
      ?? { groups: [], updatedAt: null, source: 'unavailable' };
  }
}

function homeSummaryPercent(value: unknown): number | null {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadBattlegroundSpotlightForHomeSummary() {
  try {
    const response = await fetch('http://127.0.0.1:3108/api/bg/heroes', { // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- fixed loopback-only service
      signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'ManacostArena/HomeSummary' },
    });
    if (!response.ok) throw new Error(`BG heroes HTTP ${response.status}`);
    const payload = await response.json();
    const heroes = Array.isArray(payload?.view?.heroes) ? payload.view.heroes : [];
    const candidates = heroes
      .map((hero: any) => ({
        hero,
        avgPlacement: homeSummaryPercent(hero?.avg_placement),
        pickRate: homeSummaryPercent(hero?.pick_rate),
        placementDistribution: Array.isArray(hero?.placement_distribution)
          ? hero.placement_distribution.map(homeSummaryPercent)
          : [],
      }))
      .filter((entry: any) => entry.avgPlacement !== null
        && entry.placementDistribution.length === 8
        && entry.placementDistribution.every((value: number | null) => value !== null))
      .sort((a: any, b: any) => a.avgPlacement - b.avgPlacement);
    const selected = candidates[0];
    if (!selected) return null;

    return {
      dbfId: Number(selected.hero.dbfId),
      name: String(selected.hero.hero || 'Герой Полей Сражений'),
      image: String(selected.hero.image || ''),
      tier: String(selected.hero.tier || '—'),
      avgPlacement: selected.avgPlacement,
      pickRate: selected.pickRate,
      placementDistribution: selected.placementDistribution,
      heroPower: {
        name: String(selected.hero?.hero_power?.card?.name || ''),
        text: String(selected.hero?.hero_power?.card?.text || ''),
        image: String(selected.hero?.hero_power?.card?.image || ''),
      },
      updatedAt: payload?.fetched_at ?? null,
      source: payload?.site || 'hsreplay',
    };
  } catch (err: any) {
    console.warn('[api/home/summary] battlegrounds spotlight failed:', err?.message ?? err);
    return null;
  }
}

async function buildHomeSummary(now: number) {
  const [winratesData, tierlistData, legendariesData, battlegroundSpotlight] = await Promise.all([
    fetchFreshestClassWinratesData().catch((err: any) => {
      console.warn('[api/home/summary] winrates source failed:', err?.message ?? err);
      return loadDataCached('winrates.json')?.data
        ?? { classes: [], updatedAt: null, source: 'unavailable' };
    }),
    loadTierlistForHomeSummary(now),
    loadLegendariesForHomeSummary(now),
    loadBattlegroundSpotlightForHomeSummary(),
  ]);

  const topClasses = [...(winratesData?.classes ?? [])]
    .sort((a: any, b: any) => (b.winrate ?? 0) - (a.winrate ?? 0))
    .slice(0, 3);
  const topCards = compactHomeTopCards(tierlistData);
  const topLegendaries = compactHomeTopLegendaries(legendariesData);

  return {
    topClasses,
    topCards,
    topLegendaries,
    battlegroundSpotlight,
    updatedAt: {
      winrates: winratesData?.updatedAt ?? null,
      tierlist: tierlistData?.updatedAt ?? null,
      legendaries: legendariesData?.updatedAt ?? null,
      battlegrounds: battlegroundSpotlight?.updatedAt ?? null,
    },
    sources: {
      winrates: winratesData?.source ?? 'unknown',
      tierlist: tierlistData?.source ?? 'unknown',
      legendaries: legendariesData?.source ?? 'unknown',
      battlegrounds: battlegroundSpotlight?.source ?? 'unavailable',
    },
  };
}

function makeHomeSummaryEtag(data: any, now: number) {
  const updatedValues = Object.values(data?.updatedAt ?? {})
    .map(value => typeof value === 'string' ? Date.parse(value) : NaN)
    .filter(Number.isFinite) as number[];
  const updatedToken = (updatedValues.length ? Math.max(...updatedValues) : now).toString(36);
  return `"home-summary-v2-${updatedToken}-${data.topClasses?.length ?? 0}-${data.topCards?.length ?? 0}-${data.topLegendaries?.length ?? 0}-${data.battlegroundSpotlight?.dbfId ?? 0}"`;
}

function datasetApiUrl(datasetId: string): string {
  if (/^https?:\/\//i.test(datasetId)) return datasetId;
  const path = datasetId.replace(/^\/+/, '');
  if (path.includes('/')) return `${DATASET_API_ORIGIN}/${path}`;
  return `${DATASET_API_BASE}/${path}`;
}

async function fetchDataset(datasetId: string, timeoutMs?: number) {
  const upstream = await fetch(datasetApiUrl(datasetId), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);
  return upstream.json();
}

async function fetchConstructedCardJson(url: string, timeoutMs = 8_000): Promise<unknown> {
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(datasetApiUrl(url), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ConstructedCardUpstreamError('Constructed card upstream transport failed', null, { cause: error });
  }
  if (!upstream.ok) {
    throw new ConstructedCardUpstreamError(
      `Constructed card upstream returned HTTP ${upstream.status}`,
      upstream.status,
    );
  }
  try {
    return await upstream.json();
  } catch (error) {
    throw new ConstructedCardUpstreamError('Constructed card upstream returned invalid JSON', null, { cause: error });
  }
}

function parseStandardMatchupNumber(value: unknown): number | null {
  const raw = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!raw || raw === '—' || raw === '-') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function normalizeStandardArchetypeKey(name: string): string {
  return name.toLowerCase().trim();
}

function buildFallbackStandardArchetypeTranslations(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(STANDARD_ARCHETYPE_RU).map(([eng, rus]) => [normalizeStandardArchetypeKey(eng), rus.trim()]),
  );
}

function loadAdminArchetypeTranslations(): Record<string, string> {
  const rows = dbAll<{ name_en: string; name_ru: string }>(`
    SELECT name_en, name_ru
    FROM archetype_translations
    ORDER BY CASE WHEN source = 'manual' THEN 0 ELSE 1 END, updated_at DESC
  `);
  const translations: Record<string, string> = {};
  for (const row of rows) {
    const nameEn = String(row.name_en || '').trim();
    const nameRu = String(row.name_ru || '').trim();
    if (nameEn && nameRu) translations[normalizeStandardArchetypeKey(nameEn)] = nameRu;
  }
  return translations;
}

async function fetchBlizzcoreArchetypesPayload(): Promise<unknown> {
  const response = await fetch(BLIZZCORE_ARCHETYPES_API_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`BlizzCore archetypes API HTTP ${response.status}`);
  return response.json();
}

async function ensureArchetypeTranslationsSeeded(): Promise<void> {
  const count = Number(dbGet<{ total: number }>('SELECT COUNT(*) AS total FROM archetype_translations')?.total || 0);
  if (count > 0) return;
  if (!archetypeTranslationSeedPromise) {
    archetypeTranslationSeedPromise = (async () => {
      const rows = normalizeBlizzcoreArchetypes(await fetchBlizzcoreArchetypesPayload());
      syncBlizzcoreArchetypes(db(), rows, 'system:blizzcore-seed', new Date().toISOString());
    })().finally(() => {
      archetypeTranslationSeedPromise = null;
    });
  }
  return archetypeTranslationSeedPromise;
}

function parseDeckviewArchetypeCsv(text: string): Record<string, string> {
  const translations: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(',,') || line.includes('Англ. названия')) continue;
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const eng = parts[1]?.trim().replace(/^"+|"+$/g, '');
    const rus = parts[2]?.trim().replace(/^"+|"+$/g, '');
    if (!eng || !rus) continue;
    translations[normalizeStandardArchetypeKey(eng)] = rus.trim();
  }
  return translations;
}

function deckviewArchetypesEndpoint(): string {
  if (!DECKVIEW_ARCHETYPES_API_URL) return '';
  const base = DECKVIEW_ARCHETYPES_API_URL.replace(/\/$/, '');
  return base.endsWith('/public/archetypes') ? base : `${base}/public/archetypes`;
}

function normalizeDeckviewArchetypesPayload(payload: any): Record<string, string> {
  const source = Array.isArray(payload?.archetypes)
    ? payload.archetypes
    : Array.isArray(payload)
      ? payload
      : [];
  const translations: Record<string, string> = {};
  for (const item of source) {
    const eng = Array.isArray(item) ? item[0] : item?.eng ?? item?.english ?? item?.name;
    const rus = Array.isArray(item) ? item[1] : item?.rus ?? item?.russian ?? item?.label;
    if (!eng || !rus) continue;
    translations[normalizeStandardArchetypeKey(String(eng))] = String(rus).trim();
  }
  return translations;
}

async function fetchDeckviewApiArchetypes(): Promise<Record<string, string> | null> {
  const endpoint = deckviewArchetypesEndpoint();
  if (!endpoint) return null;
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`Deckview archetypes API HTTP ${response.status}`);
  const translations = normalizeDeckviewArchetypesPayload(await response.json());
  return Object.keys(translations).length ? translations : null;
}

async function fetchDeckviewCsvArchetypes(): Promise<Record<string, string> | null> {
  const response = await fetch(DECKVIEW_ARCHETYPES_CSV_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Deckview archetypes CSV HTTP ${response.status}`);
  const translations = parseDeckviewArchetypeCsv(await response.text());
  return Object.keys(translations).length ? translations : null;
}

async function loadStandardArchetypeTranslations(): Promise<StandardArchetypeTranslations> {
  const fallback = buildFallbackStandardArchetypeTranslations();
  try {
    await ensureArchetypeTranslationsSeeded();
    const localTranslations = loadAdminArchetypeTranslations();
    if (Object.keys(localTranslations).length) {
      return { map: { ...fallback, ...localTranslations }, source: 'admin-db' };
    }
  } catch (err: any) {
    console.warn('[standard-matchups] admin archetype translations unavailable:', err?.message ?? err);
  }

  try {
    const apiTranslations = await fetchDeckviewApiArchetypes();
    if (apiTranslations) return { map: { ...fallback, ...apiTranslations }, source: 'deckview-api' };
  } catch (err: any) {
    console.warn('[standard-matchups] deckview archetypes API unavailable:', err?.message ?? err);
  }

  try {
    const csvTranslations = await fetchDeckviewCsvArchetypes();
    if (csvTranslations) return { map: { ...fallback, ...csvTranslations }, source: 'deckview-csv' };
  } catch (err: any) {
    console.warn('[standard-matchups] deckview archetypes CSV unavailable:', err?.message ?? err);
  }

  return { map: fallback, source: 'fallback' };
}

async function getStandardArchetypeTranslations(now = Date.now()): Promise<StandardArchetypeTranslations> {
  if (standardArchetypeTranslationsCache && standardArchetypeTranslationsCache.expiresAt > now) {
    return standardArchetypeTranslationsCache;
  }
  if (!standardArchetypeTranslationsPromise) {
    standardArchetypeTranslationsPromise = loadStandardArchetypeTranslations()
      .then((result) => {
        standardArchetypeTranslationsCache = { ...result, expiresAt: Date.now() + STANDARD_ARCHETYPE_TRANSLATION_CACHE_MS };
        return result;
      })
      .finally(() => {
        standardArchetypeTranslationsPromise = null;
      });
  }
  return standardArchetypeTranslationsPromise;
}

function translateStandardArchetype(name: string, translations: Record<string, string>): string {
  const normalizedName = normalizeStandardArchetypeKey(name);
  const exact = translations[normalizedName];
  if (exact) return exact;

  let bestMatch = '';
  let bestLength = 0;
  for (const [eng, rus] of Object.entries(translations)) {
    if (normalizedName.includes(eng) && eng.length > bestLength) {
      bestMatch = rus;
      bestLength = eng.length;
    }
  }
  return bestMatch || name;
}

async function loadObservedStandardArchetypes() {
  // Start the shared deck index request alongside the HSGuru slices. The
  // translation queue can then expose exact deck codes without one request per
  // missing archetype.
  const constructedRowsPromise = fetchViciousConstructedDeckRows().catch(() => []);
  const matchupRanks = Object.entries(STANDARD_MATCHUPS_DATASET_BY_RANK) as Array<[
    keyof typeof STANDARD_MATCHUPS_DATASET_BY_RANK,
    string,
  ]>;
  const matchupPayloads = await Promise.all(matchupRanks.map(async ([rank, datasetId]) => ({
    rank,
    payload: await fetchDataset(datasetId).catch(() => null),
  })));
  const matchupArchetypes = matchupPayloads.flatMap(({ rank, payload }) => {
    const table = payload?.data?.tables?.[0] ?? payload?.tables?.[0] ?? null;
    const headers = Array.isArray(table?.headers) ? table.headers.slice(2) : [];
    const rows = Array.isArray(table?.rows) ? table.rows.slice(1) : [];
    const names = [
      ...headers,
      ...rows.map((row: unknown) => Array.isArray(row) ? row[1] : ''),
    ];
    const uniqueNames = new Map<string, string>();
    for (const value of names) {
      const nameEn = String(value ?? '').trim().replace(/\s+/g, ' ');
      if (nameEn) uniqueNames.set(normalizeStandardArchetypeKey(nameEn), nameEn);
    }
    return [...uniqueNames.values()].map(nameEn => ({
      nameEn,
      rank: STANDARD_MATCHUPS_RANK_LABEL[rank],
      format: 'standard' as const,
      rankKey: 'legend' as const,
    }));
  });

  const metaSources = (Object.entries(STANDARD_META_DATASET_BY_FORMAT_RANK) as Array<[
    StandardMetaFormat,
    Record<StandardMetaRank, string>,
  ]>).flatMap(([format, ranks]) => (
    (Object.entries(ranks) as Array<[StandardMetaRank, string]>).map(([rank, datasetId]) => ({ format, rank, datasetId }))
  ));
  const metaPayloads = await Promise.all(metaSources.map(async source => ({
    ...source,
    payload: await fetchDataset(source.datasetId).catch(() => null),
  })));
  const constructedRows = await constructedRowsPromise;
  const exactDeckCodes = new Map<string, string | null>();
  const findExactDeckCode = (
    nameEn: string,
    format: StandardMetaFormat,
    rank: StandardMetaRank,
  ): string | null => {
    const cacheKey = `${format}:${normalizeStandardArchetypeKey(nameEn)}`;
    if (exactDeckCodes.has(cacheKey)) return exactDeckCodes.get(cacheKey) ?? null;
    const candidates = parseConstructedDecks({ data: constructedRows }, nameEn, nameEn, format, rank)
      .sort((left, right) => right.quality - left.quality);
    const deckCode = candidates[0]?.deckCode ?? null;
    exactDeckCodes.set(cacheKey, deckCode);
    return deckCode;
  };
  const metaArchetypes = metaPayloads.flatMap(({ format, rank, payload }) => {
    const table = payload?.data?.tables?.[0] ?? payload?.tables?.[0] ?? null;
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const uniqueNames = new Map<string, string>();
    for (const row of rows) {
      const nameEn = String(Array.isArray(row) ? row[0] : '').trim().replace(/\s+/g, ' ');
      if (nameEn) uniqueNames.set(normalizeStandardArchetypeKey(nameEn), nameEn);
    }
    return [...uniqueNames.values()].map(nameEn => ({
      nameEn,
      rank: `Мета · ${STANDARD_META_FORMAT_LABEL[format]} · ${STANDARD_META_RANK_LABEL[rank]}`,
      deckCode: findExactDeckCode(nameEn, format, rank),
      format,
      rankKey: rank,
    }));
  });

  return [
    ...matchupArchetypes.map(item => ({
      ...item,
      deckCode: findExactDeckCode(item.nameEn, 'standard', 'legend'),
    })),
    ...metaArchetypes,
  ];
}

function transformHsguruMatchups(
  payload: any,
  format: StandardMatchupFormat,
  archetypeTranslations: StandardArchetypeTranslations,
) {
  const table = payload?.data?.tables?.[0] ?? payload?.tables?.[0] ?? null;
  const headers = Array.isArray(table?.headers) ? table.headers.map((item: unknown) => String(item ?? '').trim()) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const popularityRow = Array.isArray(rows[0]) ? rows[0] : [];
  const translations = archetypeTranslations.map;
  const columns: Array<{ name: string; label: string; popularity: string | null }> = [];
  for (let index = 2; index < headers.length; index += 1) {
    const name = headers[index];
    if (!name) continue;
    columns.push({
      name,
      label: translateStandardArchetype(name, translations),
      popularity: String(popularityRow[index - 1] ?? '').trim() || null,
    });
  }

  const dataRows: Array<{
    archetype: string;
    archetypeLabel: string;
    winrate: number | null;
    cells: Array<{ opponent: string; opponentLabel: string; winrate: number | null }>;
  }> = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) continue;
    const archetype = String(row[1] ?? '').trim();
    if (!archetype) continue;
    dataRows.push({
      archetype,
      archetypeLabel: translateStandardArchetype(archetype, translations),
      winrate: parseStandardMatchupNumber(row[0]),
      cells: columns.map((column, columnIndex) => ({
        opponent: column.name,
        opponentLabel: column.label,
        winrate: parseStandardMatchupNumber(row[columnIndex + 2]),
      })),
    });
  }

  return {
    format,
    formatLabel: STANDARD_MATCHUPS_FORMAT_LABEL[format],
    rank: 'legend',
    rankLabel: 'Легенда',
    source: 'hsguru',
    sourceId: STANDARD_MATCHUPS_DATASET_BY_FORMAT[format],
    sourceUrl: payload?.data?.url ?? payload?.url ?? '',
    translationSource: archetypeTranslations.source,
    updatedAt: payload?.fetched_at ?? payload?.data?.fetched_at ?? null,
    columns,
    rows: dataRows,
  };
}

async function loadHsguruMatchupRow(archetypeName: string) {
  const now = Date.now();
  const cached = standardMatchupsApiCache.get('standard');
  let data = cached?.data;
  if (!data) {
    const [payload, translations] = await Promise.all([
      fetchDataset(STANDARD_MATCHUPS_DATASET_BY_FORMAT.standard),
      getStandardArchetypeTranslations(now),
    ]);
    data = excludeOtherStandardMatchups(transformHsguruMatchups(payload, 'standard', translations));
    standardMatchupsApiCache.set('standard', {
      data,
      etag: `"standard-matchups-v6-standard-admin-${now.toString(36)}"`,
      expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
    });
  }
  const wanted = normalizeStandardArchetypeKey(archetypeName);
  const row = (Array.isArray(data?.rows) ? data.rows : [])
    .find((candidate: any) => normalizeStandardArchetypeKey(String(candidate?.archetype || '')) === wanted);
  if (!row || !Array.isArray(row.cells)) return null;
  return row.cells.map((cell: any, index: number) => ({
    opponent_archetype_id: index + 1,
    opponent_name: String(cell?.opponentLabel || cell?.opponent || `Архетип ${index + 1}`),
    opponent_name_en: String(cell?.opponent || ''),
    opponent_class: inferStandardMetaClass(String(cell?.opponent || '')),
    win_rate: parseNumber(cell?.winrate),
    total_games: null,
  }));
}

function parseStandardMetaPopularity(value: unknown): { popularity: number | null; games: number | null } {
  const raw = String(value ?? '').trim();
  const match = raw.match(/(-?[\d.,]+)\s*%?\s*(?:\(([\d\s.,]+)\))?/);
  return {
    popularity: parseNumber(match?.[1]),
    games: parseCount(match?.[2]),
  };
}

function transformHsguruMeta(
  payload: any,
  format: StandardMetaFormat,
  rank: StandardMetaRank,
  archetypeTranslations: StandardArchetypeTranslations,
  publication: StandardMetaPublication,
) {
  const publicationMode = publication.mode;
  const publishedAt = publication.publishedAt;
  const sourceUpdatedAt = payload?.fetched_at ?? payload?.data?.fetched_at ?? null;
  const table = payload?.data?.tables?.[0] ?? payload?.tables?.[0] ?? null;
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const translations = archetypeTranslations.map;
  const items = rows.flatMap((row: unknown) => {
    if (!Array.isArray(row)) return [];
    const archetype = String(row[0] ?? '').trim().replace(/\s+/g, ' ');
    if (!archetype) return [];
    const { popularity, games } = parseStandardMetaPopularity(row[2]);
    return [{
      id: createHash('sha1').update(`${format}:${archetype.toLowerCase()}`).digest('hex').slice(0, 12),
      slug: constructedArchetypeSlug(archetype),
      archetype,
      archetypeLabel: translateStandardArchetype(archetype, translations),
      translated: translateStandardArchetype(archetype, translations) !== archetype,
      classKey: inferStandardMetaClass(archetype),
      winrate: parseNumber(row[1]),
      popularity,
      games,
      turns: parseNumber(row[3]),
      durationMinutes: parseNumber(row[4]),
      climbingSpeed: parseNumber(String(row[5] ?? '').match(/-?[\d.,]+/)?.[0]),
    }];
  });
  return {
    publicationMode,
    publishedAt,
    format,
    formatLabel: STANDARD_META_FORMAT_LABEL[format],
    rank,
    rankLabel: STANDARD_META_RANK_LABEL[rank],
    source: 'hsguru',
    sourceId: STANDARD_META_DATASET_BY_FORMAT_RANK[format][rank],
    sourceUrl: payload?.data?.url ?? payload?.url ?? '',
    translationSource: archetypeTranslations.source,
    updatedAt: sourceUpdatedAt,
    items,
  };
}

async function loadStandardMeta(
  format: StandardMetaFormat,
  rank: StandardMetaRank,
  period: StandardMetaPeriod,
  coin: StandardMetaCoin,
  minGames: StandardMetaMinGames,
) {
  const cacheKey = `${format}:${rank}:${period}:${coin}:${minGames}`;
  const now = Date.now();
  const cached = standardMetaApiCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;
  try {
    const query = new URLSearchParams({
      format,
      rank: STANDARD_META_UPSTREAM_RANK[rank],
      period,
      coin,
      min_games: String(minGames),
    });
    const [payload, translations] = await Promise.all([
      fetchDataset(`v1/hsguru/meta?${query}`, 20_000),
      getStandardArchetypeTranslations(now),
    ]);
    const sourceUpdatedAt = payload?.meta?.fetched_at ?? null;
    if (!sourceUpdatedAt || !Number.isFinite(Date.parse(sourceUpdatedAt))) {
      throw new Error('HSGuru matrix timestamp is invalid');
    }
    const rows = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    const availablePeriods = (Array.isArray(payload?.meta?.available_periods)
      ? payload.meta.available_periods
      : ['past_day', 'past_3_days', 'past_week', 'past_2_weeks'])
      .map((value: unknown) => String(value));
    const currentPatchPeriod = typeof payload?.meta?.current_patch_period === 'string'
      ? payload.meta.current_patch_period
      : null;
    const currentPeriod = typeof payload?.meta?.current_period === 'string'
      ? payload.meta.current_period
      : currentPatchPeriod;
    const data = {
      publicationMode: 'stable' as const,
      publishedAt: sourceUpdatedAt,
      format,
      formatLabel: STANDARD_META_FORMAT_LABEL[format],
      rank,
      rankLabel: STANDARD_META_RANK_LABEL[rank],
      period,
      availablePeriods,
      currentPeriod,
      currentPatchPeriod,
      coin,
      minGames,
      source: 'hsguru',
      sourceId: 'hsguru_meta_matrix',
      sourceUrl: String(payload?.data?.source_url ?? ''),
      translationSource: translations.source,
      updatedAt: sourceUpdatedAt,
      items: rows.flatMap((row: any) => {
        const archetype = String(row?.archetype ?? '').trim().replace(/\s+/g, ' ');
        if (!archetype) return [];
        const archetypeLabel = translateStandardArchetype(archetype, translations.map);
        return [{
          id: createHash('sha1').update(`${format}:${archetype.toLowerCase()}`).digest('hex').slice(0, 12),
          slug: constructedArchetypeSlug(archetype),
          archetype,
          archetypeLabel,
          translated: archetypeLabel !== archetype,
          classKey: inferStandardMetaClass(archetype),
          winrate: parseNumber(row.winrate),
          popularity: parseNumber(row.popularity),
          games: parseCount(row.games),
          turns: parseNumber(row.turns),
          durationMinutes: parseNumber(row.duration_minutes),
          climbingSpeed: parseNumber(row.climbing_speed),
        }];
      }),
    };
    const selected = selectStandardMetaCandidate(data, cached?.data ?? null, now);
    if (selected.rejectedError) {
      if (!cached) throw selected.rejectedError;
      cached.expiresAt = now + 60_000;
      console.warn(
        '[standard-meta] candidate rejected; serving last known good:',
        selected.rejectedError instanceof Error ? selected.rejectedError.message : selected.rejectedError,
      );
      return selected.data;
    }
    standardMetaApiCache.set(cacheKey, {
      data: selected.data,
      etag: selected.envelope.datasetVersion,
      expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
    });
    return selected.data;
  } catch (error) {
    if (!cached) throw error;
    // Keep the last validated in-process document visible while retrying the
    // source on a short cadence. Its envelope reports the real stale age.
    cached.expiresAt = now + 60_000;
    console.warn('[standard-meta] candidate rejected; serving last known good:', error instanceof Error ? error.message : error);
    return cached.data;
  }
}

async function loadConstructedArchetypeCatalog(
  format: ConstructedArchetypeFormat,
): Promise<ConstructedArchetypeCatalog> {
  const now = Date.now();
  const cached = constructedArchetypeCatalogCache.get(format);
  if (cached && cached.expiresAt > now) return cached.data as ConstructedArchetypeCatalog;
  const query = new URLSearchParams({
    format,
    min_games: '50',
    has_decks: 'true',
    sort: 'games',
    order: 'desc',
    limit: '500',
  });
  const [payload, translations] = await Promise.all([
    fetchDataset(`v1/hsguru/archetypes?${query}`, 20_000),
    getStandardArchetypeTranslations(),
  ]);
  const items = (Array.isArray(payload?.data) ? payload.data : []).flatMap((row: any) => {
    const archetype = String(row?.archetype ?? '').trim().replace(/\s+/g, ' ');
    if (!archetype) return [];
    const archetypeLabel = translateStandardArchetype(archetype, translations.map);
    const builds = (Array.isArray(row?.decks) ? row.decks : []).flatMap((deck: any) => {
      const deckCode = String(deck?.deck_code ?? '').trim();
      if (!deckCode) return [];
      return [{
        deckCode,
        games: parseCount(deck?.games),
        winrate: parseNumber(deck?.win_rate),
        sourceUrl: String(deck?.url ?? ''),
        updatedAt: String(deck?.updated_at ?? '') || null,
        classKey: normalizeStandardMetaClass(deck?.class) ?? inferStandardMetaClass(archetype),
        sampleRank: String(deck?.sample_rank ?? 'all'),
        samplePeriod: String(deck?.sample_period ?? 'past_30_days'),
      }];
    }).sort((left: any, right: any) => (right.games ?? -1) - (left.games ?? -1));
    return [{
      slug: constructedArchetypeSlug(archetype),
      archetype,
      archetypeLabel,
      translated: archetypeLabel !== archetype,
      classKey: inferStandardMetaClass(archetype)
        ?? normalizeStandardMetaClass(builds[0]?.classKey),
      format,
      games: parseCount(row?.games) ?? 0,
      winrate: parseNumber(row?.winrate),
      popularity: parseNumber(row?.popularity_pct),
      turns: parseNumber(row?.avg_turns),
      durationMinutes: parseNumber(row?.avg_duration_minutes),
      climbingSpeed: parseNumber(row?.climbing_speed_stars_per_hour),
      deckCount: builds.length,
      builds,
      sourceUrl: String(row?.archetype_url ?? row?.source_url ?? ''),
    }];
  });
  const criteria = payload?.criteria && typeof payload.criteria === 'object' ? payload.criteria : {};
  const catalog: ConstructedArchetypeCatalog = {
    format,
    formatLabel: STANDARD_META_FORMAT_LABEL[format],
    patch: String(criteria.period ?? '').replace(/^patch_/, ''),
    minimumGames: parseCount(criteria.minimum_games) ?? 50,
    updatedAt: String(payload?.meta?.fetched_at ?? '') || null,
    coverage: payload?.coverage && typeof payload.coverage === 'object' ? payload.coverage : {},
    items,
  };
  constructedArchetypeCatalogCache.set(format, {
    data: catalog,
    etag: catalog.updatedAt ?? `hsguru-${format}`,
    expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
  });
  return catalog;
}

async function loadConstructedArchetypeHistory(
  format: ConstructedArchetypeFormat,
  archetype: string,
): Promise<ConstructedArchetypeHistoryPoint[]> {
  const cacheKey = `${format}:${archetype}`;
  const now = Date.now();
  const cached = constructedArchetypeHistoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data as ConstructedArchetypeHistoryPoint[];
  const query = new URLSearchParams({ format, archetype, limit: '180' });
  const payload = await fetchDataset(`v1/hsguru/archetypes/history?${query}`, 20_000);
  const points = (Array.isArray(payload?.data) ? payload.data : []).flatMap((row: any) => {
    const recordedAt = String(row?.recorded_at ?? '');
    if (!recordedAt || !Number.isFinite(Date.parse(recordedAt))) return [];
    return [{
      recordedAt,
      games: parseCount(row?.games) ?? 0,
      winrate: parseNumber(row?.winrate),
      popularity: parseNumber(row?.popularity_pct),
      turns: parseNumber(row?.avg_turns),
      durationMinutes: parseNumber(row?.avg_duration_minutes),
      climbingSpeed: parseNumber(row?.climbing_speed_stars_per_hour),
    }];
  });
  points.sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
  constructedArchetypeHistoryCache.set(cacheKey, {
    data: points,
    etag: points.at(-1)?.recordedAt ?? `hsguru-history-${format}`,
    expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
  });
  return points;
}

async function loadConstructedArchetypeAnalysis(
  format: ConstructedArchetypeFormat,
  archetype: string,
): Promise<ConstructedArchetypeAnalysis | null> {
  const cacheKey = `${format}:${archetype}`;
  const now = Date.now();
  const cached = constructedArchetypeAnalysisCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as ConstructedArchetypeAnalysis | null;
  }
  const query = new URLSearchParams({ format, archetype });
  const [payload, ruCards] = await Promise.all([
    fetchDataset(`v1/hsguru/archetypes/analysis?${query}`, 20_000),
    ensureRuCardsData(),
  ]);
  const row = payload?.data && typeof payload.data === 'object' ? payload.data : null;
  if (!row) return null;
  const classMatchups = (Array.isArray(row.class_matchups) ? row.class_matchups : []).flatMap((matchup: any) => {
    const classKey = normalizeStandardMetaClass(matchup?.class_key);
    const winrate = parseNumber(matchup?.winrate);
    const games = parseCount(matchup?.games);
    if (!classKey || winrate === null || games === null) return [];
    return [{
      classKey,
      classLabel: String(matchup?.class_label ?? ''),
      winrate,
      games,
      share: parseNumber(matchup?.share_pct),
    }];
  });
  const cardStats = (Array.isArray(row.card_stats) ? row.card_stats : []).flatMap((card: any) => {
    const cardId = String(card?.card_id ?? '').trim();
    const dbfId = parseCount(card?.dbf_id);
    const localizedCard = (cardId ? ruCards[cardId] : null)
      ?? (dbfId === null ? null : hearthstoneJsonRuCardsByDbf?.get(dbfId))
      ?? null;
    const cardName = String(localizedCard?.name ?? card?.card_name ?? '').trim();
    const mulliganCount = parseCount(card?.mulligan_count);
    if (!cardName || mulliganCount === null) return [];
    return [{
      cardId: cardId || null,
      dbfId,
      cardName,
      cost: parseCount(localizedCard?.mana),
      mulliganImpact: parseNumber(card?.mulligan_impact),
      mulliganCount,
      drawnImpact: parseNumber(card?.drawn_impact),
      drawnCount: parseCount(card?.drawn_count),
      keptImpact: parseNumber(card?.kept_impact),
      keptCount: parseCount(card?.kept_count),
    }];
  });
  const sourceUrls = row.source_urls && typeof row.source_urls === 'object'
    ? row.source_urls
    : {};
  const state = row.state === 'ok' || row.state === 'error' ? row.state : 'partial';
  const analysis: ConstructedArchetypeAnalysis = {
    rank: 'legend',
    period: 'past_week',
    state,
    updatedAt: String(row.updated_at ?? '') || null,
    matchupsUpdatedAt: String(row.matchups_updated_at ?? '') || null,
    cardStatsUpdatedAt: String(row.card_stats_updated_at ?? '') || null,
    sourceUrls: {
      matchups: String(sourceUrls.matchups ?? ''),
      cards: String(sourceUrls.cards ?? ''),
    },
    classMatchups,
    cardStats,
  };
  constructedArchetypeAnalysisCache.set(cacheKey, {
    data: analysis,
    etag: analysis.updatedAt ?? `hsguru-analysis-${cacheKey}`,
    expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
  });
  return analysis;
}

type ViciousGoldBuild = Omit<StandardMetaRecommendation, 'matchMethod'> & {
  matchedArchetype: string;
  matchMethod: 'exact' | 'alias';
};

type ViciousGoldBuildCollection = {
  builds: Array<{
    deck: string;
    build: (ViciousGoldBuild & { sourceLabel: string }) | null;
  }>;
  buildCoverage: { found: number; total: number };
};

function viciousPercent(value: unknown): number | null {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function viciousClassIcon(className: string): string {
  return className.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function viciousBuildSourceLabel(source: string): string {
  if (source === 'vicious_syndicate_radars') return 'Vicious Syndicate';
  if (source === 'vicious_syndicate_decks') return 'Vicious Syndicate';
  if (source === 'hsguru-decks' || source === 'hsguru_decks' || source === 'hsguru-archetypes') return 'HSGuru';
  if (source === 'hearthstone_decks') return 'Hearthstone Decks';
  if (source === 'metastats_decks') return 'MetaStats';
  return source.replace(/[-_]+/g, ' ');
}

async function fetchViciousConstructedDeckRows(): Promise<any[]> {
  const now = Date.now();
  if (standardMetaDeckRowsCache && standardMetaDeckRowsCache.expiresAt > now) {
    return standardMetaDeckRowsCache.rows;
  }
  const generation = parserDataCacheGeneration;
  const offsets = [0, 200, 400, 600];
  const pages = await Promise.all(offsets.map(async offset => {
    const response = await fetch(`${DATASET_API_ORIGIN}/v1/constructed/decks?limit=200&offset=${offset}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Constructed decks HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  }));
  const rows = pages.flat();
  if (generation === parserDataCacheGeneration) {
    standardMetaDeckRowsCache = { rows, expiresAt: now + STANDARD_META_RECOMMENDATION_CACHE_MS };
  }
  return rows;
}

function findViciousGoldBuild(
  rows: any[],
  deck: string,
  deckLabel: string,
): ViciousGoldBuild | null {
  const { matchedArchetype, matchMethod } = resolveViciousGoldArchetype(deck);
  const wanted = normalizeStandardArchetypeKey(matchedArchetype);
  const candidates = rows.filter(row => {
    if (normalizeStandardArchetypeKey(String(row?.archetype ?? '')) !== wanted) return false;
    const format = String(row?.format ?? '').trim().toLowerCase();
    if (format && format !== 'standard') return false;
    return /^[A-Za-z0-9+/=]{40,}$/.test(String(row?.deck_code ?? '').trim());
  }).sort((left, right) => {
    const quality = (row: any) => {
      const source = String(row?.source_id ?? '');
      const sourceScore = source === 'vicious_syndicate_radars' ? 300 : source === 'hearthstone_decks' ? 200 : 100;
      const formatScore = String(row?.format ?? '').toLowerCase() === 'standard' ? 50 : 0;
      const freshness = Date.parse(String(row?.updated_at ?? '')) / 1e12 || 0;
      return sourceScore + formatScore + freshness + (Number(row?.win_rate) || 0) / 100;
    };
    return quality(right) - quality(left);
  });
  const selected = candidates[0];
  if (!selected) return null;
  const source = String(selected.source_id ?? 'constructed-decks');
  const score = parseDeckScore(selected.score);
  const classKey = normalizeStandardMetaClass(selected.class) ?? inferStandardMetaClass(matchedArchetype);
  if (!classKey) return null;
  return {
    archetype: deck,
    archetypeLabel: deckLabel,
    deckCode: String(selected.deck_code).trim(),
    format: 'standard',
    rank: 'legend',
    source,
    sourceUrl: String(selected.url ?? ''),
    streamer: null,
    sampleGames: score.games,
    winrate: parseNumber(selected.win_rate ?? selected.winrate) ?? score.winrate,
    updatedAt: String(selected.updated_at ?? '').trim() || null,
    classKey,
    matchedArchetype,
    matchMethod,
  };
}

function findViciousGoldCatalogBuild(
  catalog: ConstructedArchetypeCatalog | null,
  deck: string,
  deckLabel: string,
): ViciousGoldBuild | null {
  if (!catalog) return null;
  const { matchedArchetype, matchMethod } = resolveViciousGoldArchetype(deck);
  const wanted = normalizeStandardArchetypeKey(matchedArchetype);
  const item = catalog.items.find(row => normalizeStandardArchetypeKey(row.archetype) === wanted);
  const selected = item?.builds[0];
  if (!item || !selected) return null;
  const classKey = selected.classKey ?? item.classKey ?? inferStandardMetaClass(matchedArchetype);
  if (!classKey) return null;
  return {
    archetype: deck,
    archetypeLabel: deckLabel,
    deckCode: selected.deckCode,
    format: 'standard',
    rank: 'legend',
    source: 'hsguru-archetypes',
    sourceUrl: selected.sourceUrl || item.sourceUrl,
    streamer: null,
    sampleGames: selected.games,
    winrate: selected.winrate,
    updatedAt: selected.updatedAt ?? catalog.updatedAt,
    classKey,
    matchedArchetype,
    matchMethod,
  };
}

function findSupplementalViciousBuild(
  deck: string,
  deckLabel: string,
): ViciousGoldBuild | null {
  const supplemental = findSupplementalViciousGoldBuild(deck);
  const classKey = inferStandardMetaClass(deck);
  if (!supplemental || !classKey) return null;
  return {
    archetype: deck,
    archetypeLabel: deckLabel,
    deckCode: supplemental.deckCode,
    format: 'standard',
    rank: 'legend',
    source: supplemental.source,
    sourceUrl: supplemental.sourceUrl,
    streamer: null,
    sampleGames: null,
    winrate: null,
    updatedAt: supplemental.updatedAt,
    classKey,
    matchedArchetype: supplemental.matchedArchetype,
    matchMethod: 'exact',
  };
}

function resolveViciousGoldBuild(
  catalog: ConstructedArchetypeCatalog | null,
  rows: any[],
  deck: string,
  deckLabel: string,
): ViciousGoldBuild | null {
  if (/^(?:Other|Bot)\s/i.test(deck)) return null;
  return findViciousGoldCatalogBuild(catalog, deck, deckLabel)
    ?? findViciousGoldBuild(rows, deck, deckLabel)
    ?? findSupplementalViciousBuild(deck, deckLabel);
}

const VICIOUS_RANK_RU: Record<string, string> = {
  'All ranks': 'Все ранги',
  Legend: 'Легенда',
  'Diamond 1-4': 'Алмаз 1–4',
  'Diamond 5-10': 'Алмаз 5–10',
  Platinum: 'Платина',
  'Gold Silver Bronze': 'Золото, Серебро, Бронза',
};

async function loadViciousSyndicateGold() {
  const now = Date.now();
  const cached = viciousSyndicateGoldApiCache.get('standard');
  if (cached && cached.expiresAt > now) return cached.data;

  const [payload, translations] = await Promise.all([
    fetchDataset(VICIOUS_SYNDICATE_LIVE_DATASET),
    getStandardArchetypeTranslations(now),
  ]);
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const rawClasses = Array.isArray(structured.class_distribution) ? structured.class_distribution : [];
  const rawDecks = Array.isArray(structured.deck_distribution) ? structured.deck_distribution : [];
  const rawTierList = Array.isArray(structured.tier_list) ? structured.tier_list : [];
  const classByDeck = new Map<string, string>(rawDecks.map((row: any) => [String(row?.deck ?? ''), String(row?.class ?? '')]));
  const translatedDeck = (deck: string) => translateStandardArchetype(deck, translations.map);
  const eligibleDecks = rawDecks.flatMap((row: any) => {
    const frequency = viciousPercent(row?.frequency);
    if (frequency === null || frequency < VICIOUS_GOLD_MIN_DECK_FREQUENCY) return [];
    const deck = String(row?.deck ?? '').trim();
    const className = String(row?.class ?? '').trim();
    if (!deck || !className) return [];
    return [{
      deck,
      deckLabel: translatedDeck(deck),
      class: className,
      classLabel: VICIOUS_CLASS_RU[className] ?? className,
      classIcon: viciousClassIcon(className),
      frequency,
    }];
  });
  const deckDistribution = eligibleDecks.map(row => ({ ...row, build: null }));
  const tierList = rawTierList.map((section: any) => {
    const rankBracket = String(section?.rank_bracket ?? '').trim();
    const decks = Array.isArray(section?.decks) ? section.decks : [];
    return {
      rankBracket,
      rankLabel: VICIOUS_RANK_RU[rankBracket] ?? rankBracket,
      decks: decks.flatMap((row: any) => {
        const deck = String(row?.deck ?? '').trim();
        const className = classByDeck.get(deck) ?? '';
        const winrate = viciousPercent(row?.winrate);
        if (!deck || !className || winrate === null) return [];
        return [{
          rank: Number(row?.rank) || 0,
          deck,
          deckLabel: translatedDeck(deck),
          class: className,
          classLabel: VICIOUS_CLASS_RU[className] ?? className,
          classIcon: viciousClassIcon(className),
          winrate,
          build: null,
        }];
      }),
    };
  });
  const data = {
    title: 'Vicious Syndicate Gold',
    format: String(structured.format ?? 'Standard'),
    games: Number(structured.games) || 0,
    source: 'Vicious Syndicate Live',
    sourceUrl: String(payload?.data?.url ?? payload?.url ?? 'https://www.vicioussyndicate.com/data-reaper-live/'),
    sourceId: VICIOUS_SYNDICATE_LIVE_DATASET,
    updatedAt: payload?.fetched_at ?? payload?.data?.fetched_at ?? null,
    minimumDeckFrequency: VICIOUS_GOLD_MIN_DECK_FREQUENCY,
    timeRanges: {
      distribution: structured.pie_time_range ?? null,
      tierLadder: structured.tier_ladder_time_range ?? null,
      tierMatchups: structured.tier_matchup_time_range ?? null,
    },
    classDistribution: rawClasses.flatMap((row: any) => {
      const className = String(row?.class ?? '').trim();
      const frequency = viciousPercent(row?.frequency);
      if (!className || frequency === null) return [];
      return [{
        class: className,
        classLabel: VICIOUS_CLASS_RU[className] ?? className,
        classIcon: viciousClassIcon(className),
        frequency,
      }];
    }),
    deckDistribution,
    tierList,
    buildCoverage: {
      found: 0,
      total: deckDistribution.filter((row: any) => !/^(?:Other|Bot)\s/i.test(row.deck)).length,
    },
  };
  viciousSyndicateGoldApiCache.set('standard', {
    data,
    etag: '',
    expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
  });
  return data;
}

async function loadViciousSyndicateGoldBuilds() {
  const now = Date.now();
  const cached = viciousSyndicateGoldBuildsApiCache.get('standard');
  if (cached && cached.expiresAt > now) return cached.data;
  if (viciousSyndicateGoldBuildsJob) return viciousSyndicateGoldBuildsJob;

  const generation = viciousSyndicateGoldBuildsGeneration;
  const job: Promise<ViciousGoldBuildCollection> = (async () => {
    const [summary, archetypeCatalog, constructedRows, cardCollection] = await Promise.all([
      loadViciousSyndicateGold(),
      loadConstructedArchetypeCatalog('standard').catch(() => null),
      fetchViciousConstructedDeckRows().catch(() => []),
      constructedCardDataService.loadCards('standard').catch(() => null),
    ]);
    const rows = Array.isArray(summary?.deckDistribution) ? summary.deckDistribution : [];
    const builds = rows.map((row: any) => {
      const deck = String(row?.deck ?? '').trim();
      const deckLabel = String(row?.deckLabel ?? deck).trim();
      if (!deck || /^(?:Other|Bot)\s/i.test(deck)) return { deck, build: null };
      const build = resolveViciousGoldBuild(archetypeCatalog, constructedRows, deck, deckLabel);
      const hydratedBuild = build
        ? {
            ...build,
            deckCards: cardCollection ? buildDeckCardData(build.deckCode, cardCollection.cards) : [],
          }
        : null;
      return {
        deck,
        build: hydratedBuild
          ? { ...hydratedBuild, sourceLabel: viciousBuildSourceLabel(hydratedBuild.source) }
          : null,
      };
    });
    const data = {
      builds,
      buildCoverage: {
        found: builds.filter(row => row.deck && row.build).length,
        total: builds.filter(row => row.deck && !/^(?:Other|Bot)\s/i.test(row.deck)).length,
      },
    };
    if (generation === viciousSyndicateGoldBuildsGeneration) {
      viciousSyndicateGoldBuildsApiCache.set('standard', {
        data,
        etag: '',
        expiresAt: Date.now() + STANDARD_META_RECOMMENDATION_CACHE_MS,
      });
    }
    return data;
  })().finally(() => {
    if (viciousSyndicateGoldBuildsJob === job) viciousSyndicateGoldBuildsJob = null;
  });
  viciousSyndicateGoldBuildsJob = job;
  return job;
}

type StandardMetaDeckCandidate = StandardMetaRecommendation & { quality: number; persisted?: boolean };

async function fetchHsguruStreamerDeckInfo(payload: any): Promise<Map<string, HsguruDeckInfo>> {
  const now = Date.now();
  if (standardMetaStreamerDeckInfoExpiresAt > now) return standardMetaStreamerDeckInfoCache;
  if (standardMetaStreamerDeckInfoJob) return standardMetaStreamerDeckInfoJob;
  const codes = hsguruStreamerDeckCodes(payload);
  if (!codes.length) return new Map();
  standardMetaStreamerDeckInfoJob = (async () => {
    const response = await fetch(HSGURU_DECK_INFO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)',
      },
      body: JSON.stringify({ decks: codes }),
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) throw new Error(`HSGuru deck-info HTTP ${response.status}`);
    const payloadByCode = await response.json() as Record<string, any>;
    standardMetaStreamerDeckInfoCache.clear();
    for (const code of codes) {
      const item = payloadByCode?.[code];
      const archetype = String(item?.archetype ?? '').trim();
      const name = String(item?.name ?? '').trim();
      if (archetype || name) standardMetaStreamerDeckInfoCache.set(code, { archetype, name });
    }
    standardMetaStreamerDeckInfoExpiresAt = Date.now() + STANDARD_META_RECOMMENDATION_CACHE_MS;
    return standardMetaStreamerDeckInfoCache;
  })().finally(() => {
    standardMetaStreamerDeckInfoJob = null;
  });
  return standardMetaStreamerDeckInfoJob;
}

function parseDeckScore(value: unknown): { games: number | null; winrate: number | null } {
  const raw = String(value ?? '').trim();
  const record = raw.match(/(\d+)\s*-\s*(\d+)/);
  if (record) {
    const wins = Number(record[1]);
    const losses = Number(record[2]);
    const games = wins + losses;
    return { games, winrate: games ? Math.round((wins / games) * 10_000) / 100 : null };
  }
  const games = raw.match(/([\d\s]+)\s*games?/i);
  return { games: parseCount(games?.[1]), winrate: null };
}

function standardMetaDeckQuality(candidate: Omit<StandardMetaDeckCandidate, 'quality'>): number {
  const sample = Math.min(2_000, candidate.sampleGames ?? 0);
  const winrate = candidate.winrate ?? 0;
  const freshness = candidate.updatedAt ? Date.parse(candidate.updatedAt) / 1e12 : 0;
  const sourceBonus = candidate.source === 'hsguru-decks' ? 50 : candidate.source === 'hsguru-streamer' ? 35 : 20;
  return sample * 10 + winrate + freshness + sourceBonus;
}

function parseHsguruStreamerDecks(
  payload: any,
  archetype: string,
  archetypeLabel: string,
  format: StandardMetaFormat,
  rank: StandardMetaRank,
  deckInfo: Map<string, HsguruDeckInfo> = new Map(),
): StandardMetaDeckCandidate[] {
  const rows = hsguruStreamerRows(payload);
  const wanted = normalizeStandardArchetypeKey(archetype);
  return rows.flatMap((row: unknown) => {
    if (!Array.isArray(row)) return [];
    const deckCell = String(row[0] ?? '').trim();
    const match = deckCell.match(/^###\s+(.+?)\s+([A-Za-z0-9+/=]{40,})\s+#/);
    if (!match) return [];
    const canonicalArchetype = hsguruStreamerArchetype(match[2], match[1], deckInfo);
    if (normalizeStandardArchetypeKey(canonicalArchetype) !== wanted) return [];
    const rowFormat = String(row[2] ?? '').trim().toLowerCase();
    if (rowFormat !== format) return [];
    const score = parseDeckScore(row[6]);
    const classKey = inferStandardMetaClass(archetype);
    if (!classKey) return [];
    const base: Omit<StandardMetaDeckCandidate, 'quality'> = {
      archetype,
      archetypeLabel,
      deckCode: match[2],
      format,
      rank,
      source: 'hsguru-streamer',
      sourceUrl: payload?.data?.url ?? payload?.url ?? '',
      streamer: String(row[1] ?? '').trim() || null,
      sampleGames: score.games,
      winrate: score.winrate,
      updatedAt: String(row[8] ?? '').trim() || payload?.fetched_at || null,
      classKey,
      matchedArchetype: canonicalArchetype,
      matchMethod: 'exact',
    };
    return [{ ...base, quality: standardMetaDeckQuality(base) }];
  });
}

function parseConstructedDecks(
  payload: any,
  archetype: string,
  archetypeLabel: string,
  format: StandardMetaFormat,
  rank: StandardMetaRank,
): StandardMetaDeckCandidate[] {
  const wanted = normalizeStandardArchetypeKey(archetype);
  const wantedClass = inferStandardMetaClass(archetype);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.flatMap((row: any) => {
    const matchedArchetype = String(row?.archetype ?? '').trim();
    const rowClass = normalizeStandardMetaClass(row?.class) ?? inferStandardMetaClass(matchedArchetype);
    const isExact = normalizeStandardArchetypeKey(matchedArchetype) === wanted;
    if (!isExact) return [];
    const rowFormat = String(row?.format ?? '').trim().toLowerCase();
    if (format === 'wild' && rowFormat !== 'wild') return [];
    if (format === 'standard' && rowFormat && rowFormat !== 'standard') return [];
    const deckCode = String(row?.deck_code ?? '').trim();
    if (!/^[A-Za-z0-9+/=]{40,}$/.test(deckCode)) return [];
    const score = parseDeckScore(row?.score);
    const directWinrate = parseNumber(row?.win_rate ?? row?.winrate);
    const classKey = wantedClass ?? rowClass;
    if (!classKey) return [];
    const base: Omit<StandardMetaDeckCandidate, 'quality'> = {
      archetype,
      archetypeLabel,
      deckCode,
      format,
      rank,
      source: String(row?.source_id ?? 'constructed-decks'),
      sourceUrl: String(row?.url ?? ''),
      streamer: null,
      sampleGames: score.games,
      winrate: directWinrate ?? score.winrate,
      updatedAt: String(row?.updated_at ?? payload?.meta?.fetched_at ?? '').trim() || null,
      classKey,
      matchedArchetype,
      matchMethod: 'exact',
    };
    return [{ ...base, quality: standardMetaDeckQuality(base) }];
  });
}

const STANDARD_META_HSGURU_RANK: Record<StandardMetaRank, string> = {
  all: 'all',
  legend: 'legend',
  diamond: 'diamond_4to1',
  diamond_legend: 'all',
  top_5k: 'top_5k',
  top_legend: 'top_legend',
};

async function fetchExactHsguruDecks(
  archetype: string,
  archetypeLabel: string,
  format: StandardMetaFormat,
  rank: StandardMetaRank,
): Promise<StandardMetaDeckCandidate[]> {
  const query = new URLSearchParams({
    archetype,
    format_name: format,
    rank: STANDARD_META_HSGURU_RANK[rank],
  });
  const response = await fetch(`${DATASET_API_ORIGIN}/v1/constructed/hsguru-deck?${query}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Exact HSGuru deck HTTP ${response.status}`);
  const payload = await response.json();
  const wanted = normalizeStandardArchetypeKey(archetype);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.flatMap((row: any) => {
    const matchedArchetype = String(row?.archetype ?? '').trim();
    if (normalizeStandardArchetypeKey(matchedArchetype) !== wanted) return [];
    const deckCode = String(row?.deck_code ?? '').trim();
    if (!/^[A-Za-z0-9+/=]{40,}$/.test(deckCode)) return [];
    const classKey = normalizeStandardMetaClass(row?.class) ?? inferStandardMetaClass(archetype);
    if (!classKey) return [];
    const sampleGames = parseCount(row?.games) ?? parseDeckScore(row?.score).games;
    const base: Omit<StandardMetaDeckCandidate, 'quality'> = {
      archetype,
      archetypeLabel,
      deckCode,
      format,
      rank,
      source: 'hsguru-decks',
      sourceUrl: String(row?.url ?? ''),
      streamer: null,
      sampleGames,
      winrate: parseNumber(row?.win_rate ?? row?.winrate),
      updatedAt: String(row?.updated_at ?? payload?.meta?.fetched_at ?? '').trim() || null,
      classKey,
      matchedArchetype,
      matchMethod: 'exact',
    };
    return [{ ...base, quality: standardMetaDeckQuality(base) }];
  });
}

const archetypeDeckCodeJobs = new Map<string, Promise<string | null>>();

function readCachedArchetypeDeckCode(nameEn: string): string | null {
  const row = dbGet<{ deck_code: string }>(
    'SELECT deck_code FROM archetype_deck_codes WHERE name_en_key = ?',
    normalizeStandardArchetypeKey(nameEn),
  );
  const deckCode = String(row?.deck_code ?? '').trim();
  return /^[A-Za-z0-9+/=]{40,}$/.test(deckCode) ? deckCode : null;
}

function readPersistedStandardMetaDeck(
  archetype: string,
  archetypeLabel: string,
  format: StandardMetaFormat,
  rank: StandardMetaRank,
): StandardMetaDeckCandidate | null {
  const cutoff = new Date(Date.now() - STANDARD_META_PERSISTED_RECOMMENDATION_MAX_AGE_MS).toISOString();
  const row = dbGet<{ deck_code: string; source: string; updated_at: string }>(`
    SELECT deck_code, source, updated_at
    FROM archetype_deck_codes
    WHERE name_en_key = ? AND format = ? AND updated_at >= ?
  `, normalizeStandardArchetypeKey(archetype), format, cutoff);
  const deckCode = String(row?.deck_code ?? '').trim();
  const classKey = inferStandardMetaClass(archetype);
  if (!/^[A-Za-z0-9+/=]{40,}$/.test(deckCode) || !classKey) return null;
  const base: Omit<StandardMetaDeckCandidate, 'quality' | 'persisted'> = {
    archetype,
    archetypeLabel,
    deckCode,
    format,
    rank,
    source: String(row?.source ?? 'hsguru-decks'),
    sourceUrl: '',
    streamer: null,
    sampleGames: null,
    winrate: null,
    updatedAt: String(row?.updated_at ?? '') || null,
    classKey,
    matchedArchetype: archetype,
    matchMethod: 'exact',
  };
  return { ...base, quality: standardMetaDeckQuality(base), persisted: true };
}

function persistArchetypeDeckCode(
  nameEn: string,
  deck: Pick<StandardMetaDeckCandidate, 'deckCode' | 'format' | 'rank' | 'source'>,
) {
  dbRun(`
    INSERT INTO archetype_deck_codes (
      name_en_key, name_en, deck_code, format, rank_key, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name_en_key) DO UPDATE SET
      name_en = excluded.name_en,
      deck_code = excluded.deck_code,
      format = excluded.format,
      rank_key = excluded.rank_key,
      source = excluded.source,
      updated_at = excluded.updated_at
  `,
  normalizeStandardArchetypeKey(nameEn),
  nameEn,
  deck.deckCode,
  deck.format,
  deck.rank,
  deck.source,
  new Date().toISOString());
}

async function resolveExactArchetypeDeckCode(
  nameEn: string,
  contexts: Array<{ format: StandardMetaFormat; rank: StandardMetaRank }>,
): Promise<string | null> {
  const cached = readCachedArchetypeDeckCode(nameEn);
  if (cached) return cached;
  const key = normalizeStandardArchetypeKey(nameEn);
  const active = archetypeDeckCodeJobs.get(key);
  if (active) return active;
  const job = (async () => {
    const uniqueContexts = new Map<string, { format: StandardMetaFormat; rank: StandardMetaRank }>();
    for (const context of contexts) uniqueContexts.set(`${context.format}:${context.rank}`, context);
    // The observed HSGuru slices are authoritative. A legend fallback for each
    // format also covers names that only surface in the matchup matrix.
    for (const format of ['standard', 'wild'] as const) {
      uniqueContexts.set(`${format}:legend`, { format, rank: 'legend' });
    }
    for (const context of uniqueContexts.values()) {
      const decks = await fetchExactHsguruDecks(nameEn, nameEn, context.format, context.rank).catch(() => []);
      const exact = decks.sort((left, right) => right.quality - left.quality)[0];
      if (!exact) continue;
      persistArchetypeDeckCode(nameEn, exact);
      return exact.deckCode;
    }
    return null;
  })().finally(() => {
    archetypeDeckCodeJobs.delete(key);
  });
  archetypeDeckCodeJobs.set(key, job);
  return job;
}

async function resolveUntranslatedArchetypeDeckCodes(
  items: UntranslatedArchetype[],
  observed: ObservedArchetype[],
): Promise<UntranslatedArchetype[]> {
  const contextsByName = new Map<string, Array<{ format: StandardMetaFormat; rank: StandardMetaRank }>>();
  for (const item of observed) {
    if (!item.format || !item.rankKey) continue;
    if (!STANDARD_META_SUPPORTED_RANKS.has(item.rankKey as StandardMetaRank)) continue;
    const key = normalizeStandardArchetypeKey(item.nameEn);
    const contexts = contextsByName.get(key) ?? [];
    contexts.push({ format: item.format, rank: item.rankKey as StandardMetaRank });
    contextsByName.set(key, contexts);
  }
  const result = [...items];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(5, result.length) }, async () => {
    while (cursor < result.length) {
      const index = cursor;
      cursor += 1;
      const item = result[index];
      if (item.deckCode) {
        const contexts = contextsByName.get(normalizeStandardArchetypeKey(item.nameEn)) ?? [];
        const context = contexts[0] ?? { format: 'standard' as const, rank: 'legend' as const };
        persistArchetypeDeckCode(item.nameEn, {
          deckCode: item.deckCode,
          format: context.format,
          rank: context.rank,
          source: 'constructed-decks',
        });
        continue;
      }
      const deckCode = await resolveExactArchetypeDeckCode(
        item.nameEn,
        contextsByName.get(normalizeStandardArchetypeKey(item.nameEn)) ?? [],
      );
      if (deckCode) result[index] = { ...item, deckCode };
    }
  });
  await Promise.all(workers);
  return result;
}

async function findStandardMetaRecommendation(
  archetype: string,
  archetypeLabel: string,
  format: StandardMetaFormat,
  rank: StandardMetaRank,
): Promise<StandardMetaRecommendation | null> {
  const cacheKey = `${format}:${rank}:${normalizeStandardArchetypeKey(archetype)}`;
  const now = Date.now();
  const cached = standardMetaRecommendationCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;
  const active = standardMetaRecommendationJobs.get(cacheKey);
  if (active) return active;
  const generation = parserDataCacheGeneration;
  const job = (async () => {
    // Prefer the locally indexed exact decks. They respond in ~100 ms and avoid a
    // live HSGuru scrape on every cold modal open. The live endpoint is a fallback
    // only when the indexed sources contain no exact list for this archetype.
    const [constructedRows, streamerPayload] = await Promise.all([
      fetchViciousConstructedDeckRows().catch(() => []),
      fetchDataset(HSGURU_STREAMER_DECKS_DATASET).catch(() => ({ data: { tables: [] } })),
    ]);
    const persisted = readPersistedStandardMetaDeck(archetype, archetypeLabel, format, rank);
    let candidates = [
      ...(persisted ? [persisted] : []),
      ...parseHsguruStreamerDecks(streamerPayload, archetype, archetypeLabel, format, rank),
      ...parseConstructedDecks({ data: constructedRows }, archetype, archetypeLabel, format, rank),
    ];
    if (!candidates.length) {
      // HSGuru/D0nkey canonicalizes build titles such as “XL Rafaamlock” to
      // their aggregate archetype in one small batch request. This reuses the
      // already fetched streamer deck codes and does not consume Firecrawl.
      const streamerDeckInfo = await fetchHsguruStreamerDeckInfo(streamerPayload).catch(() => new Map());
      candidates = parseHsguruStreamerDecks(streamerPayload, archetype, archetypeLabel, format, rank, streamerDeckInfo);
    }
    if (!candidates.length) {
      // A transient live-lookup failure is not evidence that a deck does not
      // exist. Let the route return 502 so the client can retry instead of
      // caching a false 404 for fifteen minutes.
      candidates = await fetchExactHsguruDecks(archetype, archetypeLabel, format, rank);
    }
    candidates.sort((left, right) => right.quality - left.quality);
    const chosen = candidates[0] ?? null;
    if (chosen && !chosen.persisted) persistArchetypeDeckCode(archetype, chosen);
    const rawSelected = chosen
      ? (({ quality: _quality, persisted: _persisted, ...recommendation }) => recommendation)(chosen)
      : null;
    const selected = rawSelected ? await hydrateRecommendationDeckCards(rawSelected) : null;
    if (generation === parserDataCacheGeneration) {
      cacheSuccessfulRecommendation(
        standardMetaRecommendationCache,
        cacheKey,
        selected,
        Date.now() + STANDARD_META_RECOMMENDATION_CACHE_MS,
      );
    }
    return selected;
  })().finally(() => {
    if (standardMetaRecommendationJobs.get(cacheKey) === job) standardMetaRecommendationJobs.delete(cacheKey);
  });
  standardMetaRecommendationJobs.set(cacheKey, job);
  return job;
}

async function fetchStandardMetaPreview(hash: string): Promise<StandardMetaPreview> {
  const now = Date.now();
  for (const cached of standardMetaPreviewCache.values()) {
    if (cached.expiresAt > now && cached.preview.hash === hash
      && isTrustedDeckviewPreview(cached.preview, DECKVIEW_RENDER.publicBaseUrl)) {
      return cached.preview;
    }
  }
  throw new Error('DECKVIEW_PREVIEW_NOT_FOUND');
}

async function createStandardMetaPreview(
  recommendation: { deckCode: string; archetypeLabel: string },
  options: { refresh?: boolean } = {},
): Promise<StandardMetaPreview> {
  const cacheKey = deckviewPreviewCacheKey(DECKVIEW_RENDER.revision, recommendation);
  const cached = standardMetaPreviewCache.get(cacheKey);
  const cachedAction = cached ? standardMetaPreviewCacheAction(
    cached.expiresAt > Date.now()
      && isTrustedDeckviewPreview(cached.preview, DECKVIEW_RENDER.publicBaseUrl),
    options.refresh === true,
  ) : null;
  if (cached && cachedAction === 'reuse') return cached.preview;
  if (cachedAction === 'evict') {
    // A preview generated by the retired KolodaHS flow must never leak back into
    // the DeckView-only interface after a restart.
    standardMetaPreviewCache.delete(cacheKey);
    persistStandardMetaPreviewCache();
  }
  const active = standardMetaPreviewJobs.get(cacheKey);
  if (active) return active;
  const job = (async () => {
    deckviewPreviewActive += 1;
    let preview: StandardMetaPreview;
    try {
      preview = await renderDeckviewPreview({
        deckCode: recommendation.deckCode,
        deckName: recommendation.archetypeLabel,
        hash: cacheKey,
      }, {
        apiBaseUrl: DECKVIEW_RENDER.apiBaseUrl,
        publicBaseUrl: DECKVIEW_RENDER.publicBaseUrl,
        apiKey: DECKVIEW_RENDER.apiKey,
        timeoutMs: DECKVIEW_RENDER.timeoutMs,
        pollIntervalMs: DECKVIEW_RENDER.pollIntervalMs,
      });
      deckviewPreviewSucceeded += 1;
    } catch (error) {
      deckviewPreviewFailed += 1;
      throw error;
    } finally {
      deckviewPreviewActive = Math.max(0, deckviewPreviewActive - 1);
    }
    standardMetaPreviewCache.set(cacheKey, { preview, expiresAt: Date.now() + STANDARD_META_PREVIEW_CACHE_MS });
    persistStandardMetaPreviewCache();
    return preview;
  })().finally(() => {
    standardMetaPreviewJobs.delete(cacheKey);
  });
  standardMetaPreviewJobs.set(cacheKey, job);
  return job;
}

function makeExternalEtag(prefix: string, source: string, data: any, now: number): string {
  const rawUpdatedAt = data?.updatedAt;
  const updatedMs = rawUpdatedAt ? Date.parse(rawUpdatedAt) : NaN;
  const token = Number.isFinite(updatedMs) ? updatedMs.toString(36) : now.toString(36);
  const count = data?.sections?.reduce?.((sum: number, section: any) => sum + (section?.totalCards ?? 0), 0)
    ?? data?.groups?.length
    ?? 0;
  const metadataToken = prefix === 'tierlist' ? `-${tierlistEarlyStatsEtagToken(data)}` : '';
  return `"${prefix}-${source}-${token}-${count}${metadataToken}"`;
}

const app = express();
configureLoopbackProxyTrust(app);
app.disable('x-powered-by');
app.set('etag', false);
const httpMetrics = new HttpMetrics();
app.use(requestLoggingMiddleware(undefined, httpMetrics));
app.use((_req, _res, next) => {
  observeSnapshotPublication();
  next();
});

ensureAdminUploadDirs();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST;

app.use(compression({ level: 6, threshold: 1024 }));
app.use('/uploads/admin', express.static(ADMIN_UPLOAD_DIR, {
  immutable: true,
  maxAge: '30d',
}));

app.use((req, res, next) => {
  if (!APP_SECURITY_HEADERS_ENABLED) return next();
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol);
  if (proto.includes('https')) res.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// Media-heavy pages use a separate limiter so images cannot exhaust the data
// API budget, while still bounding uncached proxy traffic per client.
const publicMediaLimiter = rateLimit({
  windowMs: 60_000,
  max: 1_200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов ресурсов. Попробуйте через минуту.' },
  skip: req => req.ip === '127.0.0.1' || req.ip === '::1',
});
app.use('/api/public-resource/', publicMediaLimiter);
app.use('/api/article-cover', publicMediaLimiter);

// Rate limiting: max 120 req/min per IP for data API
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте через минуту.' },
  skip: (req) => (
    req.path.startsWith('/card-image/')
    || isPublicMediaApiRequest(req.method, req.path)
    || (req.method === 'GET' && req.originalUrl.startsWith('/api/gallery/'))
    || req.ip === '127.0.0.1'
    || req.ip === '::1'
  ),
});
app.use('/api/', apiLimiter);

const authCodeRequestLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitEmailKey,
  message: { error: 'Слишком много запросов кода. Попробуйте позже.' },
});

const authCodeVerifyLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitEmailKey,
  message: { error: 'Слишком много попыток проверки кода. Попробуйте позже.' },
});

const authPasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitEmailKey,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
});

const scrapeLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запусков обновления данных. Попробуйте позже.' },
});

const newsletterSendLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: newsletterAdminRateLimitKey,
  message: { error: 'Слишком много запусков рассылки. Попробуйте позже.' },
});

const newsletterTestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: newsletterAdminRateLimitKey,
  message: { error: 'Слишком много тестовых писем. Попробуйте позже.' },
});

// CORS for same-origin production and local Vite dev server
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '');
  if (origin) {
    try {
      if (corsOriginAllowed(origin, APP_URL, process.env.NODE_ENV !== 'production')) {
        res.header('Access-Control-Allow-Origin', origin); // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration -- origin passed the explicit production/dev allowlist
        res.header('Vary', 'Origin');
      }
    } catch {
      // Invalid Origin headers are ignored and handled as non-CORS requests.
    }
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-CSRF-Request');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/', (req, res, next) => {
  if (cookieMutationCsrfAllowed(req)) return next();
  return res.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
});

app.use(createUploadAuthorizationGuard({
  galleryAccessStatus: req => {
    const user = userAuth(req);
    if (!user) return 401;
    return isAdminUser(user) ? null : 403;
  },
  adminImageAllowed: req => Boolean(adminAuth(req) || contestAdminAuth(req)),
  setPrivateNoStore,
}));
app.use(createRouteAwareJsonParser({
  defaultLimit: process.env.API_JSON_BODY_LIMIT || '1mb',
  adminUploadMaxBytes: ADMIN_UPLOAD_MAX_BYTES,
  galleryUploadMaxBytes: GALLERY_UPLOAD_MAX_BYTES,
}));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

const cardImageRouterDependencies = createCardImageDependencies({
  cacheDir: CARD_IMAGE_CACHE_DIR,
  ensureCardImage,
  ensureCardTile,
  immutableCacheHeader: BG_IMAGE_CACHE_CONTROL,
  onError: (scope, error) => console.error(
    `[api/card-image] ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
});

const applicationAuth = registerApplicationAuth({ app, getDatabase: db, appUrl: APP_URL, userAuth, resolveUser: userId => loadAuthStore().users.find(user => user.id === userId && !user.blockedAt) ?? null, serializeUser: user => serializeApplicationProfileUser(user, APP_URL), readSubscription: userId => serializeApplicationSubscription(readSubscriptionStatus(userId) ?? emptySubscriptionStatus()), emptySubscription: () => serializeApplicationSubscription(emptySubscriptionStatus()), setPrivateNoStore });
registerPublicApi({ app, getDatabase: db, adminAuth, adminId: admin => admin.id, setPrivateNoStore, recordAudit: recordAdminAudit, cardImageDependencies: cardImageRouterDependencies, accessTokens: applicationAuth, publicOrigin: APP_URL, ...createPublicApiCardSources(() => constructedCardDataService), metaStatistics: { loadMeta: loadStandardMeta, loadCatalog: loadConstructedArchetypeCatalog, loadHistory: loadConstructedArchetypeHistory, loadAnalysis: loadConstructedArchetypeAnalysis }, deckStatistics: { loadCatalog: loadConstructedArchetypeCatalog }, arenaStatistics: { loadClasses: source => source === 'firestone' ? fetchFirestoneClassWinratesData() : fetchFreshestClassWinratesData(), loadCards: source => getTierlistApiData(source, Date.now()).then(result => result.data), loadLegendaries: source => getLegendariesApiData(source, Date.now()).then(result => result.data), loadMatchups: source => source === 'firestone' ? fetchFirestoneClassWinratesData().then(firestoneArenaMatchupsDataset) : fetchClassMatchupsData() } });
app.use('/_internal', createTierlistCacheBustRouter({
  resolveSource: source => Object.prototype.hasOwnProperty.call(TIERLIST_DATASET_BY_SOURCE, source ?? '')
    ? source as keyof typeof TIERLIST_DATASET_BY_SOURCE
    : null,
  getData: (source, now, bypassCache) => getTierlistApiData(
    source as keyof typeof TIERLIST_DATASET_BY_SOURCE,
    now,
    bypassCache,
  ),
  onError: (source, error) => console.error(
    `[internal/tierlist/cache-bust] ${source} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));

// 6 h cache (aligns with scrape schedule) — stale-while-revalidate keeps UX snappy
const CACHE_6H  = 'public, max-age=21600, stale-while-revalidate=3600';
const CACHE_1H  = 'public, max-age=3600,  stale-while-revalidate=600';
const CACHE_5M  = 'public, max-age=300, stale-while-revalidate=300';
const CACHE_TIERLIST = 'public, max-age=300, stale-while-revalidate=300';
const CACHE_TIERLIST_PROVISIONAL = 'public, max-age=300, stale-while-revalidate=300';
const CACHE_TIERLIST_STALE = 'public, max-age=300, stale-while-revalidate=600';
const ARTICLE_COVER_ALLOWED_HOSTS = new Set([
  'hs-manacost.ru',
  'www.hs-manacost.ru',
  'kolodahearthstone.com',
  'www.kolodahearthstone.com',
  'kolodahearthstone.ru',
  'www.kolodahearthstone.ru',
]);
const ARTICLE_COVER_MAX_BYTES = 8 * 1024 * 1024;
const APP_SECURITY_HEADERS_ENABLED = process.env.APP_SECURITY_HEADERS === '1';

// ─── ETag helper ──────────────────────────────────────────────────────────────
function responseCacheHeader(res: express.Response, cacheHeader: string): string {
  if (!res.locals.subscriptionGuarded) return cacheHeader;
  return cacheHeader.replace(/^public\b/i, 'private');
}

function setPrivateNoStore(res: express.Response) {
  res.set('Cache-Control', 'no-store');
  res.vary('Cookie');
  res.vary('Authorization');
}

function sendCached(req: express.Request, res: express.Response, entry: CacheEntry, cacheHeader: string) {
  res.set('Cache-Control', responseCacheHeader(res, cacheHeader));
  res.set('ETag', entry.etag);
  if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
  res.json(entry.data);
}

function sendJsonCached(req: express.Request, res: express.Response, data: any, etag: string, cacheHeader: string, cacheSource?: string) {
  res.set('Cache-Control', responseCacheHeader(res, cacheHeader));
  res.set('ETag', etag);
  if (cacheSource) res.set('X-Data-Cache', cacheSource);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.json(data);
}

function oldGuidesDatabase(): DatabaseSync {
  if (oldGuidesDb) return oldGuidesDb;
  oldGuidesDb = new DatabaseSync(OLD_GUIDES_DB_FILE, { readOnly: true });
  return oldGuidesDb;
}

app.use('/api', createHomeSummaryRouter({
  cache: homeSummaryApiCache,
  redisKey: redisDataKey('home-summary-v2'),
  redisGet: redisGetCache,
  redisSet: redisSetCache,
  buildSummary: buildHomeSummary,
  makeEtag: makeHomeSummaryEtag,
  memoryTtlMs: HOME_SUMMARY_CACHE_MS,
  redisTtlSeconds: REDIS_HOME_SUMMARY_TTL_SECONDS,
  cacheHeader: CACHE_5M,
  onError: (scope, error) => console.error(
    `[api/home/summary] ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createCardImageRouter(cardImageRouterDependencies));

app.use('/api', createWinrateRouter({
  accessGuard: requireArenaAccess,
  cache: winratesApiCache,
  redisKey: source => redisDataKey('winrates', source),
  redisGet: redisGetCache,
  redisSet: redisSetCache,
  fetchSource: source => source === 'firestone'
    ? fetchFirestoneClassWinratesData()
    : fetchClassWinratesData(),
  loadSnapshot: () => loadDataCached('winrates.json'),
  memoryTtlMs: CLASS_WINRATES_CACHE_MS,
  redisTtlSeconds: REDIS_DATASET_TTL_SECONDS,
  cacheHeader: CACHE_5M,
  onError: (scope, source, error) => console.error(
    `[api/winrates] ${source} ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createClassMatchupRouter({
  accessGuard: requireArenaAccess,
  cache: classMatchupsCache,
  redisKey: redisDataKey('class-matchups'),
  redisGet: redisGetCache,
  redisSet: redisSetCache,
  fetchMatchups: fetchClassMatchupsData,
  memoryTtlMs: CLASS_MATCHUPS_CACHE_MS,
  redisTtlSeconds: REDIS_DATASET_TTL_SECONDS,
  cacheHeader: CACHE_1H,
  onError: (scope, error) => console.error(
    `[class-matchups] ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createStandardMatchupRouter({
  accessGuard: requireStandardAccess,
  memoryCache: standardMatchupsApiCache,
  redisKey: format => redisDataKey('standard-matchups', format),
  redisGet: redisGetCache,
  redisSet: redisSetCache,
  fetchPayload: format => fetchDataset(STANDARD_MATCHUPS_DATASET_BY_FORMAT[format]),
  getTranslations: getStandardArchetypeTranslations,
  transform: transformHsguruMatchups,
  memoryTtlMs: EXTERNAL_DATASET_CACHE_MS,
  redisTtlSeconds: REDIS_DATASET_TTL_SECONDS,
  cacheHeader: CACHE_1H,
  onError: (scope, error) => console.error(
    `[standard-matchups] ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));

const constructedCardDataService = createConstructedCardDataService({
  // Card-detail HTML is proxied with a 30-second nginx deadline. Each
  // sequential catalog stage therefore fails closed before the edge timeout
  // instead of leaving a detached upstream request running indefinitely.
  fetchJson: url => fetchConstructedCardJson(url, 8_000),
  catalogBaseUrl: KOLODAHS_API_BASE_URL,
  statsDatasetByFormat: CONSTRUCTED_CARDS_DATASET_BY_FORMAT,
  statsBaseUrl: `${DATASET_API_ORIGIN}/demo/view`,
  patchesUrl: `${DATASET_API_ORIGIN}/api/patches?limit=500`,
  constructedDecksUrl: `${DATASET_API_ORIGIN}/v1/constructed/decks`,
  getArchetypeTranslations: () => getStandardArchetypeTranslations().then(result => result.map),
  stateDirectory: DATA_DIR,
  cacheTtlMs: EXTERNAL_DATASET_CACHE_MS,
  onHistoryError: error => console.error(
    '[constructed-cards] history snapshot failed:',
    error instanceof Error ? error.message : error,
  ),
});
void Promise.allSettled([
  constructedCardDataService.loadCards('standard'),
  constructedCardDataService.loadCards('wild'),
]).then(results => {
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.warn(
        `[constructed-cards] ${index === 0 ? 'standard' : 'wild'} prewarm failed:`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  }
});
const constructedCardFrontendShell = join(APP_ROOT_DIR, 'dist', 'index.html');
const constructedCardFrontendAssets = existsSync(constructedCardFrontendShell)
  ? extractConstructedCardFrontendAssets(readFileSync(constructedCardFrontendShell, 'utf8'))
  : '';

const staticSitemapCandidates = [
  join(APP_ROOT_DIR, 'dist', 'sitemaps', 'static.xml'),
  join(process.cwd(), 'dist', 'sitemaps', 'static.xml'),
];
const staticSitemapArtifact = loadStaticSitemapArtifact(staticSitemapCandidates, {
  required: process.env.NODE_ENV === 'production' || RELEASE_SHA !== 'development',
  onMissing: message => console.warn(`[entity-sitemap] ${message}; development server will continue without sitemap routes`),
});
if (staticSitemapArtifact) {
  app.use(createEntitySitemapRouter({
    ...createEntitySitemapRuntimeOptions(constructedCardDataService.loadCards, process.env),
    staticUrls: staticSitemapArtifact.urls,
    staticLastModifiedMs: staticSitemapArtifact.modifiedAt,
    stateDirectory: DATA_DIR,
    cacheTtlMs: Number(process.env.SITEMAP_CACHE_TTL_MS || 10 * 60_000),
    onError: error => console.error(
      '[entity-sitemap] catalog refresh failed:',
      error instanceof Error ? error.message : error,
    ),
  }));
}

app.use(createConstructedCardSeoRouter({
  loadCards: constructedCardDataService.loadCards,
  loadCardDetail: constructedCardDataService.loadCardDetail,
  frontendAssets: constructedCardFrontendAssets,
  onError: error => console.error(
    '[constructed-card-seo] catalog failed:',
    error instanceof Error ? error.message : error,
  ),
}));

app.use(createBattlegroundHeroSeoRouter({
  frontendAssets: constructedCardFrontendAssets,
  onError: error => console.error(
    '[battleground-hero-seo] catalog failed:',
    error instanceof Error ? error.message : error,
  ),
}));

app.use(createBattlegroundLibrarySeoRouter({
  frontendAssets: constructedCardFrontendAssets,
  onError: error => console.error(
    '[battleground-library-seo] catalog failed:',
    error instanceof Error ? error.message : error,
  ),
}));

async function hydrateRecommendationDeckCards<T extends StandardMetaRecommendation>(recommendation: T): Promise<T> {
  try {
    const collection = await constructedCardDataService.loadCards(recommendation.format);
    return { ...recommendation, deckCards: buildDeckCardData(recommendation.deckCode, collection.cards) };
  } catch (error) {
    console.warn('[deck-cards] catalog hydration unavailable:', error instanceof Error ? error.message : error);
    return { ...recommendation, deckCards: [] };
  }
}

app.use('/api', createConstructedCardRouter({
  adminGuard: adminIdGuard,
  canAccessStats: request => requestHasEntitlementAccess(request, 'standard'),
  ...constructedCardDataService,
  getMechanicTranslations: () => loadConstructedMechanicTranslationMap(db()),
  getMechanicTranslationOverrides: () => loadConstructedMechanicOverrideMap(db()),
  createDeckPreview: (deck: ConstructedCardDeck) => createStandardMetaPreview({
    deckCode: deck.deckCode,
    archetypeLabel: deck.archetypeLabel || deck.archetype || deck.title,
  }),
  setPrivateNoStore,
  onError: (scope, error) => console.error(
    `[constructed-cards] ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));
app.use('/api', createDeckRenderRouter({ renderDeck: async (deckCode, deckName, refresh) => (
  createStandardMetaPreview({ deckCode, archetypeLabel: deckName }, { refresh })
) }));

app.use('/api', createGlobalSearchRouter({
  loadArticles: () => loadDataCached('articles.json'),
  loadCards: constructedCardDataService.loadCards,
  getArticleMode: article => articleMode(article),
  isVipArticleUrl: isKhaVipArticleUrl,
  cacheHeader: 'public, max-age=60, stale-while-revalidate=120',
  onError: error => console.error(
    '[global-search] failed:',
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createStandardMetaRouter({
  adminGuard: adminIdGuard,
  accessGuard: requireStandardAccess,
  loadMeta: loadStandardMeta,
  loadViciousGold: loadViciousSyndicateGold,
  loadViciousGoldBuilds: loadViciousSyndicateGoldBuilds,
  findRecommendation: findStandardMetaRecommendation,
  createPreview: createStandardMetaPreview,
  getPreview: fetchStandardMetaPreview,
  setPrivateNoStore,
  onError: (scope, error) => console.error(
    `[standard-meta] ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createConstructedArchetypeRouter({
  accessGuard: requireStandardAccess,
  loadCatalog: loadConstructedArchetypeCatalog,
  loadHistory: loadConstructedArchetypeHistory,
  loadAnalysis: loadConstructedArchetypeAnalysis,
  setPrivateNoStore,
  onError: (scope, error) => console.error(
    `[constructed-archetypes] ${scope} failed:`,
    error instanceof Error ? error.message : error,
  ),
}));

async function tierlistDataAllowedByPublicationPolicy(_source: string, data: any): Promise<boolean> {
  if (normalizeTierlistEarlyStatsMetadata(data).provisional !== true) return true;
  if (!hsDataParserControlClient.configured) return false;
  const control = await hsDataParserControlClient.getControl() as Record<string, any>;
  const policy = control?.policy && typeof control.policy === 'object' ? control.policy : {};
  const effectiveMode = String(policy.effectiveMode ?? policy.effective_mode ?? policy.mode ?? 'stable').toLowerCase();
  return effectiveMode === 'early';
}

app.use('/api', createTierlistRouter({
  accessGuard: requireArenaAccess,
  cache: tierlistApiCache,
  resolveSource: source => normalizeSource(source, TIERLIST_DATASET_BY_SOURCE, 'hsreplay'),
  getData: (source, now, bypassCache) => getTierlistApiData(
    source as keyof typeof TIERLIST_DATASET_BY_SOURCE,
    now,
    bypassCache,
  ),
  present: withClassPositions,
  loadFallback: source => {
    const filename = source === 'hsreplay'
      ? 'hsreplay_tierlist.json'
      : source === 'heartharena'
        ? 'tierlist.json'
        : null;
    return filename ? loadDataCached(filename) : null;
  },
  allowData: tierlistDataAllowedByPublicationPolicy,
  allowFallback: tierlistDataAllowedByPublicationPolicy,
  cacheHeader: CACHE_TIERLIST,
  provisionalCacheHeader: CACHE_TIERLIST_PROVISIONAL,
  staleCacheHeader: CACHE_TIERLIST_STALE,
  fallbackCacheHeader: CACHE_6H,
  onError: error => console.error(
    '[api/tierlist] request failed:',
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createLegendaryRouter({
  accessGuard: requireArenaAccess,
  cache: legendariesApiCache,
  resolveSource: source => normalizeSource(source, LEGENDARIES_DATASET_BY_SOURCE, 'hsreplay'),
  getData: (source, now, bypassCache) => getLegendariesApiData(
    source as keyof typeof LEGENDARIES_DATASET_BY_SOURCE,
    now,
    bypassCache,
  ),
  isUsableData: hasLegendaryGroups,
  loadFallback: source => source === 'hsreplay' ? loadDataCached('legendaries.json') : null,
  cacheHeader: CACHE_1H,
  fallbackCacheHeader: CACHE_6H,
  onError: error => console.error(
    '[api/legendaries] request failed:',
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createArenaDecksRouter({
  accessGuard: requireArenaAccess,
  fetchDecks: fetchArenaDecksData,
  cache: arenaDecksCache,
  maxLimit: ARENA_DECKS_MAX_LIMIT,
  cacheTtlMs: ARENA_DECKS_CACHE_MS,
  publicCacheHeader: CACHE_1H,
  onFetchError: error => console.error(
    '[arena-decks] fetch failed:',
    error instanceof Error ? error.message : error,
  ),
}));

function articleDateMs(article: any): number {
  const parsed = Date.parse(String(article?.date ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

type ArticleMode = ArticleAccessMode;

function articleMode(article: Record<string, any>): ArticleMode {
  const explicitMode = String(article.mode || '').trim().toLowerCase();
  if (explicitMode === 'arena' || explicitMode === 'battlegrounds' || explicitMode === 'standard' || explicitMode === 'wild' || explicitMode === 'general') {
    return explicitMode;
  }
  const haystack = [
    article.tag,
    article.title,
    article.excerpt,
    article.url,
  ].map(value => normalizeBoostyLevelName(String(value || ''))).join(' ');
  if (/(поля сражений|полей сражений|battleground|battle grounds|tavern|таверна|боб|bob|бг)/.test(haystack)) {
    return 'battlegrounds';
  }
  if (/(арена|arena)/.test(haystack)) return 'arena';
  return 'general';
}

function normalizeArticleModeInput(value: unknown, fallbackArticle: Record<string, any>): ArticleMode {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'arena' || raw === 'battlegrounds' || raw === 'standard' || raw === 'wild' || raw === 'general') return raw;
  return articleMode(fallbackArticle);
}

function subscriptionAllowsArticle(subscription: SubscriptionStatus, article: Record<string, any>): boolean {
  const entitlement = articleAccessEntitlement(articleMode(article));
  return entitlement ? Boolean(subscription.entitlements?.[entitlement]) : subscription.hasAccess;
}

function findArticleById(articleId: string): Record<string, any> | null {
  const existing: any = loadData('articles.json') ?? { articles: [] };
  if (!Array.isArray(existing.articles)) return null;
  return existing.articles.find((article: any) => String(article.id) === articleId) ?? null;
}

function findArticleByUrlOrTitle(rawUrl: string, title: string): Record<string, any> | null {
  const existing: any = loadData('articles.json') ?? { articles: [] };
  if (!Array.isArray(existing.articles)) return null;
  const targetSlug = articleSlug(rawUrl);
  const normalizedTitle = normalizeBoostyLevelName(title);
  return existing.articles.find((article: any) => {
    const articleUrl = String(article.url || '');
    const articleTitle = normalizeBoostyLevelName(String(article.title || ''));
    return (targetSlug && articleSlug(articleUrl) === targetSlug)
      || (normalizedTitle && articleTitle === normalizedTitle);
  }) ?? null;
}

function shapeArticlesData(raw: any, userId = '') {
  const articles = Array.isArray(raw?.articles)
    ? [...raw.articles].sort((a, b) => articleDateMs(b) - articleDateMs(a) || String(b.id ?? '').localeCompare(String(a.id ?? '')))
    : [];
  const ids = articles.map(article => String(article.id ?? '')).filter(Boolean);
  const votesByArticle = new Map<string, { likes: number; dislikes: number }>();
  const userVotes = new Map<string, 'like' | 'dislike'>();
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    dbAll<any>(`
      SELECT article_id,
             SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS likes,
             SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS dislikes
      FROM article_votes
      WHERE article_id IN (${placeholders})
      GROUP BY article_id
    `, ...ids).forEach(row => {
      votesByArticle.set(String(row.article_id), {
        likes: Number(row.likes || 0),
        dislikes: Number(row.dislikes || 0),
      });
    });
    if (userId) {
      dbAll<any>(`
        SELECT article_id, vote
        FROM article_votes
        WHERE user_id = ? AND article_id IN (${placeholders})
      `, userId, ...ids).forEach(row => {
        userVotes.set(String(row.article_id), Number(row.vote) === 1 ? 'like' : 'dislike');
      });
    }
  }
  return {
    ...raw,
    updatedAt: raw?.updatedAt ?? null,
    articles: articles.map(article => {
      const id = String(article.id ?? '');
      const votes = votesByArticle.get(id) ?? { likes: 0, dislikes: 0 };
      return {
        ...article,
        id,
        title: String(article.title ?? ''),
        date: String(article.date ?? ''),
        image: articleImageSrc(String(article.image ?? '')),
        excerpt: String(article.excerpt ?? ''),
        tag: String(article.tag ?? ''),
        mode: articleMode(article),
        url: canonicalArticleUrl(String(article.url ?? '#')),
        likes: votes.likes,
        dislikes: votes.dislikes,
        userVote: userVotes.get(id) ?? null,
      };
    }),
  };
}

function articleExists(articleId: string): boolean {
  return Boolean(findArticleById(articleId));
}

app.use('/api', createGalleryRouter({
  dataDir: DATA_DIR,
  uploadDir: GALLERY_UPLOAD_DIR,
  uploadMaxBytes: GALLERY_UPLOAD_MAX_BYTES,
  uploadMaxPixels: GALLERY_UPLOAD_MAX_PIXELS,
  previewMaxWidth: GALLERY_PREVIEW_MAX_WIDTH,
  thumbMaxWidth: GALLERY_THUMB_MAX_WIDTH,
  loadData,
  loadDataCached,
  invalidateDataCache: filename => dataCache.delete(filename),
  sendJsonCached,
  publicCacheHeader: CACHE_5M,
  adminGuard: adminIdGuard,
  adminAuth,
  setPrivateNoStore,
}));

const cosmeticsDataService = createCosmeticsDataService({
  apiBaseUrl: KOLODAHS_API_BASE_URL,
  localizedCardsUrl: HEARTHSTONE_RU_CARDS_URL,
  cacheTtlMs: EXTERNAL_DATASET_CACHE_MS,
  fetchJson: async url => {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok) {
      const error = new Error(`Cosmetics upstream returned HTTP ${upstream.status}`) as Error & { status?: number };
      error.status = upstream.status;
      throw error;
    }
    return upstream.json();
  },
});
app.use('/api', createPublicResourceRouter());
app.use('/api', createCosmeticsRouter(cosmeticsDataService, { fetchMedia: fetch }));
app.use(createCosmeticsSeoRouter({
  loadDetail: cosmeticsDataService.loadDetail,
  frontendAssets: constructedCardFrontendAssets,
  onError: error => console.error(
    '[cosmetics-seo] detail failed:',
    error instanceof Error ? error.message : error,
  ),
}));
void Promise.allSettled([
  cosmeticsDataService.loadCatalog('heroes', { page: 1, perPage: 48, q: '' }),
  cosmeticsDataService.loadCatalog('coins', { page: 1, perPage: 100, q: '' }),
  cosmeticsDataService.loadCatalog('pets', { page: 1, perPage: 100, q: '' }),
]).then(results => {
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.warn(
        `[cosmetics] ${(['heroes', 'coins', 'pets'] as const)[index]} prewarm failed:`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  }
});

app.use('/api', createArticleRouter({
  loadArticles: () => loadDataCached('articles.json'),
  authenticate: userAuth,
  shapeArticles: shapeArticlesData,
  refreshSubscription: user => refreshSubscriptionForUser(user as AdminUser, false),
  findArticle: findArticleById,
  isAdmin: user => isAdminUser(user as AdminUser),
  subscriptionAllowsArticle,
  parseUrl: parseHttpUrl,
  isVipArticleUrl: isKhaVipArticleUrl,
  findArticleByUrlOrTitle,
  findVipLocker: findKhaVipLockerForArticle,
  issueVipLink: (locker, user) => issueKhaVipArticleLink(locker as KhaVipLocker, user as AdminUser),
  dbGet,
  dbRun,
  publicCacheHeader: CACHE_5M,
  onAccessLinkError: error => console.error(
    '[articles] access-link failed:',
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createGuidesArchiveRouter({
  getDatabase: oldGuidesDatabase,
  accessGuard: requireGuidesArchiveAccess,
  publicUrl: OLD_GUIDES_PUBLIC_URL,
  cacheHeader: CACHE_1H,
}));

app.use('/api', createArticleCoverRouter({
  allowedHosts: ARTICLE_COVER_ALLOWED_HOSTS,
  maxBytes: ARTICLE_COVER_MAX_BYTES,
}));

async function proxyLegacyBattlegroundEndpoint(req: express.Request, res: express.Response, upstreamPath: string) {
  try {
    const upstreamUrl = new URL(upstreamPath, 'http://127.0.0.1:3107');
    const isImageEndpoint = upstreamPath === '/api/remote-image' || upstreamPath === '/api/card-art';
    const imageTransform = isImageEndpoint
      ? battlegroundImageTransformFromQuery(req.query as Record<string, unknown>)
      : null;
    for (const [key, value] of Object.entries(req.query)) {
      if (imageTransform && (key === 'width' || key === 'quality' || key === 'format')) continue;
      if (Array.isArray(value)) {
        value.forEach(item => upstreamUrl.searchParams.append(key, String(item)));
      } else if (value !== undefined) {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const transformCacheKey = imageTransform
      ? `:${battlegroundImageTransformCacheKey(imageTransform)}`
      : '';
    const cacheKey = `legacy:${upstreamUrl.href}${transformCacheKey}`;
    const redisKey = redisHashedDataKey('bg-legacy-proxy', cacheKey);
    const cached = battlegroundAppProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', isImageEndpoint || cached.contentType.includes('image/')
        ? BG_IMAGE_CACHE_CONTROL
        : BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-BG-Legacy-Cache', 'HIT');
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      return res.send(cached.body); // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write -- bounded binary/JSON proxy cache
    }
    const redisCached = await redisGetProxyCache(redisKey);
    if (redisCached) {
      battlegroundAppProxyCache.set(cacheKey, {
        ...redisCached,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      res.status(redisCached.status);
      res.setHeader('Content-Type', redisCached.contentType);
      res.setHeader('Cache-Control', isImageEndpoint || redisCached.contentType.includes('image/')
        ? BG_IMAGE_CACHE_CONTROL
        : BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', redisCached.etag);
      res.setHeader('X-BG-Legacy-Cache', 'REDIS');
      if (req.headers['if-none-match'] === redisCached.etag) return res.status(304).end();
      return res.send(redisCached.body); // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write -- bounded binary/JSON proxy cache
    }

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(20_000) });
    let body = Buffer.from(await upstream.arrayBuffer());
    let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (imageTransform && upstream.status >= 200 && upstream.status < 300) {
      try {
        const optimized = await optimizeBattlegroundImage(body, imageTransform);
        body = optimized.body;
        contentType = optimized.contentType;
      } catch (error: any) {
        console.warn('[bg image optimizer] using original image:', error?.message ?? error);
      }
    }
    const etag = `"bg-legacy-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (
      upstream.status >= 200
      && upstream.status < 300
      && (Boolean(imageTransform) || (!isImageEndpoint && !contentType.toLowerCase().includes('image/')))
    ) {
      const cacheEntry = {
        body,
        contentType,
        status: upstream.status,
        etag,
      };
      battlegroundAppProxyCache.set(cacheKey, {
        ...cacheEntry,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      if (imageTransform) {
        const optimizedKeys = [...battlegroundAppProxyCache.keys()]
          .filter(key => key.startsWith('legacy:') && /:webp:w\d+:q\d+$/.test(key));
        const overflow = optimizedKeys.length - MAX_BG_OPTIMIZED_IMAGE_CACHE_ENTRIES;
        if (overflow > 0) optimizedKeys.slice(0, overflow).forEach(key => battlegroundAppProxyCache.delete(key));
      }
      void redisSetProxyCache(redisKey, cacheEntry, Math.max(60, Math.ceil(BG_DATA_CACHE_MS / 1000)));
    }
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', isImageEndpoint || contentType.includes('image/')
      ? BG_IMAGE_CACHE_CONTROL
      : BG_JSON_CACHE_CONTROL);
    res.setHeader('ETag', etag);
    res.setHeader('X-BG-Legacy-Cache', 'MISS');
    res.send(body); // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write -- bounded binary/JSON proxy response
  } catch (err: any) {
    console.error('[bg legacy proxy] failed:', upstreamPath, err?.message ?? err);
    res.status(502).json({ error: 'BG legacy upstream unavailable' });
  }
}

async function proxyBattlegroundAppEndpoint(
  req: express.Request,
  res: express.Response,
  upstreamPath: string,
  transformJson?: (payload: any) => any,
) {
  try {
    const isHsReplayStrategies = upstreamPath === '/api/bg/tier-lists' && String(req.query.list || '').toLowerCase() === 'strategies' && String(req.query.source || '').toLowerCase() === 'hsreplay';
    if (isHsReplayStrategies) return proxyHsReplayStrategyPayload(req, res);
    const upstreamUrl = new URL(upstreamPath, 'http://127.0.0.1:3108');
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) value.forEach(item => upstreamUrl.searchParams.append(key, String(item)));
      else if (value !== undefined) upstreamUrl.searchParams.set(key, String(value));
    }

    const cacheKey = upstreamUrl.href;
    const redisKey = redisHashedDataKey('bg-app-proxy', cacheKey);
    const cached = battlegroundAppProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const clientCacheControl = res.locals.subscriptionGuarded && !cached.contentType.includes('image/')
        ? 'private, no-store, max-age=0, must-revalidate'
        : (cached.contentType.includes('image/') ? BG_IMAGE_CACHE_CONTROL : BG_JSON_CACHE_CONTROL);
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', clientCacheControl);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-BG-Proxy-Cache', 'HIT');
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      return res.send(cached.body);
    }
    const redisCached = await redisGetProxyCache(redisKey);
    if (redisCached) {
      battlegroundAppProxyCache.set(cacheKey, {
        ...redisCached,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      const clientCacheControl = res.locals.subscriptionGuarded && !redisCached.contentType.includes('image/')
        ? 'private, no-store, max-age=0, must-revalidate'
        : (redisCached.contentType.includes('image/') ? BG_IMAGE_CACHE_CONTROL : BG_JSON_CACHE_CONTROL);
      res.status(redisCached.status);
      res.setHeader('Content-Type', redisCached.contentType);
      res.setHeader('Cache-Control', clientCacheControl);
      res.setHeader('ETag', redisCached.etag);
      res.setHeader('X-BG-Proxy-Cache', 'REDIS');
      if (req.headers['if-none-match'] === redisCached.etag) return res.status(304).end();
      return res.send(redisCached.body);
    }

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(25_000) });
    let body = Buffer.from(await upstream.arrayBuffer());
    let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (transformJson && upstream.status >= 200 && upstream.status < 300 && contentType.includes('application/json')) {
      try {
        const payload = JSON.parse(body.toString('utf8'));
        body = Buffer.from(JSON.stringify(transformJson(payload)));
        contentType = 'application/json; charset=utf-8';
      } catch (err: any) {
        console.warn('[bg app proxy] JSON transform failed:', upstreamPath, err?.message ?? err);
      }
    }
    const etag = `"bg-app-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (upstream.status >= 200 && upstream.status < 300) {
      const cacheEntry = {
        body,
        contentType,
        status: upstream.status,
        etag,
      };
      battlegroundAppProxyCache.set(cacheKey, {
        ...cacheEntry,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      void redisSetProxyCache(redisKey, cacheEntry, Math.max(60, Math.ceil(BG_DATA_CACHE_MS / 1000)));
    }
    res.status(upstream.status);
    const clientCacheControl = res.locals.subscriptionGuarded && !contentType.includes('image/')
      ? 'private, no-store, max-age=0, must-revalidate'
      : (contentType.includes('image/') ? BG_IMAGE_CACHE_CONTROL : BG_JSON_CACHE_CONTROL);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', clientCacheControl);
    res.setHeader('ETag', etag);
    res.setHeader('X-BG-Proxy-Cache', 'MISS');
    res.send(body);
  } catch (err: any) {
    console.error('[bg app proxy] failed:', upstreamPath, err?.message ?? err);
    res.status(502).json({ error: 'BG app upstream unavailable' });
  }
}

async function proxyExtraBattlegroundLibraryEndpoint(req: express.Request, res: express.Response, library: string) {
  const endpoint = EXTRA_BG_LIBRARY_ENDPOINTS[library];
  if (!endpoint) return res.status(404).json({ error: 'Unknown BG library' });

  try {
    const upstreamUrl = new URL(`${KOLODAHS_API_BASE_URL}${endpoint}`);
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach(item => upstreamUrl.searchParams.append(key, String(item)));
      } else if (value !== undefined) {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const cacheKey = `extra-library:${upstreamUrl.href}`;
    const redisKey = redisHashedDataKey('bg-extra-library', cacheKey);
    const cached = battlegroundAppProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-BG-Extra-Library-Cache', 'HIT');
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      return res.send(cached.body);
    }
    const redisCached = await redisGetProxyCache(redisKey);
    if (redisCached) {
      battlegroundAppProxyCache.set(cacheKey, {
        ...redisCached,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      res.status(redisCached.status);
      res.setHeader('Content-Type', redisCached.contentType);
      res.setHeader('Cache-Control', BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', redisCached.etag);
      res.setHeader('X-BG-Extra-Library-Cache', 'REDIS');
      if (req.headers['if-none-match'] === redisCached.etag) return res.status(304).end();
      return res.send(redisCached.body);
    }

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(25_000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const etag = `"bg-extra-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (upstream.status >= 200 && upstream.status < 300) {
      const cacheEntry = {
        body,
        contentType,
        status: upstream.status,
        etag,
      };
      battlegroundAppProxyCache.set(cacheKey, {
        ...cacheEntry,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      void redisSetProxyCache(redisKey, cacheEntry, Math.max(60, Math.ceil(BG_DATA_CACHE_MS / 1000)));
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', BG_JSON_CACHE_CONTROL);
    res.setHeader('ETag', etag);
    res.setHeader('X-BG-Extra-Library-Cache', 'MISS');
    res.send(body);
  } catch (err: any) {
    console.error('[bg extra library proxy] failed:', library, err?.message ?? err);
    res.status(502).json({ error: 'BG extra library upstream unavailable' });
  }
}

app.use('/api', createBattlegroundProxyRouter({
  requireAccess: requireBattlegroundsAccess,
  proxyLegacy: proxyLegacyBattlegroundEndpoint,
  proxyApp: proxyBattlegroundAppEndpoint,
  proxyExtraLibrary: proxyExtraBattlegroundLibraryEndpoint,
  enrichHeroPayload: enrichBattlegroundHeroPayload,
}));

const upstreamDataHealth = createUpstreamDataHealthMonitor({
  url: `${(process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN).replace(/\/+$/, '')}/v1/system/health`,
  timeoutMs: Number(process.env.HS_DATA_API_HEALTH_TIMEOUT_MS || 5_000),
  refreshIntervalMs: Number(process.env.HS_DATA_API_HEALTH_REFRESH_MS || 5 * 60_000),
});
upstreamDataHealth.start();
const criticalDataHealth = createCriticalDataHealth({
  loadDataset: loadDataCached,
  getConstructedCatalogHealth: format => constructedCardDataService.getCatalogHealth(format),
  getUpstreamInput: upstreamDataHealth.getInput,
});

const healthRouter = createHealthRouter({
  getDataHealth: criticalDataHealth,
  getRelease: () => RELEASE_SHA,
});
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
const metricsRouter = createMetricsRouter({
  metrics: httpMetrics,
  getDataHealth: criticalDataHealth,
  getRelease: () => RELEASE_SHA,
});
app.use('/metrics', metricsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api', createWebVitalsRouter({ capture: captureServerWebVital }));
app.use('/api', createClientErrorRouter({
  capture: incident => console.error('[client-interface-error]', JSON.stringify(incident)),
}));

app.use('/api', createOperationalRouter({
  loadDataset: filename => loadDataCached(filename),
  authenticate: userAuth,
  isAdmin: user => isAdminUser(user as AdminUser | null),
  getClientIp: getTrustedClientIp,
  scrapeGuard: manualScrapeGuard,
  scrapeLimiter,
  scrapeQueueHandler: createScrapeQueueHandler(DATA_DIR),
  publicCacheHeader: CACHE_5M,
}));

app.use('/api/auth/register', authCodeRequestLimiter);
app.use('/api/auth/login', authPasswordLimiter, authCodeRequestLimiter);
app.use('/api', createAuthCredentialRouter({
  normalizeEmail,
  isRealEmail,
  register: async ({ email, password, name, country, newsletterOptIn }) => {
    const store = loadAuthStore();
    if (store.users.some(item => item.email === email)) {
      return { ok: false, status: 409, error: 'Пользователь с такой почтой уже есть' } as const;
    }

    const now = new Date().toISOString();
    store.users.push({
      id: `user_${sha256(email).slice(0, 12)}`,
      email,
      name,
      role: 'user',
      country,
      newsletterOptIn,
      avatarInitials: name.slice(0, 2).toUpperCase(),
      passwordHash: hashSecret(password),
      createdAt: now,
      updatedAt: now,
    });

    const authCode = prepareAuthCode(store, email);
    if (authCode.ok === false) return authCode;
    await deliverCredentialCode(
      () => sendAuthCodeEmail(email, authCode.code),
      () => saveAuthStore(store),
    );
    return {
      ok: true,
      payload: { success: true, email, message: 'Аккаунт создан. Код отправлен на почту' },
    } as const;
  },
  login: async ({ email, password }, req) => {
    const store = loadAuthStore();
    const user = store.users.find(item => item.email === email);
    if (!user || user.blockedAt || !verifySecret(password, user.passwordHash)) {
      return { ok: false, status: 401, error: 'Неверная почта или пароль' } as const;
    }

    const activeSession = authenticatedSessionFromRequest(req);
    const token = activeSession?.token ?? '';
    if (activeSession?.user.email === email) {
      if (refreshAuthSessionIfNeeded(activeSession.store, activeSession.session)) {
        saveAuthStore(activeSession.store);
      }
      return {
        ok: true,
        sessionToken: token,
        payload: {
          success: true,
          authenticated: true,
          user: publicUser(activeSession.user),
          adminAllowed: isAdminUser(activeSession.user),
          contestAdminAllowed: isContestAdminUser(activeSession.user),
          message: 'Вы уже вошли в аккаунт.',
        },
      } as const;
    }

    const authCode = prepareAuthCode(store, email);
    if (authCode.ok === false) return authCode;
    await deliverCredentialCode(
      () => sendAuthCodeEmail(email, authCode.code),
      () => saveAuthStore(store),
    );
    return {
      ok: true,
      payload: { success: true, email, message: 'Код отправлен на почту' },
    } as const;
  },
  setAuthCookie,
  setPrivateNoStore,
  reportFailure: operation => console.warn(`[auth] ${operation} could not be completed`),
}));

app.use('/api/auth/password-reset/request', authCodeRequestLimiter);
app.use('/api/auth/password-reset/confirm', authCodeVerifyLimiter);
app.use('/api', createPasswordResetRouter({
  normalizeEmail,
  isRealEmail,
  issueReset: async email => {
    const store = loadAuthStore();
    const user = store.users.find(item => item.email === email);
    if (!user || user.blockedAt) return;
    const authCode = prepareAuthCode(store, email);
    if (authCode.ok === false) return;
    saveAuthStore(store);
    await sendAuthCodeEmail(email, authCode.code);
  },
  confirmReset: (email, code, password) => {
    const store = loadAuthStore();
    const user = store.users.find(item => item.email === email);
    if (user?.blockedAt) return false;
    return completePasswordReset(store, email, code, password, {
      now: Date.now,
      maxAttempts: AUTH_CODE_MAX_ATTEMPTS,
      verifyCode: verifyPendingCode,
      hashPassword: hashSecret,
      persist: saveAuthStore,
    });
  },
  reportRequestFailure: () => {
    console.warn('[auth] password reset request could not be completed');
  },
  setPrivateNoStore,
}));

app.get('/api/auth/telegram/config', (_req, res) => {
  const enabled = telegramAuthEnabled();
  const useOidc = telegramOidcEnabled();
  const useLegacyWidget = !useOidc && telegramLegacyWidgetEnabled();
  res.json({
    enabled,
    mode: useOidc ? 'oidc' : useLegacyWidget ? 'legacy-widget' : 'disabled',
    botUsername: enabled ? TELEGRAM_AUTH_BOT_USERNAME : '',
    authUrl: enabled ? (useLegacyWidget ? `${APP_URL}/api/auth/telegram/callback` : `${APP_URL}/api/auth/telegram/start`) : '',
    callbackUrl: enabled ? `${APP_URL}/api/auth/telegram/callback` : '',
  });
});

function upsertSocialOauthUser(provider: SocialProvider, profile: SocialProfile, linkUserId?: string) {
  const identityProvider = `${provider}_oauth`;
  const now = new Date().toISOString();
  const store = loadAuthStore();
  const owner = identityOwner(identityProvider, profile.subject);
  const linkedUser = linkUserId ? store.users.find(user => user.id === linkUserId) : undefined;
  const identityUser = owner?.user_id ? store.users.find(user => user.id === owner.user_id) : undefined;
  if (linkedUser && identityUser && linkedUser.id !== identityUser.id) throw new Error('Этот внешний аккаунт уже привязан к другому профилю');
  let user = linkedUser ?? identityUser;
  let createdUser = false;
  if (!user) {
    const suffix = sha256(`${provider}:${profile.subject}`).slice(0, 20);
    user = {
      id: `${provider}_${suffix}`,
      email: `${provider}_${suffix}@social.local`,
      name: profile.name,
      role: 'user', country: '', newsletterOptIn: false,
      avatarInitials: profile.name.slice(0, 2).toUpperCase(), photoUrl: profile.photoUrl,
      passwordHash: hashSecret(randomBytes(24).toString('hex')), createdAt: now, updatedAt: now,
    };
    store.users.push(user);
    createdUser = true;
  } else {
    user.name = user.name || profile.name;
    user.photoUrl = profile.photoUrl || user.photoUrl;
    user.updatedAt = now;
  }
  if (createdUser) saveAuthStore(store);
  const identityResult = db().prepare(`INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET username = excluded.username, photo_url = excluded.photo_url, updated_at = excluded.updated_at
    WHERE identities.user_id = excluded.user_id`).run(user.id, identityProvider, profile.subject, profile.email, profile.username, profile.photoUrl, now, now, now);
  if (identityResult.changes !== 1) throw new Error('Этот внешний аккаунт уже привязан к другому профилю');
  const token = createAuthSession(store, user);
  saveAuthStore(store);
  return token;
}

async function socialOauthHandler(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const providerValue = String(req.params.provider || '');
  if (!isSocialProvider(providerValue)) return next();
  const provider = providerValue;
  setPrivateNoStore(res);
  if (!socialOauthEnabled(provider)) return res.redirect(`/?login&${provider}=error`);
  const client = SOCIAL_OAUTH_CLIENTS[provider];
  if (req.path.endsWith('/start')) {
    const state = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const returnTo = safeAuthReturnTo(req.query.returnTo);
    writeSocialOauthState(req, res, provider, {
      state,
      codeVerifier,
      returnTo,
      linkUserId: userAuth(req)?.id || '',
      expiresAt: Date.now() + SOCIAL_OAUTH_STATE_TTL_MS,
    });
    return res.redirect(createSocialAuthorizationUrl({ provider, clientId: client.clientId, redirectUri: socialOauthCallbackUrl(provider), state, codeChallenge: sha256Base64Url(codeVerifier) }));
  }
  const state = readSocialOauthState(req, provider, String(req.query.state || ''));
  if (!state || !req.query.code) return res.redirect(`/?login&${provider}=error`);
  consumeSocialOauthState(req, res, provider, state);
  try {
    const profile = await fetchSocialProfile({ provider, code: String(req.query.code), codeVerifier: state.codeVerifier, clientId: client.clientId, clientSecret: client.clientSecret, redirectUri: socialOauthCallbackUrl(provider) });
    if (!profile) throw new Error('provider profile unavailable');
    if (state.linkUserId && userAuth(req)?.id !== state.linkUserId) throw new Error('auth session changed during identity link');
    const token = upsertSocialOauthUser(provider, profile, state.linkUserId || undefined);
    setAuthCookie(req, res, token);
    return res.redirect(safeAuthReturnTo(state.returnTo));
  } catch {
    return res.redirect(`/?login&${provider}=error`);
  }
}

app.get('/api/auth/:provider/start', socialOauthHandler);
app.get('/api/auth/:provider/callback', socialOauthHandler);

app.get('/api/auth/social/config', (_req, res) => {
  res.json({ providers: SOCIAL_PROVIDERS.filter(socialOauthEnabled).map(provider => ({ provider, authUrl: `/api/auth/${provider}/start` })) });
});

async function sendTelegramAuthBotMessage(chatId: string | number, text: string): Promise<void> {
  if (!TELEGRAM_AUTH_BOT_TOKEN) return;
  const startedAt = Date.now();
  try {
    const response = await fetchTelegramBotApi(TELEGRAM_AUTH_BOT_TOKEN, 'sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    }, 5_000);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.warn('[telegram auth bot] sendMessage failed:', data?.description || `HTTP ${response.status}`);
    }
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > 1500) console.warn(`[telegram auth bot] sendMessage slow: ${elapsedMs}ms`);
  } catch (err: any) {
    console.warn('[telegram auth bot] sendMessage unavailable:', err?.message ?? err);
  }
}

app.post('/api/auth/telegram/link-code', (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  if (!TELEGRAM_AUTH_BOT_TOKEN || !TELEGRAM_AUTH_BOT_USERNAME) {
    return res.status(503).json({ error: 'Telegram-бот пока не настроен' });
  }

  try {
    const result = createTelegramLinkCode(user.id);
    res.json({
      success: true,
      code: result.code,
      expiresAt: new Date(result.expiresAt).toISOString(),
      botUsername: TELEGRAM_AUTH_BOT_USERNAME,
      botUrl: `https://t.me/${TELEGRAM_AUTH_BOT_USERNAME}?start=${encodeURIComponent(result.code)}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Не удалось создать Telegram-код' });
  }
});

app.post('/api/auth/telegram/bot/webhook', async (req, res) => {
  setPrivateNoStore(res);
  if (!TELEGRAM_AUTH_BOT_TOKEN || !TELEGRAM_AUTH_BOT_USERNAME) {
    return res.status(503).json({ ok: false, error: 'Telegram auth bot disabled' });
  }
  if (TELEGRAM_AUTH_BOT_WEBHOOK_SECRET) {
    const received = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (!safeEqualString(received, TELEGRAM_AUTH_BOT_WEBHOOK_SECRET)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  }

  const message = req.body?.message;
  const chatId = message?.chat?.id;
  const chatType = String(message?.chat?.type || '');
  const telegramUser = message?.from;
  const telegramId = telegramUser?.id ? String(telegramUser.id).replace(/\D/g, '') : '';
  const messageText = String(message?.text || '').trim();
  const requestedEmail = extractEmailFromTelegramMessage(messageText);
  const emailCode = telegramEmailCodeFromMessage(messageText);
  const hasPendingEmailCode = Boolean(telegramId && pendingTelegramEmailCode(telegramId));
  const linkCode = telegramLinkCodeFromMessage(messageText);
  res.json({ ok: true });

  if (!chatId || !telegramId) return;
  if (chatType && chatType !== 'private') return;
  if (requestedEmail) {
    try {
      await requestTelegramEmailCode(telegramId, requestedEmail);
      await sendTelegramAuthBotMessage(chatId, `Код подтверждения отправлен на ${requestedEmail}. Пришлите сюда 6 цифр из письма.`);
    } catch (err: any) {
      await sendTelegramAuthBotMessage(chatId, err?.message || 'Не удалось отправить код подтверждения на почту.');
    }
    return;
  }
  if (hasPendingEmailCode && emailCode.length === 6 && !/^\/(?:start|link)\b/i.test(messageText) && !/^TG-/i.test(messageText)) {
    try {
      const result = await confirmTelegramEmailCode(telegramId, emailCode);
      if (result.linkedUser) {
        await sendTelegramAuthBotMessage(chatId, result.status?.hasAccess
          ? `Почта ${result.email} подтверждена и привязана к сайту. Boosty-доступ обновлён.`
          : `Почта ${result.email} подтверждена и привязана к сайту. Boosty-доступ пока не найден, обновите проверку в профиле.`);
      } else {
        await sendTelegramAuthBotMessage(chatId, `Почта ${result.email} подтверждена в общей базе Telegram-бота. После привязки Telegram на сайте она будет использована для проверки Boosty.`);
      }
    } catch (err: any) {
      await sendTelegramAuthBotMessage(chatId, err?.message || 'Не удалось подтвердить почту.');
    }
    return;
  }
  if (!linkCode) {
    await sendTelegramAuthBotMessage(chatId, [
      'Отправьте сюда ID-код из профиля hearthpulse.net.',
      'Код создаётся в блоке Telegram в личном кабинете и действует ограниченное время.',
      '',
      'Чтобы привязать Boosty-почту через бота, отправьте /email name@example.com.',
    ].join('\n'));
    return;
  }

  try {
    const database = db();
    const token = database.prepare(`
      SELECT code, user_id, expires_at, used_at
      FROM telegram_link_tokens
      WHERE code = ?
    `).get(linkCode) as { code: string; user_id: string; expires_at: number; used_at?: string } | undefined;
    if (!token || token.used_at || token.expires_at <= Date.now()) {
      await sendTelegramAuthBotMessage(chatId, 'Код не найден или устарел. Создайте новый код в профиле.');
      return;
    }

    const store = loadAuthStore();
    const targetUser = store.users.find(item => item.id === token.user_id);
    if (!targetUser) {
      await sendTelegramAuthBotMessage(chatId, 'Профиль для этого кода не найден. Создайте новый код в профиле.');
      return;
    }
    if (targetUser.telegramId && targetUser.telegramId !== telegramId) {
      await sendTelegramAuthBotMessage(chatId, 'У этого аккаунта уже привязан другой Telegram. Напишите администратору, если нужна замена.');
      return;
    }
    const existingTelegramUser = store.users.find(item => item.telegramId === telegramId && item.id !== targetUser.id);
    if (existingTelegramUser || identityBelongsToAnotherUser('telegram', telegramId, targetUser.id)) {
      await sendTelegramAuthBotMessage(chatId, 'Этот Telegram уже привязан к другому аккаунту.');
      return;
    }

    const username = String(telegramUser?.username || '').trim().replace(/^@/, '');
    const nowIso = new Date().toISOString();
    targetUser.telegramId = telegramId;
    targetUser.telegramUsername = username || targetUser.telegramUsername;
    targetUser.updatedAt = nowIso;
    saveAuthStore(store);
    dbRun(`
      INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'telegram', ?, '', ?, '', ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        username = excluded.username,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
        WHERE identities.user_id = excluded.user_id
    `, targetUser.id, telegramId, username, nowIso, nowIso, nowIso);
    const khaEmail = khaVerifiedEmail(readKhaVipProfile(telegramId));
    if (khaEmail && khaEmail !== targetUser.email) {
      const existingEmailUser = store.users.find(item => item.email === khaEmail && item.id !== targetUser.id);
      if (!existingEmailUser && !identityBelongsToAnotherUser('boosty-email', khaEmail, targetUser.id)) {
        const oldEmail = targetUser.email;
        targetUser.email = khaEmail;
        targetUser.contactEmail = targetUser.contactEmail || khaEmail;
        targetUser.updatedAt = nowIso;
        store.sessions = store.sessions.map(session => session.email === oldEmail ? { ...session, email: khaEmail } : session);
        saveAuthStore(store);
        dbRun(`
          INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
          VALUES (?, 'boosty-email', ?, ?, ?, '', ?, ?, ?)
          ON CONFLICT(provider, provider_user_id) DO UPDATE SET
            email = excluded.email,
            username = excluded.username,
            verified_at = excluded.verified_at,
            updated_at = excluded.updated_at
            WHERE identities.user_id = excluded.user_id
        `, targetUser.id, khaEmail, khaEmail, khaEmail, nowIso, nowIso, nowIso);
      }
    }
    database.prepare('UPDATE telegram_link_tokens SET used_at = ?, telegram_id = ? WHERE code = ?').run(nowIso, telegramId, linkCode);

    await sendTelegramAuthBotMessage(chatId, 'Telegram привязан. Проверяю подписку и обновляю доступ на сайте...');
    const status = await refreshSubscriptionForUser(targetUser, true);
    await sendTelegramAuthBotMessage(chatId, status.hasAccess
      ? 'Telegram привязан. Подписка найдена, доступ на сайте обновлён.'
      : 'Telegram привязан, но бот не нашёл вас в VIP-каналах. Проверьте подписку и нажмите "Обновить" в профиле.');
  } catch (err: any) {
    console.warn('[telegram auth bot] link failed:', err?.message ?? err);
    await sendTelegramAuthBotMessage(chatId, 'Не удалось привязать Telegram. Создайте новый код в профиле и попробуйте ещё раз.');
  }
});

function upsertTelegramUser(payload: Record<string, unknown>, options: { linkUserId?: string } = {}) {
  const telegramId = String(payload.id ?? '').replace(/\D/g, '');
  const telegramOidcSub = String(payload.oidc_sub ?? '').trim();
  if (!telegramId && !telegramOidcSub) throw new Error('Telegram не передал ID пользователя');

  const khaProfile = readKhaVipProfile(telegramId);
  const verifiedBoostyEmail = khaVerifiedEmail(khaProfile);
  const firstName = String(payload.first_name ?? '').trim();
  const lastName = String(payload.last_name ?? '').trim();
  const username = String(payload.username ?? '').trim().replace(/^@/, '');
  const photoUrl = String(payload.photo_url ?? '').trim();
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim()
    || (username ? `@${username}` : `Telegram ${telegramId || sha256(telegramOidcSub).slice(0, 10)}`);
  const email = verifiedBoostyEmail || (telegramId
    ? `telegram_${telegramId}@telegram.local`
    : `telegram_oidc_${sha256(telegramOidcSub).slice(0, 16)}@telegram.local`);
  const now = new Date().toISOString();
  const store = loadAuthStore();
  const oidcIdentity = telegramOidcSub
    ? dbGet<{ user_id?: string }>("SELECT user_id FROM identities WHERE provider = 'telegram_oidc' AND provider_user_id = ?", telegramOidcSub)
    : null;
  const oidcUser = oidcIdentity?.user_id ? store.users.find(item => item.id === oidcIdentity.user_id) : undefined;
  const usernameOidcIdentity = username
    ? dbGet<{ user_id?: string }>("SELECT user_id FROM identities WHERE provider = 'telegram_oidc' AND lower(username) = lower(?)", username)
    : null;
  const usernameOidcUser = usernameOidcIdentity?.user_id ? store.users.find(item => item.id === usernameOidcIdentity.user_id) : undefined;
  const telegramUser = telegramId ? store.users.find(item => item.telegramId === telegramId) : undefined;
  const usernameTelegramUser = username
    ? store.users.find(item => String(item.telegramUsername || '').toLowerCase() === username.toLowerCase())
    : undefined;
  const emailUser = store.users.find(item => item.email === email);
  const linkUser = options.linkUserId ? store.users.find(item => item.id === options.linkUserId) : undefined;
  let user = oidcUser ?? telegramUser ?? usernameTelegramUser ?? usernameOidcUser ?? emailUser;

  if (linkUser) {
    if (telegramId) assertIdentityAvailable('telegram', telegramId, linkUser.id, 'Этот Telegram');
    if (telegramOidcSub) assertIdentityAvailable('telegram_oidc', telegramOidcSub, linkUser.id, 'Этот Telegram');
    if (verifiedBoostyEmail) assertIdentityAvailable('boosty-email', verifiedBoostyEmail, linkUser.id, 'Эта Boosty-почта');
    if (telegramUser && telegramUser.id !== linkUser.id) {
      throw new Error('Этот Telegram уже привязан к другому аккаунту');
    } else if (oidcUser && oidcUser.id !== linkUser.id) {
      throw new Error('Этот Telegram уже привязан к другому аккаунту');
    } else if (usernameOidcUser && usernameOidcUser.id !== linkUser.id) {
      throw new Error('Этот Telegram уже привязан к другому аккаунту');
    } else {
      user = linkUser;
      user.telegramId = telegramId || user.telegramId;
      user.telegramUsername = username || user.telegramUsername;
      user.photoUrl = photoUrl || user.photoUrl;
      user.updatedAt = now;
    }
  } else if (telegramUser && emailUser && telegramUser.id !== emailUser.id) {
    throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
  } else if (!telegramUser && emailUser) {
    user = emailUser;
    user.telegramId = telegramId || user.telegramId;
    user.telegramUsername = username;
    user.photoUrl = photoUrl || user.photoUrl;
    user.updatedAt = now;
  } else if (telegramUser && verifiedBoostyEmail && telegramUser.email !== verifiedBoostyEmail) {
    const emailOwner = store.users.find(item => item.email === verifiedBoostyEmail && item.id !== telegramUser.id);
    if (emailOwner || identityBelongsToAnotherUser('boosty-email', verifiedBoostyEmail, telegramUser.id)) {
      throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
    }
    telegramUser.email = verifiedBoostyEmail;
    telegramUser.updatedAt = now;
    user = telegramUser;
  }

  if (!user) {
    user = {
      id: `tg_${sha256(telegramId || telegramOidcSub).slice(0, 12)}`,
      email,
      name: displayName,
      role: 'user',
      country: '',
      newsletterOptIn: false,
      avatarInitials: displayName.slice(0, 2).toUpperCase(),
      telegramId: telegramId || undefined,
      telegramUsername: username,
      photoUrl,
      passwordHash: hashSecret(randomBytes(24).toString('hex')),
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(user);
  } else {
    user.name = user.name && !user.name.startsWith('Telegram ') ? user.name : displayName;
    user.telegramId = telegramId || user.telegramId;
    user.telegramUsername = username;
    user.photoUrl = photoUrl || user.photoUrl;
    user.updatedAt = now;
  }
  return { store, user, khaProfile };
}

function linkTelegramOidcIdentity(user: AdminUser, claims: Record<string, any>) {
  const oidcSub = String(claims.sub ?? '').trim();
  if (!oidcSub) return;
  const now = new Date().toISOString();
  dbRun(`
    INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, 'telegram_oidc', ?, '', ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      username = excluded.username,
      photo_url = excluded.photo_url,
      updated_at = excluded.updated_at
      WHERE identities.user_id = excluded.user_id
  `, user.id, oidcSub, String(claims.preferred_username || '').replace(/^@/, ''), String(claims.picture || ''), now, now, now);
}

app.get('/api/auth/telegram/start', async (req, res) => {
  setPrivateNoStore(res);
  if (!telegramOidcEnabled()) return res.redirect('/?login&telegram=error');
  try {
    const discovery = await telegramOidcDiscovery();
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const returnTo = safeAuthReturnTo(req.query.returnTo);
    setTelegramOidcCookie(req, res, {
      state,
      nonce,
      codeVerifier,
      returnTo,
      expiresAt: Date.now() + TELEGRAM_OIDC_STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      client_id: TELEGRAM_OIDC_CLIENT_ID,
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: `${APP_URL}/api/auth/telegram/callback`,
      state,
      nonce,
      code_challenge: sha256Base64Url(codeVerifier),
      code_challenge_method: 'S256',
    });
    return res.redirect(`${discovery.authorization_endpoint}?${params.toString()}`);
  } catch (err) {
    console.warn('[auth] Telegram OIDC start failed:', err);
    return res.redirect('/?login&telegram=error');
  }
});

app.get('/api/auth/telegram/callback', async (req, res) => {
  setPrivateNoStore(res);
  if (telegramOidcEnabled() && req.query.code) {
    const requestedState = String(req.query.state ?? '');
    const oidcState = readTelegramOidcState(req, requestedState);
    if (!oidcState) {
      console.warn('[auth] Telegram OIDC callback rejected: missing, expired, or mismatched state');
      return res.redirect('/?login&telegram=error');
    }
    clearTelegramOidcCookie(req, res, oidcState.state);
    try {
      const discovery = await telegramOidcDiscovery();
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(req.query.code),
        redirect_uri: `${APP_URL}/api/auth/telegram/callback`,
        client_id: TELEGRAM_OIDC_CLIENT_ID,
        code_verifier: oidcState.codeVerifier,
      });
      const basicAuth = Buffer.from(`${TELEGRAM_OIDC_CLIENT_ID}:${TELEGRAM_OIDC_CLIENT_SECRET}`).toString('base64');
      const tokenData = await fetchJsonWithTimeout(discovery.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: tokenParams,
      });
      const claims = await verifyTelegramOidcIdToken(String(tokenData.id_token || ''), oidcState.nonce);
      const nameParts = String(claims.name || '').trim().split(/\s+/).filter(Boolean);
      const payload: Record<string, unknown> = {
        id: String(claims.id ?? '').replace(/\D/g, ''),
        oidc_sub: String(claims.sub ?? ''),
        first_name: nameParts[0] || String(claims.name || '').trim(),
        last_name: nameParts.slice(1).join(' '),
        username: String(claims.preferred_username || '').replace(/^@/, ''),
        photo_url: String(claims.picture || ''),
      };
      const currentUser = userAuth(req);
      const { store, user, khaProfile } = upsertTelegramUser(payload, { linkUserId: currentUser?.id });
      const token = createAuthSession(store, user);
      saveAuthStore(store);
      linkTelegramOidcIdentity(user, claims);
      applyKhaSubscriptionSnapshot(user, khaProfile);
      await refreshSubscriptionAfterTelegramAuth(user);
      setAuthCookie(req, res, token);
      return res.redirect(safeAuthReturnTo(oidcState.returnTo));
    } catch (err) {
      console.warn('[auth] Telegram OIDC callback failed:', err);
      return res.redirect('/?login&telegram=error');
    }
  }

  const payload = req.query as Record<string, unknown>;
  const verification = verifyTelegramAuthPayload(payload);
  if (verification.ok === false) {
    return res.redirect('/?login&telegram=error');
  }
  try {
    const currentUser = userAuth(req);
    const { store, user, khaProfile } = upsertTelegramUser(payload, { linkUserId: currentUser?.id });
    const token = createAuthSession(store, user);
    saveAuthStore(store);
    applyKhaSubscriptionSnapshot(user, khaProfile);
    await refreshSubscriptionAfterTelegramAuth(user);
    setAuthCookie(req, res, token);
    return res.redirect(safeAuthReturnTo(req.query.returnTo));
  } catch (err) {
    console.warn('[auth] Telegram callback failed:', err);
    return res.redirect('/?login&telegram=error');
  }
});

app.post('/api/auth/telegram', async (req, res) => {
  setPrivateNoStore(res);
  const payload = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const verification = verifyTelegramAuthPayload(payload);
  if (verification.ok === false) return res.status(401).json({ error: verification.error });

  let store: AdminAuthStore;
  let user: AdminUser;
  let khaProfile: Record<string, any> | null;
  try {
    const currentUser = userAuth(req);
    ({ store, user, khaProfile } = upsertTelegramUser(payload, { linkUserId: currentUser?.id }));
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? 'Telegram не передал пользователя' });
  }

  if (user.blockedAt) return res.status(403).json({ error: 'Пользователь заблокирован' });
  const token = createAuthSession(store, user);
  saveAuthStore(store);
  applyKhaSubscriptionSnapshot(user, khaProfile);
  await refreshSubscriptionAfterTelegramAuth(user);
  setAuthCookie(req, res, token);
  res.json(authenticatedUserPayload(user, {
    serializeUser: publicUser,
    isAdmin: isAdminUser,
    isContestAdmin: isContestAdminUser,
  }));
});

app.use('/api/auth/verify', authCodeVerifyLimiter);
app.use('/api', createAuthVerificationRouter({
  normalizeEmail,
  isRealEmail,
  verify: (email, code) => {
    const store = loadAuthStore();
    const user = store.users.find(item => item.email === email);
    const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > Date.now());
    if (!user || !pending) {
      return { ok: false, status: 401, error: 'Неверный или устаревший код' } as const;
    }
    pending.attempts += 1;
    if (pending.attempts > AUTH_CODE_MAX_ATTEMPTS || !verifyPendingCode(pending, code)) {
      saveAuthStore(store);
      return { ok: false, status: 401, error: 'Неверный или устаревший код' } as const;
    }
    store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
    if (user.blockedAt) {
      saveAuthStore(store);
      return { ok: false, status: 403, error: 'Доступ запрещён' } as const;
    }
    const sessionToken = createAuthSession(store, user);
    saveAuthStore(store);
    if (user.newsletterOptIn) {
      try {
        updateMailingConsent(user, true, 'email-code-verified');
      } catch {
        console.warn('[auth] verified mailing consent could not be synchronized');
      }
    }
    return { ok: true, user, sessionToken } as const;
  },
  setAuthCookie,
  serializeUser: publicUser,
  isAdmin: isAdminUser,
  isContestAdmin: isContestAdminUser,
  setPrivateNoStore,
}));

app.use('/api', createAuthProfileRouter({
  getSession: req => {
    const activeSession = authenticatedSessionFromRequest(req);
    if (!activeSession) return null;
    const { token } = activeSession;
    return {
      user: activeSession.user,
      touch: res => {
        if (refreshAuthSessionIfNeeded(activeSession.store, activeSession.session)) {
          saveAuthStore(activeSession.store);
        }
        setAuthCookie(req, res, token);
      },
    };
  },
  authenticate: userAuth,
  userId: user => user.id,
  updateProfile: (userId: string, patch: AuthProfilePatch) => {
    const store = loadAuthStore();
    const user = store.users.find(item => item.id === userId);
    if (!user) return null;
    if (patch.country !== undefined) user.country = patch.country;
    if (patch.newsletterOptIn !== undefined) user.newsletterOptIn = patch.newsletterOptIn;
    if (patch.contactVkUrl !== undefined) user.contactVkUrl = patch.contactVkUrl;
    if (patch.contactTelegram !== undefined) user.contactTelegram = patch.contactTelegram;
    if (patch.contactEmail !== undefined) user.contactEmail = patch.contactEmail;
    user.updatedAt = new Date().toISOString();
    saveAuthStore(store);
    if (patch.newsletterOptIn !== undefined) {
      updateMailingConsent(user, patch.newsletterOptIn, 'profile-preference');
    }
    return user;
  },
  serializeUser: publicUser,
  isAdmin: isAdminUser,
  isContestAdmin: isContestAdminUser,
  tokenFromRequest: adminTokenFromReq,
  revokeSession: token => {
    const store = loadAuthStore();
    const tokenHash = sha256(token);
    store.sessions = store.sessions.filter(item => item.tokenHash !== tokenHash);
    saveAuthStore(store);
  },
  clearAuthCookie,
  normalizeContactEmail,
  normalizeContactTelegram,
  normalizeContactVkUrl,
  setPrivateNoStore,
}));

app.use('/api', createPublicProfileRouter({
  findProfile: publicProfileId => dbGet<PublicProfileRecord>(`
    SELECT
      CAST(public_numeric_id AS TEXT) AS publicProfileId,
      name,
      avatar_initials AS avatarInitials,
      created_at AS createdAt
    FROM users
    WHERE (CAST(public_numeric_id AS TEXT) = ? OR public_profile_id = ?)
      AND COALESCE(blocked_at, '') = ''
    LIMIT 1
  `, publicProfileId, publicProfileId) ?? null,
}));

app.use('/api', createSubscriptionRouter({
  userAuth,
  refreshSubscription: refreshSubscriptionForUser,
  unavailableStatus: emptySubscriptionStatus,
  setPrivateNoStore,
}));

app.use('/api', createContestRouter({
  userAuth,
  repository: {
    all: (sql, ...params) => dbAll<Record<string, unknown>>(sql, ...params),
    get: (sql, ...params) => dbGet<Record<string, unknown>>(sql, ...params) ?? null,
    run: (sql, ...params) => dbRun(sql, ...params),
  },
  serializeContest: (row, entry) => contestFromRow(row, entry),
  serializeUser: publicUser,
  refreshSubscription: user => refreshSubscriptionForUser(user, false),
  contestStatus: contestStatusFromDates,
  setPrivateNoStore,
  contestAdminUserId: CONTEST_ADMIN_USER_ID,
  isRealEmail,
}));

app.use('/api', createAdminContestReadRouter({
  adminAuth: contestAdminAuth,
  repository: { all: (sql, ...params) => dbAll<Record<string, unknown>>(sql, ...params) },
  serializeContest: row => contestFromRow(row, undefined, { includeRawWinners: true }),
  serializeAdmin: publicUser,
  safeJsonObject,
  setPrivateNoStore,
}));

app.use('/api', createAdminContestMutationRouter({
  adminAuth: contestAdminAuth,
  normalizeDateTime: normalizeDateTimeInput,
  normalizeImageUrl: normalizeContestImageUrl,
  upsertContest: contest => {
    dbRun(`
      INSERT INTO contests (id, title, description, prize, image_url, starts_at, ends_at, status, winners_json, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        prize = excluded.prize,
        image_url = excluded.image_url,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        status = excluded.status,
        updated_at = excluded.updated_at
    `, contest.id, contest.title, contest.description, contest.prize, contest.imageUrl, contest.startsAt,
    contest.endsAt, contest.status, '[]', contest.createdBy, contest.timestamp, contest.timestamp);
    return dbGet<any>('SELECT * FROM contests WHERE id = ?', contest.id);
  },
  getContest: contestId => dbGet<any>('SELECT * FROM contests WHERE id = ?', contestId) ?? null,
  approvedWinnerIds: contestId => dbAll<any>(
    "SELECT user_id FROM contest_entries WHERE contest_id = ? AND status = 'approved'",
    contestId,
  ).map(row => String(row.user_id || '')).filter(Boolean),
  publishWinners: (contestId, winners, timestamp) => {
    dbRun('UPDATE contests SET winners_json = ?, status = ?, updated_at = ? WHERE id = ?',
      JSON.stringify(winners), 'completed', timestamp, contestId);
    return dbGet<any>('SELECT * FROM contests WHERE id = ?', contestId);
  },
  deleteContest: contestId => { dbRun('DELETE FROM contests WHERE id = ?', contestId); },
  serializeContest: (row, includeRawWinners) => contestFromRow(row, undefined, { includeRawWinners }),
  setPrivateNoStore,
}));

app.use('/api', createAdminUserReadRouter({
  adminAuth,
  repository: {
    get: (sql, ...params) => dbGet<any>(sql, ...params) ?? null,
    all: (sql, ...params) => dbAll<any>(sql, ...params),
  },
  subscriptionForUser: (row, manualAccess) => {
    const boosty = normalizeBoostySubscriptionDetail(safeJsonObject(row.boosty_json));
    const telegram = normalizeTelegramSubscriptionDetail(safeJsonObject(row.telegram_json));
    const providerSource = String(row.subscription_source || 'none');
    const source = manualAccess.enabled
      ? providerSource === 'none' ? 'manual-access' : `${providerSource},manual-access`
      : providerSource;
    const entitlements = manualAccess.enabled
      ? allEntitlements()
      : deriveStoredEntitlements(Boolean(row.has_access), source, boosty, telegram);
    return {
      hasAccess: hasAnyEntitlement(entitlements), source,
      message: manualAccess.enabled
        ? manualAccess.expiresAt
          ? `Полный доступ выдан администратором до ${new Date(manualAccess.expiresAt).toLocaleDateString('ru-RU')}.`
          : 'Бессрочный доступ выдан администратором.'
        : String(row.subscription_message || ''),
      checkedAt: row.subscription_checked_at ? String(row.subscription_checked_at) : '',
      updatedAt: row.subscription_updated_at ? String(row.subscription_updated_at) : '',
      entitlements, boosty, telegram,
    };
  },
  subscriptionForSearchUser: row => {
    const source = String(row.subscription_source || 'none');
    const boosty = normalizeBoostySubscriptionDetail(safeJsonObject(row.boosty_json));
    const telegram = normalizeTelegramSubscriptionDetail(safeJsonObject(row.telegram_json));
    const entitlements = deriveStoredEntitlements(Boolean(row.has_access), source, boosty, telegram);
    return {
      hasAccess: hasAnyEntitlement(entitlements), source,
      checkedAt: row.subscription_checked_at ? String(row.subscription_checked_at) : '', entitlements,
    };
  },
  setPrivateNoStore,
}));


app.use('/api', createAdminBoostyRouter({
  adminAuth,
  getStatus: fetchBoostyServiceStatus,
  getSubscribers: fetchBoostySubscribers,
  configured: () => Boolean(BOOSTY_AUTH_API_URL),
  setPrivateNoStore,
}));

app.use('/api', createAdminBoostyAnalyticsRouter({
  adminAuth,
  setPrivateNoStore,
  loadAnalytics: loadBoostyArticleAnalytics,
}));

app.use('/api', createAdminTelegramReadRouter({
  adminAuth,
  repository: { all: sql => dbAll<Record<string, unknown>>(sql) },
  safeJsonObject,
  normalizeBoosty: normalizeBoostySubscriptionDetail,
  normalizeTelegram: normalizeTelegramSubscriptionDetail,
  deriveEntitlements: (hasAccess, source, boosty, telegram) => deriveStoredEntitlements(hasAccess, source, boosty, telegram),
  hasAnyEntitlement: entitlements => hasAnyEntitlement(entitlements),
  subscriptionRefreshMs: SUBSCRIPTION_REFRESH_MS,
  configured: () => Boolean(KHA_VIP_BOT_TOKEN),
  chatIds: () => [...SUBSCRIPTION_TELEGRAM_CHAT_IDS],
  setPrivateNoStore,
}));

app.use('/api', createAdminUserMutationRouter({
  adminAuth,
  csrfAllowed: cookieMutationCsrfAllowed,
  setPrivateNoStore,
  mutateUser: (actorId, userId, changes) => {
    const database = db();
    const mutationStore: AdminUserMutationStore = {
      transaction: work => {
        try {
          database.exec('BEGIN IMMEDIATE');
          const result = work();
          database.exec('COMMIT');
          return result;
        } catch (error) {
          try { database.exec('ROLLBACK'); } catch { /* BEGIN may itself have failed. */ }
          throw error;
        }
      },
      listUsers: () => (database.prepare(`
        SELECT id, email, role, blocked_at, updated_at
        FROM users
        ORDER BY created_at ASC
      `).all() as any[]).map(row => ({
        id: String(row.id),
        email: String(row.email),
        role: row.role === 'admin' ? 'admin' : 'user',
        blockedAt: row.blocked_at ? String(row.blocked_at) : '',
        updatedAt: String(row.updated_at),
      })),
      getManualAccess: targetId => {
        const row = database.prepare(`
          SELECT expires_at
          FROM manual_subscription_grants
          WHERE user_id = ? AND active = 1
            AND (expires_at IS NULL OR expires_at > ?)
        `).get(targetId, new Date().toISOString()) as { expires_at?: string | null } | undefined;
        return row
          ? { enabled: true, expiresAt: row.expires_at ? String(row.expires_at) : null }
          : { enabled: false, expiresAt: null };
      },
      updateUser: (targetId, values) => {
        database.prepare(`
          UPDATE users SET role = ?, blocked_at = ?, updated_at = ? WHERE id = ?
        `).run(values.role, values.blockedAt || null, values.updatedAt, targetId);
      },
      deleteUserSessions: (targetId, email) => {
        database.prepare('DELETE FROM sessions WHERE user_id = ? OR email = ?').run(targetId, email);
      },
      setManualAccess: (targetId, access, grantedBy, timestamp) => {
        if (access.enabled) {
          const note = access.expiresAt
            ? `Полный доступ до ${access.expiresAt} из админ-панели`
            : 'Бессрочный доступ из админ-панели';
          database.prepare(`
            INSERT INTO manual_subscription_grants (
              user_id, active, entitlements_json, granted_by, granted_at, expires_at,
              revoked_by, revoked_at, note, updated_at
            ) VALUES (?, 1, ?, ?, ?, ?, NULL, NULL, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              active = 1,
              entitlements_json = excluded.entitlements_json,
              granted_by = excluded.granted_by,
              granted_at = excluded.granted_at,
              expires_at = excluded.expires_at,
              revoked_by = NULL,
              revoked_at = NULL,
              note = excluded.note,
              updated_at = excluded.updated_at
          `).run(targetId, JSON.stringify(allEntitlements()), grantedBy, timestamp, access.expiresAt, note, timestamp);
        } else {
          database.prepare(`
            UPDATE manual_subscription_grants
            SET active = 0, revoked_by = ?, revoked_at = ?, updated_at = ?
            WHERE user_id = ?
          `).run(grantedBy, timestamp, timestamp, targetId);
        }
      },
      recordAudit: (grantedBy, targetId, details, timestamp) => {
        database.prepare(`
          INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at)
          VALUES (?, 'user.updated', 'user', ?, ?, ?)
        `).run(grantedBy, targetId, JSON.stringify(details), timestamp);
      },
    };
    const outcome = mutateAdminUser(mutationStore, actorId, userId, changes, new Date().toISOString());
    const user = loadAuthStore().users.find(item => item.id === userId);
    if (!user) throw new Error('Updated user is missing');
    return {
      success: true,
      user: {
        ...publicUser(user),
        manualAccess: outcome.manualAccess,
        lifetimeAccess: outcome.lifetimeAccess,
      },
      manualAccess: outcome.manualAccess,
      lifetimeAccess: outcome.lifetimeAccess,
      subscription: readSubscriptionStatus(user.id) ?? emptySubscriptionStatus(),
    };
  },
}));

app.use('/api', createAdminMailingReadRouter({
  adminAuth,
  overview: mailingOverviewPayload,
  getCampaign: campaignId => dbGet<any>('SELECT * FROM mailing_campaigns WHERE id = ?', campaignId) ?? null,
  serializeCampaign: mailingCampaignFromRow,
  setPrivateNoStore,
}));

app.use('/api', createAdminMailingPreviewRouter({
  adminAuth,
  csrfAllowed: cookieMutationCsrfAllowed,
  signingSecretConfigured: () => Boolean(NEWSLETTER_UNSUBSCRIBE_SECRET),
  normalizeDraft: normalizeNewsletterDraft,
  eligibleContacts: segment => eligibleMailingContacts(segment),
  renderPreview: draft => renderNewsletterHtml(draft, `${APP_URL}/api/newsletter/unsubscribe?token=preview`, true),
  previewDigest: newsletterPreviewDigest,
  setPrivateNoStore,
}));

app.use('/api', createAdminMailingDeliveryRouter({
  adminGuard: adminIdGuard,
  testLimiter: newsletterTestLimiter,
  sendLimiter: newsletterSendLimiter,
  adminAuth,
  csrfAllowed: cookieMutationCsrfAllowed,
  signingSecretConfigured: () => Boolean(NEWSLETTER_UNSUBSCRIBE_SECRET),
  normalizeDraft: normalizeNewsletterDraft,
  isRealEmail,
  sendTest: async (admin, draft) => {
    syncMailingContactForUser(db(), admin as AdminUser, { source: 'admin-test' });
    const contact = dbGet<any>('SELECT * FROM mailing_contacts WHERE lower(email) = lower(?)', admin.email);
    if (!contact) throw new Error('Test contact is missing');
    const token = newsletterUnsubscribeToken(String(contact.id));
    const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    const testDraft = { ...draft, subject: `[Тест] ${draft.subject}` };
    const host = new URL(APP_URL).hostname;
    await sendMimeEmail({
      to: admin.email,
      subject: testDraft.subject,
      text: `${draft.textBody}\n\nОтписаться от рассылки: ${unsubscribeUrl}`,
      html: renderNewsletterHtml(testDraft, unsubscribeUrl),
      messageId: `${randomBytes(12).toString('hex')}@${host}`,
      headers: ['Precedence: bulk', `List-Unsubscribe: <${unsubscribeUrl}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'],
    });
  },
  queueCampaign: (admin, draft, expectedRecipients, suppliedPreviewDigest) => {
    const campaignId = `campaign_${Date.now().toString(36)}_${randomBytes(5).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const database = db();
    try {
      database.exec('BEGIN IMMEDIATE');
      const running = database.prepare("SELECT id FROM mailing_campaigns WHERE status IN ('queued', 'sending') LIMIT 1").get();
      if (running) throw new AdminMailingDeliveryError(409, 'Другая рассылка уже выполняется');
      const contacts = eligibleMailingContacts(draft.segment);
      if (!Number.isInteger(expectedRecipients) || expectedRecipients !== contacts.length) {
        throw new AdminMailingDeliveryError(409, `Аудитория изменилась: сейчас ${contacts.length}. Обновите предпросмотр.`);
      }
      if (!contacts.length) throw new AdminMailingDeliveryError(400, 'В выбранной аудитории нет доступных адресов');
      if (!safeEqualHex(suppliedPreviewDigest, newsletterPreviewDigest(draft, contacts))) {
        throw new AdminMailingDeliveryError(409, 'Предпросмотр устарел или содержимое письма изменилось. Обновите предпросмотр.');
      }
      database.prepare(`
        INSERT INTO mailing_campaigns (
          id, subject, preheader, html_body, text_body, template_key, segment, status,
          created_by, created_at, recipient_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `).run(campaignId, draft.subject, draft.preheader, draft.htmlBody, draft.textBody, draft.templateKey, draft.segment,
      admin.id, nowIso, contacts.length);
      const insertDelivery = database.prepare(`
        INSERT INTO mailing_deliveries (campaign_id, contact_id, email_snapshot, status, attempts, updated_at)
        VALUES (?, ?, ?, 'pending', 0, ?)
      `);
      for (const contact of contacts) insertDelivery.run(campaignId, contact.id, contact.email, nowIso);
      database.exec('COMMIT');
      const row = database.prepare('SELECT * FROM mailing_campaigns WHERE id = ?').get(campaignId);
      return { campaign: mailingCampaignFromRow(row), recipientCount: contacts.length };
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* BEGIN may itself have failed. */ }
      throw error;
    }
  },
  recordAudit: (admin, action, entityType, entityId, details) => recordAdminAudit(admin as AdminUser, action, entityType, entityId, details),
  scheduleCampaign: campaignId => { setImmediate(() => void runNewsletterCampaign(campaignId)); },
  setPrivateNoStore,
  onSideEffectError: (_error, operation) => console.error(`[mailing] post-commit side effect failed: ${operation}`),
}));

app.use('/api', createNewsletterUnsubscribeRouter({
  resolveContact: token => {
    const row = mailingContactFromUnsubscribeToken(token);
    return row ? {
      id: String(row.id),
      userId: row.user_id ? String(row.user_id) : undefined,
      consentStatus: String(row.consent_status || 'unknown'),
    } : null;
  },
  unsubscribe: (contact, timestamp) => {
    const database = db();
    const store: NewsletterUnsubscribeStore = {
      transaction: work => {
        try {
          database.exec('BEGIN IMMEDIATE');
          const result = work();
          database.exec('COMMIT');
          return result;
        } catch (error) {
          try { database.exec('ROLLBACK'); } catch { /* BEGIN may itself have failed. */ }
          throw error;
        }
      },
      updateContact: (contactId, updatedAt) => {
        database.prepare(`
          UPDATE mailing_contacts
          SET consent_status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?),
              suppressed_reason = 'user-unsubscribed', updated_at = ?
          WHERE id = ?
        `).run(updatedAt, updatedAt, contactId);
      },
      updateUser: (userId, updatedAt) => {
        database.prepare('UPDATE users SET newsletter_opt_in = 0, updated_at = ? WHERE id = ?').run(updatedAt, userId);
      },
    };
    unsubscribeNewsletterContact(store, contact, timestamp);
  },
  escapeHtml: escapeNewsletterHtml,
  setPrivateNoStore,
}));


app.post('/api/subscription/email/request', authCodeRequestLimiter, async (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  const email = normalizeEmail(req.body?.email);
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите реальную почту Boosty' });

  const store = loadAuthStore();
  const existing = store.users.find(item => item.email === email && item.id !== user.id);
  if (existing || identityBelongsToAnotherUser('boosty-email', email, user.id)) {
    return res.status(409).json({ error: 'Эта почта уже привязана к другому профилю' });
  }

  const authCode = prepareAuthCode(store, email);
  if (authCode.ok === false) return res.status(authCode.status).json({ error: authCode.error });
  saveAuthStore(store);

  try {
    await sendAuthCodeEmail(email, authCode.code);
    res.json({ success: true, email, message: 'Код подтверждения отправлен на почту' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Не удалось отправить код' });
  }
});

app.post('/api/subscription/email/confirm', authCodeVerifyLimiter, async (req, res) => {
  setPrivateNoStore(res);
  const authedUser = userAuth(req);
  if (!authedUser) return res.status(401).json({ error: 'Требуется вход' });
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите реальную почту Boosty' });

  const store = loadAuthStore();
  let user = store.users.find(item => item.id === authedUser.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  const existing = store.users.find(item => item.email === email && item.id !== user.id);
  if (existing || identityBelongsToAnotherUser('boosty-email', email, user.id)) {
    return res.status(409).json({ error: 'Эта почта уже привязана к другому профилю' });
  }
  const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > Date.now());
  if (!pending) return res.status(401).json({ error: 'Код устарел. Запросите новый.' });

  pending.attempts += 1;
  if (pending.attempts > AUTH_CODE_MAX_ATTEMPTS || !verifyPendingCode(pending, code)) {
    saveAuthStore(store);
    return res.status(401).json({ error: 'Неверный код' });
  }

  const oldEmail = user.email;
  user.email = email;
  user.updatedAt = new Date().toISOString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
  store.sessions = store.sessions.map(session => session.email === oldEmail ? { ...session, email } : session);
  saveAuthStore(store);
  syncMailingContactForUser(db(), user, {
    confirmConsent: Boolean(user.newsletterOptIn),
    source: 'verified-email-change',
  });
  const nowIso = new Date().toISOString();
  dbRun(`
    INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, 'boosty-email', ?, ?, ?, '', ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      email = excluded.email,
      username = excluded.username,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
      WHERE identities.user_id = excluded.user_id
  `, user.id, email, email, email, nowIso, nowIso, nowIso);
  const status = await refreshSubscriptionForUser(user, true);
  res.json({ success: true, user: publicUser(user), subscription: status });
});

app.use('/api', createEcosystemInternalRouter({
  internalGuard: internalApiGuard,
  resolveUser: resolveUserFromRequest,
  serializeUser: publicUser,
  readSubscription: readSubscriptionStatus,
  emptySubscription: emptySubscriptionStatus,
  refreshSubscription: refreshSubscriptionForUser,
  setPrivateNoStore,
}));

// ─── Admin API (/api/admin-articles — matches Vercel file api/admin-articles.js) ─

function adminIdGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  if (!isAdminUser(user)) return res.status(403).json({ error: 'Доступ запрещён для этого ID' });
  next();
}

app.use('/api', createAdminArticleRouter({
  adminGuard: adminIdGuard,
  adminAuth,
  loadArticles: () => loadData('articles.json') ?? { articles: [], updatedAt: null },
  saveArticles: document => writeArticlesFile(DATA_DIR, document),
  invalidateArticles: () => dataCache.delete('articles.json'),
  deleteArticleVotes: articleId => { dbRun('DELETE FROM article_votes WHERE article_id = ?', articleId); },
  normalizeMode: (value, article) => normalizeArticleModeInput(value, article),
  setPrivateNoStore,
  onVoteCleanupError: (error, articleId) => console.warn(
    `[admin-articles] vote cleanup failed article=${articleId}:`,
    error instanceof Error ? error.message : error,
  ),
}));

app.use('/api', createAdminImageUploadRouter({
  adminAuth,
  contestAdminAuth,
  setPrivateNoStore,
  publicDir: ADMIN_UPLOAD_DIR,
  sourceDir: ADMIN_UPLOAD_SOURCE_DIR,
  maxBytes: ADMIN_UPLOAD_MAX_BYTES,
  maxPixels: ADMIN_UPLOAD_MAX_PIXELS,
  maxWidth: ADMIN_UPLOAD_MAX_WIDTH,
  maxHeight: ADMIN_UPLOAD_MAX_HEIGHT,
  fetchRemoteImage: url => fetchRemoteAdminImage(url, { maxBytes: ADMIN_UPLOAD_MAX_BYTES }),
}));

const referralRouterDependencies = {
  getDatabase: db,
  adminGuard: adminIdGuard,
  adminAuth,
  appUrl: APP_URL,
  clientIp: getTrustedClientIp,
  ipHashSalt: process.env.ECOSYSTEM_INTERNAL_KEY || 'manacost-referrals',
};
app.get('/r/:slug', createReferralRedirectHandler(referralRouterDependencies));
app.use('/api', createReferralRouter(referralRouterDependencies));

app.use('/api', createAdminClassPositionRouter({
  adminGuard: adminIdGuard,
  adminAuth,
  loadPositions: loadClassPositionsData,
  savePositions: document => writeClassPositionsFile(DATA_DIR, document),
  setPrivateNoStore,
}));

app.use('/api', createAdminArchetypeTranslationRouter({
  adminGuard: adminIdGuard,
  adminAuth,
  getDatabase: db,
  loadUpstream: fetchBlizzcoreArchetypesPayload,
  loadObservedArchetypes: loadObservedStandardArchetypes,
  resolveMissingDeckCodes: resolveUntranslatedArchetypeDeckCodes,
  ensureSeeded: ensureArchetypeTranslationsSeeded,
  setPrivateNoStore,
  invalidateTranslations: () => {
    standardArchetypeTranslationsCache = null;
    standardArchetypeTranslationsPromise = null;
    invalidateDataCache();
  },
  recordAudit: (actor, action, entityId, details) => recordAdminAuditByActorId(
    actor.id,
    action,
    'archetype-translation',
    entityId,
    details,
  ),
}));

app.use('/api', createAdminArchetypesRouter({
  adminGuard: adminIdGuard,
  setPrivateNoStore,
  loadArchetypes: async () => {
    /*
     * `hs-data-api` is the only HSReplay client on this path. It owns the
     * authenticated request/session and returns a normalized `{ id, name,
     * class, url }` dictionary. Keeping it out of the browser avoids both
     * Cloudflare failures and leaking HSReplay session details.
     */
    const base = (process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN).replace(/\/+$/, '');
    const response = await fetch(`${base}/api/hsreplay/archetypes?hl=en`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
      signal: AbortSignal.timeout(Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000)),
    });
    if (!response.ok) throw new Error(`HS data API archetypes HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.archetypes) ? payload.archetypes : [];
  },
  loadStandardSnapshots: async () => {
    const base = (process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN).replace(/\/+$/, '');
    const response = await fetch(
      `${base}/api/db/archetypes?game_type=RANKED_STANDARD&rank_range=LEGEND&limit=500`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
        signal: AbortSignal.timeout(Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000)),
      },
    );
    if (!response.ok) throw new Error(`HS data API Standard archetypes HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.archetypes) ? payload.archetypes : [];
  },
  loadWildMeta: async () => {
    /*
     * HSReplay does not publish named Wild-archetype analytics via its
     * per-archetype endpoints. HSGuru is our existing Wild meta source and
     * supplies the aggregate metrics shown in the admin catalogue.
     */
    const base = (process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN).replace(/\/+$/, '');
    const response = await fetch(
      `${base}/v1/hsguru/meta?format=wild&rank=all&period=past_day&min_games=100`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
        signal: AbortSignal.timeout(Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000)),
      },
    );
    if (!response.ok) throw new Error(`HS data API Wild meta HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.data?.items) ? payload.data.items : [];
  },
  loadWildDecks: async (archetype) => {
    const base = (process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN).replace(/\/+$/, '');
    const query = new URLSearchParams({ archetype, format_name: 'wild', rank: 'all' });
    const response = await fetch(`${base}/v1/constructed/hsguru-deck?${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
      signal: AbortSignal.timeout(Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000)),
    });
    if (!response.ok) throw new Error(`HS data API Wild decks HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  },
  loadDetail: async (archetypeId) => {
    const base = (process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN).replace(/\/+$/, '');
    const response = await fetch(
      `${base}/api/db/archetypes/${encodeURIComponent(String(archetypeId))}?game_type=RANKED_STANDARD&rank_range=LEGEND`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
        signal: AbortSignal.timeout(Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000)),
      },
    );
    return { status: response.status, payload: await response.json().catch(() => null) };
  },
  translateArchetype: async (name) => {
    // The translation source is Arena's DB/manual overrides plus fallback map.
    // A missing label intentionally returns the English HSReplay name unchanged.
    const translations = await getStandardArchetypeTranslations();
    return translateStandardArchetype(name, translations.map);
  },
  resolveCanonicalArchetype: async ({ detail }) => {
    const translations = await getStandardArchetypeTranslations();
    return resolveArchetypeDeckIdentity({
      payload: detail as any,
      candidates: loadArchetypeDeckCandidates(db(), 'standard'),
      translate: name => translateStandardArchetype(name, translations.map),
    });
  },
  loadCanonicalMatchups: loadHsguruMatchupRow,
}));

app.use('/api', createDeckBuilderRouter({
  adminGuard: adminIdGuard,
  setPrivateNoStore,
  getDatabase: db,
  loadCatalogCards: async format => {
    const collection = await constructedCardDataService.loadCards(format);
    return collection.cards as any[];
  },
  loadCardsRu: () => loadDataCached('cards_ru.json')?.data ?? null,
  loadArchetypeTranslations: async () => {
    const translations = await getStandardArchetypeTranslations();
    return translations.map;
  },
}));

app.use('/api', createAdminMechanicTranslationRouter({
  adminGuard: adminIdGuard,
  adminAuth,
  getDatabase: db,
  loadCards: constructedCardDataService.loadCards,
  setPrivateNoStore,
  recordAudit: (actor, action, entityId, details) => recordAdminAuditByActorId(
    actor.id,
    action,
    'mechanic-translation',
    entityId,
    details,
  ),
}));

function standardOperationsStatus() {
  const freshCount = (cache: Map<string, { expiresAt: number }>) => [...cache.values()].filter(item => item.expiresAt > Date.now()).length;
  const funDeckPrewarm = funDeckPreviewCoordinator.snapshot();
  return {
    generatedAt: new Date().toISOString(),
    publicRoutes: ['/standard/cards'],
    diamondRoutes: ['/standard/matchups', '/standard/meta', '/standard/vicious-gold'],
    caches: {
      meta: { entries: standardMetaApiCache.size, fresh: freshCount(standardMetaApiCache) },
      viciousGold: { entries: viciousSyndicateGoldApiCache.size, fresh: freshCount(viciousSyndicateGoldApiCache) },
      viciousGoldBuilds: { entries: viciousSyndicateGoldBuildsApiCache.size, fresh: freshCount(viciousSyndicateGoldBuildsApiCache) },
      recommendations: { entries: standardMetaRecommendationCache.size, active: standardMetaRecommendationJobs.size },
      previews: { entries: standardMetaPreviewCache.size, activeJobs: standardMetaPreviewJobs.size },
    },
    deckView: {
      queued: funDeckPrewarm.queued,
      active: deckviewPreviewActive,
      prewarmActive: funDeckPrewarm.active,
      prewarmWarmed: funDeckPrewarm.warmed,
      succeeded: deckviewPreviewSucceeded,
      failed: deckviewPreviewFailed,
      timeoutMs: DECKVIEW_RENDER.timeoutMs,
    },
    sources: {
      viciousSyndicate: VICIOUS_SYNDICATE_LIVE_DATASET,
      cardStatistics: CONSTRUCTED_CARDS_DATASET_BY_FORMAT,
      renderApi: DECKVIEW_RENDER.apiBaseUrl,
    },
  };
}

function resetStandardCache(target: StandardCacheTarget) {
  if (target === 'meta' || target === 'all') {
    standardMetaApiCache.clear();
    viciousSyndicateGoldApiCache.clear();
    viciousSyndicateGoldBuildsApiCache.clear();
    viciousSyndicateGoldBuildsGeneration += 1;
    viciousSyndicateGoldBuildsJob = null;
  }
  if (target === 'recommendations' || target === 'all') {
    standardMetaRecommendationCache.clear();
    standardMetaDeckRowsCache = null;
  }
  if (target === 'previews' || target === 'all') {
    standardMetaPreviewCache.clear();
    persistStandardMetaPreviewCache();
  }
}

app.use('/api', createAdminStandardOperationsRouter({
  adminGuard: adminIdGuard,
  adminAuth,
  getStatus: standardOperationsStatus,
  resetCache: resetStandardCache,
  setPrivateNoStore,
  recordAudit: (actor, action, entityId) => recordAdminAuditByActorId(actor.id, action, 'standard-cache', entityId),
}));

async function loadFunDecksDataset(): Promise<unknown> {
  const base = (process.env.HS_DATA_API_BASE_URL || DATASET_API_ORIGIN).replace(/\/+$/, '');
  const response = await fetch(`${base}/datasets/hsguru_fun_decks`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000)),
  });
  if (!response.ok) throw new Error(`HS data API fun decks HTTP ${response.status}`);
  return response.json();
}

const funDeckPreviewCoordinator = createFunDeckPreviewCoordinator({
  cache: standardMetaPreviewCache,
  revision: DECKVIEW_RENDER.revision,
  publicBaseUrl: DECKVIEW_RENDER.publicBaseUrl,
  render: deck => createStandardMetaPreview({
    deckCode: deck.deckCode,
    archetypeLabel: deck.title,
  }),
});

app.use('/api', createPublicFunDecksRouter({
  loadFunDecks: loadFunDecksDataset,
  getPreview: funDeckPreviewCoordinator.getPreview,
  schedulePreviews: funDeckPreviewCoordinator.schedule,
  onError: error => console.error('[public fun decks]', error instanceof Error ? error.message : error),
}));

app.use('/api', createAdminFunDecksRouter({
  adminGuard: adminIdGuard,
  setPrivateNoStore,
  loadFunDecks: loadFunDecksDataset,
  onError: error => console.error('[admin fun decks]', error instanceof Error ? error.message : error),
}));

app.use('/api', createAdminArenaSynergyServiceRouter({ adminGuard: adminIdGuard, setPrivateNoStore, csrfAllowed: cookieMutationCsrfAllowed, fetchDataset, stateDirectory: DATA_DIR, enableRefreshPipeline: process.env.ARENA_DRAFT_REFRESH_ENABLED !== '0', onRefreshMetric: metric => httpMetrics.arenaDraftRefreshFinished(metric) }));

async function invalidateParserControlledDataCaches(): Promise<void> {
  await clearParserDataCaches({
    memoryCaches: [
      dataCache,
      winratesApiCache,
      tierlistApiCache,
      legendariesApiCache,
      standardMatchupsApiCache,
      standardMetaApiCache,
      constructedArchetypeCatalogCache,
      constructedArchetypeHistoryCache,
      constructedArchetypeAnalysisCache,
      viciousSyndicateGoldApiCache,
      viciousSyndicateGoldBuildsApiCache,
      battlegroundAppProxyCache,
    ],
    singletonCaches: [homeSummaryApiCache, classMatchupsCache, arenaDecksCache],
    invalidateCards: () => constructedCardDataService.invalidate?.(),
    invalidateDerived: () => {
      parserDataCacheGeneration += 1;
      viciousSyndicateGoldBuildsGeneration += 1;
      viciousSyndicateGoldBuildsJob = null;
      standardMetaRecommendationCache.clear();
      standardMetaRecommendationJobs.clear();
      standardMetaDeckRowsCache = null;
      standardMetaPreviewCache.clear();
      persistStandardMetaPreviewCache();
    },
    clearRedis: () => clearRedisDataCache({ throwOnError: true }),
  });
}

const parserRunReconciler = createParserRunReconciler({
  listRuns: hsDataParserControlClient.listRuns,
  invalidate: invalidateParserControlledDataCaches,
  stateStore: createParserRunReconciliationFileStore(DATA_DIR),
  onWarning: (scope, error, runId) => console.warn(
    `[parser-control] reconciliation scope=${scope} runId=${runId}:`,
    error instanceof Error ? error.message : error,
  ),
});

app.use('/api', createAdminParserControlRouter({
  adminGuard: adminIdGuard,
  adminAuth,
  csrfAllowed: cookieMutationCsrfAllowed,
  client: hsDataParserControlClient,
  invalidateParserDataCaches: invalidateParserControlledDataCaches,
  setPrivateNoStore,
  runReconciler: parserRunReconciler,
  onWarning: (scope, error, context) => console.warn(
    `[parser-control] ${scope} requestId=${context?.requestId ?? 'unknown'} action=${context?.action ?? 'unknown'}:`,
    error instanceof Error ? error.message : error,
  ),
  recordAudit: (actor, action, entityId, details) => recordAdminAuditByActorId(
    actor.id,
    action,
    'parser-control',
    entityId,
    details,
  ),
  listAudit: listParserControlAudit,
}));

app.use('/api', createAdminImageGenerationRouter({
  adminGuard: adminIdGuard,
  adminAuth,
  setPrivateNoStore,
  jobs: {
    legendaries: {
      script: join(APP_ROOT_DIR, 'server', 'gen_legendary_image.py'),
      output: join(APP_ROOT_DIR, 'public', 'generated', 'top_legendaries.png'),
      publicUrl: '/generated/top_legendaries.png',
      cwd: join(APP_ROOT_DIR, 'server'),
    },
  },
}));

installSentryExpressErrorHandler(app);
app.use(structuredErrorMiddleware());

const subscriptionRefreshJob = startSubscriptionRefreshJob({ refresh: refreshAllSubscriptions });

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`[Server] API server running on http://${HOST || 'localhost'}:${PORT}`);
  console.log('[Server] Card images: HearthstoneJSON 512x responsive cache');
  console.log('[Server] Scraping is isolated in hs-arena-scraper.service. Trigger queue: POST /api/scrape');

  if (hsDataParserControlClient.configured) {
    const parserRunRecoveryLoop = startParserRunRecoveryLoop({
      reconciler: parserRunReconciler,
      onWarning: error => console.warn(
        '[parser-control] periodic reconciliation failed:',
        error instanceof Error ? error.message : error,
      ),
    });
    httpServer.once('close', () => parserRunRecoveryLoop.stop());
    void parserRunRecoveryLoop.runNow()
      .then(count => {
        if (count > 0) console.log(`[parser-control] resumed or reconciled ${count} manual run(s)`);
      });
  }

  const mailingResumeTimer = setTimeout(() => resumeNewsletterCampaigns(), 1500);
  mailingResumeTimer.unref?.();

  const archetypeTranslationSeedTimer = setTimeout(() => {
    ensureArchetypeTranslationsSeeded()
      .then(() => console.log('[Archetype translations] Startup sync complete.'))
      .catch(error => console.warn(
        '[Archetype translations] Startup sync failed:',
        error instanceof Error ? error.message : error,
      ));
  }, 2500);
  archetypeTranslationSeedTimer.unref?.();

});

installProcessLifecycle({
  server: httpServer,
  quiesce: [{ name: 'subscription-refresh-job', stop: subscriptionRefreshJob.stop }],
  timeoutMs: Number(process.env.SERVER_SHUTDOWN_TIMEOUT_MS || 10_000),
});
