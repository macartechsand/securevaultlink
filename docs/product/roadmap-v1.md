# Caminho para a versão 1.0 paga

> Plano de 2026-11-04. Hoje o produto está em **0.9.0-beta**: piloto de 15 dias em produção, sem cobrança. Situação atual: [`../STATUS.md`](../STATUS.md).

**Decisão do dono (2026-11-03):** o produto só vai para as lojas (Play Store, App Store e lojas de extensões) quando a **primeira versão produtiva completa** estiver pronta. Isso significa funcionalidades e adequação revisadas, assinaturas funcionando e segurança e funcionamento garantidos com evidência.

## Visão geral

| Etapa | O que é | Sai quando |
|---|---|---|
| **0. Piloto** (em curso) | 15 dias em produção no plano Free com os convidados | Piloto encerrado e retorno dos usuários registrado |
| **1. Revisão** | Funcionalidades, features e visual, tela por tela | Escopo da 1.0 fechado e ajustes de interface feitos |
| **2. Assinaturas** | Cobrança recorrente ligada às licenças, mais a base legal e fiscal | Um cliente de teste assina, renova, cancela e é rebaixado sem intervenção manual |
| **3. Garantia de segurança** | Revisão externa, operação segura, backup testado | Pentest sem achado crítico ou alto em aberto, e restauração testada |
| **4. Garantia de funcionalidade** | Testes automáticos em todo PR, testes em aparelhos reais, monitoramento | Checklist de qualidade verde por 2 semanas com clientes pagantes iniciais |
| **5. Lojas** | Play Store, App Store, Chrome Web Store e Edge Add-ons | Apps publicados |

As etapas 2, 3 e 4 podem andar em paralelo depois da revisão. A etapa 5 só começa com as três concluídas.

---

## Etapa 0. Piloto (em curso)

- Concluir os passos do piloto: [`../PRODUCTION.md`](../PRODUCTION.md), seção 0.
- **Coletar o retorno** de cada convidado ao fim dos 15 dias. Perguntas sugeridas:
  - O que você usou de verdade?
  - O que ficou confuso?
  - O que faltou para trocar o seu gerenciador atual?
  - Você pagaria? Quanto?
- Juntar os dados de uso, que são só metadados: itens criados, arquivos, compartilhamentos, rotações, extensão e app. Use a aba Administração → Visão geral e Eventos.
- Decidir: migrar a produção para o **Supabase Pro** (backups diários e sem pausa) antes da Etapa 2.

## Etapa 1. Revisão de funcionalidades, features e visual

### 1.1 Funcionalidades
Para cada área, decidir: **manter**, **ajustar**, **esconder na 1.0** ou **remover**. O inventário completo está em [`../HANDOVER.md`](../HANDOVER.md), seção 2.

Critérios para cada decisão:
- **Uso no piloto:** foi usado e teve retorno?
- **Diferencial:** é parte do diferencial do produto? O diferencial é cofre zero-knowledge auditável com governança de nível corporativo (rotação, recertificação, auditoria).
- **Risco:** pode causar perda de dados ou exposição se falhar?
- **Custo de suporte:** vai gerar muitas dúvidas?

Itens já conhecidos para a revisão:

| Área | Ponto | Proposta |
|---|---|---|
| Arquivos | Erro de arquivo acima de 25 MB diz "No plano gratuito" mesmo no Premium | Corrigir a mensagem e mostrar formatos e limite na tela |
| Arquivos | Limite de 25 MB, porque a cifragem é feita em memória | Decidir se a 1.0 precisa de arquivos maiores (cifragem em streaming) |
| Rotação | Conectores automáticos em **beta**, testados só com credenciais falsas | Validar cada um com uma conta real de baixo risco, ou esconder na 1.0 os que não forem validados |
| Extensão | Só preenche; não oferece salvar a senha ao fazer login | Decidir se a fase 2 (salvar, ícone no campo, vários endereços) entra na 1.0 |
| App Android | Layout do Android 15/16 não conferido em aparelho real | Conferir no piloto |
| iPhone | Só pelo app web na tela de início; baixar arquivos é menos prático | Decidir se o app nativo de iPhone entra na 1.0 |
| Celular | Sem desbloqueio por digital ou rosto | Biometria (fase 2 do app) é esperada pelo mercado; recomendo incluir |
| Administração | Painel completo (IAM, PAM, conformidade) para um produto individual | Decidir o que fica para o plano Business |

