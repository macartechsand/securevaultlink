# Documentação de Desenvolvimento - SecureLink Vault

## 1. Introdução

Este documento serve como um guia central para a equipe de desenvolvimento do SecureLink Vault. Ele detalha o escopo do projeto, objetivos, arquitetura, tecnologias, processos de desenvolvimento e o que foi implementado até o momento. Este documento será atualizado continuamente à medida que o projeto evolui.

**Objetivo Principal do Projeto:** Disponibilizar um MVP (Minimum Viable Product) funcional de um aplicativo mobile focado em segurança digital para um grupo inicial de usuários, garantindo a proteção e gerenciamento seguro de seus dados sensíveis.

**Escopo do MVP:**
- Autenticação segura de usuários (Login/Registro).
- Suporte à autenticação biométrica.
- Gerenciamento de sessão.
- Criptografia de dados armazenados localmente.
- Interface de usuário intuitiva e funcional.
- Integração com Supabase para backend services.

## 2. Visão Geral do Projeto (Conforme README.md)

SecureLink Vault é uma aplicação mobile desenvolvida como MVP (Minimum Viable Product) focada em segurança digital. O aplicativo foi construído utilizando tecnologias modernas e robustas para garantir a proteção e gerenciamento seguro de dados sensíveis dos usuários.

## 3. Histórico de Desenvolvimento e Status Atual

### 3.1. Fase Inicial (MVP - Bolt AI)
O desenvolvimento inicial foi focado na criação da estrutura base e funcionalidades core:
- **Estrutura Base:** Configuração do ambiente React Native/Expo, arquitetura do projeto, TypeScript.
- **Funcionalidades Core:** Sistema de autenticação, criptografia de dados, UI básica, integração com Supabase.

