# Status do projeto SecureLink Vault

Retrato de **2026-11-05** · Produção: app **0.9.1**, extensão **0.1** · Desenvolvimento: extensão **0.2.0** e prazos de troca · Desenvolvimento em `dev` · Produção a partir de `master`

Esta página serve para **retomar o trabalho**: onde o projeto está, o que está no ar, o que falta e qual é o próximo passo. O detalhe técnico está em [`HANDOVER.md`](HANDOVER.md), e o plano até a versão paga em [`product/roadmap-v1.md`](product/roadmap-v1.md).

**Fase atual:** **validação do desenvolvimento** ([`operations/dev-validation.md`](operations/dev-validation.md)), teste com um grupo pequeno de usuários e **pentest feito pelo dono** ([`SECURITY_TESTING.md`](SECURITY_TESTING.md)). Depois: versão 1 beta nas lojas e abertura para assinantes (seção 5 do roteiro de validação).

**Garantia de segurança para assinantes (NIST, CSA, arquitetura multiplataforma):** [`security/security-assurance.md`](security/security-assurance.md).

**Revisão da arquitetura de segurança comparada a Idira (CyberArk), Bitwarden e Google, com potencial de inovação:** [`architecture/security-architecture-review.md`](architecture/security-architecture-review.md).

**Portal de documentação** (diagramas, seções e busca): `cd docs; npm ci; npm run dev` e abrir http://localhost:5173. Guia da equipe: [`guide/engineering.md`](guide/engineering.md).

**Outros documentos de planejamento:**
- [`product/plan-strategy.md`](product/plan-strategy.md): planos e matriz Free/Pro/Enterprise;
- [`product/feature-review.md`](product/feature-review.md): inventário com evidências e lacunas P0–P4;
- [`operations/release-readiness.md`](operations/release-readiness.md): portões do beta, das assinaturas e das lojas;
- [`operations/finops.md`](operations/finops.md) e [`operations/scaling-triggers.md`](operations/scaling-triggers.md): custos e quando escalar.

---

## 1. Em uma frase
Cofre de senhas e arquivos **zero-knowledge** com governança de nível corporativo, ou seja, rotação, recertificação de acesso e auditoria à prova de adulteração. Ele funciona na **web**, como **extensão** do Chrome e do Edge e como **app Android**, em **beta fechado** na produção, sem cobrança.

## 2. O que foi feito

| Componente | Situação | Onde |
|---|---|---|
| App web (React + Supabase) | ✅ Cofre, Secured Items, arquivos, compartilhamento, transferências, MFA, saúde e postura, rotação, administração (IAM, PAM, licenças, conformidade, auditoria), LGPD | `web-saas/` · [`HANDOVER.md`](HANDOVER.md), seção 2 |
| Interface | ✅ Menu agrupado, ações rápidas, medidor de postura, navegação inferior no celular, temas claro e escuro, PWA | `web-saas/src/styles/theme.css` |
| Endurecimento do beta (2026-11-04) | ✅ Limite de itens e de verificações de sites **no banco**, Web Risk, âncoras externas da auditoria, atraso após senha mestra errada, CI com CodeQL, Gitleaks e Dependabot | migration `20261105000000`, `.github/` |
| Administração: excluir conta (2026-11-05) | ✅ no desenvolvimento. Exige digitar o e-mail; recusa a própria conta e contas administrativas; apaga arquivos e registra na auditoria | `supabase/functions/admin/` |
| **Prazos de troca e avisos** (2026-11-05) | ✅ no desenvolvimento. Senha vazada ou site perigoso: 7 dias; fraca, reutilizada ou com mais de 1 ano: 30 dias; troca programada: a data do item. Verificação de vazamentos automática 1 vez por dia; coluna "Prazo" na fila de rotação; notificação do navegador opcional, só com quantidades | `web-saas/src/lib/rotationDeadlines.ts` |
| Extensão Chrome/Edge 0.1 (fase 1) | ✅ na produção. Entrar (inclusive Google e GitHub), desbloquear, preencher só no site certo, copiar, gerador, bloqueio após 10 min | `web-saas/extension/` |
| **Extensão 0.2.0 (fase 2)** (2026-11-05) | ✅ no desenvolvimento. Menu de sugestões no campo, barra "Salvar/Atualizar login", gerador no cadastro, "Nunca neste site", preenchimento ao abrir a página (opcional, desligado) | [`product/browser-extension.md`](product/browser-extension.md), seção 13 |
| **Central de contingência** (2026-11-06) | ✅ no desenvolvimento. Lista de preparo, teste da chave de recuperação sem alterar nada, guia "o que fazer se…" e leitor offline do backup (abre sem internet e sem o SecureLink) | [`product/contingency-plan.md`](product/contingency-plan.md) |
| **Premium e conveniência** (2026-11-06) | ✅ no desenvolvimento, falta aplicar a migration `20261106000000` no desenvolvimento. Lixeira de 14 dias, onde e quando a senha foi usada (cifrado), OTP de sistemas externos (app e extensão), modo emergência, rotação só no Premium (inclusive no servidor) e PIN para desbloquear (todos os planos) | [`operations/dev-validation.md`](operations/dev-validation.md) |
| App Android 0.9.1 | ✅ APK assinado: bloqueio em segundo plano, bloqueio de captura, sem backup e sem depuração | `web-saas/android/` · [`product/mobile-app.md`](product/mobile-app.md) |
| iPhone | 🟡 Pelo app web instalado na tela de início do Safari | [`product/mobile-app.md`](product/mobile-app.md) |
| Operação da produção | ✅ `prod-setup.sql` aplicado, cron de limpeza ativo, primeiro backup externo com teste parcial de restauração, login Google/GitHub com clientes OAuth próprios da produção, publicação só por script verificado | [`PRODUCTION.md`](PRODUCTION.md) |
| Cobrança / assinaturas | ❌ Não existe; o Premium é atribuído manualmente pelo admin | [`product/roadmap-v1.md`](product/roadmap-v1.md), Etapa 2 |

