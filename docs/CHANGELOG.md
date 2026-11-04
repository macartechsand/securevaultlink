# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.9.0-beta] - 2026-11-01 (app web `web-saas/`, extensão e produção)

O protótipo Expo abaixo foi substituído pelo app web com Supabase. Histórico detalhado: [`mvp-progress.md`](mvp-progress.md).

### Adicionado
- Cofre de conhecimento zero (PBKDF2 600k → AES-256-GCM), Secured Items, arquivos cifrados, compartilhamento por ECDH, transferências por link, MFA (TOTP), chave de recuperação opcional.
- Saúde das senhas (HIBP por k-anonimato, Safe Browsing), postura 0–100, rotação assistida e automática (beta) por API.
- Administração sem acesso a conteúdo: IAM, PAM com acesso temporário, conformidade, licenças Premium, beta fechado.
- Auditoria imutável e encadeada por SHA-256; backup externo cifrado com restauração verificada.
- Interface renovada: menu agrupado com estado da proteção, navegação inferior no celular, medidor de postura, ações rápidas, PWA instalável.
- Extensão de navegador (Chrome/Edge): preenchimento com correspondência de domínio anti-phishing, login com Google/GitHub, bloqueio após 10 min.
- Produção: piloto de 15 dias no Supabase Free (`securelink-prod`) e site https://securelinkvault.netlify.app.

### Segurança
- RLS em todas as tabelas, MFA exigido pelo banco (aal2), CSP sem scripts de terceiros, HSTS, nenhuma chave de serviço no app ou na extensão.

## [1.0.0] - 2024-03-19 (protótipo Expo, descontinuado)

### Adicionado
- Estrutura inicial do projeto com React Native/Expo
- Sistema de navegação com Expo Router
- Componentes base da UI com React Native Paper
- Sistema de autenticação básico
- Gerenciamento seguro de senhas
  - Criptografia AES para senhas
  - Geração de senhas seguras
  - Interface de gerenciamento CRUD
- Verificações de segurança
  - Integração com Have I Been Pwned
  - Verificação de URLs com VirusTotal
  - Análise de força de senha
- Feedback visual e animações
  - Medidor de força de senha
  - Indicadores de status
  - Transições suaves

### Segurança
- Implementação de criptografia AES
- Geração segura de chaves mestras
- Verificação de senhas vazadas via k-anonymity
- Validação de URLs maliciosas

### Interface
- Design moderno e responsivo
- Sistema de navegação por tabs
- Formulários com validação em tempo real
- Feedback visual para ações do usuário

## [Não Lançado]

### Planejado
- Autenticação biométrica
- Sistema de backup criptografado
- Sincronização entre dispositivos
- Categorização de senhas
- Sistema de notificações
- Timeout de sessão
- Autenticação 2FA
- Histórico de alterações
- Relatórios de segurança 