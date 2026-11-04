# SecureLink Vault: documento de continuidade do MVP

Última atualização: 2026-11-04 · Código de produção: `master` · Desenvolvimento: `dev`

Documento principal para quem vai **operar, recriar ou evoluir** o sistema. Reúne o que existe, como montar um ambiente novo do zero, como operar no dia a dia e o que falta.

| Documento | Para quê |
|---|---|
| [`STATUS.md`](STATUS.md) | **Retrato atual em uma página**: o que existe, ambientes, pendências, próximos passos e como retomar |
| [`product/roadmap-v1.md`](product/roadmap-v1.md) | **Caminho para a versão 1.0 paga**: revisão, assinaturas, garantia de segurança e de funcionamento, lojas |
| [`product/plan-strategy.md`](product/plan-strategy.md) · [`product/feature-review.md`](product/feature-review.md) | Planos Free/Pro/Enterprise e inventário de funcionalidades com evidências e prioridades |
| [`operations/finops.md`](operations/finops.md) · [`operations/scaling-triggers.md`](operations/scaling-triggers.md) · [`operations/release-readiness.md`](operations/release-readiness.md) | Custos e receita, gatilhos de escala e portões de prontidão |
| **Este arquivo** | Visão completa, ambiente novo, operação, testes |
| [`PRODUCTION.md`](PRODUCTION.md) | **Produção**: piloto de 15 dias no plano Free (seção 0: o que está no ar e o que falta), depois beta Pro com licenças, backups, segurança, rotinas e checklist de go-live |
| [`operations/data-storage-and-backup.md`](operations/data-storage-and-backup.md) | Onde cada dado fica, o que é cifrado, camadas de backup, backup externo cifrado e teste de restauração |
| [`security/cyberark-alignment.md`](security/cyberark-alignment.md) | Aderência às boas práticas CyberArk (Vault, Server Security Standard, Secured Items) |
| [`product/open-source-and-business.md`](product/open-source-and-business.md) | Open source (licença, preparação), web + mobile, modelo de negócio e posicionamento contra o 1Password |
| [`product/browser-extension.md`](product/browser-extension.md) | Extensão de navegador: objetivo, fases, arquitetura, correspondência de domínio, ameaças, decisões e situação |
| [`../web-saas/extension/README.md`](../web-saas/extension/README.md) | Extensão: build, instalação sem loja, login Google/GitHub, testes |
| [`product/mobile-app.md`](product/mobile-app.md) | App para celular (Android e iOS): objetivo, arquitetura, segurança e fases |
| [`security/access-recertification.md`](security/access-recertification.md) | Quem acessa cada item: matriz de acesso, controles com evidência de teste e riscos residuais |
| [`security/mvp-security-model.md`](security/mvp-security-model.md) | Modelo de segurança detalhado e limitações |
| [`security/oauth.md`](security/oauth.md) | Login com Google e GitHub (OAuth + PKCE) |
| [`architecture/connectors-rotation.md`](architecture/connectors-rotation.md) | Conectores e rotação de senhas |
| [`mvp-progress.md`](mvp-progress.md) | Histórico, decisões e linha do tempo |
| [`pending-actions.md`](pending-actions.md) | Checklist de ações do responsável no ambiente atual |

---

## 1. Ambiente atual

