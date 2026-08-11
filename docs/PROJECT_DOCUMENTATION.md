# SecureLink Vault - Documentação de Desenvolvimento

## Visão Geral do Projeto

O SecureLink Vault é um projeto de segurança digital que atualmente contém duas frentes principais:

1. **Aplicativo Mobile** (raiz do repositório)
   - Framework: Expo + React Native + TypeScript
   - Objetivo: oferecer um cofre de senhas seguro com autenticação, biometria e armazenamento local criptografado

2. **Aplicação Web SaaS** (`web-saas`)
   - Framework: React + Vite + TypeScript
   - Objetivo: oferecer uma interface web para gerenciamento de vault e integração com Supabase

O projeto está em estágio de MVP e deve ser documentado para a equipe de desenvolvimento continuar a evolução de forma segura e consistente.

---

## Objetivos desta documentação

- Fornecer contexto técnico completo do projeto
- Detalhar a arquitetura e a organização dos dois aplicativos
- Explicar como configurar, executar e construir cada parte
- Registrar as principais dependências e variáveis de ambiente
- Orientar futuros commits e deploys

---

## Estrutura do Repositório

```
securevaultclone/
├── app.config.js
├── app.json
├── bin/
├── config/
├── docs/
│   ├── PROJECT_DOCUMENTATION.md
│   ├── analysis.md
│   ├── API.md
│   ├── CHANGELOG.md
│   ├── CONTRIBUTING.md
│   ├── SECURITY.md
│   ├── SECURITY_TESTING.md
│   ├── STATUS.md
│   ├── TECHNICAL.md
│   └── templates/
├── package.json
├── scripts/
├── src/
│   ├── components/
│   ├── config/
│   ├── constants/
│   ├── models/
│   ├── services/
│   └── utils/
├── web-saas/
│   ├── package.json
│   ├── src/
│   ├── tsconfig.json
│   └── vite.config.ts
└── ...
```

### O que existe no repositório

- `src/`: código do aplicativo mobile Expo
- `web-saas/`: aplicação web em Vite com Supabase
- `docs/`: documentação do produto e segurança
- `package.json`: scripts e dependências do app mobile
- `web-saas/package.json`: scripts e dependências do app web

---

## Aplicativo Mobile (Expo)

### Visão geral

- **Localização:** raiz do repositório
- **Framework:** Expo + React Native + TypeScript
- **Entrada:** `app.json`, `src/`, `app/`
- **Propósito:** cofre pessoal para gerenciamento de senhas, links e dados sensíveis

### Arquitetura

- `app/`: navegação e telas principais do Expo Router
- `src/components/`: componentes reutilizáveis da interface
- `src/services/`: lógica de negócios, autenticação, criptografia e integração com APIs
- `src/utils/`: utilitários e helpers
- `src/config/`: configurações de providers, incluindo Firebase

### Dependências principais

- `expo`, `expo-router`, `expo-local-authentication`, `expo-secure-store`
- `react-native-paper`
- `crypto-js`, `expo-crypto`
- `@react-native-async-storage/async-storage`
- `firebase` (via `src/config/firebase.ts`)

### Scripts disponíveis

No diretório raiz:

```bash
npm install
npm run start      # inicia o Expo
npm run android    # abre no Android
npm run ios        # abre no iOS
npm run web        # abre no navegador
npm run test       # executa os testes Jest
npm run lint       # roda o ESLint
npm run type-check # roda o TypeScript
```

### Configuração

O aplicativo mobile usa variáveis de ambiente e o manifesto `app.json` para configurações.

O arquivo `app.json` contém:

- `expo.extra` com `eas.projectId`
- `expo.plugins` com `expo-router` e `expo-local-authentication`
- identificadores para iOS e Android

A integração de Firebase depende de `Constants.expoConfig?.extra.*` exibindo as variáveis de ambiente definidas pelo Expo.

### Variáveis de ambiente necessárias

Para mobile, deve ser configurado no Expo ou `.env` local, por exemplo:

- `firebaseApiKey`
- `firebaseAuthDomain`
- `firebaseProjectId`
- `firebaseStorageBucket`
- `firebaseMessagingSenderId`
- `firebaseAppId`

Essas chaves são lidas em `src/config/firebase.ts`.

### Pontos de atenção

- A criptografia é espalhada entre múltiplos arquivos (`src/services/CryptoService.ts`, `src/services/encryption.ts`, `app/services/CryptoService.ts`).
- O fluxo de autenticação mistura login backend e autenticação local.
- A biometria está disponível via `expo-local-authentication`, mas deve ser tratada como desbloqueio local.

---

