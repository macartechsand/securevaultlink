type StatCardProps = {
  label: string;
  value: string;
  note?: string;
  tone?: 'good' | 'bad' | 'neutral';
};

export function StatCard({ label, value, note, tone = 'neutral' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-head">
        <span>{label}</span>
        {note && <span className={`chip ${tone === 'good' ? 'up' : tone === 'bad' ? 'down' : ''}`}>{note}</span>}
      </div>
      <strong>{value}</strong>
    </div>
  );
}