| Item | Valor |
|---|---|
| **Produção (piloto)** | App `https://securelinkvault.netlify.app` (site `securelinkvault`) · Supabase `securelink-prod`, ref `exglsdylytdjwrlmyptk`, São Paulo, plano **Free** por 15 dias. Situação e passos restantes: `PRODUCTION.md`, seção 0. Segredos locais em `~/.securelink-prod/` (fora do repositório) |
| Desenvolvimento | App `https://securelinkvaultdev.netlify.app` (site `securelinkvaultdev`) · Supabase ref `sueemdqyhwnmbqokpefz`, plano Free. É onde rodam os testes de integração; **nunca** rode testes contra a produção |
| Publicação | Por CLI. Desenvolvimento: `netlify deploy --prod --dir web-saas/dist`. Produção: build com as variáveis da produção e `--site 074110e2-19ba-4fdc-82f8-ad7a5d7cab4f` (ver `PRODUCTION.md`). A CLI do Supabase fica vinculada ao **desenvolvimento**; comandos de produção usam `--project-ref exglsdylytdjwrlmyptk` |
| Extensão | `web-saas/extension/` (Chrome e Edge, MV3). Pacote de desenvolvimento em `web-saas/dist-extension`; de produção, fora do repositório |
| App Android | `web-saas/android/` (Capacitor 7). APK de produção assinado em `~/.securelink-prod/`; como gerar em `product/mobile-app.md`, seção 8 |
| Código | `web-saas/` (app), `supabase/migrations/` (banco), `supabase/functions/` (Edge Functions), `supabase/admin/` (scripts de operação) |
| Repositório | GitHub `macartechsand/securevaultlink`. **PR #1 mesclado** em `master` (`d5bf916`); o desenvolvimento segue em `dev`. O `master` antigo (protótipo Bolt) foi ligado ao histórico com um merge `-s ours` |
| Legado | O app Expo da raiz está congelado; não usar |

---

## 2. Funcionalidades do MVP

### 2.1 Usuário final
| Área | Funcionalidades |
|---|---|
| **Conta** | Cadastro só para convidados (beta fechado); login com e-mail e senha, **Google** ou **GitHub** (OAuth + PKCE); "Esqueci a senha da conta"; links de acesso gerados pelo administrador; **verificação em duas etapas** (TOTP); sessões ativas com encerramento remoto |
| **Cofre** | Senha mestra (zero-knowledge); **chave de recuperação** opcional; troca da senha mestra; bloqueio manual e automático (5 min) |
| **Secured Items** | Tipos **Login, Nota segura, Segredo/chave de API, Cartão**; até 10 campos personalizados (com opção de ocultar); notas de até 4.000 caracteres; até 10 **anexos**; **pastas** (nome cifrado), **tags**, favoritos; busca; filtros por tipo, pasta, tag, risco e compartilhamento |
| **Histórico** | Últimas 10 senhas de cada item, visíveis só para o dono, com "Restaurar" |
| **Compartilhar (conectar usuários)** | Itens com permissão **Visualizar** ou **Editar**; arquivos; validade de até **48 h no gratuito** (Premium até 30 dias ou sem expiração); conferência da **impressão digital** da chave; revogação com **troca de chave** |
| **Arquivos** | Cofre de arquivos cifrados; "Compartilhados comigo"; **transferências por link** para qualquer pessoa (senha opcional, expiração, limite de downloads, revogação) |
| **Saúde e postura** | Senhas fracas, reutilizadas, antigas e com troca vencida; **Verificar segurança**: vazamentos (Have I Been Pwned, k-anonimato) e sites perigosos (Google Safe Browsing); **score de postura** 0–100 com recomendações |
| **Rotação** | Botão **↻ na lista de itens** e "Rotacionar agora" no editor, além da aba Rotação. **1 clique**: logins geram e copiam a nova senha e abrem `/.well-known/change-password`, e a senha só é salva após confirmação. Rotacionam **automaticamente** via API, com consentimento por item (beta): **AWS IAM** (access key e senha do console), **Microsoft 365 / Entra ID** (senha de conta corporativa e client secret), **Google Workspace** (senha de usuário), **Google Cloud** (chave de service account), **GitLab** (PAT) e **Cloudflare** (token). **Instagram, Facebook, Gmail e conta Microsoft pessoal** não têm API de troca de senha: o 1 clique abre direto a página de troca de cada um. Também: troca assistida passo a passo, **troca programada** (30 dias a 1 ano), **fila de correção** por risco e catálogo de **conectores** |
| **Gerador** | Senhas com CSPRNG, sem viés |
| **Atividade** | Log de auditoria da própria conta |
| **Backup e migração** | **Exportação cifrada** (senha própria, PBKDF2 600k + AES-GCM); importação do backup; **importação de CSV** (Chrome, Edge, Firefox, Bitwarden, 1Password, LastPass) |
| **Privacidade (LGPD)** | Aviso de privacidade; controle das métricas enviadas ao suporte; **excluir conta e todos os dados** |
| **Diagnóstico** | Testes do navegador, conexão, cofre, chaves, armazenamento e funções; relatório copiável ou **enviado ao suporte** |
| **Recomeçar o cofre** | Sem chave de recuperação, "Esqueci a senha mestra" permite apagar o cofre (digitando `APAGAR COFRE`) e criar outro, mantendo conta, MFA e papéis |
| **Interface** | Tema escuro e claro, português. Menu agrupado (Cofre, Proteção, Conta) com contadores de pendências e quadro "Cofre desbloqueado" (o que protege a sessão); busca com atalho `/` ou `Ctrl+K`; visão geral com ações rápidas, medidor de postura e cartões que abrem o cofre filtrado. **Celular:** barra de navegação inferior, itens em cartões, janelas como painéis inferiores. **PWA:** instalável no Android e no iPhone |
| **Extensão de navegador** (Chrome/Edge) | Entrar com e-mail/senha, **Google ou GitHub** + TOTP; desbloquear com a senha mestra; bloqueio após 10 min, ao bloquear o sistema e ao fechar o navegador; **preencher** logins só no site correspondente (domínio base, http×https, IP e porta exatos), com gesto do usuário e nunca em iframe de terceiro; `Ctrl+Shift+L`; copiar com limpeza em 30 s; gerador. Detalhes: `product/browser-extension.md` |

