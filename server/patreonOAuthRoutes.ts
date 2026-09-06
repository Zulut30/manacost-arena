import { randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { decodeSignedStateCookie, encodeSignedStateCookie, safeAuthReturnTo } from './authRedirect.js';
import {
  createPatreonAuthorizationUrl,
  exchangePatreonAuthorizationCode,
  type PatreonAuthorization,
  type PatreonClient,
} from './patreonOAuth.js';

const STATE_TTL_MS = 10 * 60 * 1_000;
const COOKIE_NAME = 'manacost_patreon_link';

type LinkState = {
  state: string;
  userId: string;
  returnTo: string;
  expiresAt: number;
};

type PatreonLinkUser = { id: string; blockedAt?: string };

export type PatreonOAuthRouteDependencies<User extends PatreonLinkUser> = {
  appUrl: string;
  client: PatreonClient | null;
  cookieValue: (request: Request, name: string) => string;
  cookieSecure: (request: Request) => boolean;
  cookieDomain: (request: Request) => string;
  setPrivateNoStore: (response: Response) => void;
  userAuth: (request: Request) => User | null;
  setAuthCookie: (request: Request, response: Response, token: string) => void;
  provisionUser: (authorization: PatreonAuthorization) => { user: User; token: string } | null;
  saveAuthorization: (user: User, authorization: PatreonAuthorization) => void;
  refreshSubscription: (user: User, force: boolean) => Promise<unknown>;
  exchangeAuthorization?: (input: {
    client: PatreonClient;
    code: string;
    redirectUri: string;
  }) => Promise<PatreonAuthorization | null>;
};

function callbackUrl<User extends PatreonLinkUser>(dependencies: PatreonOAuthRouteDependencies<User>): string {
  return `${dependencies.appUrl}/api/auth/patreon/callback`;
}

function readState<User extends PatreonLinkUser>(
  dependencies: PatreonOAuthRouteDependencies<User>,
  request: Request,
): LinkState | null {
  if (!dependencies.client) return null;
  const raw = dependencies.cookieValue(request, COOKIE_NAME);
  if (!raw) return null;
  const decoded = decodeSignedStateCookie(raw, dependencies.client.clientSecret);
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const value = decoded as Partial<LinkState>;
  if (typeof value.state !== 'string' || typeof value.userId !== 'string' || Number(value.expiresAt) <= Date.now()) return null;
  return {
    state: value.state,
    userId: value.userId,
    returnTo: safeAuthReturnTo(value.returnTo, '/?login&patreon=linked'),
    expiresAt: Number(value.expiresAt),
  };
}

function writeState<User extends PatreonLinkUser>(
  dependencies: PatreonOAuthRouteDependencies<User>,
  request: Request,
  response: Response,
  state: LinkState | null,
): void {
  const attributes = [
    `Path=/api/auth/patreon`,
    state ? `Max-Age=${Math.ceil(STATE_TTL_MS / 1_000)}` : 'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    dependencies.cookieSecure(request) ? 'Secure' : '',
    dependencies.cookieDomain(request),
  ].filter(Boolean).join('; ');
  const value = state && dependencies.client
    ? encodeURIComponent(encodeSignedStateCookie(state, dependencies.client.clientSecret))
    : '';
  response.append('Set-Cookie', `${COOKIE_NAME}=${value}; ${attributes}`);
}

function errorRedirect(response: Response): void {
  response.redirect('/?login&patreon=error');
}

/**
 * A signed-in user explicitly links Patreon to the existing account. Without
 * a current session this is a normal Patreon sign-in that provisions or reuses
 * the account bound to that Patreon identity.
 */
export function registerPatreonOAuthRoutes<User extends PatreonLinkUser>(
  app: Express,
  dependencies: PatreonOAuthRouteDependencies<User>,
): void {
  app.get('/api/auth/patreon/start', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!dependencies.client || user?.blockedAt) return errorRedirect(response);
    const state: LinkState = {
      state: randomBytes(24).toString('base64url'),
      userId: user?.id || '',
      returnTo: safeAuthReturnTo(request.query.returnTo, '/?login&patreon=linked'),
      expiresAt: Date.now() + STATE_TTL_MS,
    };
    writeState(dependencies, request, response, state);
    response.redirect(createPatreonAuthorizationUrl({
      clientId: dependencies.client.clientId,
      redirectUri: callbackUrl(dependencies),
      state: state.state,
    }));
  });

  app.get('/api/auth/patreon/callback', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const state = readState(dependencies, request);
    writeState(dependencies, request, response, null);
    const sessionUser = dependencies.userAuth(request);
    if (!dependencies.client || !state || sessionUser?.blockedAt || (state.userId && (!sessionUser || sessionUser.id !== state.userId)) || state.state !== String(request.query.state || '')) {
      return errorRedirect(response);
    }
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    if (!code) return errorRedirect(response);
    try {
      const authorization = await (dependencies.exchangeAuthorization ?? exchangePatreonAuthorizationCode)({
        client: dependencies.client,
        code,
        redirectUri: callbackUrl(dependencies),
      });
      if (!authorization) return errorRedirect(response);
      const login = state.userId ? null : dependencies.provisionUser(authorization);
      const user = state.userId ? sessionUser : login?.user;
      if (!user) return errorRedirect(response);
      dependencies.saveAuthorization(user, authorization);
      await dependencies.refreshSubscription(user, true);
      if (login) dependencies.setAuthCookie(request, response, login.token);
      return response.redirect(state.returnTo);
    } catch {
      return errorRedirect(response);
    }
  });
}
