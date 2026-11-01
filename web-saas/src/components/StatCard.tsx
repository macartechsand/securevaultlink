import { Icon, type IconName } from './ui/Icon';

type StatCardProps = {
  label: string;
  value: string;
  note?: string;
  tone?: 'good' | 'bad' | 'neutral';
  icon?: IconName;
  /** Makes the whole card a button (e.g. opens the vault filtered by this risk). */
  onClick?: () => void;
};

export function StatCard({ label, value, note, tone = 'neutral', icon, onClick }: StatCardProps) {
  const badge = tone === 'good' ? 'badge--ok' : tone === 'bad' ? 'badge--danger' : '';
  const body = (
    <>
      <div className="stat__label">
        <span className="row">
          {icon && (
            <span className="stat__icon" aria-hidden="true">
              <Icon name={icon} size={16} />
            </span>
          )}
          {label}
        </span>
        {note && <span className={`badge ${badge}`}>{note}</span>}
      </div>
      <div className="stat__value">{value}</div>
    </>
  );
  const className = `stat ${tone !== 'neutral' ? `stat--${tone}` : ''}`;
  if (onClick) {
    return (
      <button type="button" className={`${className} stat--link`} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
