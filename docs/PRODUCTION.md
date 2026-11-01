# Produção: beta com 5 usuários Premium e credenciais reais

Última atualização: 2026-11-01 · Produção: `securelink-prod` (Free, piloto de 15 dias) · Código: `master`

**Escopo atual:** beta fechado, **5 licenças Premium de 30 dias**, atribuídas e renovadas **manualmente** pelo administrador, **sem pagamento**. São 6 contas no total (5 usuários + o administrador master).

Roteiro para sair do ambiente de testes e operar o SecureLink Vault de forma **produtiva e consistente**: dados preservados, backups testados, acessos controlados e licenças geridas. Complementa o [`HANDOVER.md`](HANDOVER.md), que traz a visão completa do sistema e a montagem de ambiente. Antes de dados reais, leia também:
- [`operations/data-storage-and-backup.md`](operations/data-storage-and-backup.md): onde cada dado fica, o que é cifrado, as camadas de backup e o teste de restauração;
- [`security/cyberark-alignment.md`](security/cyberark-alignment.md): aderência às boas práticas CyberArk (Vault, Server Security Standard, Secured Items) e o que falta;
- [`security/access-recertification.md`](security/access-recertification.md): recertificação de que só o dono e quem recebeu o compartilhamento acessam cada item.

---

## 0. Piloto em produção no plano Free (2026-11-01)

Decisão do dono do produto: validar a usabilidade **antes** de pagar o Pro, num piloto de **15 dias** com os convidados (licenças Premium de 15 dias). Os dados são **preservados** ao fim do prazo; nada é apagado automaticamente.

