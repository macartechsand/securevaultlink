import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

/**
 * SecureLink Vault documentation portal. The pages are the Markdown files of docs/ (single source
 * of truth); this file only organizes them into sections, like the Google Cloud and AWS portals.
 * Run: cd docs && npm run dev  (localhost only: never expose the dev server with --host).
 */

const start = [
  { text: 'Visão geral do portal', link: '/' },
  { text: 'Guia dos engenheiros', link: '/guide/engineering' },
  { text: 'Status do projeto', link: '/STATUS' },
  { text: 'Handover técnico', link: '/HANDOVER' },
  { text: 'Ações pendentes', link: '/pending-actions' },
  { text: 'Progresso do MVP', link: '/mvp-progress' },
]

const architecture = [
  {
    text: 'Arquitetura',
    items: [
      { text: 'Visão geral e diagramas', link: '/architecture/overview' },
      { text: 'Criptografia e chaves', link: '/architecture/cryptography' },
      { text: 'Fluxos (sequência)', link: '/architecture/flows' },
      { text: 'Revisão comparada (Idira, Bitwarden, Google)', link: '/architecture/security-architecture-review' },
      { text: 'Conectores e rotação', link: '/architecture/connectors-rotation' },
    ],
  },
  {
    text: 'Clientes',
    items: [
      { text: 'Extensão de navegador', link: '/product/browser-extension' },
      { text: 'App móvel', link: '/product/mobile-app' },
    ],
  },
]

const security = [
  {
    text: 'Modelo e garantia',
    items: [
      { text: 'Modelo de segurança', link: '/security/mvp-security-model' },
      { text: 'Garantia (NIST, CSA) e bloqueios', link: '/security/security-assurance' },
      { text: 'Alinhamento CyberArk / Idira', link: '/security/cyberark-alignment' },
      { text: 'Recertificação de acesso', link: '/security/access-recertification' },
      { text: 'OAuth (Google, GitHub)', link: '/security/oauth' },
    ],
  },
  {
    text: 'Segurança ofensiva',
    items: [
      { text: 'Pentest: escopo e roteiro', link: '/SECURITY_TESTING' },
      { text: 'Modelo de revisão de segurança', link: '/templates/SECURITY_REVIEW_TEMPLATE' },
    ],
  },
]

const product = [
  {
    text: 'Produto',
    items: [
      { text: 'Roadmap da 1.0', link: '/product/roadmap-v1' },
      { text: 'Revisão de funcionalidades', link: '/product/feature-review' },
      { text: 'Planos (Free e Premium)', link: '/product/plan-strategy' },
      { text: 'Plano de contingência', link: '/product/contingency-plan' },
      { text: 'Login e autenticação', link: '/product/login-experience' },
      { text: 'Broker de IA (MCP)', link: '/product/agent-broker' },
      { text: 'Código aberto e negócio', link: '/product/open-source-and-business' },
      { text: 'Inovação: implementação', link: '/product/innovation' },
    ],
  },
]

const operations = [
  {
    text: 'Operações',
    items: [
      { text: 'Validação do desenvolvimento', link: '/operations/dev-validation' },
      { text: 'Produção', link: '/PRODUCTION' },
      { text: 'Prontidão (portões)', link: '/operations/release-readiness' },
      { text: 'Dados, armazenamento e backup', link: '/operations/data-storage-and-backup' },
      { text: 'Custos (FinOps)', link: '/operations/finops' },
      { text: 'Quando escalar', link: '/operations/scaling-triggers' },
    ],
  },
]

const reference = [
  {
    text: 'Referências',
    items: [
      { text: 'Padrões e frameworks', link: '/reference/standards' },
      { text: 'Concorrentes e práticas de mercado', link: '/reference/market' },
      { text: 'Glossário', link: '/reference/glossary' },
    ],
  },
  {
    text: 'Legado (protótipo de 2024)',
    collapsed: true,
    items: [
      { text: 'Documentação técnica antiga', link: '/TECHNICAL' },
      { text: 'Documentação de desenvolvimento antiga', link: '/PROJECT_DOCUMENTATION' },
      { text: 'API antiga', link: '/API' },
      { text: 'Política de segurança antiga', link: '/SECURITY' },
      { text: 'Contribuição', link: '/CONTRIBUTING' },
      { text: 'Changelog', link: '/CHANGELOG' },
    ],
  },
]

