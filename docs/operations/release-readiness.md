# Prontidão: beta, abertura de assinaturas e lojas

> Checklist de 2026-11-04. Cada portão só abre com todos os itens marcados.
>
> Legenda: ✅ feito, com evidência · 🟡 parcial · ❌ falta.
>
> Detalhes técnicos: [`../HANDOVER.md`](../HANDOVER.md) · Lacunas: [`../product/feature-review.md`](../product/feature-review.md) · Etapas: [`../product/roadmap-v1.md`](../product/roadmap-v1.md).

## Portão 1: beta fechado em produção (Supabase Free, até 25 usuários)

| Item | Estado |
|---|---|
| Projeto de produção separado, segredos fora do repositório | ✅ |
| 19 migrations e 7 funções publicadas; cabeçalhos HTTPS, HSTS e CSP conferidos | ✅ |
| `prod-setup.sql` (admin master, limites, cron de limpeza) rodado pelo dono | ❌ |
| URLs de autenticação, senha mínima de 10, confirmação de e-mail, TOTP | ❌ (dono, no painel) |
| Admin master com MFA | ❌ |
| **Primeiro backup externo cifrado** antes do primeiro convidado; 2 por semana depois | ❌ |
| Cotas ajustadas à capacidade do Free (30 MB Free, 60 MB Premium do beta; limite de 25 contas) | ❌ (ver [`finops.md`](finops.md), seção 3) |
| Forma de coletar o retorno dos convidados (formulário ou conversa ao fim do prazo) | ❌ |

## Portão 2: abertura das assinaturas

**Infraestrutura e operação**
- [ ] **Supabase Pro** na produção. É decisão do dono, e o momento é este portão.
- [ ] Teste de **restauração completa** do backup num projeto temporário, com registro.
- [ ] RPO e RTO definidos e testados. Proposta: **RPO 24 h** (backup diário do Pro) e **RTO 4 h**.
- [ ] Domínio próprio e SMTP próprio (Resend) com SPF, DKIM e DMARC.
- [ ] Monitoramento externo: disponibilidade, erros e alerta para o dono.
- [ ] Ancoragem da cadeia de auditoria fora do banco.
- [ ] Plano de resposta a incidentes (quem age, como comunica a ANPD e os usuários) com um simulado.

**Produto**
- [ ] Entitlements no servidor (Free = 7 itens e os demais limites do [`plan-strategy.md`](../product/plan-strategy.md)), com testes de integração.
- [ ] Rebaixamento testado: nada fica ilegível e a exportação continua.
- [ ] Cobrança: assinar, renovar, falha no pagamento, cancelar e rebaixar sem intervenção manual. Testado no modo de testes do gateway.
- [ ] Web Risk no lugar do Safe Browsing.
- [ ] Limite de uso no banco para URLs e rotações.
- [ ] Escopo da 1.0 revisado (Etapa 1 do roadmap), com o visual ajustado.

**Legal**
- [ ] Termos de Uso e Política de Privacidade publicados, com aceite registrado.
- [ ] Encarregado de dados (DPO) e canal de contato.
- [ ] Registro de operações de tratamento e RIPD.
- [ ] Direito de arrependimento de 7 dias e cancelamento simples.
- [ ] CNPJ e emissão de nota fiscal.
- [ ] Nenhuma afirmação de conformidade (ISO 27001, SOC 2) sem auditoria.

## Portão 3: garantia de segurança e de funcionamento (antes das lojas)

| Item | Estado |
|---|---|
| RLS em todas as tabelas, testes negativos entre usuários | ✅ (`rls`, `files`, `items`, `iam`) |
| Criptografia no cliente com testes reais (sem mocks) | ✅ |
| MFA obrigatório para todo papel administrativo | ✅ |
| Logs sem segredos (rotação não registra valores; relatórios de erro sem dados) | ✅ |
| Proteções da extensão (domínio, iframe, gesto) com teste ponta a ponta | ✅ |
| Proteções do Android (captura, backup, depuração) conferidas em build de usuário | ✅ |
| CI em todo PR: testes, `npm audit`, análise de código (Semgrep), segredos (Gitleaks) | ❌ |
| Varredura dinâmica gratuita (OWASP ZAP) contra o desenvolvimento | ❌ |
| **Pentest externo** sem achado crítico ou alto em aberto | ❌ |
| Revisão independente da criptografia | ❌ |
| Política de divulgação de vulnerabilidades (`security.txt`) | ❌ |
| Matriz de aparelhos e navegadores testada | ❌ |
| 2 semanas com clientes pagantes iniciais sem incidente grave | ❌ |
| App Links verificados, biometria e passkey (se no escopo da 1.0) | ❌ |
