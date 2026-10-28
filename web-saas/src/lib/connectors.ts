/**
 * Rotation connectors (CyberArk-style "platforms"): declarative manifests that describe what a
 * connector can do, which credentials it needs and WHERE it must run. Adding a platform means adding
 * a manifest plus, for automatic connectors, an adapter in the matching executor.
 *
 * Executors:
 *  - assisted: the user changes the password on the site, guided by the app (zero-knowledge, any site).
 *  - cloud:    a rotation worker calls a public API. The worker sees the credential while rotating,
 *              so it requires explicit per-item consent.
 *  - agent:    an agent installed inside the customer's network (outbound-only), for targets that are
 *              not reachable from the internet (databases, servers, Active Directory).
 */
import type { ItemType } from './items'

export type ConnectorCategory = 'web' | 'cloud' | 'directory' | 'saas_api' | 'database' | 'server' | 'secrets_sync'
export type Executor = 'assisted' | 'cloud' | 'agent'
/** beta = implemented, but not yet validated against the real platform by the operator. */
export type ConnectorStatus = 'available' | 'beta' | 'planned'
export type Capability = 'change' | 'verify' | 'reconcile' | 'rotate_key' | 'sync'

export type PasswordPolicy = { minLength: number; maxLength: number; symbols: boolean; excludeChars?: string }

export type ConnectorManifest = {
  id: string
  name: string
  category: ConnectorCategory
  executor: Executor
  status: ConnectorStatus
  capabilities: Capability[]
  itemTypes: ItemType[]
  description: string
  /** What the connector needs in order to run (shown to the user before consenting). */
  requires: string[]
  policy: PasswordPolicy
}

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  web: 'Sites e aplicativos',
  cloud: 'Nuvem',
  directory: 'Identidade e diretório',
  saas_api: 'Tokens e chaves de SaaS',
  database: 'Bancos de dados',
  server: 'Servidores',
  secrets_sync: 'Sincronização com cofres de segredos',
}

export const EXECUTOR_LABELS: Record<Executor, { label: string; detail: string }> = {
  assisted: {
    label: 'Assistida',
    detail: 'Você troca a senha no site com o app guiando cada passo. O servidor nunca vê a senha.',
  },
  cloud: {
    label: 'Automática na nuvem',
    detail:
      'Em 1 clique, uma função do servidor chama a API da plataforma, verifica a nova credencial e devolve ao seu navegador, que a cifra no cofre. Ela vê a credencial só durante a troca e não guarda nada; exige seu consentimento por item.',
  },
  agent: {
    label: 'Agente local',
    detail: 'Um agente instalado na sua rede executa a troca; só faz conexões de saída e recebe tarefas cifradas.',
  },
}

const WEB_POLICY: PasswordPolicy = { minLength: 20, maxLength: 64, symbols: true }

