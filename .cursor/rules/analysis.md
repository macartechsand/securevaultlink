# SecureLink Vault — SaaS Architecture Assessment & Refactoring Plan

Você é um engenheiro de software sênior especializado em TypeScript, React, React Native, SaaS, segurança de aplicações e arquitetura cloud.

Analise o repositório atual do projeto:

https://github.com/macartechsand/securevaultlink

## Contexto

O projeto foi originalmente criado como um MVP mobile usando React Native/Expo e posteriormente publicado durante a fase de prototipação.

O objetivo agora é evoluir o projeto para um **SaaS de segurança pessoal**, mantendo as funcionalidades existentes que fizerem sentido, mas criando uma arquitetura que permita:

* utilização via Web;
* utilização via dispositivo mobile;
* possibilidade de transformar o mobile em uma aplicação baseada em WebView posteriormente;
* autenticação de usuários;
* armazenamento seguro de dados;
* arquitetura preparada para modelo Freemium;
* futura evolução para planos Premium e Business;
* integração futura com recursos de IA;
* possibilidade de escalar sem reescrever completamente o projeto.

O produto continua sendo o conceito do **SecureLink Vault**, um cofre pessoal para gerenciamento seguro de senhas, links e informações sensíveis.

Neste momento NÃO quero implementar novas funcionalidades.

Quero primeiro entender o estado atual do projeto e o que precisa ser alterado para transformá-lo em uma base SaaS sustentável.

---

# OBJETIVO PRINCIPAL

Faça uma análise técnica completa do repositório atual e produza um plano objetivo para transformar o projeto de:

Mobile-first MVP

para:

Web SaaS + Mobile-compatible architecture.

Não faça alterações no código ainda.

Não reescreva o projeto.

Não remova funcionalidades existentes.

Não introduza novas bibliotecas sem justificar.

---

# 1. ANALISAR A ARQUITETURA ATUAL

Identifique:

* framework utilizado;
* versão do framework;
* estrutura de diretórios;
* entry points;
* sistema de navegação;
* gerenciamento de estado;
* autenticação;
* banco de dados;
* integração com Supabase;
* armazenamento local;
* criptografia;
* gerenciamento de sessão;
* gerenciamento de variáveis de ambiente;
* APIs;
* componentes reutilizáveis;
* dependências;
* configuração de build;
* configuração do Expo;
* configuração para Web;
* configuração para Mobile.

Apresente uma visão simplificada:

User
→ Frontend
→ Authentication
→ Application Logic
→ Encryption
→ Database
→ External Services

---

# 2. MAPEAR AS FUNCIONALIDADES EXISTENTES

Liste as funcionalidades atualmente implementadas.

Para cada funcionalidade informe:

* nome;
* localização no código;
* dependências;
* se funciona atualmente;
* se é específica de Mobile;
* se pode ser reutilizada na Web;
* se precisa ser refatorada;
* prioridade.

Classifique:

KEEP
REFACTOR
REPLACE
REMOVE

Não remova nada neste momento.

---

# 3. AVALIAR A MIGRAÇÃO PARA SaaS WEB

Determine o que precisa mudar para que o projeto possa funcionar como SaaS Web.

Avalie principalmente:

* React Native Web;
* Expo Web;
* componentes incompatíveis com navegador;
* APIs específicas de Mobile;
* armazenamento local;
* biometria;
* navegação;
* autenticação;
* gerenciamento de sessão;
* responsividade;
* PWA;
* WebView;
* compartilhamento de código entre Web e Mobile.

Determine se a melhor estratégia é:

A. React Native + Expo Web

B. React Web + React Native compartilhando lógica

C. Separação Web/Mobile

D. Outra arquitetura

Escolha uma recomendação e explique objetivamente o motivo.

---

# 4. DEFINIR A ARQUITETURA SaaS ALVO

Proponha uma arquitetura inicial simples e econômica.

O objetivo é permitir desenvolvimento e testes com baixo custo.

Considere:

Frontend
Authentication
Database
Storage
API/Backend
Encryption
Monitoring
Analytics

Não introduza Kubernetes, microservices ou arquitetura enterprise neste momento.

Priorize simplicidade.

A arquitetura deve permitir evolução futura.

---

# 5. MODELO DE DADOS

Analise o modelo atual do banco.

Identifique:

* tabelas;
* relacionamentos;
* primary keys;
* foreign keys;
* policies;
* RLS;
* campos relacionados ao usuário;
* possíveis problemas de isolamento entre usuários.

Proponha somente as alterações necessárias para suportar:

User
→ Account
→ Vault
→ Vault Items

E futuramente:

User
→ Subscription
→ Plan
→ Usage

Não implemente essas alterações ainda.

---

# 6. AUTENTICAÇÃO E AUTORIZAÇÃO

Analise o mecanismo atual.

Determine:

* como o usuário faz login;
* como a sessão é armazenada;
* como logout funciona;
* como o frontend identifica o usuário;
* como o backend/banco identifica o usuário;
* se existe risco de acesso cruzado entre usuários;
* se o RLS está corretamente configurado.

