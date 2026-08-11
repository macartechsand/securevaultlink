type StatCardProps = {
  label: string;
  value: string;
  change: string;
  status: 'up' | 'down';
};

export function StatCard({ label, value, change, status }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-head">
        <span>{label}</span>
        <span className={`chip ${status}`}>{change}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
