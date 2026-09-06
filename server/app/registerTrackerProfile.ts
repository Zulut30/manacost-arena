import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request } from 'express';
import {
  createJoinKeyDeriver,
  createSqliteTrackerProfileRepository,
  createTrackerProfileRouter,
  initializeTrackerProfileRepository,
  type TrackerAccessTokens,
} from '../modules/trackerProfile/public.js';

type RegisterTrackerProfileDependencies<User extends { id: string }> = {
  app: Application;
  getDatabase: () => DatabaseSync;
  accessTokens: TrackerAccessTokens;
  userAuth: (request: Request) => User | null;
  /** Raw TRACKER_JOIN_SECRET; undefined keeps opponent joining disabled. */
  joinSecret: string | undefined;
  warn?: (message: string) => void;
  onError?: (scope: string, error: unknown) => void;
};

/** Registers personal tracker ingestion and profile reads behind the application bearer boundary. */
export function registerTrackerProfile<User extends { id: string }>(
  dependencies: RegisterTrackerProfileDependencies<User>,
): void {
  initializeTrackerProfileRepository(dependencies.getDatabase);
  const joinKey = createJoinKeyDeriver(dependencies.joinSecret);
  if (!joinKey.enabled) {
    (dependencies.warn ?? console.warn)(
      '[tracker-profile] TRACKER_JOIN_SECRET is not configured; opponent deck joining is disabled',
    );
  }
  dependencies.app.use('/api/v1', createTrackerProfileRouter({
    repository: createSqliteTrackerProfileRepository(dependencies.getDatabase, { joinKey: joinKey.derive }),
    accessTokens: dependencies.accessTokens,
    userAuth: dependencies.userAuth,
    onError: dependencies.onError ?? ((scope, error) => console.error(
      `[tracker-profile] ${scope} failed:`,
      error instanceof Error ? error.message : String(error),
    )),
  }));
}