Produza recomendações para uma arquitetura SaaS multi-tenant simples.

---

# 7. CRIPTOGRAFIA E SEGURANÇA

Esta é uma parte crítica do projeto.

Não altere criptografia neste momento.

Analise somente a implementação atual.

Determine:

* onde a master password é utilizada;
* se ela é enviada ao backend;
* como as chaves são derivadas;
* onde as chaves ficam armazenadas;
* como os dados são criptografados;
* onde ocorre encrypt/decrypt;
* quais dados chegam ao Supabase;
* se o servidor consegue acessar dados em plaintext;
* bibliotecas criptográficas utilizadas;
* riscos potenciais.

Classifique os riscos:

CRITICAL
HIGH
MEDIUM
LOW

Não faça afirmações que não possam ser verificadas diretamente no código.

---

# 8. MODELO FREEMIUM

Não implementar billing ainda.

Somente preparar uma proposta arquitetural.

Proponha como futuramente controlar:

FREE
PREMIUM
BUSINESS

Exemplo:

FREE

* limite de vault items
* funcionalidades básicas

PREMIUM

* vault ilimitado
* sincronização
* recursos avançados

BUSINESS

* usuários múltiplos
* compartilhamento
* RBAC
* auditoria

Determine quais estruturas seriam necessárias no banco e na aplicação.

---

# 9. MOBILE

O objetivo é que o produto seja Web-first, mas possa ser utilizado futuramente em Mobile.

Avalie:

* Expo;
* React Native;
* React Native Web;
* WebView;
* PWA;
* autenticação mobile;
* armazenamento seguro mobile;
* biometria.

Não precisamos construir o aplicativo mobile agora.

Quero apenas garantir que a arquitetura SaaS não impeça essa evolução.

---

# 10. NETLIFY / DEPLOYMENT

Analise a configuração atual de deployment.

Verifique:

* build;
* environment variables;
* redirects;
* routing;
* SPA configuration;
* Supabase connection;
* problemas potenciais no Netlify.

Proponha uma configuração mínima para desenvolvimento:

Local
→ GitHub
→ Netlify
→ Supabase

---

# 11. ESTRUTURA RECOMENDADA DO PROJETO

Proponha uma estrutura de diretórios adequada para a evolução SaaS.

Exemplo conceitual:

src/
components/
pages/
layouts/
features/
hooks/
services/
lib/
auth/
crypto/
types/

Não copie este exemplo cegamente.

Adapte à arquitetura encontrada no projeto.

Explique a responsabilidade de cada camada.

---

# 12. BACKLOG DE REFACTORING

Crie um backlog priorizado:

P0 — obrigatório antes de continuar

P1 — necessário para SaaS

P2 — melhoria arquitetural

P3 — futuro

Para cada item informe:

* problema;
* arquivo/local;
* solução;
* risco;
* esforço estimado;
* dependências.

---

# 13. NÃO IMPLEMENTAR AINDA

Durante esta análise NÃO:

* altere arquivos;
* faça commits;
* remova funcionalidades;
* troque framework;
* troque banco;
* troque biblioteca criptográfica;
* implemente Stripe;
* implemente billing;
* implemente IA;
* implemente RBAC;
* implemente novos planos;
* crie novas features.

Somente análise e plano.

---

# 14. RESULTADO FINAL

Ao terminar, entregue exatamente estes blocos:

## A. Current Architecture

Resumo da arquitetura atual.

## B. Existing Features

Tabela das funcionalidades existentes.

## C. SaaS Gap Analysis

O que impede o projeto de ser um SaaS.

## D. Security Assessment

Principais riscos encontrados.

## E. Recommended Architecture

Arquitetura SaaS recomendada.

## F. Web/Mobile Strategy

Como manter compatibilidade futura com Mobile.

## G. Database Changes

Alterações necessárias no modelo de dados.

## H. Refactoring Backlog

P0/P1/P2/P3.

## I. Recommended Development Order

Ordem recomendada de implementação.

## J. Risks & Decisions

Decisões arquiteturais que precisam ser tomadas antes de codificar.

## K. Files To Be Changed

Liste os arquivos que provavelmente precisarão ser alterados posteriormente.

---

## MAPEAMENTO DETALHADO DE FUNCIONALIDADES (continuação)

Abaixo segue o mapeamento das funcionalidades encontradas no código, com localização, dependências, status, compatibilidade Web/Mobile, necessidade de refactor e classificação.

- **Autenticação (email/password + biometria)**
	- Localização: `app/auth.tsx`, `src/services/auth.ts`, `src/config/firebase.ts`
	- Dependências: `firebase`, `expo-local-authentication`
	- Funciona atualmente: Sim (email/password). Biometria implementada para native.
	- Mobile-specific: Biometria sim; email/password não.
	- Reutilizável na Web: Email/password sim; biometria requer WebAuthn ou fallback.
	- Refactor: Padronizar provedor de Auth (Firebase vs Supabase).
	- Classificação: KEEP (padronizar backend)

