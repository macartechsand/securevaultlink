export type VaultItem = {
  id: number;
  title: string;
  username: string;
  password?: string;
  url: string;
  appLink?: string;
  category: 'Work' | 'Finance' | 'Social' | 'Personal';
  strength: 'Strong' | 'Medium' | 'Weak';
  lastUsed: string;
  status: 'Healthy' | 'Review' | 'Blocked';
  exposed: boolean;
};

export const vaultItems: VaultItem[] = [
  {
    id: 1,
    title: 'Google Workspace',
    username: 'analise@securevault.io',
    url: 'accounts.google.com',
    appLink: 'https://accounts.google.com',
    category: 'Work',
    strength: 'Strong',
    lastUsed: '2 hours ago',
    status: 'Healthy',
    exposed: false,
  },
  {
    id: 2,
    title: 'GitHub',
    username: 'dev-secure',
    url: 'github.com',
    appLink: 'https://github.com',
    category: 'Work',
    strength: 'Strong',
    lastUsed: 'Today',
    status: 'Healthy',
    exposed: false,
  },
  {
    id: 3,
    title: 'Stripe',
    username: 'billing@securevault.io',
    url: 'dashboard.stripe.com',
    appLink: 'https://dashboard.stripe.com',
    category: 'Finance',
    strength: 'Medium',
    lastUsed: '1 day ago',
    status: 'Review',
    exposed: true,
  },
  {
    id: 4,
    title: 'Notion',
    username: 'team@securevault.io',
    url: 'notion.so',
    appLink: 'https://notion.so',
    category: 'Personal',
    strength: 'Strong',
    lastUsed: '4 days ago',
    status: 'Healthy',
    exposed: false,
  },
  {
    id: 5,
    title: 'Twitter',
    username: 'securevault',
    url: 'x.com',
    appLink: 'https://x.com',
    category: 'Social',
    strength: 'Weak',
    lastUsed: '5 days ago',
    status: 'Blocked',
    exposed: true,
  },
];

export type SecureLink = {
  id: number;
  title: string;
  url: string;
  description: string;
  status: 'Trusted' | 'Review';
};

export const secureLinks: SecureLink[] = [
  {
    id: 1,
    title: 'Banking Portal',
    url: 'https://banking.securevault.io',
    description: 'Trusted access to corporate finance services.',
    status: 'Trusted',
  },
  {
    id: 2,
    title: 'Corporate VPN',
    url: 'https://vpn.securevault.io',
    description: 'Secure gateway for remote worker access.',
    status: 'Review',
  },
];

export const activityFeed = [
  {
    title: 'Password rotation finished',
    detail: '6 critical accounts rotated successfully',
    time: '2 min ago',
    tone: 'success',
  },
  {
    title: 'Security alert reviewed',
    detail: '1 account matched a breach record',
    time: '45 min ago',
    tone: 'warning',
  },
  {
    title: 'New device verified',
    detail: 'Laptop · Windows 11 · Berlin office',
    time: '1 hour ago',
    tone: 'info',
  },
  {
    title: 'Backup completed',
    detail: 'Latest encrypted export synced',
    time: 'Today',
    tone: 'success',
  },
];

export const overviewStats = [
  { label: 'Vault items', value: '1,248', change: '+12.4%', status: 'up' },
  { label: 'Security score', value: '94%', change: '+6.2%', status: 'up' },
  { label: 'Breach alerts', value: '03', change: '-2', status: 'down' },
  { label: 'Active devices', value: '12', change: '+3', status: 'up' },
];

export const scoreBreakdown = [
  { label: 'Encryption', value: 96 },
  { label: 'Password health', value: 88 },
  { label: 'Device trust', value: 92 },
  { label: 'Backup integrity', value: 89 },
];

export const planFeatures = [
  { name: 'Protected vault', value: 'Unlimited' },
  { name: 'Password history', value: 'Included' },
  { name: 'Secure sharing', value: '4 users' },
  { name: 'Business SSO', value: 'Available' },
];