### 2.2 Administração
Nenhuma função administrativa devolve conteúdo de cofre.

| Aba | Conteúdo |
|---|---|
| Visão geral | Usuários, MFA, recuperação, Premium, itens, arquivos, transferências e sinais operacionais de 24 h |
| **Licenças** | Licenças Premium em uso e disponíveis (padrão **5** no beta), usuários × tipo de licença, atribuição **Premium com prazo** (30, 90 ou 180 dias, 1 ano, outro) ou **sem prazo**, ou Gratuito; observação só para admins; vencimentos dos próximos 7 dias; convites Premium pendentes. Detalhes em `PRODUCTION.md`, seção 3 |
| **Usuários (IAM)** | Lista com papel, plano, provedores, MFA e score. A ficha tem: **Insights de segurança** (postura em números e metadados do servidor), **Identidade e acesso** (plano, MFA obrigatório, link de redefinição, reset de MFA, encerrar sessões, suspender), **Eventos** e **Suporte** (relatórios recebidos) |
| **Acesso privilegiado (PAM)** | Revisão de quem tem privilégio, até quando, por quê e com que MFA; concessão **temporária** (just-in-time) com justificativa. Só o **Administrador master** concede |
| **Conformidade** | 16 controles marcados como OK, atenção ou falha |
| **Eventos** | Feed global de auditoria com filtros |
| **Beta e limites** | Convites (Gratuito ou **Premium com prazo opcional**), "convidar e gerar link", máximo de contas, cotas, modo de cadastro, MFA obrigatório para todos |
| Saúde do sistema | Bucket, chaves configuradas, limpeza |

Papéis:

| Papel | Pode |
|---|---|
| `owner` (Administrador master) | Tudo, inclusive conceder e revogar papéis |
| `admin` | Gerenciar usuários e configurações |
| `support` / `auditor` | Somente leitura |

Todo papel exige MFA.

---

## 3. Arquitetura