export default withMermaid(
  defineConfig({
    lang: 'pt-BR',
    title: 'SecureLink Vault Docs',
    description: 'Arquitetura, segurança, produto e operação do SecureLink Vault.',
    cleanUrls: true,
    lastUpdated: true,
    srcExclude: ['**/node_modules/**', 'analysis.md'],
    // Links to source files outside docs/ (code, migrations, scripts) are valid in the repository
    // but are not pages of the portal.
    ignoreDeadLinks: [/(web-saas|supabase|scripts|\.github|extension)\//, /\.(sql|ts|tsx|mjs|json|toml|html)$/, /^\.\.\/README/, /localhost/],
    head: [
      ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
      ['meta', { name: 'theme-color', content: '#1a56db' }],
    ],
    markdown: { lineNumbers: false },
    themeConfig: {
      logo: '/logo.svg',
      siteTitle: 'SecureLink Vault',
      nav: [
        { text: 'Começar', link: '/guide/engineering', activeMatch: '^/(guide|STATUS|HANDOVER|pending)' },
        { text: 'Arquitetura', link: '/architecture/overview', activeMatch: '^/architecture|^/product/(browser|mobile)' },
        { text: 'Segurança', link: '/security/mvp-security-model', activeMatch: '^/security|^/SECURITY|^/templates' },
        { text: 'Produto', link: '/product/roadmap-v1', activeMatch: '^/product/(roadmap|feature|plan|contingency|open|innovation|login|agent)' },
        { text: 'Operações', link: '/operations/dev-validation', activeMatch: '^/operations|^/PRODUCTION' },
        { text: 'Referências', link: '/reference/standards', activeMatch: '^/reference' },
      ],
      sidebar: {
        '/architecture/': architecture,
        '/product/browser-extension': architecture,
        '/product/mobile-app': architecture,
        '/security/': security,
        '/SECURITY_TESTING': security,
        '/templates/': security,
        '/product/': product,
        '/operations/': operations,
        '/PRODUCTION': operations,
        '/reference/': reference,
        '/TECHNICAL': reference,
        '/PROJECT_DOCUMENTATION': reference,
        '/API': reference,
        '/SECURITY': reference,
        '/CONTRIBUTING': reference,
        '/CHANGELOG': reference,
        '/': [{ text: 'Começar', items: start }],
      },
      outline: { level: [2, 3], label: 'Nesta página' },
      search: {
        provider: 'local',
        options: {
          translations: {
            button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
            modal: {
              noResultsText: 'Nada encontrado para',
              resetButtonTitle: 'Limpar',
              footer: { selectText: 'abrir', navigateText: 'navegar', closeText: 'fechar' },
            },
          },
        },
      },
      editLink: { pattern: 'https://github.com/macartechsand/securevaultlink/edit/dev/docs/:path', text: 'Editar esta página no GitHub' },
      lastUpdated: { text: 'Atualizado em' },
      docFooter: { prev: 'Anterior', next: 'Próxima' },
      darkModeSwitchLabel: 'Tema',
      sidebarMenuLabel: 'Menu',
      returnToTopLabel: 'Voltar ao topo',
      footer: { message: 'Documentação interna do SecureLink Vault. Nunca coloque segredos aqui: o repositório é público.' },
    },
    mermaid: {
      securityLevel: 'strict',
      fontFamily: 'Arial, Helvetica, sans-serif',
      themeVariables: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '15px' },
      flowchart: { useMaxWidth: true, htmlLabels: true, padding: 12 },
      sequence: { useMaxWidth: true },
      er: { useMaxWidth: true },
    },
  }),
)