export const CONNECTORS: ConnectorManifest[] = [
  {
    id: 'web-assisted',
    name: 'Qualquer site (troca assistida)',
    category: 'web',
    executor: 'assisted',
    status: 'available',
    capabilities: ['change'],
    itemTypes: ['login'],
    description: 'Gera uma senha nova, abre a página de troca do site (padrão /.well-known/change-password) e guarda a anterior no histórico.',
    requires: ['Acesso à conta no site'],
    policy: WEB_POLICY,
  },
  {
    id: 'aws-iam-access-key',
    name: 'AWS IAM: chave de acesso',
    category: 'cloud',
    executor: 'cloud',
    status: 'beta',
    capabilities: ['rotate_key', 'verify'],
    itemTypes: ['secret'],
    description: 'Cria uma nova access key, verifica (sts:GetCallerIdentity, mesma identidade), salva no cofre e só então remove a antiga.',
    requires: [
      'Item do tipo Segredo com o Access key ID (AKIA…) em "Identificador" e a Secret no valor',
      'Permissões iam:CreateAccessKey e iam:DeleteAccessKey no próprio usuário; no máximo 1 chave ativa antes da troca',
    ],
    policy: WEB_POLICY,
  },
  {
    id: 'aws-iam-console',
    name: 'AWS IAM: senha do console',
    category: 'cloud',
    executor: 'cloud',
    status: 'beta',
    capabilities: ['change'],
    itemTypes: ['login'],
    description: 'Gera uma senha forte e a aplica ao usuário IAM (UpdateLoginProfile) com uma access key administrativa guardada em outro item do cofre.',
    requires: [
      'Login com o nome do usuário IAM em "Usuário"',
      'Um segredo do cofre com uma access key (AKIA…) que tenha iam:UpdateLoginProfile para esse usuário',
    ],
    policy: { minLength: 20, maxLength: 128, symbols: true },
  },
  {
    id: 'entra-app-secret',
    name: 'Microsoft Entra ID: segredo de aplicativo',
    category: 'directory',
    executor: 'cloud',
    status: 'beta',
    capabilities: ['rotate_key', 'verify'],
    itemTypes: ['secret'],
    description: 'Adiciona um novo client secret (Graph addPassword), verifica com um token e, depois de salvar, remove o antigo (removePassword).',
    requires: [
      'Application (client) ID em "Identificador" e o Directory (tenant) ID na configuração',
      'Permissão de aplicativo Application.ReadWrite.OwnedBy (com consentimento do admin) e o app como dono de si mesmo',
    ],
    policy: WEB_POLICY,
  },
  {
    id: 'gcp-service-account-key',
    name: 'Google Cloud: chave de service account',
    category: 'cloud',
    executor: 'cloud',
    status: 'beta',
    capabilities: ['rotate_key', 'verify'],
    itemTypes: ['secret'],
    description: 'Cria uma nova chave JSON, verifica obtendo um token com ela e, depois de salvar, remove a antiga.',
    requires: [
      'O arquivo JSON da chave em "Valor do segredo"',
      'Papel "Service Account Key Admin" da service account nela mesma; a política da organização deve permitir chaves',
    ],
    policy: WEB_POLICY,
  },
  {
    id: 'entra-user',
    name: 'Microsoft Entra ID: senha de usuário',
    category: 'directory',
    executor: 'cloud',
    status: 'planned',
    capabilities: ['change'],
    itemTypes: ['login'],
    description: 'Redefine a senha de contas de serviço do tenant via Microsoft Graph.',
    requires: ['Administrador do tenant (User.ReadWrite.All)'],
    policy: { minLength: 16, maxLength: 256, symbols: true },
  },
  {
    id: 'google-workspace-user',
    name: 'Google Workspace: senha de usuário',
    category: 'directory',
    executor: 'cloud',
    status: 'planned',
    capabilities: ['change'],
    itemTypes: ['login'],
    description: 'Troca a senha de contas do domínio via Admin SDK.',
    requires: ['Conta de serviço com delegação de domínio'],
    policy: { minLength: 16, maxLength: 100, symbols: true },
  },
  {
    id: 'okta-user',
    name: 'Okta: senha de usuário',
    category: 'directory',
    executor: 'cloud',
    status: 'planned',
    capabilities: ['change'],
    itemTypes: ['login'],
    description: 'Troca a senha de contas de serviço via Okta Users API.',
    requires: ['Token de API Okta com escopo okta.users.manage'],
    policy: { minLength: 16, maxLength: 72, symbols: true },
  },
  {
    id: 'gitlab-pat',
    name: 'GitLab: token de acesso pessoal',
    category: 'saas_api',
    executor: 'cloud',
    status: 'beta',
    capabilities: ['rotate_key', 'verify'],
    itemTypes: ['secret'],
    description: 'Usa o endpoint de rotação de tokens do GitLab (o token antigo é revogado automaticamente) e verifica o novo.',
    requires: ['Token pessoal com escopo api ou self_rotate', 'gitlab.com ou GitLab próprio com endereço HTTPS público'],
    policy: WEB_POLICY,
  },
  {
    id: 'cloudflare-api-token',
    name: 'Cloudflare: token de API',
    category: 'saas_api',
    executor: 'cloud',
    status: 'beta',
    capabilities: ['rotate_key', 'verify'],
    itemTypes: ['secret'],
    description: 'Gera um novo valor para o token ("roll") mantendo as permissões, e verifica o novo.',
    requires: ['Token de usuário (não de conta) com a permissão "API Tokens: Edit"'],
    policy: WEB_POLICY,
  },
  {
    id: 'twilio-sendgrid-keys',
    name: 'Twilio / SendGrid: chaves de API',
    category: 'saas_api',
    executor: 'cloud',
    status: 'planned',
    capabilities: ['rotate_key'],
    itemTypes: ['secret'],
    description: 'Cria uma chave nova com as mesmas permissões e revoga a antiga.',
    requires: ['Chave com permissão de gerenciar chaves de API'],
    policy: WEB_POLICY,
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    category: 'database',
    executor: 'agent',
    status: 'planned',
    capabilities: ['change', 'verify', 'reconcile'],
    itemTypes: ['login'],
    description: 'ALTER ROLE … PASSWORD, verifica conectando com a nova senha; reconcilia com uma conta administrativa.',
    requires: ['Agente com rede até o banco', 'Conta de reconciliação (opcional)'],
    policy: { minLength: 24, maxLength: 64, symbols: true, excludeChars: "'\"\\;" },
  },
  {
    id: 'mysql',
    name: 'MySQL / MariaDB',
    category: 'database',
    executor: 'agent',
    status: 'planned',
    capabilities: ['change', 'verify', 'reconcile'],
    itemTypes: ['login'],
    description: 'ALTER USER … IDENTIFIED BY, com verificação de login.',
    requires: ['Agente com rede até o banco'],
    policy: { minLength: 24, maxLength: 32, symbols: true, excludeChars: "'\"\\;" },
  },
  {
    id: 'sqlserver',
    name: 'Microsoft SQL Server',
    category: 'database',
    executor: 'agent',
    status: 'planned',
    capabilities: ['change', 'verify', 'reconcile'],
    itemTypes: ['login'],
    description: 'ALTER LOGIN … WITH PASSWORD, com verificação.',
    requires: ['Agente com rede até o banco'],
    policy: { minLength: 24, maxLength: 128, symbols: true, excludeChars: "'\"\\;" },
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    category: 'database',
    executor: 'agent',
    status: 'planned',
    capabilities: ['change', 'verify'],
    itemTypes: ['login'],
    description: 'updateUser com a nova senha (SCRAM), com verificação.',
    requires: ['Agente com rede até o banco'],
    policy: { minLength: 24, maxLength: 64, symbols: false },
  },
  {
    id: 'linux-ssh',
    name: 'Linux / Unix (SSH)',
    category: 'server',
    executor: 'agent',
    status: 'planned',
    capabilities: ['change', 'verify', 'reconcile', 'rotate_key'],
    itemTypes: ['login', 'secret'],
    description: 'Troca a senha (chpasswd) ou a chave SSH (authorized_keys) e verifica o acesso.',
    requires: ['Agente com acesso SSH ao servidor'],
    policy: { minLength: 24, maxLength: 64, symbols: true },
  },
  {
    id: 'windows-ad',
    name: 'Windows / Active Directory',
    category: 'server',
    executor: 'agent',
    status: 'planned',
    capabilities: ['change', 'verify', 'reconcile'],
    itemTypes: ['login'],
    description: 'Contas locais (WinRM) e de domínio (LDAPS), respeitando a política de senha do domínio.',
    requires: ['Agente no domínio', 'Conta de reconciliação'],
    policy: { minLength: 20, maxLength: 127, symbols: true },
  },
  {
    id: 'sync-secrets-managers',
    name: 'AWS Secrets Manager, HashiCorp Vault, GitHub Actions',
    category: 'secrets_sync',
    executor: 'cloud',
    status: 'planned',
    capabilities: ['sync'],
    itemTypes: ['secret', 'login'],
    description: 'Depois de uma troca, publica o novo valor nos cofres de segredos e pipelines que o usam.',
    requires: ['Credencial de escrita no destino'],
    policy: WEB_POLICY,
  },
]

export const connectorById = (id: string | null | undefined) => CONNECTORS.find((c) => c.id === id)

/** The W3C "well-known change-password" URL for a site (sites that do not support it redirect or 404). */
export function changePasswordUrl(siteUrl: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(siteUrl.trim()) ? siteUrl.trim() : `https://${siteUrl.trim()}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.origin}/.well-known/change-password`
  } catch {
    return null
  }
}

export const ROTATION_INTERVALS = [
  { days: 0, label: 'Sem troca programada' },
  { days: 30, label: 'A cada 30 dias' },
  { days: 60, label: 'A cada 60 dias' },
  { days: 90, label: 'A cada 90 dias' },
  { days: 180, label: 'A cada 6 meses' },
  { days: 365, label: 'A cada 1 ano' },
]