```
Navegador (React 19 + Vite, web-saas/)
  ├─ WebCrypto: senha mestra → PBKDF2 600k → KEK → DEK (AES-256-GCM)
  │   ├─ itens: chave por item (v2), AAD = dono + item + versão
  │   ├─ arquivos: chave por arquivo, blocos de 1 MiB autenticados
  │   └─ compartilhamento: ECDH P-256 → HKDF → AES-GCM
  ├─ Supabase Auth (e-mail/senha, OAuth Google/GitHub com PKCE, TOTP)
  ├─ Supabase Postgres (RLS em todas as tabelas, triggers de auditoria e limites)
  ├─ Supabase Storage (bucket privado vault-files) │ Cloudflare R2 (Premium, opcional)
  └─ Edge Functions: check-url · transfer · cleanup-files · admin · storage-r2 · account · rotate
Terceiros: Have I Been Pwned (k-anonimato) · Google Safe Browsing (pela função check-url)
           APIs de rotação (pela função rotate): AWS IAM/STS, Google OAuth/IAM/Admin SDK, Microsoft Graph, GitLab, Cloudflare
Hospedagem: Netlify (CSP, HSTS, noindex)

Extensão (web-saas/extension/, MV3)
  ├─ service worker: sessão própria (chrome.storage.local), DEK só em memória (chrome.storage.session)
  ├─ mesma criptografia e serviços do app (importados de web-saas/src; cliente Supabase trocado no build)
  └─ preenchimento: varre os frames sem segredos → envia usuário/senha a um único frame do mesmo site
```

### 3.1 Banco (principais tabelas)
| Tabela | Conteúdo (cifrado = ilegível ao servidor) |
|---|---|
| `vault_profiles` | Parâmetros do KDF, DEK embrulhada (senha e recuperação) |
| `vault_entries` | Itens (cifrados), chave do item embrulhada, histórico cifrado |
| `vault_folders` | Nome da pasta (cifrado) |
| `item_shares`, `file_shares` | Chave selada ao destinatário, permissão, validade |
| `vault_files`, `transfers` | Metadados cifrados, chaves embrulhadas, backend (Supabase/R2), contadores |
| `user_keys` | Chave pública de compartilhamento; privada embrulhada pela DEK |
| `audit_events` | Log só de inclusão (servidor e app); retenção de 365 dias |
| `user_plans`, `app_settings`, `beta_allowlist`, `user_policies` | Licenças (plano, validade, quem concedeu, observação), limites (inclusive `premium_seats`), convites (com plano), MFA obrigatório |
| `app_admins` | Papéis privilegiados (com validade e justificativa) |
| `posture_snapshots`, `user_preferences`, `support_reports` | Métricas numéricas (opt-out), preferência e relatórios de suporte |

### 3.2 Edge Functions
| Função | JWT | Papel | Secrets |
|---|---|---|---|
| `check-url` | sim | Reputação de URLs: **Web Risk** (uso comercial) ou Safe Browsing (só sem cobrança). Uso justo por plano e dia contado no banco (`consume_url_checks`) | `WEB_RISK_API_KEY` ou `SAFE_BROWSING_API_KEY` |
| `transfer` | **não** (público) | Download de transferências por link | (service role, automático) |
| `cleanup-files` | **não** (protegida por header) | Limpeza de vencidos e abandonados; heartbeat | `CLEANUP_SECRET` |
| `admin` | sim | MFA reset, suspender, links de convite e redefinição, saúde | `APP_ORIGINS` |
| `storage-r2` | sim | URLs assinadas do R2 (Premium) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| `account` | sim | Exclusão da própria conta (LGPD) e "recomeçar cofre" | — |
| `rotate` | sim | Rotação automática em 1 clique (AWS IAM, Microsoft 365/Entra ID, Google Workspace, Google Cloud, GitLab, Cloudflare); não guarda nem registra valores; 20 chamadas às plataformas por hora por usuário | — |

Todas as funções que respondem ao navegador leem `ALLOWED_ORIGIN` (CORS). Sem ele, o valor é `*`; em produção, defina o domínio do app.

---

## 4. Montar um ambiente novo do zero

Use este roteiro para um projeto de **produção** separado do de desenvolvimento.