- **CRUD do cofre (Vault Items / Senhas)**
	- Localização: `src/services/PasswordService.ts`, `src/models/Password.ts`, componentes em `src/components/` e `app/(tabs)/passwords*`
	- Dependências: `@react-native-async-storage/async-storage`, `zxcvbn` (for strength)
	- Funciona atualmente: Sim (armazenamento local), porém criptografia em `PasswordService` é TODO (retorna plaintext).
	- Mobile-specific: Armazenamento local e UI mobile; lógica pode ser compartilhada.
	- Reutilizável na Web: Sim, com adapter de armazenamento (IndexedDB/localForage).
	- Refactor: Implementar/enforcar criptografia cliente-side consistente; sincronização com backend.
	- Classificação: REFACTOR (P0 para segurança)

- **Criptografia / Gestão de chave mestra**
	- Localização: múltiplos: `src/services/encryption.ts`, `src/services/CryptoService.ts`, `app/services/CryptoService.ts`, `src/services/SecurityService.ts`
	- Dependências: `crypto-js`, `expo-crypto`, `expo-secure-store`
	- Funciona atualmente: Implementações inconsistentes; alguns serviços mantêm chave mestra em SecureStore, outros em AsyncStorage; `PasswordService` não usa criptografia correta.
	- Mobile-specific: usa APIs Expo; Web precisa de WebCrypto adaptado.
	- Reutilizável na Web: Sim, após consolidar implementação (usar WebCrypto / libs compatíveis).
	- Refactor: Unificar em um único `crypto` service com KDF/PBKDF2 padrão e AES-GCM, garantir que master password nunca seja transmitida.
	- Classificação: REFACTOR (P0 — crítico)

- **Biometria**
	- Localização: `app/services/BiometricService.ts`, `app/auth.tsx`
	- Dependências: `expo-local-authentication`, `@react-native-async-storage/async-storage`
	- Funciona atualmente: Sim em dispositivos suportados; testes existem em `__tests__`.
	- Mobile-specific: Sim.
	- Reutilizável na Web: Não diretamente; requer WebAuthn ou fallback por senha.
	- Refactor: Abstrair via interface `IBiometric` e adicionar adapter Web (opcional).
	- Classificação: KEEP

- **Backup & Restore (local encrypted files)**
	- Localização: `src/services/BackupService.ts`
	- Dependências: `expo-file-system`, `expo-secure-store`, `CryptoService`
	- Funciona atualmente: Sim (gera arquivos locais encriptados via `cryptoService`).
	- Mobile-specific: Sim (FileSystem native APIs)
	- Reutilizável na Web: Requer implementação (download/upload do arquivo encriptado ou integração com storage cloud).
	- Refactor: Validar esquema de encriptação; oferecer export/import web-friendly.
	- Classificação: REFACTOR

- **Compartilhamento temporário de senhas (ShareService)**
	- Localização: `src/services/ShareService.ts`
	- Dependências: `expo-secure-store`, `expo-crypto`, `CryptoService`
	- Funciona atualmente: Sim, armazenamento local de tokens de compartilhamento.
	- Mobile-specific: Sim (SecureStore)
	- Reutilizável na Web: Sim, via backend (preferível) ou armazenamento temporário servidor-side.
	- Refactor: Mover para backend para links públicos controlados; garantir que apenas ciphertext seja armazenado em servidor.
	- Classificação: REFACTOR

- **Cache seguro (SecureCacheService)**
	- Localização: `src/services/SecureCacheService.ts`
	- Dependências: `expo-secure-store`, `CryptoService`
	- Funciona atualmente: Sim (TTL-based cache em SecureStore)
	- Mobile-specific: Sim
	- Reutilizável na Web: Sim (adapter para IndexedDB)
	- Refactor: Unificar crypto e considerar limites de armazenamento no web adapter.
	- Classificação: KEEP

- **Autofill (AutofillService)**
	- Localização: `src/services/AutofillService.ts`
	- Dependências: `expo-clipboard`, `SecureCacheService`, `CryptoService`
	- Funciona atualmente: Implementado para copiar credenciais; web autopreenchimento não implementado.
	- Mobile-specific: Parte mobile sim; web autopreenchimento não.
	- Reutilizável na Web: Parcialmente (suggestions), mas integração com navegadores exige extensões/WebAuthn or browser API.
	- Refactor: Implementar adapters; avaliar estratégia de extensão (futuro).
	- Classificação: REFACTOR

- **Verificação de vazamentos (HIBPService)**
	- Localização: `src/services/HIBPService.ts`, `src/services/hibp.ts`
	- Dependências: fetch, `expo-crypto`
	- Funciona atualmente: Sim (k-anonymity SHA-1 model).
	- Mobile-specific: Não
	- Reutilizável na Web: Sim
	- Refactor: Não necessário, apenas integração UI.
	- Classificação: KEEP

- **VirusTotal URL scan**
	- Localização: `src/services/virusTotal.ts`
	- Dependências: API key via `EXPO_PUBLIC_VIRUSTOTAL_API_KEY`
	- Funciona atualmente: Sim (clienteside requests). Pode consumir quota da API.
	- Classificação: KEEP (avaliar custo/privacidade)

