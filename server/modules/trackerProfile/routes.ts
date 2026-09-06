import { Router, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  buildProfileSummary,
  TRACKER_LIMITS,
  TRACKER_MATCH_MODES,
  type TrackerMatchMode,
  type TrackerProfileRepository,
  type TrackerScope,
} from './model.js';
import { parseTrackerBatch, TrackerBatchError, type TrackerRejectionCode } from './schema.js';

export type TrackerAccessTokens = {
  authenticate: (
    accessToken: unknown,
    requiredScopes: readonly TrackerScope[],
  ) => { userId: string } | null | 'FORBIDDEN';
};

export type TrackerProfileRouterDependencies<User extends { id: string }> = {
  repository: TrackerProfileRepository;
  accessTokens: TrackerAccessTokens;
  userAuth: (request: Request) => User | null;
  now?: () => number;
  onError?: (scope: string, error: unknown) => void;
  rateLimits?: { windowMs?: number; perIp?: number; perUser?: number };
};

const apiError = (code: string, message: string) => ({ error: { code, message } });
const RATE_WINDOW_MS = 15 * 60_000;
const PER_IP_LIMIT = 60;
const PER_USER_LIMIT = 120;

function bearerToken(request: Request): string {
  const authorization = String(request.headers.authorization ?? '').trim();
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
}

/** Personal data must never enter a shared or browser cache, including on errors. */
function privateResponse(response: Response): void {
  response.set('Cache-Control', 'private, no-store');
  response.set('Pragma', 'no-cache');
  response.vary('Authorization');
  response.vary('Cookie');
}

function rejectToken(response: Response, forbidden: boolean, scope: TrackerScope): void {
  if (forbidden) {
    response.status(403).json(apiError('INSUFFICIENT_SCOPE', `Access token does not grant ${scope}`));
    return;
  }
  response.set('WWW-Authenticate', 'Bearer realm="Manacost API"');
  response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
}

function unavailable(response: Response): void {
  response.set('Retry-After', '30');
  response.status(503).json(apiError('TRACKER_UNAVAILABLE', 'Tracker profile storage is temporarily unavailable'));
}

function readLimit(value: unknown): number | null {
  if (value === undefined) return TRACKER_LIMITS.defaultReadLimit;
  if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= TRACKER_LIMITS.readLimit ? limit : null;
}

function readMode(value: unknown): TrackerMatchMode | null {
  if (value === undefined) return 'ranked';
  return TRACKER_MATCH_MODES.find(mode => mode === value) ?? null;
}

function createLimiter(options: {
  windowMs: number;
  limit: number;
  keyGenerator?: (request: Request, response: Response) => string;
}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    handler: (_request, response) => {
      privateResponse(response);
      response.status(429).json(apiError('RATE_LIMITED', 'Too many tracker requests; retry later'));
    },
  });
}

/**
 * Batch ingestion is bearer-only; the read routes additionally accept the
 * browser session so the profile UI can consume them without a device token.
 */
export function createTrackerProfileRouter<User extends { id: string }>(
  dependencies: TrackerProfileRouterDependencies<User>,
): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const onError = dependencies.onError ?? (() => undefined);
  const windowMs = dependencies.rateLimits?.windowMs ?? RATE_WINDOW_MS;
  const ipLimiter = createLimiter({ windowMs, limit: dependencies.rateLimits?.perIp ?? PER_IP_LIMIT });
  const userLimiter = createLimiter({
    windowMs,
    limit: dependencies.rateLimits?.perUser ?? PER_USER_LIMIT,
    keyGenerator: (_request, response) => `user:${String(response.locals.trackerUserId ?? '')}`,
  });

  const authenticateWriter: RequestHandler = (request, response, next) => {
    privateResponse(response);
    const verdict = dependencies.accessTokens.authenticate(bearerToken(request), ['tracker.write']);
    if (!verdict || verdict === 'FORBIDDEN') return rejectToken(response, verdict === 'FORBIDDEN', 'tracker.write');
    response.locals.trackerUserId = verdict.userId;
    return next();
  };

  const resolveReader = (request: Request, response: Response): string | null => {
    privateResponse(response);
    const bearer = bearerToken(request);
    if (bearer) {
      const verdict = dependencies.accessTokens.authenticate(bearer, ['tracker.read']);
      if (!verdict || verdict === 'FORBIDDEN') {
        rejectToken(response, verdict === 'FORBIDDEN', 'tracker.read');
        return null;
      }
      return verdict.userId;
    }
    const user = dependencies.userAuth(request);
    if (!user) {
      response.status(401).json(apiError('LOGIN_REQUIRED', 'Sign in to read the tracker profile'));
      return null;
    }
    return user.id;
  };

  const guarded = (scope: string, handler: (request: Request, response: Response) => void): RequestHandler => (
    (request, response) => {
      try {
        handler(request, response);
      } catch (error) {
        onError(scope, error);
        unavailable(response);
      }
    }
  );

  router.post('/tracker/events/batch', ipLimiter, authenticateWriter, userLimiter, guarded('batch', (request, response) => {
    const userId = String(response.locals.trackerUserId);
    let parsed;
    try {
      parsed = parseTrackerBatch(request.body);
    } catch (error) {
      if (error instanceof TrackerBatchError) return response.status(400).json(apiError('INVALID_BATCH', error.message));
      throw error;
    }
    const receivedAt = now();
    const accepted: string[] = [];
    const rejected: Array<{ eventId: string; code: TrackerRejectionCode }> = [];
    for (const entry of parsed) {
      if (entry.status === 'rejected') {
        rejected.push({ eventId: entry.eventId, code: entry.code });
        continue;
      }
      dependencies.repository.recordEvent(userId, entry.event, receivedAt);
      accepted.push(entry.eventId);
    }
    return response.json({ accepted, rejected });
  }));

  router.get('/tracker/profile/summary', guarded('summary', (request, response) => {
    const userId = resolveReader(request, response);
    if (!userId) return;
    response.json(buildProfileSummary(dependencies.repository.readSummaryCounts(userId)));
  }));

  router.get('/tracker/profile/matches', guarded('matches', (request, response) => {
    const userId = resolveReader(request, response);
    if (!userId) return;
    const mode = readMode(request.query.mode);
    const limit = readLimit(request.query.limit);
    if (!mode || !limit) {
      response.status(400).json(apiError('INVALID_QUERY', 'mode must be ranked, arena or battlegrounds; limit 1..50'));
      return;
    }
    response.json({ mode, matches: dependencies.repository.listMatches(userId, mode, limit) });
  }));

  router.get('/tracker/profile/arena/runs', guarded('arena-runs', (request, response) => {
    const userId = resolveReader(request, response);
    if (!userId) return;
    const limit = readLimit(request.query.limit);
    if (!limit) {
      response.status(400).json(apiError('INVALID_QUERY', 'limit must be 1..50'));
      return;
    }
    response.json({ runs: dependencies.repository.listArenaRuns(userId, limit) });
  }));

  return router;
}
