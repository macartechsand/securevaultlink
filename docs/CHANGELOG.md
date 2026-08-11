# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2024-03-19

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