- **Segurança / bloqueio de conta (SecurityLockService)**
	- Localização: `src/services/SecurityLockService.ts`
	- Dependências: `expo-secure-store`
	- Funciona atualmente: Sim (tentativas, lockout, persistência)
	- Classificação: KEEP

- **Histórico de acessos (AccessHistoryService)**
	- Localização: `src/services/AccessHistoryService.ts`
	- Dependências: `expo-secure-store`
	- Funciona atualmente: Sim (local)
	- Reutilizável na Web: Sim (armazenamento remoto recomendado no SaaS)
	- Classificação: KEEP / REFACTOR (mover parte para servidor em SaaS)

---

## A. Current Architecture

- Framework: Expo (SDK ~53) + React Native 0.73.2 + React 18.2.0 (`package.json`).
- Router / Navigation: `expo-router` + stack (`app/_layout.tsx`).
- Auth: Firebase Auth client-side (`src/config/firebase.ts`, `src/services/auth.ts`).
- Data: Vault items and metadata stored locally (AsyncStorage / SecureStore / FileSystem). Não há armazenamento remoto consistente para vault items.
- Crypto: Implementações dispersas em `src/services/encryption.ts`, `src/services/CryptoService.ts`, `app/services/CryptoService.ts` — inconsistências.
- Services: `src/services/*` centralizam lógica de backup, cache, sharing, HIBP, virusTotal, autofill.

Visão simplificada:
User → Frontend (Expo/React Native) → Authentication (Firebase Auth) → Application Logic (`src/services`) → Encryption (local client-side services) → Database (local AsyncStorage/SecureStore/FileSystem) → External Services (HIBP, VirusTotal, Firebase)

## B. Existing Features

- Autenticação (Email/Password + Biometria) — `app/auth.tsx`, `src/services/auth.ts` — KEEP
- CRUD de senhas (local) — `src/services/PasswordService.ts` — REFACTOR (criptografia incompleta)
- Criptografia / chave mestra — múltiplos arquivos — REFACTOR (unificar)
- Biometria — `app/services/BiometricService.ts` — KEEP
- Backup & Restore — `src/services/BackupService.ts` — REFACTOR
- Compartilhamento temporário — `src/services/ShareService.ts` — REFACTOR (mover para backend)
- Cache seguro — `src/services/SecureCacheService.ts` — KEEP
- Autofill — `src/services/AutofillService.ts` — REFACTOR
- HIBP leak check — `src/services/HIBPService.ts` — KEEP
- VirusTotal scanning — `src/services/virusTotal.ts` — KEEP (rever custos)
- Security lock / brute-force protection — `src/services/SecurityLockService.ts` — KEEP
- Access history — `src/services/AccessHistoryService.ts` — KEEP/REFACTOR

## C. SaaS Gap Analysis

- Falta de backend para sincronização de vault items (multi-device sync) — impede SaaS.
- Criptografia inconsistente e armazenamento em plaintext em partes do código — bloqueador crítico.
- Inconsistência entre documentação (Supabase) e implementação (Firebase) — decisão de backend pendente.
- Dependência de APIs Expo nativas (SecureStore, FileSystem, LocalAuthentication) que precisam de adapters para web.
- Ausência de modelo de dados multi-tenant e RLS nas camadas de armazenamento.

## D. Security Assessment (resumo)

- CRITICAL: senhas armazenadas sem criptografia em `PasswordService` (TODO). Diversas implementações de crypto com derivações não padronizadas.
- HIGH: master password/derivação usa SHA256 simples; key storage distribuído entre SecureStore e AsyncStorage.
- MEDIUM: operações de backup, share e cache precisam garantir que apenas ciphertext seja sincronizado/resguardado.
- LOW: dependências devem ser mantidas atualizadas; VirusTotal requer chave pública em envs.

## E. Recommended Architecture (resumo)

- Frontend: manter Expo para prototipagem rápida e Expo Web para MVP Web; extrair services compartilhados para `src/lib`/`packages/shared`.
- Auth: decidir entre Firebase (atual) e Supabase (recomendado para Postgres+RLS). Se desejar RLS e SQL desde o início, escolha Supabase; caso contrário, manter Firebase para acelerar.
- Database: Supabase (Postgres) recomendado para SaaS; armazenar apenas ciphertext no servidor.
- Encryption: garantir E2EE — chaves derivadas no cliente (PBKDF2/Argon2) e nunca enviadas ao servidor.
- Storage: encrypted vault items em Postgres (ciphertext + metadata JSONB).
- Deployment: Frontend → Netlify/Vercel; Backend gerenciado (Supabase) + GitHub Actions.

## F. Web/Mobile Strategy

- Estratégia inicial: Expo + Expo Web (rapidez). Paralelamente, criar adaptadores para:
	- Storage: AsyncStorage/SecureStore → IndexedDB/localForage
	- Crypto: expo-crypto → WebCrypto
	- Biometria: expo-local-authentication → WebAuthn (ou fallback)
- Long-term: extrair lógica em pacotes compartilhados para permitir um React Web app separado se necessário.

