export const SOCIAL_PROVIDERS = ['google', 'discord', 'yandex'] as const;
export type SocialProvider = typeof SOCIAL_PROVIDERS[number];

type SocialProviderConfig = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scope: string;
  userInfoAuthorizationScheme: 'Bearer' | 'OAuth';
};

export type SocialProfile = {
  subject: string;
  name: string;
  username: string;
  email: string;
  photoUrl: string;
};

const PROVIDER_CONFIG: Record<SocialProvider, SocialProviderConfig> = {
  discord: {
    authorizationEndpoint: 'https://discord.com/oauth2/authorize',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    userInfoEndpoint: 'https://discord.com/api/users/@me',
    scope: 'identify email',
    userInfoAuthorizationScheme: 'Bearer',
  },
  google: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid profile email',
    userInfoAuthorizationScheme: 'Bearer',
  },
  yandex: {
    authorizationEndpoint: 'https://oauth.yandex.ru/authorize',
    tokenEndpoint: 'https://oauth.yandex.ru/token',
    userInfoEndpoint: 'https://login.yandex.ru/info?format=json',
    scope: 'login:email login:info',
    userInfoAuthorizationScheme: 'OAuth',
  },
};

export function isSocialProvider(value: string): value is SocialProvider {
  return SOCIAL_PROVIDERS.includes(value as SocialProvider);
}

export function createSocialAuthorizationUrl(input: {
  provider: SocialProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const config = PROVIDER_CONFIG[input.provider];
  const url = new URL(config.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: config.scope,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export async function fetchSocialProfile(input: {
  provider: SocialProvider;
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<SocialProfile | null> {
  const config = PROVIDER_CONFIG[input.provider];
  const fetchImpl = input.fetchImpl ?? fetch;
  const tokenResponse = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  });
  if (!tokenResponse.ok) return null;
  const token = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
  const accessToken = typeof token?.access_token === 'string' ? token.access_token : '';
  if (!accessToken) return null;
  const profileResponse = await fetchImpl(config.userInfoEndpoint, {
    headers: { Authorization: `${config.userInfoAuthorizationScheme} ${accessToken}` },
  });
  if (!profileResponse.ok) return null;
  return parseSocialProfile(input.provider, await profileResponse.json().catch(() => null));
}

function text(value: unknown, maximum = 500): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum) : '';
}

export function parseSocialProfile(provider: SocialProvider, value: unknown): SocialProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  if (provider === 'discord') {
    const subject = text(profile.id, 64);
    const username = text(profile.username, 120);
    const avatar = text(profile.avatar, 200);
    if (!subject) return null;
    return {
      subject,
      name: text(profile.global_name, 120) || username || `Discord ${subject}`,
      username,
      email: profile.verified === true ? text(profile.email, 254).toLowerCase() : '',
      photoUrl: avatar ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(subject)}/${encodeURIComponent(avatar)}.png` : '',
    };
  }
  const subject = text(profile.sub ?? profile.id, 256);
  if (!subject) return null;
  return {
    subject,
    name: text(profile.name ?? profile.display_name, 120) || text(profile.login, 120) || `${provider} ${subject}`,
    username: text(profile.login ?? profile.preferred_username, 120),
    email: text(profile.email ?? profile.default_email, 254).toLowerCase(),
    photoUrl: text(profile.picture, 1_000),
  };
}