### 1.2 Visual e experiência
Revisar cada tela no computador, no celular (app e navegador) e na extensão:
- [ ] **Primeiro uso:** cadastro, criação da senha mestra, chave de recuperação, MFA. Fica claro o que é cada senha e o risco de perder a senha mestra?
- [ ] **Telas vazias:** cada lista sem itens explica o que fazer.
- [ ] **Mensagens de erro:** dizem o que aconteceu e o que fazer, sem termos técnicos.
- [ ] **Consistência:** botões, ícones, cores de risco e textos iguais em web, app e extensão.
- [ ] **Celular:** nada cortado ou escondido atrás das barras do sistema; alvos de toque de pelo menos 44 px.
- [ ] **Acessibilidade:** contraste nível AA nos dois temas, uso completo pelo teclado, rótulos para leitores de tela.
- [ ] **Textos:** português revisado, tom uniforme, sem anglicismos desnecessários.
- [ ] **Marca:** nome final do produto, logotipo e domínio próprio. Hoje o app usa o subdomínio do Netlify.

**Entregável:** lista "Escopo 1.0" aprovada, com os ajustes feitos e testados.

## Etapa 2. Assinaturas

### 2.1 Decisões do dono
| Decisão | Opções / sugestão |
|---|---|
| Planos e preços | Sugestão de [`open-source-and-business.md`](open-source-and-business.md): Premium R$ 9–12/mês, Família R$ 19–25/mês, Business R$ 20–30/usuário/mês. Validar com o retorno do piloto |
| O que o Gratuito inclui | Hoje: cofre completo, compartilhamento até 48 h, cotas menores |
| Período de teste | Ex.: 14 dias de Premium sem cartão |
| Meio de pagamento | Cartão e **Pix recorrente**. Gateways: Stripe (cartão, Pix limitado), Mercado Pago, Asaas ou Pagar.me (Pix e boleto recorrentes) |
| Pessoa jurídica | CNPJ, regime tributário e emissão de **NFS-e**, que alguns gateways automatizam |
| Assinatura nas lojas | Assinar pela web evita a taxa de 15–30% das lojas. As regras da Apple e do Google sobre apps que não vendem dentro do app precisam ser conferidas antes da Etapa 5 |

### 2.2 Implementação
- Tabela `subscriptions` (cliente, plano, status, período, gateway), com RLS e leitura só pelo próprio usuário.
- **Edge Function de webhook:**
  - confere a assinatura do gateway e é idempotente;
  - atualiza `user_plans`: as licenças manuais passam a ser alimentadas pela cobrança, e a atribuição manual continua para cortesias.
- Página "Plano e cobrança": assinar, trocar de plano, cancelar, ver faturas.
- **Inadimplência:** carência (ex.: 7 dias) e depois rebaixamento para o Gratuito. O rebaixamento já preserva os arquivos e links existentes. Nunca bloquear o acesso ao próprio cofre nem a exportação.
- Avisos por e-mail (renovação, falha no pagamento, cancelamento). Isso exige **SMTP próprio**.
- Trocar o Google Safe Browsing pelo **Web Risk**, porque o Safe Browsing é só para uso não comercial.

### 2.3 Legal (LGPD e consumidor)
- **Termos de Uso** e **Política de Privacidade** publicados, com aceite registrado no cadastro.
- **Encarregado de dados** (DPO) nomeado e canal de contato.
- Registro das operações de tratamento e relatório de impacto (RIPD), porque o produto guarda dados sensíveis de terceiros.
- **Direito de arrependimento** de 7 dias em compra online (Código de Defesa do Consumidor), e cancelamento tão fácil quanto a contratação.
- Exclusão de conta dentro do app, que já existe. As lojas também exigem esse recurso.