### 3.2. Atualizações Recentes (Versão 1.0.0 - Data Atual: 2024-03-19)
- ✅ **Inicialização do Repositório Git:** O código fonte agora é versionado.
- ✅ **Documentação Completa do Projeto:** Criação do `docs/README.md` com informações gerais.
- ✅ **Estruturação do Código Fonte:** Organização inicial das pastas e arquivos.
- ✅ **Implementação das Funcionalidades Básicas de Segurança:** Mecanismos iniciais de criptografia e autenticação.
- ✅ **Configuração do Ambiente de Desenvolvimento:** Detalhes no `docs/README.md`.
- ✅ **Integração com GitHub:** Repositório disponível em [https://github.com/macartechsand/securevaultlink.git](https://github.com/macartechsand/securevaultlink.git).
- ✅ **Criação deste Documento de Desenvolvimento:** `project/.cursor/rules/docs/documentacaodev.md`.
- ✅ **Melhorias na Navegação (2024-03-20):**
  - Implementação de redirecionamento automático para autenticação
  - Tratamento aprimorado de rotas inexistentes
  - Melhor controle de fluxo para usuários autenticados/não autenticados
  - Atualização visual da página de erro 404

### 3.3. Status do Projeto
- **Versão Atual:** 1.0.0
- **Estado:** MVP em desenvolvimento ativo.
- **Foco Atual:** Refinamento das funcionalidades existentes, preparação para testes iniciais com usuários.

## 4. Arquitetura e Tecnologias

### 4.1. Tecnologias Principais
(Conforme detalhado no `docs/README.md#Tecnologias-Principais`)
- **Frontend:** React Native, Expo, TypeScript, Expo Router, React Navigation, Reanimated.
- **Backend (BaaS):** Supabase.
- **Segurança:** crypto-js, expo-crypto, AsyncStorage, expo-local-authentication.

### 4.2. Estrutura do Projeto
(Conforme detalhado no `docs/README.md#Estrutura-do-Projeto`)
```
project/
├── app/                    # Rotas e layouts principais (Expo Router)
│   ├── index.tsx          # Redirecionamento inicial
│   ├── (tabs)/            # Navegação principal por abas
│   ├── modal/             # Telas modais
│   └── auth.tsx           # Fluxo de autenticação
├── assets/                # Imagens, fontes e outros recursos estáticos
├── components/            # Componentes React reutilizáveis
├── constants/            # Valores constantes (cores, temas, etc.)
├── hooks/                 # Hooks React personalizados
├── utils/                 # Funções utilitárias (ex: criptografia, helpers)
├── types/                 # Definições de tipos TypeScript globais
├── .expo/                 # Arquivos gerados pelo Expo
├── .bolt/                 # Arquivos de configuração do Bolt AI
├── .cursor/               # Arquivos de configuração do Cursor AI
│   └── rules/
│       └── docs/
│           └── documentacaodev.md # Este documento
├── docs/                  # Documentação geral do projeto
│   └── README.md
├── node_modules/          # Dependências do projeto
├── .env.example           # Exemplo de arquivo de variáveis de ambiente (Criar .env)
├── .gitignore             # Arquivos e pastas ignorados pelo Git
├── app.json               # Configurações do aplicativo Expo
├── package.json           # Dependências e scripts do projeto
├── tsconfig.json          # Configurações do TypeScript
└── ...                    # Outros arquivos de configuração
```

## 5. Funcionalidades Detalhadas (MVP)

### 5.1. Autenticação Segura
- **Login/Registro:** Usuários podem criar contas e fazer login.
    - *Implementação Atual:* Fluxo básico via `app/auth.tsx`.
    - *Backend:* Supabase Auth.
- **Autenticação Biométrica:** Suporte para login com biometria (digital, facial).
    - *Implementação Atual:* Utiliza `expo-local-authentication`.
- **Gerenciamento de Sessão:** Manter o usuário logado de forma segura.
    - *Implementação Atual:* Gerenciamento de token com Supabase e AsyncStorage.

### 5.2. Proteção de Dados
- **Criptografia:** Dados sensíveis do usuário são criptografados antes do armazenamento.
    - *Implementação Atual:* Utiliza `crypto-js` e `expo-crypto` (ver `utils/encryption.ts`).
    - *Chaves:* Mecanismo de gerenciamento de chaves a ser refinado.
- **Armazenamento Seguro Local:** Dados são armazenados de forma segura no dispositivo.
    - *Implementação Atual:* `AsyncStorage` para dados criptografados.

### 5.3. Interface Intuitiva
- **Design:** Foco em uma interface limpa, moderna e fácil de usar.
- **Navegação:** 
    - Implementada com Expo Router e React Navigation.
    - Sistema de roteamento robusto com:
        - Redirecionamento automático para autenticação
        - Proteção contra rotas inexistentes
        - Página de erro 404 personalizada
        - Controle de fluxo baseado no estado de autenticação
    - Estrutura de arquivos:
        - `app/_layout.tsx`: Configuração principal de navegação
        - `app/index.tsx`: Redirecionamento inicial
        - `app/auth.tsx`: Tela de autenticação
        - `app/(tabs)/_layout.tsx`: Navegação por abas
        - `app/+not-found.tsx`: Tratamento de rotas inexistentes
- **Feedback Visual e Tátil:** Uso de animações (`Reanimated`) e haptics (`expo-haptics`).

## 6. Configuração do Ambiente de Desenvolvimento
(Conforme detalhado no `docs/README.md#Configuração-do-Ambiente-de-Desenvolvimento`)

**Importante:** Certifique-se de criar um arquivo `.env` na raiz do projeto com as credenciais do Supabase:
```env
SUPABASE_URL=sua_url_supabase
SUPABASE_ANON_KEY=sua_chave_anonima
```

## 7. Processos e Boas Práticas de Desenvolvimento

### 7.1. Controle de Versão (Git)
- **Branching Model:** (A definir, sugestão: GitFlow simplificado - main, develop, feature/xxx).
- **Commits:** Mensagens de commit claras e descritivas.
- **Pull Requests:** (A definir, sugestão: para features e correções antes de merge em develop/main).

### 7.2. Qualidade de Código
- **Linting:** `npm run lint` (ESLint configurado).
- **TypeScript:** Utilizar tipagem forte para garantir a robustez do código.
- **Revisão de Código:** (A definir, sugestão: revisões por pares para PRs).
- **Componentização:** Criar componentes reutilizáveis e bem definidos.

### 7.3. Segurança
- **Princípio do Menor Privilégio.**
- **Não armazenar dados sensíveis (chaves, senhas) diretamente no código.** Utilizar variáveis de ambiente.
- **Validação de Entradas.**
- **Atualização regular de dependências.**

### 7.4. Testes
- **Testes Unitários:** (A definir ferramentas, ex: Jest).
- **Testes de Integração:** (A definir).
- **Testes E2E:** (A definir ferramentas, ex: Detox ou Appium).
- *Status Atual:* Testes ainda não implementados formalmente.

## 8. Próximos Passos e Roadmap de Desenvolvimento

### 8.1. Curto Prazo (Próximas Sprints)
- **Refinamento da UI/UX:** Melhorar a usabilidade e o design visual.
- **Testes Iniciais com Usuários:** Coletar feedback para direcionar melhorias.
- **Implementação de Testes Unitários:** Para as funcionalidades core.
- **Revisão de Segurança:** Análise mais aprofundada dos mecanismos de criptografia e autenticação.

### 8.2. Médio Prazo
(Conforme `docs/README.md#Próximos-Passos`)
- Implementação de backup seguro.
- Sincronização entre dispositivos.
- Autenticação dois fatores (2FA).

### 8.3. Longo Prazo
- Otimização de performance.
- Melhorias na arquitetura de dados.
- Implementação de cache.
- Expansão de funcionalidades.

## 9. Contatos e Suporte Interno
- **Líder Técnico/Desenvolvedor Sênior:** [Seu Nome/Contato]
- **Canal de Comunicação da Equipe:** [Slack/Discord/Teams, etc.]
- **Repositório de Issues:** [Link para issues no GitHub]

---
*Este documento deve ser mantido atualizado pela equipe de desenvolvimento a cada nova feature, alteração de arquitetura ou decisão técnica importante.* 