import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { OAUTH_PROVIDERS, type OAuthProvider, fetchEnabledProviders, signInWithOAuth } from '../services/authService';
import { ProviderIcon } from './ui/ProviderIcon';

/**
 * Social sign-in buttons, shown only for providers enabled in Supabase. A provider account with the
 * same verified e-mail as an existing account signs into that account (Supabase automatic linking).
 */
export function OAuthButtons({ dividerLabel = 'ou com e-mail', placement = 'before' }: { dividerLabel?: string; placement?: 'before' | 'after' }) {
  const [enabled, setEnabled] = useState<OAuthProvider[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    void fetchEnabledProviders().then(setEnabled);
  }, []);

  if (enabled.length === 0) return null;
  const divider = (
    <div className="divider">
      <span>{dividerLabel}</span>
    </div>
  );
  return (
    <div className="stack-sm">
      {placement === 'after' && divider}
      {OAUTH_PROVIDERS.filter((p) => enabled.includes(p.key)).map((p) => (
        <button
          key={p.key}
          type="button"
          className="btn btn--block"
          disabled={busy !== null}
          onClick={async () => {
            setError('');
            setBusy(p.key);
            const { error: err } = await signInWithOAuth(p.key);
            if (err) {
              setError(friendlyError(err, 'Não foi possível iniciar o login.'));
              setBusy(null);
            }
          }}
        >
          <ProviderIcon provider={p.key} />
          {busy === p.key ? 'Redirecionando…' : `Continuar com ${p.name}`}
        </button>
      ))}
      {error && <div className="alert alert--error">{error}</div>}
      {placement === 'before' && divider}
    </div>
  );
}