**Sai quando:** um cliente de teste no ambiente de desenvolvimento, usando o modo de testes do gateway, consegue assinar, renovar, ter um pagamento falho, cancelar e ser rebaixado, tudo sem intervenção manual. Os termos precisam estar publicados.

## Etapa 3. Garantia de segurança

| # | Requisito | Evidência |
|---|---|---|
| 1 | **Pentest externo** de web, API, extensão e app | Relatório sem achado crítico ou alto em aberto |
| 2 | **Revisão independente da criptografia** (chaves, KDF, compartilhamento, transferências) | Parecer escrito |
| 3 | Modelo de ameaças e riscos residuais atualizados | [`../security/access-recertification.md`](../security/access-recertification.md) revisado |
| 4 | **Backups**: Supabase Pro + backup externo cifrado + restauração completa testada | Registro do teste de restauração |
| 5 | Plano de **resposta a incidentes** (quem faz o quê, comunicação à ANPD e aos usuários) | Documento e um simulado |
| 6 | Varredura automática de dependências, segredos e código em todo PR | GitHub Actions verde |
| 7 | Política de divulgação de vulnerabilidades (`security.txt`, e-mail de segurança) | Publicada |
| 8 | Login social do app por **App Links verificados** (`https`) | Teste no aparelho |
| 9 | Biometria com chave do Android Keystore e do iOS Keychain (se entrar na 1.0) | Teste no aparelho |
| 10 | Conectores de rotação: só os validados com conta real ficam visíveis | Registro de cada validação |
| 11 | Alertas de segurança: picos de `vault.unlock_failed`, ações `admin.`, cadeia de auditoria | Alerta testado |
| 12 | Rotação dos segredos da operação (service role, `CLEANUP_SECRET`, OAuth) e acesso ao painel com MFA | Checklist assinado |

Se o código for aberto (AGPL, ver [`open-source-and-business.md`](open-source-and-business.md)), abrir o repositório **depois** do pentest e com o histórico revisado, sem segredos.

## Etapa 4. Garantia de funcionalidade

- **Testes automáticos em todo PR** (GitHub Actions):
  - unitários;
  - integração contra um projeto de testes;
  - build da extensão e do app;
  - o PR só entra com tudo verde.
- **Testes ponta a ponta dos fluxos críticos no navegador:** cadastro, desbloqueio, criar e editar item, compartilhar, arquivo, assinatura e exclusão de conta.
- **Matriz de aparelhos:** Android 8, 13 e 15/16; iPhone (Safari e app); Chrome, Edge, Firefox e Safari no computador.
- **Monitoramento:**
  - página de status;
  - alerta de erro (`client.error`) e de função fora do ar;
  - tempo de resposta.
- **Suporte:** canal de atendimento, base de respostas (FAQ) e prazo de resposta definido.
- **Lançamento controlado:** um grupo pequeno de clientes pagantes por 2 semanas antes da abertura geral.

## Etapa 5. Lojas

| Loja | Requisitos |
|---|---|
| Google Play | Conta (US$ 25, taxa única); formulário de segurança dos dados; política de privacidade por URL; exclusão de conta; teste fechado com 12 pessoas por 14 dias, exigido para contas pessoais novas |
| App Store | Mac ou build na nuvem; conta Apple Developer (US$ 99/ano); TestFlight; rótulos de privacidade; revisão da Apple |
| Chrome Web Store e Edge Add-ons | Conta de desenvolvedor; justificativa de cada permissão; a build de loja já existe (`--mode store`, sem a chave fixa do manifest) |

---

## Decisões em aberto do dono
1. Migrar para o Supabase Pro ao fim do piloto?
2. Escopo 1.0 (Etapa 1): sobretudo arquivos grandes, extensão fase 2, iPhone nativo e biometria.
3. Planos, preços, teste grátis e gateway de pagamento.
4. Nome final, domínio próprio e CNPJ.
5. Quem faz o pentest e a revisão de criptografia, e o orçamento.
6. Abrir o código (AGPL) antes ou depois da 1.0.
