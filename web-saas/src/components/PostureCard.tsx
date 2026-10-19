import type { Posture } from '../lib/posture';
import { Icon } from './ui/Icon';

const SEVERITY: Record<string, { badge: string; label: string }> = {
  high: { badge: 'badge--danger', label: 'Alta' },
  medium: { badge: 'badge--warn', label: 'Média' },
  low: { badge: '', label: 'Baixa' },
};

const tone = (pct: number) => (pct < 50 ? 'meter--danger' : pct < 80 ? 'meter--warn' : '');

export function PostureCard({ posture, onAction }: { posture: Posture; onAction: (view: string, filter?: string) => void }) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Postura de segurança</p>
          <h2>
            {posture.score}/100 <span className={`badge ${posture.score >= 70 ? 'badge--ok' : posture.score >= 50 ? 'badge--warn' : 'badge--danger'}`}>{posture.grade}</span>
          </h2>
          <p className="subtle">Calculada só com dados reais da sua conta: senhas, proteção da conta, sites, compartilhamentos e sessões.</p>
        </div>
      </div>
      <div className={`meter ${tone(posture.score)}`} aria-hidden="true">
        <span className={`w-${Math.round(posture.score / 10)}`} />
      </div>

      <div className="grid grid--stats">
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
