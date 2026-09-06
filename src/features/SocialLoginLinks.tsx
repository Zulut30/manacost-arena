import './SocialLoginLinks.css';

type Provider = 'discord' | 'google' | 'yandex';
type LoginProvider = Provider | 'telegram';
type SocialLoginProvider = { provider: Provider; authUrl: string };

const labels: Record<LoginProvider, string> = { google: 'Google', discord: 'Discord', yandex: 'Яндекс ID', telegram: 'Telegram' };

export function parseSocialLoginProviders(value: unknown): SocialLoginProvider[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): SocialLoginProvider[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { provider?: unknown; authUrl?: unknown };
    if ((candidate.provider !== 'discord' && candidate.provider !== 'google' && candidate.provider !== 'yandex') || typeof candidate.authUrl !== 'string') return [];
    return [{ provider: candidate.provider, authUrl: candidate.authUrl }];
  });
}

export default function SocialLoginLinks({ disabled, providers, telegramAuthUrl, withDivider }: { disabled: boolean; providers: unknown; telegramAuthUrl?: string; withDivider: boolean }) {
  const buttons: Array<{ provider: LoginProvider; authUrl: string }> = [
    ...(telegramAuthUrl ? [{ provider: 'telegram' as const, authUrl: telegramAuthUrl }] : []),
    ...parseSocialLoginProviders(providers),
  ];
  if (!buttons.length) return null;
  return <div className="login-telegram">{withDivider && <div className="login-divider"><span className="login-divider__line" /><span>или</span><span className="login-divider__line" /></div>}<div className="login-provider-grid" aria-label="Вход через социальные сети">{buttons.map(({ provider, authUrl }) => (
    <a key={provider} href={authUrl} className={`login-provider login-provider--${provider}${disabled ? ' login-provider--disabled' : ''}`} aria-label={`Войти через ${labels[provider]}`} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} onClick={disabled ? event => event.preventDefault() : undefined} title={`Войти через ${labels[provider]}`}>
      <img className="login-provider__icon" src={`/auth-icons/${provider}.svg`} alt="" width="32" height="32" />
    </a>
  ))}</div></div>;
}
