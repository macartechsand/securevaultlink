import type { Posture } from '../lib/posture';
import { Icon } from './ui/Icon';

const SEVERITY: Record<string, { badge: string; label: string }> = {
  high: { badge: 'badge--danger', label: 'Alta' },
  medium: { badge: 'badge--warn', label: 'Média' },
  low: { badge: '', label: 'Baixa' },
};

const tone = (pct: number) => (pct < 50 ? 'meter--danger' : pct < 80 ? 'meter--warn' : '');

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

/** Circular 0–100 gauge. Uses SVG attributes (no inline styles, so the strict CSP still holds). */
function ScoreRing({ score }: { score: number }) {
  const ringTone = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'danger';
  const filled = (Math.max(0, Math.min(100, score)) / 100) * RING_C;
  return (
    <div className={`score-ring score-ring--${ringTone}`} role="img" aria-label={`Pontuação ${score} de 100`}>
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
        <circle className="score-ring__track" cx="54" cy="54" r={RING_R} fill="none" strokeWidth="9" />
        <circle
          className="score-ring__value"
          cx="54"
          cy="54"
          r={RING_R}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${RING_C}`}
        />
      </svg>
      <div className="score-ring__label" aria-hidden="true">
        <strong>{score}</strong>
        <span>de 100</span>
      </div>
    </div>
  );
}

export function PostureCard({ posture, onAction }: { posture: Posture; onAction: (view: string, filter?: string) => void }) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Postura de segurança</p>
          <h2>
            Nível <span className={`badge ${posture.score >= 70 ? 'badge--ok' : posture.score >= 50 ? 'badge--warn' : 'badge--danger'}`}>{posture.grade}</span>
          </h2>
          <p className="subtle">Calculada só com dados reais da sua conta: senhas, proteção da conta, sites, compartilhamentos e sessões.</p>
        </div>
      </div>

      <div className="posture-head">
        <ScoreRing score={posture.score} />
        <div className="posture-cats">
          {posture.categories.map((c) => {
            const pct = Math.round((c.score / c.max) * 100);
            return (
              <div key={c.key} className="stack-sm">
                <span className="row-between subtle">
                  <span>{c.label}</span>
                  <span>
                    {Math.round(c.score)}/{c.max}
                  </span>
                </span>
                <div className={`meter ${tone(pct)}`} aria-hidden="true">
                  <span className={`w-${Math.round(pct / 10)}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3>Recomendações</h3>
        {posture.recommendations.length === 0 ? (
          <p className="empty">
            <Icon name="check" /> Nada pendente. Continue rodando a verificação de segurança de tempos em tempos.
          </p>
        ) : (
          <ul className="list">
            {posture.recommendations.map((r) => (
              <li key={r.id}>
                <span>
                  <span className={`badge ${SEVERITY[r.severity].badge}`}>{SEVERITY[r.severity].label}</span> <strong>{r.title}</strong>
                  <span className="subtle block">{r.detail}</span>
                </span>
                {r.action && (
                  <button type="button" className="btn btn--sm" onClick={() => onAction(r.action!.view, r.action!.filter)}>
                    {r.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