| Recurso | Produção |
|---|---|
| Projeto Supabase | `securelink-prod` · ref `exglsdylytdjwrlmyptk` · São Paulo (`sa-east-1`) · **Free** |
| App | https://securelinkvault.netlify.app (site Netlify `securelinkvault`, separado do de desenvolvimento) |
| Código | `master` (PR #1 mesclado em `d5bf916`) |
| Extensão | Pacote de produção gerado fora do repositório (`~/.securelink-prod/securelink-extension-prod.zip`) |
| Segredos locais | `~/.securelink-prod/` (só o seu usuário do Windows lê): senha do banco, `CLEANUP_SECRET`, SQL inicial |

**Feito (pelo Claude, com autorização):**
- projeto criado;
- 19 migrations aplicadas;
- 7 funções publicadas;
- secrets `CLEANUP_SECRET`, `APP_ORIGINS` e `ALLOWED_ORIGIN`;
- site publicado com cabeçalhos verificados;
- função de limpeza testada (200 com o secret, 403 sem ele);
- pacote da extensão de produção gerado.

**Diferenças do Free em relação ao plano Pro deste documento:**
| Limite do Free | Impacto | Mitigação |
|---|---|---|
| **Sem backup automático** | Uma exclusão acidental não tem volta pelo painel | **Backup externo cifrado obrigatório**: o primeiro antes de convidar, depois 2 vezes por semana (`scripts/backup/backup.mjs`, exige o Docker Desktop aberto). Usuários fazem a exportação cifrada |
| **Pausa após 7 dias sem uso** | O app para de responder até alguém retomar o projeto no painel | Uso diário do piloto evita; se pausar, **Restore project** no painel (os dados ficam) |
| 1 GB de arquivos, 500 MB de banco | Cotas menores | Premium 150 MB × 5 + admin 80 MB = 830 MB |
| E-mail padrão do Supabase só envia para membros da organização | Convites e redefinições por e-mail não chegam | Os convites do app já são **links** enviados por mensagem direta; não depende de e-mail |
| No máximo 2 projetos ativos por organização | Não há onde fazer o teste de restauração completo (dev + prod ocupam as vagas) | Teste parcial: `restore.mjs` sem `--apply` (decifra e confere os hashes). Teste completo ao migrar para o Pro |

**Falta (você, no painel ou no app):**
1. [ ] **SQL Editor da produção** → colar e rodar `~/.securelink-prod/prod-setup.sql`, que contém:
   - a autorização do administrador master;
   - os limites do piloto;
   - o cron de limpeza.

   Conferir que aparecem 7 ajustes e 1 job.
2. [ ] **Authentication → URL Configuration:**
   - Site URL `https://securelinkvault.netlify.app`;
   - Redirect URLs `https://securelinkvault.netlify.app/**` e `https://mcljapeloopnadipmhmojkmbjjgbpdij.chromiumapp.org/`.
3. [ ] **Authentication → Sign In / Providers → Email:** senha mínima 10, Confirm email ligado. **Multi-Factor:** TOTP habilitado.
4. [ ] **Administrador master:**
   1. Authentication → Users → **Add user** (mesmo e-mail do passo 1, senha forte, "Auto Confirm User").
   2. Rodar a parte B de `supabase/admin/create-master-admin.sql`, trocando o e-mail.
   3. Entrar no app, criar o cofre e ativar o MFA.
5. [ ] **Backup:** abrir o Docker Desktop e rodar o primeiro backup externo. Pode pedir ao Claude, que lê a senha do banco do arquivo privado.
6. [ ] **Convites:** Administração → Beta e limites → e-mail → Premium → **outro prazo: 15 dias**. Enviar o link e o `.zip` da extensão por mensagem direta, com o onboarding (seção 7).
7. [ ] Opcional: chave do Safe Browsing (`npx supabase secrets set --project-ref exglsdylytdjwrlmyptk SAFE_BROWSING_API_KEY=...`, digitada por você no terminal). Sem ela, a verificação de sites aparece como indisponível. Google/GitHub exigem novos clientes OAuth apontando para a produção (`security/oauth.md`); até lá, login por e-mail e senha.

**Ao fim dos 15 dias:** decidir entre migrar para o Pro, que mantém o mesmo projeto e os dados (Settings → Billing → upgrade), ou encerrar. Se encerrar, **exportar e avisar os usuários antes**; apagar dados reais exige a sua aprovação explícita.

---

## 1. Decisão principal: um projeto de produção separado

**Recomendação:** criar um **projeto Supabase novo, no plano Pro**, só para produção, e manter o atual (`sueemdqyhwnmbqokpefz`) como **desenvolvimento**.

| Motivo | Detalhe |
|---|---|
| Os testes de integração **escrevem** no projeto atual | As suítes usam as contas A e B, recriam o cofre da conta A e chamam as APIs reais. Rodá-las contra dados reais seria inaceitável |
| O projeto atual tem contas, convites, eventos e cofres de teste | Começar limpo evita confundir dados de teste com dados reais na auditoria e na conformidade |
| O plano Free **pausa** após 7 dias sem uso e **não tem backup automático** | Para credenciais reais, isso significa risco de indisponibilidade e de perda de dados |
| Capacidade | 5 usuários Premium × 200 MB = 1 GB de arquivos, o limite inteiro do Free. O Pro tem 100 GB |

Custo de referência: Supabase Pro em torno de US$ 25 por mês, com backups diários e retenção de 7 dias. O add-on de PITR permite restaurar a qualquer minuto.

> Se preferir manter um projeto só, transforme o atual em produção: faça o upgrade para Pro, apague as contas e os dados de teste e **nunca mais rode** `npm test -- integration` contra ele.

---

## 2. Montagem da produção (passo a passo)

O roteiro técnico detalhado está no [`HANDOVER.md`](HANDOVER.md), seção 4. Resumo, com o que é específico de produção:

### 2.1 Supabase (projeto novo, plano Pro)
1. [ ] Criar o projeto (região **São Paulo**, `sa-east-1`) com uma senha de banco forte, guardada no próprio cofre.
2. [ ] `npx supabase link --project-ref <REF_PROD>` e `npx supabase db push`. Aplica as **19 migrations**, de `20261009…` a `20261104…`.
3. [ ] Edge Functions:
   ```powershell
   npx supabase functions deploy check-url
   npx supabase functions deploy admin
   npx supabase functions deploy storage-r2
   npx supabase functions deploy account
   npx supabase functions deploy rotate
   npx supabase functions deploy transfer --no-verify-jwt
   npx supabase functions deploy cleanup-files --no-verify-jwt
   ```
4. [ ] Secrets. Gere valores **novos**; não reutilize os do desenvolvimento.
   ```powershell
   npx supabase secrets set SAFE_BROWSING_API_KEY=<chave> CLEANUP_SECRET=<64 hex> APP_ORIGINS=https://<dominio-prod> ALLOWED_ORIGIN=https://<dominio-prod>
   ```
   `ALLOWED_ORIGIN` restringe o CORS das funções ao domínio do app. Hoje, no desenvolvimento, ele não está definido e fica `*`; as funções continuam exigindo login.
5. [ ] Authentication:
   - Site URL e Redirect URLs do domínio de produção;
   - "Confirm email" ligado;
   - senha mínima de 10 caracteres;
   - **SMTP próprio** (Resend ou Brevo, com domínio verificado);
   - TOTP habilitado;
   - Google e GitHub (`security/oauth.md`) com **novos** clientes OAuth, que apontam para o projeto de produção.
6. [ ] Cron de hora em hora chamando `cleanup-files` (header `x-cleanup-secret`).
7. [ ] **Backups:** confirmar backups diários (Pro). Opcional: PITR.
8. [ ] **Rede:** Database → Network Restrictions (só o seu IP acessa o Postgres direto) e **Enforce SSL**.
9. [ ] **Contas das plataformas:** MFA (de preferência chave física) em Supabase, Netlify, GitHub, Cloudflare, registrador do domínio e no e-mail administrativo; só você como membro das organizações.

### 2.2 App
1. [ ] Site Netlify novo (ex.: `securelinkvault`) ou domínio próprio. Defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto de **produção** e publique a partir da raiz (`netlify deploy --prod --dir web-saas/dist`).
2. [ ] Conferir os cabeçalhos: `curl -sI https://<dominio-prod>` precisa mostrar `Content-Security-Policy`, `Strict-Transport-Security` e `X-Robots-Tag`.
3. [ ] O site de desenvolvimento continua apontando para o projeto de desenvolvimento.

### 2.3 Configuração inicial (pelo painel do app)
1. [ ] **Administrador master:** `supabase/admin/create-master-admin.sql` (partes A e B), depois **MFA** no app.
2. [ ] Administração → **Beta e limites**:
   - modo de cadastro **somente convidados**;
   - **máximo de contas: 6** (5 usuários + o administrador);
   - **cota Premium: 200 MB** (ou mais, com R2);
   - **MFA obrigatório para todos: ligado**;
   - **Rotação automática pelo servidor: desligada** (já nasce assim em instalação nova). Só ligue depois de validar cada conector com contas de teste.
3. [ ] Administração → **Licenças**: total de licenças Premium = **5** (padrão da migration `20261102000000`).
4. [ ] Convidar os 5 usuários já como **Premium por 30 dias** (Beta e limites → e-mail → Premium; o prazo já vem 30) e enviar cada link por mensagem direta.

---

## 3. Licenças (Administração → Licenças)

| Recurso | Como funciona |
|---|---|
| **Total de licenças Premium** | Padrão **5** no beta, editável. Uma licença nova só é concedida se houver vaga; senão aparece "Todas as licenças Premium estão em uso" |
| **Atribuir licença** | Por usuário: Premium por **30 dias** (padrão do beta), 90 ou 180 dias, 1 ano, outro prazo ou sem prazo, com observação visível só para admins. Ou voltar ao Gratuito |
| **Renovar** | Mudar o prazo de quem já é Premium não ocupa outra vaga. No beta, renove a cada 30 dias (filtro "Premium vencendo") |
| **Vencimento** | Ao vencer, a conta volta ao Gratuito **automaticamente** e a vaga é liberada. Os dados e arquivos continuam; novos envios seguem a cota do Gratuito. Os vencimentos dos próximos 7 dias aparecem em destaque |
| **Convites Premium** | Ocupam a licença no cadastro. Se não houver vaga nesse momento, a conta entra como Gratuito (evento `plan.invite_seat_unavailable`) e o cadastro não falha |
| **Auditoria** | `admin.plan_changed` e `plan.granted_by_invite`, com plano, prazo e observação. A licença registra quem concedeu |
| **Privacidade** | O usuário vê só o próprio plano e a validade, não a observação nem quem concedeu |

---

## 4. Consistência e preservação dos dados

| Camada | Proteção | Rotina |
|---|---|---|
| Banco (itens cifrados, perfis, compartilhamentos, auditoria) | Backup diário do Pro (7 dias); PITR opcional | **Mensal:** testar a restauração num projeto temporário (seção 6) |
| Arquivos (Storage) | **Não entram** no backup do Supabase | **Semanal:** backup externo cifrado (`scripts/backup/backup.mjs`), que leva banco **e** arquivos para fora do Supabase |
| Auditoria | Imutável e encadeada por hashes | Conformidade → **Verificar log de auditoria**; a cabeça da cadeia fica em cada backup externo |
| Cofre de cada usuário | Zero-knowledge: só o usuário decifra | Orientar cada usuário a ativar a **chave de recuperação** e fazer a **exportação cifrada** mensal (Configurações → Backup) |
| Integridade | Cada item tem AAD (dono, item e versão); adulterações são detectadas | O Diagnóstico mostra itens que não puderam ser abertos; a Conformidade mostra falhas |
| Histórico | 10 versões de senha por item, só para o dono | Restaurar pela aba "Histórico de senhas" do item |

**Regra de ouro:** sem chave de recuperação, quem esquece a senha mestra perde o cofre. Ninguém, nem o administrador, consegue recuperar. Garanta isso no onboarding.

---

## 5. Segurança para credenciais reais

1. [ ] **MFA obrigatório para todos** (Beta e limites). Os papéis administrativos já exigem.
2. [ ] **PAM:** só o administrador master é `owner`; suporte e auditoria recebem acesso **temporário** (1 a 8 h) com justificativa.
3. [ ] **Rotação automática (beta):** antes de usar com credenciais de produção, valide cada conector com uma **conta de teste** (lista em [`pending-actions.md`](pending-actions.md)). Durante a troca, o servidor vê a credencial por alguns segundos, sem guardar nada; por isso cada item exige consentimento. As credenciais administrativas (app do Entra, service account do Google, access key da AWS) devem ter o **menor privilégio possível**, por exemplo só `User-PasswordProfile.ReadWrite.All` ou só `iam:UpdateLoginProfile` em usuários específicos.
4. [ ] **Segredos da plataforma:** service role, `CLEANUP_SECRET`, chave do Safe Browsing e chaves do R2 só nos secrets do Supabase. Nunca no app nem no repositório.
5. [ ] **Revisão mensal:** aba Conformidade (18 controles), Eventos (`vault.unlock_failed`, `rotation.failed`, `client.error`, `admin.`) e PAM (quem tem privilégio e até quando).
6. [ ] **Safe Browsing → Web Risk** quando o produto for cobrado (o Safe Browsing é para uso não comercial).
7. [ ] **Auditoria externa (pentest)** antes de abrir para além dos 5 usuários do beta.

---

## 6. Rotinas de operação

| Frequência | Tarefa |
|---|---|
| Diária (2 min) | Visão geral do admin: erros de cliente, falhas de desbloqueio, limpeza recente |
| Semanal | Licenças vencendo (renovar as de 30 dias); Eventos `rotation.failed`; **backup externo** (`node scripts/backup/backup.mjs`) e cópia para o segundo local |
| Mensal | **Teste de restauração** com `scripts/backup/restore.mjs --apply` num projeto temporário (passo a passo em `operations/data-storage-and-backup.md`, seção 4), verificação do log de auditoria, revisão de Conformidade e PAM, lembrete de exportação cifrada aos usuários |
| A cada mudança de código | `npm test` contra o **desenvolvimento**; publicar primeiro no site de desenvolvimento e depois no de produção; aplicar as migrations novas na produção pelo SQL Editor ou com `npx supabase db push` (no projeto linkado de produção) |

**Incidentes:** veja [`HANDOVER.md`](HANDOVER.md), seção 5. Resumo:
- **Conta comprometida:** encerrar sessões, suspender e trocar a senha da conta.
- **Segredo da plataforma vazado:** gerar um novo e atualizar os secrets.
- **Perda de dados:** restaurar o backup e comunicar os usuários.

---

## 7. Onboarding dos usuários (enviar junto com o link)

1. Abra o link, defina a senha da conta e ative a **verificação em duas etapas**.
2. Crie a **senha mestra**: uma frase longa que só você saiba. Ela nunca sai do seu dispositivo.
3. Em Configurações, ative a **chave de recuperação** e guarde-a fora do computador (papel ou outro cofre).
4. Importe suas senhas: CSV do navegador ou de outro gerenciador (Configurações → Backup → Importar).
5. Rode **Verificar segurança** na Visão geral e siga a fila em **Rotação**.
6. Uma vez por mês: **Exportar backup cifrado**.

---

## 8. Checklist de go-live

| # | Item | Situação |
|---|---|---|
| 1 | Projeto Supabase de produção no **Pro**, com as 19 migrations, Network Restrictions e SSL obrigatório | 🟡 Free com as 19 migrations (piloto); Pro e restrições de rede depois |
| 2 | Funções publicadas e secrets novos, inclusive `ALLOWED_ORIGIN` | ✅ (falta só o Safe Browsing, opcional) |
| 3 | Auth: URLs, Confirm email, senha mínima, SMTP, TOTP, OAuth de produção | ⬜ |
| 4 | Site de produção com cabeçalhos verificados | ✅ securelinkvault.netlify.app |
| 5 | Administrador master com MFA | ⬜ |
| 6 | Limites: 6 contas, 5 licenças Premium (30 dias), MFA obrigatório para todos | ⬜ |
| 7 | Cron da limpeza rodando (Conformidade) | ⬜ |
| 8 | **Backup externo** feito e **teste de restauração** bem-sucedido antes de dados reais | ⬜ |
| 9 | Frase do backup e códigos de recuperação das contas guardados em papel, em local seguro | ⬜ |
| 10 | Conectores de rotação usados em produção validados com contas de teste | ⬜ |
| 11 | Aviso de privacidade revisado | ⬜ |
| 12 | Onboarding enviado (seção 7) | ⬜ |
| 13 | PR #1 revisado e mesclado em `master` | ✅ `d5bf916` |
| 14 | MFA em todas as contas de plataforma; e-mail administrativo dedicado | ⬜ |
| 15 | Rotação automática desligada; recertificação de acesso revisada (`security/access-recertification.md`) | ⬜ |
| 16 | Extensão: Redirect URL `https://<id>.chromiumapp.org/` no projeto de produção (ID sem loja `mcljapeloopnadipmhmojkmbjjgbpdij`; com loja, o ID atribuído) | ⬜ |
