import type { VaultItem } from '../data/mockData';

type PasswordTableProps = {
  items: VaultItem[];
  onAddItem?: () => void;
};

export function PasswordTable({ items, onAddItem }: PasswordTableProps) {
  return (
    <div className="table-card">
      <div className="table-header">
        <div>
          <p className="eyebrow">Protected vault</p>
          <h3>Recent entries</h3>
        </div>
        <button type="button" className="ghost-button" onClick={onAddItem}>
          + Add item
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Username</th>
            <th>Site</th>
            <th>Category</th>
            <th>Strength</th>
            <th>Last used</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="table-title">
                  <span className="tiny-pill">{item.title.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.url}</small>
                  </div>
                </div>
              </td>
              <td>{item.username}</td>
              <td>
                <div className="site-cell">
                  <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noreferrer">
                    Visit
                  </a>
                  {item.appLink && (
                    <a href={item.appLink} target="_blank" rel="noreferrer" className="link-button">
                      Open app
                    </a>
                  )}
                </div>
              </td>
              <td>{item.category}</td>
              <td>
                <span className={`strength ${item.strength.toLowerCase()}`}>{item.strength}</span>
              </td>
              <td>{item.lastUsed}</td>
              <td>
                <span className={`status-pill ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {item.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