### 4.1 Supabase
1. Crie o projeto. Para dados reais, use o **plano Pro**: backups diários, 100 GB de storage, sem pausa por inatividade.
2. No terminal, na raiz do repositório:
   ```powershell
   npx supabase login
   npx supabase link --project-ref <REF_NOVO>
   npx supabase db push            # aplica TODAS as migrations, em ordem
   ```
   Isso cria tabelas, RLS, triggers, o bucket `vault-files`, o beta fechado, os papéis e as licenças. As 20 migrations ficam em `supabase/migrations/` e já estão na ordem certa (`20261009…` → `20261105…`).
3. Edge Functions:
   ```powershell
   npx supabase functions deploy check-url
   npx supabase functions deploy admin
   npx supabase functions deploy storage-r2
   npx supabase functions deploy account
   npx supabase functions deploy rotate
   npx supabase functions deploy transfer --no-verify-jwt
   npx supabase functions deploy cleanup-files --no-verify-jwt
   ```
4. Secrets (gere o `CLEANUP_SECRET` com o gerador seguro, ver `pending-actions.md`):
   ```powershell
   npx supabase secrets set WEB_RISK_API_KEY=<chave> CLEANUP_SECRET=<64 hex> APP_ORIGINS=https://<dominio-do-app> ALLOWED_ORIGIN=https://<dominio-do-app>
   # opcional: HEARTBEAT_URL=<url de heartbeat do monitoramento>, chamada a cada limpeza (de hora em hora)
   ```
5. **Authentication:**
   - **URL Configuration:**
     - Site URL: `https://<dominio-do-app>`
     - Redirect URLs: `https://<dominio-do-app>/**`
   - **Email:**
     - "Confirm email" ligado;
     - senha mínima de 10 caracteres;
     - **SMTP próprio** (Resend, Brevo…). Sem ele, os e-mails só chegam a membros da equipe do projeto.
   - **Providers:** Google e GitHub, ver `security/oauth.md`.
   - **Multi-Factor:** TOTP habilitado.
6. **Cron:** job a cada hora chamando `cleanup-files` (POST, header `x-cleanup-secret`).
7. **Administrador master:** `supabase/admin/create-master-admin.sql` (partes A e B) e depois ative o MFA no app.
8. **Limites:** `supabase/admin/set-mvp-limits.sql`, ou pelo painel em Administração → Beta e limites.

### 4.2 App (Netlify)
1. `web-saas/.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto novo. A chave anon é pública; **nunca** use a service role no app.
2. Site novo: `npx netlify-cli link --name <site>` na raiz.
3. Build e publicação:
   ```powershell
   cd web-saas; npm ci; npm run build; cd ..
   npx netlify-cli deploy --prod --dir web-saas/dist
   ```
   Publique a partir da **raiz**, para que os cabeçalhos do `netlify.toml` (CSP, HSTS, noindex) sejam aplicados.
4. Para build automático pelo GitHub: configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em Site configuration → Environment variables. O `netlify.toml` já tem o comando.
5. Confira: `curl -sI https://<dominio>` precisa mostrar `Content-Security-Policy`, `Strict-Transport-Security` e `X-Robots-Tag`.

### 4.3 Opcionais
- **Cloudflare R2 (Premium):** bucket privado, token restrito ao bucket, CORS com o domínio do app, secrets `R2_*`. Ver `pending-actions.md`.
- **Web Risk** no lugar do Safe Browsing ao cobrar pelo produto (o Safe Browsing é para uso não comercial).

---

## 5. Operação (runbook)

