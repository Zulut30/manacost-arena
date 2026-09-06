type Provider = 'discord' | 'google' | 'yandex';
export type SocialLoginProvider = { provider: Provider; authUrl: string };

const labels: Record<Provider, string> = { google: 'Google', discord: 'Discord', yandex: 'Яндекс ID' };

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
  return <div className="login-telegram">{withDivider && <div className="login-divider"><span className="login-divider__line" /><span>или</span><span className="login-divider__line" /></div>}<div className="login-social-links">{providers.map(({ provider, authUrl }) => (
    <a key={provider} href={authUrl} className={`login-telegram-link${disabled ? ' login-telegram-link--disabled' : ''}`} aria-disabled={disabled}>
      <span>Войти через {labels[provider]}</span>
    </a>
  ))}</div></div>;
}