## Aplicação Web SaaS (`web-saas`)

### Visão geral

- **Localização:** `web-saas/`
- **Framework:** React + Vite + TypeScript
- **Entrada:** `web-saas/src/main.tsx`, `web-saas/index.html`
- **Propósito:** interface web para gerenciamento de vault e integração com Supabase

### Arquitetura

- `web-saas/src/App.tsx`: UI principal e lógica de autenticação/CRUD
- `web-saas/src/lib/supabase.ts`: cliente Supabase
- `web-saas/src/services/supabaseService.ts`: abstração de autenticação e operações no banco
- `web-saas/src/components/`: componentes de apresentação
- `web-saas/src/data/mockData.ts`: tipos e dados mock usados no UI

### Dependências principais

- `@supabase/supabase-js`
- `react`, `react-dom`
- `vite`, `typescript`

### Scripts disponíveis

No diretório `web-saas`:

```bash
npm install
npm run dev      # roda o Vite em modo dev
npm run build    # build de produção
npm run preview  # preview local do build
npm run lint     # roda oxlint
```

### Configuração

Variáveis de ambiente do web-saas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O arquivo `.env` existente no `web-saas` já deve estar configurado com estes valores.

### Comportamento implementado

- Login / registro usando Supabase Auth
- Salvamento de segredos e links em Supabase
- Uso de armazenamento local como fallback quando o backend falha
- Funcionalidade de search e exibição de vault items

---

## Configuração do ambiente de desenvolvimento

### Pré-requisitos

- Node.js LTS instalada
- npm
- Expo CLI instalada globalmente (recomendado)
- Acesso às credenciais do Firebase e/ou Supabase

### Passo a passo

1. Clone o repositório:
   ```bash
git clone <repo-url>
cd securityvaultclone
```
2. Instale dependências do app mobile:
   ```bash
npm install
```
3. Instale dependências da aplicação web:
   ```bash
cd web-saas
npm install
```

### Executando o aplicativo mobile

No diretório raiz:

```bash
npm run start
```

Para testes específicos:

```bash
npm run android
npm run ios
npm run web
```

### Executando a aplicação web SaaS

No diretório `web-saas`:

```bash
npm run dev
```

A aplicação web será exposta em `http://localhost:5173` por padrão.

---

## Deploy e publicação

### Web SaaS

A aplicação web pode ser publicada em qualquer serviço de hospedagem estática que suporte Vite.

**Recomendação inicial:** Netlify.

#### Fluxo básico de deploy no Netlify

1. Crie uma nova site no Netlify conectando o repositório GitHub
2. Use `web-saas` como diretório de publicação, se o serviço permitir
3. Defina variáveis de ambiente no Netlify:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build command: `npm run build`
5. Publish directory: `dist`

### Aplicativo Mobile

Para o mobile, o deploy deve seguir o fluxo de Expo / EAS.

- `npm run start` para desenvolvimento
- `eas build` para build de produção (se EAS estiver configurado)

---

## Testes e qualidade

### Testes existentes

O repositório contém suporte a Jest e alguns testes automatizados em `__tests__/`.

### Comandos de qualidade

- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run security:check`

### Boas práticas recomendadas

- Usar tipagem TypeScript forte
- Revisar `eslint` antes dos commits
- Fazer testes de fluxo para autenticação, criptografia e persistência
- Evitar commit de chaves e arquivos `.env`

---

## Pontos técnicos importantes

### Mobile

- A arquitetura do mobile é centrada em `Expo Router` e `src/services/`
- O fluxo atual mistura autenticação Firebase com validação local
- A criptografia precisa ser consolidada para maior segurança

### Web SaaS

- O app web usa Supabase para autenticação e armazenamento
- Existe fallback local em `localStorage` para salvar se o backend falhar
- O projeto é compatível com acesso em rede local usando `vite --host 0.0.0.0`

### Segurança

- Não versionar arquivos de ambiente (`.env`)
- Usar `expo-secure-store` para dados sensíveis no mobile sempre que possível
- Revisar políticas de dados antes de qualquer sincronização de vault

---

## Processos de commit e deploy

1. Atualize a documentação sempre que fizer mudança relevante
2. Execute lint e testes antes de commit
3. Abra PRs claros com descrição e checklist
4. Configure o deploy Netlify para `web-saas`
5. Use o root `README.md` como ponto de entrada para novos desenvolvedores

---

## Observações finais

Este documento serve como guia principal da equipe de desenvolvimento. Se alguma parte do código mudar significativamente, atualize este arquivo e o `README.md`.

Para publicação no Netlify, siga os passos de deploy descritos acima após terminar a revisão e commit no GitHub.