| Tarefa | Como |
|---|---|
| Convidar usuário | Administração → Beta e limites → **Convidar e gerar link** → enviar o link por mensagem direta |
| Convidar já no **Premium** | Mesmo fluxo, escolhendo **Premium** e, se quiser, os dias (vazio = sem prazo). O plano vale a partir do cadastro; se a conta já existir, vale na hora. Conta no limite de usuários. Quando o prazo acaba, a conta volta ao Gratuito sozinha: novos uploads respeitam a cota menor, e os arquivos e links que já existem continuam. Trocar o plano manualmente em Usuários remove o prazo. Eventos: `plan.granted_by_invite`, `admin.plan_changed` |
| Atribuir ou renovar licença | Administração → **Licenças** → usuário → **Alterar licença** → Premium (prazo) ou Gratuito → Aplicar. Ajuste o total de licenças no topo da aba |
| Rotação automática falhou | Eventos → `rotation.failed` (o detalhe traz só o código, ex. `permission`, `current_invalid`, `key_limit`). A mensagem na tela do usuário explica a permissão que falta |
| Usuário esqueceu a senha da **conta** | Usuários → ficha → **Gerar link de redefinição** |
| Usuário esqueceu a **senha mestra** | Ninguém consegue redefini-la (nem o admin). Com a **chave de recuperação**: Desbloquear → "Esqueci a senha mestra" → chave + nova senha, sem perder nada. Sem a chave: Desbloquear → "Esqueci a senha mestra" → digitar `APAGAR COFRE`. Isso apaga o cofre (itens, arquivos, pastas, compartilhamentos enviados e recebidos) e mantém conta, MFA e papéis; a pessoa cria uma nova senha mestra. Registrado como `vault.reset` em Eventos (Edge Function `account`, ação `reset_vault`) |
| Usuário perdeu o autenticador | Confirmar a identidade por outro canal → Usuários → ficha → **Resetar MFA** |
| Conta comprometida | **Encerrar sessões** e **Suspender**; pedir troca da senha da conta |
| Dar acesso ao suporte | PAM → conceder **Suporte (leitura)** por 1 a 8 horas, com justificativa |
| Acompanhar riscos | **Conformidade** (falhas em vermelho) e **Eventos** (filtrar `admin.`, `vault.unlock_failed`, `client.error`, `rotation.`) |
| Usuário com problema | Pedir que use Configurações → Diagnóstico → **Enviar ao suporte**; ver na ficha → Suporte |
| Limpeza parada | Conformidade → "Horas desde a última limpeza"; conferir o Cron |
| Backup do banco (Free) | Semanal: `npx supabase db dump -f backup-AAAA-MM-DD.sql` (pede a senha do banco). No Pro há backup diário automático |
| Backup dos arquivos | O backup do banco **não inclui os objetos do Storage**; no Pro, considere exportar o bucket periodicamente. Os objetos são cifrados |
| Capacidade (Free) | 1 GB de arquivos (15 × 60 MB), 5 GB de tráfego por mês, projeto pausa após 7 dias sem uso |

**Incidentes:**
- **Vazou a service role ou o `CLEANUP_SECRET`:** gere uma nova no painel do Supabase e atualize os secrets.
- **Vazou a chave anon:** não é segredo, o RLS protege os dados.

---

## 6. Testes

```powershell
cd web-saas
npm test                       # todos os testes (unitários + integração se configurados)
npm test -- src/lib            # só unitários (criptografia, itens, saúde, conectores, backup, postura)
npm test -- integration        # integração contra o Supabase de DESENVOLVIMENTO
```

**Integração:** usa as contas descartáveis A e B em `web-saas/.env.test.local` (git-ignored). Nunca use contas reais.

| Suíte | Cobre |
|---|---|
| `rls.integration` | Isolamento do cofre de senhas |
| `files.integration` | Isolamento de arquivos, storage, cotas, compartilhamento, transferências, planos, auditoria |
| `items.integration` | Secured Items: compartilhamento ver/editar, proteção da chave e do histórico, pastas |
| `iam.integration` | Bloqueio de funções administrativas, métricas de postura, relatórios de suporte |
| `core.integration` | **Ponta a ponta**: persistência, rotação com histórico, conectar usuários, auditoria, HIBP, Safe Browsing ao vivo, transferência anônima |
| `session.integration` | Caminho real de desbloqueio (perfil → senha mestra → itens → histórico) e "recomeçar cofre" |
| `rotate.integration` | Função `rotate` contra as APIs **reais** de AWS, Google, Microsoft, GitLab e Cloudflare com credenciais **falsas**: autenticação, validação, anti-SSRF, nenhum valor ecoado |