## G. Database Changes (proposta mínima)

- Tabelas propostas (conceitual): `vault_items(id UUID PK, owner_id UUID, title TEXT, ciphertext TEXT, metadata JSONB, created_at TIMESTAMP, updated_at TIMESTAMP)`; `accounts`, `subscriptions`, `plans` para freemium.
- Política: RLS em `vault_items` filtrando por `auth.uid = owner_id` (Supabase).

## H. Refactoring Backlog (P0–P3)

- P0 (crítico): Unificar criptografia e corrigir armazenamento plaintext
	- Arquivos: `src/services/PasswordService.ts`, `src/services/encryption.ts`, `src/services/CryptoService.ts`, `app/services/CryptoService.ts`, `src/services/SecurityService.ts`
	- Esforço: 3–7 dias

- P1: Escolher e padronizar backend (Firebase vs Supabase), implementar sync inicial (ciphertext only)
	- Esforço: 1–2 sprints

- P2: Extrair `src/lib` compartilhado, implementar web adapters (IndexedDB, WebCrypto, WebAuthn)
	- Esforço: 1–2 sprints

- P3: Billing, RBAC, sharing server-side avançado, team features
	- Esforço: futuro

## I. Recommended Development Order

1. P0: corrigir criptografia e garantir que nenhum plaintext seja persistido.
2. Decidir provedor Auth/DB (Firebase x Supabase) e alinhar configurações.
3. Implementar armazenamento remoto de vault items (ciphertext only) e RLS/server policies.
4. Extrair serviços compartilhados e criar web adapters.
5. Implementar freemium plumbing e, depois, billing.

## J. Risks & Decisions

- Decisão necessária: Firebase Auth (atual) ou Supabase Auth + Postgres (recomendado para RLS)?
- Decisão de E2EE: confirmação de que chaves derivadas apenas no cliente e nunca armazenadas no servidor.
- Risco: enquanto criptografia permanecer inconsistente, dados de usuários podem vazar — resolver antes de sync.

## K. Files To Be Changed (prováveis)

- `src/services/PasswordService.ts`
- `src/services/encryption.ts`
- `src/services/CryptoService.ts`
- `app/services/CryptoService.ts`
- `src/services/SecurityService.ts`
- `src/services/BackupService.ts`
- `src/services/ShareService.ts`
- `src/config/firebase.ts` (se migrar)
- `documentacaodev.md` (alinhar docs)

---

Fim da atualização do `analysis.md`. Aguardo sua aprovação para seguir com qualquer ação posterior (apenas análise solicitada por enquanto).

## Análise Detalhada: Autenticação & Fluxo de Sessão

Resumo dos achados específicos ao fluxo de autenticação e sessão:

- Sign-up: `src/services/auth.ts` usa o Firebase para criar conta; `app/(auth)/register.tsx` grava um hash da senha mestra em `AsyncStorage` via `SecurityService.setMasterPassword()` e mantém a senha mestra em memória.
- Login: `app/(auth)/login.tsx` pode autenticar de duas formas:
	- **Local-only:** se `SecurityService.hasMasterPassword()` for true, o app solicita apenas a senha mestra e valida localmente com `SecurityService.validateMasterPassword()`; **não** chama `signIn()` do Firebase. Usuários podem acessar a UI sem autenticação backend.
	- **Backend:** caso contrário, o app pede `email` + `password` e usa `signIn()` do Firebase.
- Biometria: `LocalAuthentication.authenticateAsync()` permite desbloqueio local sem assegurar que haja sessão backend ou que a `masterPassword` esteja em memória.
- Timeout: `SecurityService.startSessionTimeout()` limpa a senha mestra da memória após 5 minutos ou quando o app vai para background; não faz sign-out no backend (Firebase), gerando possíveis estados inconsistentes.

Impacto e riscos:

- Estados inconsistentes entre autenticação local e backend — para SaaS isso causa problemas de autorização, sincronização e experiência do usuário.
- Hash da senha mestra sem salt e usando SHA256 é fraco e vulnerável se o armazenamento for comprometido.
- Biometria desbloqueia localmente, mas não garante identidade remota — isto deve ser revisto para SaaS.

Recomendações (registradas, sem implementação):

- Padronizar fluxo: sempre autenticar com o provedor (Firebase ou Supabase) ao iniciar sessão; em seguida, pedir senha mestra para derivar chave local. Não permitir que senha mestra substitua autenticação server-side.
- Biometria: usar apenas para desbloquear chaves locais já derivadas/armazenadas (wrapped keys). Não permitir que biometria substitua autenticação remota.
- Master password: substituir hash simples por KDF (PBKDF2/Argon2) com salt; armazenar parâmetros do KDF e um verifier seguro. Melhor: derivar chave e armazenar apenas chave envolta (wrapped) em `SecureStore`.
- Sessões: alinhar timeout cliente com backend; considerar invalidar sessão local e/ou forçar re-auth no backend quando apropriado.
- Migração: definir processo para usuários com cofre local sem conta backend (vincular cofre local a uma conta, enviar apenas ciphertext para o servidor após validação local).

