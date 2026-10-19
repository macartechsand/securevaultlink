type StatCardProps = {
  label: string;
  value: string;
  note?: string;
  tone?: 'good' | 'bad' | 'neutral';
};

export function StatCard({ label, value, note, tone = 'neutral' }: StatCardProps) {
  const badge = tone === 'good' ? 'badge--ok' : tone === 'bad' ? 'badge--danger' : '';
  return (
    <div className="stat">
      <div className="stat__label">
        <span>{label}</span>
        {note && <span className={`badge ${badge}`}>{note}</span>}
      </div>
      <div className="stat__value">{value}</div>
    </div>
  );
}