**Testes (2026-11-05):**
- 124 testes unitários e 30 da extensão passam; lint sem erros; builds do app e da extensão OK;
- os 53 testes de integração ficam **pulados** até o `.env.test.local` ser recriado (última execução completa: 154/154 em 2026-11-04);
- extensão 0.2.0: teste de fumaça no Edge real sem conta OK; os 3 testes de ponta a ponta da fase 2 (preencher pelo menu, salvar, atualizar) estão escritos e **ainda não rodaram**.

## 3. Ambientes

| | Desenvolvimento | Produção (beta) |
|---|---|---|
| App | https://securelinkvaultdev.netlify.app | https://securelinkvault.netlify.app |
| Supabase | `sueemdqyhwnmbqokpefz` (Free) | `securelink-prod`, ref `exglsdylytdjwrlmyptk`, São Paulo (Free) |
| Código publicado | `dev` (`a9501ab`) | `master` (`e9ec261`); site publicado em 2026-11-05 por `scripts/deploy-prod-site.mjs` |
| Funções | `admin` e `account` com a exclusão de conta | versão de 2026-11-04 (sem a exclusão de conta) |
| Extensão | `web-saas/dist-extension` (0.2.0, gerar com `npm run build:ext`) | `~/.securelink-prod/securelink-extension-prod.zip` (0.1) |
| App Android | Build de debug local | `~/.securelink-prod/securelink-vault-0.9.1.apk` |

Os segredos de produção ficam em `~/.securelink-prod/`, fora do repositório.

**Como publicar na produção (só o dono executa):**
```powershell
npx supabase functions deploy admin account --project-ref exglsdylytdjwrlmyptk
node scripts/deploy-prod-site.mjs
node scripts/build-prod-extension.mjs
```
Nunca use `netlify deploy` direto no site de produção: ele refaz o build com o `.env.local` do desenvolvimento (incidente de 2026-11-05).

## 4. O que falta para liberar aos usuários

### 4.1 Para o teste com alguns usuários agora (versão da produção)
1. **Administrador master** ([`PRODUCTION.md`](PRODUCTION.md), seção 0, passo 4): Add user, parte B de `supabase/admin/create-master-admin.sql`, criar o cofre e ativar o MFA.
2. **Conferir no painel da produção** (passos 2 e 3): Site URL e Redirect URLs (site, extensão e app), senha mínima 10, confirmação de e-mail, TOTP habilitado.
3. **Senha dos backups** (`~/.securelink-prod/backup-passphrase.txt`): guardar no seu cofre e em papel; copiar o backup para um segundo lugar.
4. **Monitores e heartbeat** (passo 8): site, `/auth/v1/health` e `HEARTBEAT_URL`. Os monitores também evitam a pausa de 7 dias do Free.
5. **Convites** (passo 6): link do convite, zip da extensão e APK por mensagem direta, com o onboarding (seção 7 do `PRODUCTION.md`).
6. **Coletar o retorno:** um formulário curto ou conversa ao fim do prazo (o que confundiu, o que faltou, erros).
7. **Backup 2 vezes por semana** durante o teste (`scripts/backup/backup.mjs`, Docker Desktop aberto).