Esses pontos foram integrados ao backlog P0/P1 e aos blocos de Risks & Decisions. 

## 7. CRIPTOGRAFIA E SEGURANÇA — ANÁLISE DETALHADA

Arquivos analisados: `src/services/CryptoService.ts`, `app/services/CryptoService.ts`, `src/services/encryption.ts`, `src/services/PasswordService.ts`, `src/services/SecurityService.ts`, `src/services/BackupService.ts`, `src/services/ShareService.ts`, `src/services/SecureCacheService.ts`.

Principais observações técnicas:

- Implementações múltiplas e inconsistentes:
	- `src/services/CryptoService.ts` gera/guarda uma *master key* em `SecureStore`, mas usa `Crypto.digestStringAsync` (SHA256) repetidamente para "derivar" chaves e para operações marcadas como encrypt/decrypt. O uso de digestes concatenados não substitui um cifrador autenticado reversível.
	- `app/services/CryptoService.ts` utiliza SHA256 (via `expo-crypto`) para derivação e depois `CryptoJS.AES.encrypt(data, key)` com a string de digest como passphrase — a função descreve PBKDF2 mas não a usa adequadamente.
	- `src/services/encryption.ts` armazena uma `masterKey` em `AsyncStorage` e usa `CryptoJS.AES.encrypt(text, this.masterKey)` sem controle explícito de IV/tag.

- Uso inseguro de armazenamento:
	- Material sensível em `AsyncStorage` (`src/services/encryption.ts`, hash da master password em `SecurityService`) — `AsyncStorage` não é um cofre seguro em muitos dispositivos.
	- Há inconsistência entre `SecureStore` e `AsyncStorage` quanto a onde chaves/params são mantidos.

- Derivação de chaves e KDF:
	- Não há uso consistente de PBKDF2/Argon2 com salt e parâmetros; algumas funções fazem apenas SHA256(password+salt), o que é insuficiente.

- Esquema de cifragem:
	- Falta uso padronizado de AES-GCM ou XChaCha20-Poly1305 com IV único por mensagem e tag de autenticação. Algumas implementações dependem de APIs de conveniência (`CryptoJS`) sem parâmetros explícitos.

- Backups/Compartilhamento/Cache:
	- `BackupService`, `ShareService` e `SecureCacheService` dependem do `cryptoService`. Dado o estado atual, backups e compartilhamentos podem conter ciphertext gerado por implementações inconsistentes; risco de perda de confidencialidade ou de dados irrecuperáveis.

Riscos (classificação):

- CRITICAL:
	- `src/services/CryptoService.ts` implementa operações incompatíveis com criptografia reversível adequada — risco de perda de dados e falha funcional.
	- `src/services/PasswordService.ts` ainda contém TODOs e pode persistir senhas em texto claro — exposição direta.

- HIGH:
	- Armazenamento de material sensível em `AsyncStorage`; uso de hash simples SHA256 sem salt para verifier.
	- Ausência de KDF robusto com parâmetros adequados.

- MEDIUM:
	- Uso misto de `CryptoJS` e `expo-crypto` sem padronização aumenta probabilidade de bugs e vulnerabilidades.

- LOW:
	- Dependências precisam de revisão periódica para vulnerabilidades conhecidas.

Recomendações (registro — não implementar agora):

1. Consolidar um `crypto` service (cliente) com API clara: `deriveKeyFromPassword()`, `wrapKey()`, `unwrapKey()`, `encrypt()`, `decrypt()`.
	 - Usar PBKDF2 (alto iteration count) ou Argon2 para derivação; armazenar salt e parâmetros; nunca armazenar senha em claro.
	 - Usar AES-GCM ou XChaCha20-Poly1305 para cifragem com IV/nonce único por mensagem e autenticação.

2. Armazenar material sensível no cofre seguro: `expo-secure-store` / Keychain / Keystore; evitar `AsyncStorage` para chaves/verifiers.

3. Backups e compartilhamentos devem conter apenas ciphertext e metadata. O servidor (ou storage) nunca deve receber a senha mestra em claro.

4. Atualizar `PasswordService` para garantir que nunca persista plaintext (P0).

5. Documentar o fluxo E2EE e adicionar testes que verifiquem interoperabilidade entre implementações (WebCrypto vs expo-crypto).

6. Prioridade: P0 para unificação e correção de crypto; esforço estimado 3–7 dias por engenheiro sênior.

Esses pontos foram integrados ao backlog P0/P1 e aos blocos de Risks & Decisions.


## 8. DATA MODEL, DB SCHEMA & RLS (Proposta)

Objetivo: design relacional para SaaS (Supabase/Postgres) que armazene somente ciphertext e metadata mínima, permitindo RLS para isolamento por usuário.

Principais tabelas (resumo):

- `users` (fornecido por Supabase Auth) — usar `auth.uid` como `owner_id`.
- `vault_items` — itens do cofre (senhas, notas)
	- Columns: `id UUID PRIMARY KEY`, `owner_id UUID REFERENCES auth.users(id)`, `ciphertext BYTEA NOT NULL`, `iv BYTEA NOT NULL`, `tag BYTEA` (if using AEAD), `meta JSONB` (optional encrypted metadata or plaintext minimal flags), `created_at TIMESTAMP`, `updated_at TIMESTAMP`.
