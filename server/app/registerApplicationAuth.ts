import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createApplicationAuthManager,
  createApplicationAuthRouter,
  createSqliteApplicationAuthRepository,
  initializeApplicationAuthRepository,
  type ApplicationAuthManager,
} from '../modules/applicationAuth/public.js';

type RegisterApplicationAuthDependencies<User extends { id: string }, Subscription> = {
  app: Application;
  getDatabase: () => DatabaseSync;
  appUrl: string;
  userAuth: (request: Request) => User | null;
  resolveUser: (userId: string) => User | null;
  serializeUser: (user: User) => unknown;
  readSubscription: (userId: string) => Subscription | null;
  emptySubscription: () => Subscription;
  setPrivateNoStore: (response: Response) => void;
};

const oauthLimiter = (maximum: number) => rateLimit({
  windowMs: 15 * 60_000,
  max: maximum,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.set('Cache-Control', 'private, no-store');
    response.set('Pragma', 'no-cache');
    response.status(429).json({ error: 'temporarily_unavailable' });
  },
});

/**
 * Registers the public-client OAuth boundary and returns its access-token
 * authenticator for the rest of Public API v1.
 */
export function registerApplicationAuth<User extends { id: string }, Subscription>(
  dependencies: RegisterApplicationAuthDependencies<User, Subscription>,
): ApplicationAuthManager {
  initializeApplicationAuthRepository(dependencies.getDatabase);
  const manager = createApplicationAuthManager({
    repository: createSqliteApplicationAuthRepository(dependencies.getDatabase),
    clients: [{
      id: 'manacost-tracker',
      name: 'Manacost Tracker',
      scopes: [
        'profile.read',
        'subscription.read',
        'catalog.read',
        'images.read',
        'statistics.read',
        'tracker.write',
        'tracker.read',
      ],
    }],
    verificationUri: `${dependencies.appUrl.replace(/\/+$/, '')}/connect/`,
  });
  dependencies.app.use('/api/v1/oauth/device/code', oauthLimiter(20));
  dependencies.app.use('/api/v1/oauth/device/authorization', oauthLimiter(120));
  dependencies.app.use('/api/v1/oauth/device/approve', oauthLimiter(30));
  dependencies.app.use('/api/v1/oauth/token', oauthLimiter(240));
  dependencies.app.use('/api/v1/oauth/revoke', oauthLimiter(60));
  dependencies.app.use('/api/v1', createApplicationAuthRouter({
    manager,
    userAuth: dependencies.userAuth,
    userId: user => user.id,
    resolveUser: dependencies.resolveUser,
    serializeUser: dependencies.serializeUser,
    readSubscription: dependencies.readSubscription,
    emptySubscription: dependencies.emptySubscription,
    setPrivateNoStore: dependencies.setPrivateNoStore,
  }));
  return manager;
}