**Extensão:**
```powershell
npm test -- extension            # regras de domínio (phishing) e retorno do OAuth
npm run build:ext:test; npm run test:ext:e2e   # Edge real + desenvolvimento + conta A
```

Última execução (2026-11-01): **149 de 149** e **6 de 6** ponta a ponta no Edge. O app Android foi conferido em emulador (ver `product/mobile-app.md`, seção 7). Os arquivos de teste rodam um de cada vez (`fileParallelism: false`), porque as suítes de integração compartilham as contas A e B. A suíte `rotate.integration` faz cerca de 10 chamadas às plataformas por execução (o limite é 20 por hora).

---

## 7. Checklist de produção

O checklist de go-live para o **beta com 5 usuários Premium e credenciais reais** está em [`PRODUCTION.md`](PRODUCTION.md), seção 8. As ações do ambiente atual estão em [`pending-actions.md`](pending-actions.md).

---

## 8. Limitações conhecidas
- **Senha mestra:** sem a chave de recuperação, esquecê-la significa perder o cofre.
- **Tamanho de arquivo:** até 25 MB, porque a cifragem é feita em memória. Arquivos maiores exigem streaming.
- **Conectores automáticos de rotação:** AWS IAM (access key e console), Microsoft 365/Entra ID (senha e client secret), Google Workspace, Google Cloud, GitLab e Cloudflare funcionam em 1 clique, mas estão em **beta**. Foram testados contra as APIs reais só com credenciais falsas (falham na autenticação, sem alterar nada), e ainda falta validar cada um com uma credencial real de baixo risco. Os demais seguem planejados. Não existe rotação agendada sem o usuário presente: exigiria custódia da credencial.
- **Revogação:** não apaga cópias que o destinatário já tinha. O endpoint autenticado do Storage pode servir um objeto em cache por alguns segundos; o app usa URLs assinadas e não é afetado.
- **Metadados visíveis ao servidor:** quantidade de itens, tamanhos e datas.
- **Confirmação por e-mail com PKCE:** precisa ser aberta no mesmo navegador do cadastro.
- **Sem API de troca de senha:** Instagram, Facebook, Gmail e conta Microsoft pessoal; o 1 clique só abre a página de troca de cada um.
- **Licenças:** não há cobrança automática (Stripe); o Premium é atribuído pelo admin.
- **Supabase Free:** sem backup automático e pausa após 7 dias sem uso. A produção do piloto está no Free; o backup externo é obrigatório.
- **Extensão:** só logins (notas, segredos e cartões ficam no app); não oferece salvar senha ao fazer login nem ícone dentro do campo (fase 2); a área de transferência é limpa após 30 s sem conferir o conteúdo.
- **Login social na produção:** exige novos clientes OAuth do Google e do GitHub apontando para o projeto de produção.

## 9. Próximos passos (ordem combinada em 2026-11-03)
O plano detalhado, com critérios de saída de cada etapa, está em [`product/roadmap-v1.md`](product/roadmap-v1.md).
1. Concluir o piloto de produção (`PRODUCTION.md`, seção 0), colher o retorno dos convidados e decidir o Pro ao fim dos 15 dias.
2. **Revisar funcionalidades, features e visual** e fechar o escopo da 1.0. Em discussão:
   - extensão fase 2;
   - arquivos grandes por streaming;
   - biometria e iPhone nativo;
   - conectores de rotação validados com conta real;
   - agente local para bancos e servidores.
3. **Assinaturas:** cobrança recorrente (cartão e Pix) ligada às licenças, Termos de Uso, Política de Privacidade, CNPJ e NFS-e.
4. **Garantia de segurança:** pentest externo, revisão da criptografia, Supabase Pro com restauração testada, plano de incidentes.
5. **Garantia de funcionalidade:** testes automáticos em todo PR, matriz de aparelhos, monitoramento, suporte.
6. **Lojas** (Play Store, App Store, lojas de extensões): só com a versão 1.0 completa.
7. Depois da 1.0: equipes e organizações (plano Business).