- `categories` — per-user categories (id, owner_id, name, color)
- `device_keys` — per-device wrapped DEKs for multi-device access
	- Columns: `id`, `owner_id`, `device_id`, `wrapped_key BYTEA`, `created_at`.
- `backups` — uploaded backup blobs (ciphertext + metadata)

Exemplo de política RLS (Postgres/Supabase):

-- Habilitar RLS
ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;

-- Permitir leitura somente ao dono
CREATE POLICY "select_vault_items" ON vault_items
	FOR SELECT USING (auth.uid() = owner_id::text);

-- Permitir inserção somente se owner_id for o mesmo que auth.uid
CREATE POLICY "insert_vault_items" ON vault_items
	FOR INSERT WITH CHECK (auth.uid() = owner_id::text);

-- Atualizar/deletar apenas pelo dono
CREATE POLICY "modify_vault_items" ON vault_items
	FOR UPDATE, DELETE USING (auth.uid() = owner_id::text) WITH CHECK (auth.uid() = owner_id::text);

Observações de design:

- Armazenar apenas ciphertext para campos sensíveis (`ciphertext`, `iv`, `tag`). Se for necessário pesquisar por título, usar blind indexes ou armazenar índices derivados (HMAC) com salt público.
- `device_keys` permite implementar multi-device sem expor a senha mestra: cada dispositivo recebe um `wrapped DEK` cifrado com KEK derivado da senha mestra.


## 9. MIGRAÇÃO DE USUÁRIOS LOCAIS PARA CONTA (Fluxo recomendado)

Objetivo: permitir que usuários que tinham apenas cofre local sincronizem com a conta sem expor senhas em claro.

Fluxo simplificado:

1. Usuário cria conta no provedor (Supabase/Firebase). App autentica e obtém `auth.uid`.
2. Aplicativo pede ao usuário a `master password` local para desbloquear o cofre existente.
3. Localmente, derivar KEK = KDF(masterPassword, salt) usando PBKDF2/Argon2. Gerar (ou recuperar) DEK (Data Encryption Key) usado para cifrar itens. Se DEK não existir, gerar novo e re-encryptar localmente os itens com DEK.
4. Wrap DEK com KEK (wrapKey = AES-KW or AES-GCM) e armazenar `device_keys` no servidor: `wrapped_key` + `device_id` + `owner_id`.
5. Upload de itens: enviar apenas `ciphertext`, `iv`, `tag`, `meta` para `vault_items` com `owner_id = auth.uid`.
6. Marca local: cofre está vinculado; futuras sessões importam `device_keys` e, após usuário fornecer `masterPassword`, deswrapam o DEK.

Notas e verificações:

- Para usuários que usaram armazenamento inseguro (senhas em AsyncStorage em claro), exigir verificação adicional (forçar mudança de senha mestra e re-encrypt local antes de upload).
- Não enviar a senha mestra ao servidor em nenhum momento.
- Registrar no cliente a versão de esquema e KDF params para permitir futuros upgrades de KDF.


## 10. SAAS TARGET ARCHITECTURE (alto nível)

- Frontend: Web (Next.js / Vercel) + Mobile (Expo / EAS). Compartilhar lógica de crypto onde possível (WebCrypto vs React Native adapters).
- Backend: Supabase (Auth + Postgres + Storage + Edge Functions) — recomendado pela documentação existente.
- Sync/Workers: Edge Function / Serverless para tarefas não sensíveis (webhooks, backups metadata), mas toda criptografia e key handling permanecem no cliente.
- CI/CD: GitHub Actions para deploy web; EAS for mobile builds.
- Observability & Security: Logging sem dados sensíveis, dependabot/renovate, secrets in env manager.

Principais responsabilidades:

- Cliente: autenticação com Auth provider; derivação de chaves; encriptação/desencripção local; upload/download de ciphertext; key wrapping/unwrapping.
- Servidor: armazenar ciphertext e wrapped keys; aplicar RLS; oferecer backup/upload/download; fornecer APIs para device management.


## 11. PRIORITIZED BACKLOG (P0 → P3)

P0 (Correção urgente)
- Parar qualquer sincronização automática até garantir E2EE.
- Unificar implementação de `crypto` client-side em `src/services/CryptoService.ts` com API clara.
- Corrigir `PasswordService.encryptPassword`/`decryptPassword` para não retornar/persistir plaintext.
- Mover todos os segredos e verifiers para `SecureStore` (não `AsyncStorage`).
- Adicionar testes unitários de criptografia e integração (WebCrypto ↔ RN) e criação de CI que execute-os.

P1 (Infra & migração)
- Definir esquema Postgres (tabelas + RLS) e criar migrations.
- Implementar fluxo de vinculação de cofre local → conta (migration flow) com UI.
- Implementar `device_keys` para multi-device de maneira segura.
- Implementar API inicial ou configurar Supabase com políticas RLS.

