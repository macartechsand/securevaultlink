import { useEffect, useMemo, useState } from 'react';
import { parseOtp, totpCode } from '../lib/totp';
import { Icon } from './ui/Icon';

/** Live one-time code with the seconds left and a copy button (clipboard cleared after 30 s). */
export function OtpCode({ secret, onCopied }: { secret: string; onCopied?: () => void }) {
  const params = useMemo(() => {
    try {
      return parseOtp(secret);
    } catch {
      return null;
    }
  }, [secret]);
  const [state, setState] = useState<{ code: string; secondsLeft: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!params) return;
    let alive = true;
    const tick = () => void totpCode(params).then((s) => alive && setState(s));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [params]);

  if (!params) return <span className="field__hint">Segredo inválido: cole o código em base32 ou o link otpauth:// do site.</span>;
  if (!state) return null;
  const code = state.code;
  const pretty = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return (
    <div className="row otp-code">
      <code className="otp-code__value" aria-live="polite">
        {pretty}
      </code>
      <span className={`badge ${state.secondsLeft <= 5 ? 'badge--warn' : ''}`}>{state.secondsLeft}s</span>
      <button
        type="button"
        className="btn btn--sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            onCopied?.();
            window.setTimeout(async () => {
              try {
                if ((await navigator.clipboard.readText()) === code) await navigator.clipboard.writeText('');
              } catch {
                /* ignore */
              }
              setCopied(false);
            }, 30_000);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
        {copied ? 'Copiado' : 'Copiar código'}
      </button>
      {(params.issuer || params.account) && <span className="subtle">{[params.issuer, params.account].filter(Boolean).join(' · ')}</span>}
    </div>
  );
}
