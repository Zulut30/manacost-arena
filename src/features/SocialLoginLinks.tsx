type Provider = 'discord' | 'google' | 'yandex';
export type SocialLoginProvider = { provider: Provider; authUrl: string };

const labels: Record<Provider, string> = { google: 'Google', discord: 'Discord', yandex: 'Яндекс ID' };

function loginUrl(authUrl: string, provider: Provider) {
  const url = new URL(authUrl, window.location.origin);
  url.searchParams.set('returnTo', `/?login&${provider}=ok`);
  return url.toString();
}

export function parseSocialLoginProviders(value: unknown): SocialLoginProvider[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): SocialLoginProvider[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { provider?: unknown; authUrl?: unknown };
    if ((candidate.provider !== 'discord' && candidate.provider !== 'google' && candidate.provider !== 'yandex') || typeof candidate.authUrl !== 'string') return [];
    return [{ provider: candidate.provider, authUrl: candidate.authUrl }];
  });
}

export default function SocialLoginLinks({ disabled, providers, withDivider }: { disabled: boolean; providers: SocialLoginProvider[]; withDivider: boolean }) {
  if (!providers.length) return null;
  return <div className={withDivider ? 'login-telegram' : 'login-telegram login-telegram--followup'}>{withDivider && <div className="login-divider"><span className="login-divider__line" /><span>или</span><span className="login-divider__line" /></div>}<div className="login-social-links">{providers.map(({ provider, authUrl }) => (
    <a key={provider} href={loginUrl(authUrl, provider)} className={`login-social-link login-social-link--${provider}${disabled ? ' login-telegram-link--disabled' : ''}`} aria-disabled={disabled}>
      <span className="login-social-link__mark" aria-hidden="true">{labels[provider].slice(0, 1)}</span>
      <span>Войти через {labels[provider]}</span>
    </a>
  ))}</div></div>;
}