P2 (Sincronização e Web)
- Implementar sincronização bidirecional (client-first conflict resolution).
- Adaptar crypto para Web (WebCrypto API) e criar abstractions para platform adapters.
- Implementar backups seguros (ciphertext only) e restore flows.

P3 (Melhorias e extras)
- 2FA, compartilhamento seguro entre usuários (E2EE sharing), key rotation, audit logs, compliance.
- Performance tuning e pesquisas de UX para migração de usuários legados.


## Consolidated Technical Assessment + SaaS Migration Plan

### 1. Current Architecture
- Expo + React Native app, local-first and mobile-first, with `expo-router` and Firebase client auth.
- Local storage is spread across `AsyncStorage`, `SecureStore`, and file system APIs, not a single remote data model.
- Business logic lives in `src/services/*`; encryption is fragmented and not yet safe for production SaaS.
- The vault is effectively a local personal vault today, not a multi-user SaaS product.

### 2. Existing Features
- Auth, biometrics, vault CRUD, password generation, HIBP checks, VirusTotal scanning, security lock, cache, backups, and sharing are present but unevenly implemented.
- Most features are useful and reusable, but several depend on native/mobile assumptions and must be adapted for web or SaaS.
- The strongest candidates to keep are: authentication flow, vault model, password strength tooling, HIBP checks, and local security controls.

### 3. SaaS Gap Analysis
- Missing multi-user backend, vault sync, and remote ownership model.
- No secure, consistent end-to-end encryption pattern across all modules.
- Local-only session flow can bypass backend auth and is not suitable for a SaaS identity model.
- Web compatibility is not yet designed; browser/integration requirements must be handled through platform adapters.

### 4. Security Assessment
- Critical: plaintext risk in `PasswordService` and multiple crypto implementations.
- High: SHA256-only master password handling, insecure storage of key material in `AsyncStorage`, and inconsistent KDF usage.
- Medium: backup/share/cache flows may leak or corrupt data if they rely on the current crypto layer.
- Security fix is required before sync or server storage is enabled.

### 5. Recommended SaaS Architecture
- Client-first E2EE: derive keys in the client; store only ciphertext remotely.
- Web + Mobile split by platform adapters: shared domain logic, different storage/crypto adapters.
- Recommended backend: Supabase Auth + Postgres + RLS for a simple secure SaaS foundation.
- Keep server as a storage/identity layer, not as a place where secrets are decrypted or held in plaintext.

### 6. Web/Mobile Strategy
- Start with Expo + Expo Web for lowest cost and faster product validation.
- Add platform adapters for `AsyncStorage`/`SecureStore` to browser storage (IndexedDB/local storage patterns), and `expo-crypto` to WebCrypto.
- Treat biometrics as a local unlock mechanism, not as remote identity.
- Long-term: separate web app or shared package if product growth requires it.

### 7. Database Changes
- Introduce a user-owned vault model with `vault_items` and per-user ownership/ACL semantics.
- Store only encrypted payloads, IV/nonce, authentication tags, and minimal metadata.
- Add a device key model for multi-device access without exposing the master password.
- Add `subscriptions`/`plans` later only after authentication and data model are stabilized.

### 8. Refactoring Backlog P0-P3
- P0: unify crypto, remove plaintext persistence, move sensitive material out of `AsyncStorage`, add tests.
- P1: standardize auth/backend and migrate local vault to account-linked encrypted sync.
- P2: web adapters, conflict resolution, secure backups, and multi-device sync.
- P3: billing, team sharing, RBAC, audit logs, and premium plan expansion.

### 9. Recommended Development Order
1. Fix crypto and stop any unsafe persistence before any cloud sync.
2. Decide backend identity model and align local auth flows to the same model.
3. Implement encrypted remote storage with RLS/ownership rules.
4. Add shared web/mobile adapters and reduce native coupling.
5. Add freemium plumbing and only then billing or advanced features.

### 10. Risks & Decisions
- Decision required: Firebase vs Supabase for Auth and DB. Supabase is the better fit for a data-oriented SaaS with RLS.
- Decision required: client-only key derivation and E2EE must be enforced; no server-side decryption.
- Main risk: continuing with inconsistent crypto while enabling sync would create irreversible user data exposure.

### 11. Files To Be Changed
- `src/services/PasswordService.ts`
- `src/services/encryption.ts`
- `src/services/CryptoService.ts`
- `src/services/SecurityService.ts`
- `src/services/BackupService.ts`
- `src/services/ShareService.ts`
- `src/services/SecureCacheService.ts`
- `src/config/firebase.ts` (if auth/backend is changed)
- `documentacaodev.md` and any public product docs that describe auth/storage behavior

# REGRA IMPORTANTE

Não tente "melhorar" o projeto simplesmente reescrevendo código.

Primeiro compreenda a arquitetura existente.

O objetivo desta etapa é produzir um **Technical Assessment + SaaS Migration Plan**, não implementar a solução.

Ao final, aguarde aprovação antes de realizar qualquer alteração.