### 4.2 Para levar as novidades do desenvolvimento à produção
1. **Recriar `web-saas/.env.test.local`** com as contas descartáveis do desenvolvimento; então rodar a suíte de integração e `npm run build:ext:test && npm run test:ext:e2e` (inclui os 3 testes da fase 2).
2. **Testar você mesmo no desenvolvimento:**
   - excluir uma conta de teste pelo painel;
   - extensão 0.2.0: menu no campo, salvar, atualizar, gerar senha no cadastro;
   - prazos na fila de rotação e o aviso do navegador.
3. **PR `dev` → `master`** com a CI verde (o PR #11 aberto pode ser mesclado antes).
4. **Publicar** com os 3 comandos da seção 3 e, no navegador, trocar a extensão de desenvolvimento pela de produção (`web-saas/dist-extension-prod`). Avisar os usuários: a extensão 0.2.0 pede permissão para ler todos os sites.

### 4.3 Pentest (antes de ampliar o beta)
Roteiro, regras e tabela de achados: [`SECURITY_TESTING.md`](SECURITY_TESTING.md). Achado **crítico** ou **alto** em aberto bloqueia novos convidados.

### 4.4 Para a disponibilização geral (versão 1.0 paga)
Resumo dos portões 2 e 3 de [`operations/release-readiness.md`](operations/release-readiness.md):
- **Infraestrutura:** Supabase Pro, restauração completa testada, domínio e SMTP próprios, plano de incidentes;
- **Produto:** cobrança (cartão e Pix) ligada às licenças, rebaixamento testado, escopo da 1.0 revisado;
- **Legal:** Termos de Uso, Política de Privacidade, encarregado de dados, CNPJ e nota fiscal;
- **Segurança:** pentest **externo** sem achado crítico ou alto, revisão independente da criptografia, *Private vulnerability reporting* ativado no GitHub;
- **Funcionalidade:** matriz de aparelhos e navegadores, 2 semanas com clientes iniciais sem incidente grave;
- **Lojas** só depois de tudo isso (decisão de 2026-11-03).

## 5. Limitações conhecidas (resumo)
- **Senha mestra:** sem a chave de recuperação opcional, quem a esquece perde o cofre.
- **Arquivos:** até 25 MB, e a mensagem de erro acima disso cita o plano gratuito por engano.
- **Conectores de rotação automática:** em beta, testados só com credenciais falsas.
- **Supabase Free:** sem backup automático e pausa após 7 dias sem uso.
- **Avisos de prazo:** só com o app aberto (sem e-mail ou push, que exigiriam o servidor saber quais senhas estão em risco); no Android, só dentro do app.
- **Extensão:** só logins; sem ícone na barra com contagem, sem várias URLs por item e sem regras por item.

Lista completa: [`HANDOVER.md`](HANDOVER.md), seção 8.

## 6. Como retomar o trabalho
1. Ler esta página, depois [`product/roadmap-v1.md`](product/roadmap-v1.md) e [`pending-actions.md`](pending-actions.md).
2. Preparar o ambiente:
   ```powershell
   git checkout dev; git pull
   cd web-saas; npm ci; npm test
   ```
   O `.env.local` aponta para o **desenvolvimento**. O `.env.test.local` tem as contas descartáveis de teste.
3. Para o app Android, o `JAVA_HOME` precisa apontar para o Java do Android Studio (`C:\Program Files\Android\Android Studio\jbr`). Passos em [`product/mobile-app.md`](product/mobile-app.md), seção 8.
4. Regras que valem sempre:
   - nunca rodar testes contra a produção;
   - nunca usar credenciais reais em testes;
   - mudanças no banco só por migration nova, aplicada pelo dono no SQL Editor;
   - toda tabela nova com RLS e `revoke all` para `authenticated`;
   - dependências npm com pelo menos 2 semanas de publicação;
   - produção publicada só pelos scripts `deploy-prod-site.mjs` e `build-prod-extension.mjs`.
