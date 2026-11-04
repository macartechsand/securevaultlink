# Status do projeto SecureLink Vault

Retrato de **2026-11-04** · Versão **0.9.0-beta** · Desenvolvimento em `dev` · Produção a partir de `master`

Esta página serve para **retomar o trabalho**: onde o projeto está, o que está no ar, o que falta e qual é o próximo passo. O detalhe técnico está em [`HANDOVER.md`](HANDOVER.md), e o plano até a versão paga em [`product/roadmap-v1.md`](product/roadmap-v1.md).

**Planejamento da versão paga (Fase A, 2026-11-04):**
- [`product/plan-strategy.md`](product/plan-strategy.md): planos e matriz Free/Pro/Enterprise;
- [`product/feature-review.md`](product/feature-review.md): inventário com evidências e lacunas P0–P4;
- [`operations/finops.md`](operations/finops.md): custos, receita e ponto de equilíbrio;
- [`operations/scaling-triggers.md`](operations/scaling-triggers.md): quando escalar;
- [`operations/release-readiness.md`](operations/release-readiness.md): portões do beta, das assinaturas e das lojas.

> O status antigo (protótipo de 2024, app Expo) foi substituído; ele continua no histórico do git.

---

## 1. Em uma frase
Cofre de senhas e arquivos **zero-knowledge** com governança de nível corporativo, ou seja, rotação, recertificação de acesso e auditoria à prova de adulteração. Ele funciona na **web**, como **extensão** do Chrome e do Edge e como **app Android**, e está num **piloto de 15 dias** em produção, sem cobrança.

## 2. O que existe hoje

| Componente | Situação | Onde |
|---|---|---|
| App web (React + Supabase) | ✅ Completo para o beta: cofre, Secured Items, arquivos, compartilhamento, transferências, MFA, saúde e postura, rotação, administração (IAM, PAM, licenças, conformidade, auditoria), LGPD | `web-saas/` · [`HANDOVER.md`](HANDOVER.md), seção 2 |
| Interface | ✅ Nova (2026-11-01): menu agrupado, ações rápidas, medidor de postura, navegação inferior no celular, temas claro e escuro, PWA | `web-saas/src/styles/theme.css` |
| Extensão Chrome/Edge | ✅ Fase 1: entrar (inclusive Google e GitHub), desbloquear, preencher só no site certo, copiar, gerador, bloqueio após 10 min | `web-saas/extension/` · [`product/browser-extension.md`](product/browser-extension.md) |
| App Android | ✅ Fase 1: mesmo app empacotado e assinado, bloqueio em segundo plano, bloqueio de captura, sem backup e sem depuração | `web-saas/android/` · [`product/mobile-app.md`](product/mobile-app.md) |
| iPhone | 🟡 Pelo app web instalado na tela de início do Safari. App nativo só na versão 1.0 | [`product/mobile-app.md`](product/mobile-app.md) |
| Cobrança / assinaturas | ❌ Não existe; o Premium é atribuído manualmente pelo admin | [`product/roadmap-v1.md`](product/roadmap-v1.md), Etapa 2 |
| Testes | ✅ 149/149 (unitários e integração contra o desenvolvimento) e 6/6 ponta a ponta da extensão no Edge | [`HANDOVER.md`](HANDOVER.md), seção 6 |

## 3. Ambientes

| | Desenvolvimento | Produção (piloto) |
|---|---|---|
| App | https://securelinkvaultdev.netlify.app | https://securelinkvault.netlify.app |
| Supabase | `sueemdqyhwnmbqokpefz` (Free) | `securelink-prod`, ref `exglsdylytdjwrlmyptk`, São Paulo (Free, piloto de 15 dias) |
| Código publicado | `dev` | `master` (`d5bf916`) |
| Extensão | `web-saas/dist-extension` | `~/.securelink-prod/securelink-extension-prod.zip` |
| App Android | Build de debug local | `~/.securelink-prod/securelink-vault-0.9.0.apk` (SHA-256 `75725e16…4c202829`) |

Os segredos de produção ficam em `~/.securelink-prod/`, fora do repositório: senha do banco, `CLEANUP_SECRET`, SQL inicial, chave de assinatura do Android e pacotes.

**Diferença entre `dev` e produção:** o `dev` tem 2 commits a mais que o `master`. São a documentação do piloto e o app Android, que inclui uma correção da tela de Arquivos: falha na chave de compartilhamento não esconde mais os arquivos próprios. Para levar a correção à produção, abra um PR de `dev` para `master` e publique o build de produção.

## 4. Pendências do dono (antes e durante o piloto)

Lista completa e marcável: [`pending-actions.md`](pending-actions.md). Resumo:
1. **Produção** ([`PRODUCTION.md`](PRODUCTION.md), seção 0):
   - rodar `prod-setup.sql`;
   - URLs de autenticação;
   - e-mail e MFA;
   - administrador master;
   - **primeiro backup** (com o Docker Desktop aberto);
   - convites Premium de 15 dias.
2. **Redirect URLs** do Supabase (desenvolvimento e produção):
   - `app.securelink.vault://auth-callback` (app);
   - `https://mcljapeloopnadipmhmojkmbjjgbpdij.chromiumapp.org/` (extensão).
3. **Celular:** instalar o APK num aparelho real e conferir o layout do Android 15/16.
4. **Chave de assinatura do Android:** cópia cifrada no envelope de emergência.
5. **Desenvolvimento:** aplicar as migrations pendentes listadas em `pending-actions.md`.

## 5. Próximos passos (ordem combinada)

1. **Concluir o piloto** e colher o retorno dos convidados. A produção fica no Supabase **Free** durante o beta, com até 25 usuários; o Pro entra ao abrir as assinaturas.
2. **Revisar funcionalidades, features e visual** ([`product/roadmap-v1.md`](product/roadmap-v1.md), Etapa 1). O resultado é o escopo da versão 1.0.
3. **Assinaturas** (Etapa 2):
   - planos, preços e gateway (cartão e Pix);
   - webhook ligado às licenças;
   - Termos de Uso, Política de Privacidade e CNPJ/NFS-e.
4. **Garantia de segurança** (Etapa 3): pentest externo, revisão da criptografia, Supabase Pro com restauração testada, plano de incidentes.
5. **Garantia de funcionalidade** (Etapa 4): testes em todo PR, matriz de aparelhos, monitoramento, suporte.
6. **Lojas** (Etapa 5): só depois de 2 a 5 concluídos. Decisão do dono de 2026-11-03.

## 6. Limitações conhecidas (resumo)
- **Senha mestra:** sem a chave de recuperação opcional, quem a esquece perde o cofre.
- **Arquivos:** até 25 MB, e a mensagem de erro acima disso cita o plano gratuito por engano.
- **Conectores de rotação automática:** em beta, testados só com credenciais falsas.
- **Supabase Free:** sem backup automático e pausa após 7 dias sem uso.
- **Extensão:** não oferece salvar a senha ao fazer login.

Lista completa: [`HANDOVER.md`](HANDOVER.md), seção 8.

## 7. Como retomar o trabalho
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
   - dependências npm com pelo menos 2 semanas de publicação.
