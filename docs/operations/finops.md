# FinOps: custos, receita e ponto de equilíbrio

> Modelo de 2026-11-04. **Preços consultados em 2026-11-04** em páginas oficiais e guias de terceiros, sem acesso às páginas ao vivo de alguns fornecedores. Os itens marcados como *estimativa* precisam ser conferidos antes de contratar.
>
> Câmbio usado: **US$ 1 = R$ 5,50** (*estimativa*).
>
> **Decisão do dono (2026-11-04):** produção no **Supabase Free** até o fim do beta, com usuários limitados. O Pro entra quando as assinaturas abrirem.

## 1. Preços dos fornecedores

| Fornecedor | Uso | Gratuito | Pago | Fonte / confiança |
|---|---|---|---|---|
| **Supabase** | Banco, autenticação, arquivos, funções | 500 MB de banco, 1 GB de arquivos, 5 GB de tráfego, 50 mil usuários ativos/mês, 2 projetos, **pausa após 7 dias sem uso, sem backup** | **Pro US$ 25/mês**: 8 GB de banco, 100 GB de arquivos, 250 GB de tráfego, 100 mil usuários ativos, backup diário. Excedentes: US$ 0,125/GB de banco, US$ 0,0213/GB de arquivos, US$ 0,09/GB de tráfego | [supabase.com/pricing](https://supabase.com/pricing), docs de cobrança. Alta |
| **Netlify** | Hospedagem do app | 300 créditos/mês (cerca de 30 GB de tráfego, a 10 créditos/GB) | Personal US$ 9/mês (1.000 créditos) · Pro US$ 20/mês | Guias de 2026. *Média: conferir em netlify.com/pricing* |
| **Resend** | E-mail (SMTP) | 3.000/mês, **100/dia**, 1 domínio | Pro a partir de US$ 20/mês (50 mil) | [resend.com/pricing](https://resend.com/pricing). Alta para o gratuito |
| **Google Web Risk** | URLs perigosas | **100 mil consultas/mês** (Lookup) | US$ 0,50 por mil consultas, até 10 milhões | [cloud.google.com/web-risk/pricing](https://cloud.google.com/web-risk/pricing). Alta |
| HIBP Pwned Passwords | Senhas vazadas | Gratuito, sem chave (k-anonimato) | — | Alta |
| **Better Stack** (ou Sentry) | Erros e disponibilidade | Better Stack: 10 monitores, página de status, 100 mil exceções/mês · Sentry: 5 mil erros/mês, 1 usuário | Pago a partir de cerca de US$ 26/mês | Guias de 2026. *Média* |
| Cloudflare R2 | Arquivos Premium (opcional) | 10 GB | US$ 0,015/GB por mês, **sem cobrança de tráfego** | Alta |
| Domínio `.com.br` | Marca | — | Cerca de R$ 40/ano | registro.br. Alta |
| Pagamento | Assinaturas | — | Cartão cerca de 3–5% por transação; Pix de R$ 0,99 a R$ 1,99 por transação (Asaas), ou 0% a 1% conforme o gateway | *Estimativa: conferir nas tabelas de Asaas, Mercado Pago, Stripe e Pagar.me* |
| Impostos | Simples Nacional (serviço de software) | — | Cerca de 6% a 15,5% da receita, conforme anexo e faturamento | *Estimativa: confirmar com contador* |
| Lojas | Distribuição | — | Google Play US$ 25 (uma vez) · Chrome Web Store US$ 5 (uma vez) · Edge gratuito · Apple US$ 99/ano | Alta |
| Pentest externo | Garantia | — | R$ 10 a 40 mil por rodada, conforme o escopo | *Estimativa de mercado* |

## 2. Custos fixos e variáveis

**Fixos (mês):**

| Item | Beta (Free) | Com assinaturas (Pro) |
|---|---|---|
| Supabase | R$ 0 | R$ 138 |
| Domínio | R$ 3 | R$ 3 |
| Hospedagem, e-mail, monitoramento, Web Risk | R$ 0 | R$ 0 até os limites gratuitos |
| Apple Developer (quando houver iOS) | — | R$ 45 (US$ 99/ano) |
| **Total** | **cerca de R$ 3** | **cerca de R$ 140 a 190** |

**Variáveis:** dependem de uso, não do número de contas.

| Custo | Fórmula | Observação |
|---|---|---|
| Arquivos | GB guardados × US$ 0,0213 (Supabase, acima de 100 GB) ou US$ 0,015 (R2) | O que mais pesa; controlado pelas cotas por plano |
| Tráfego | GB baixados × US$ 0,09 (Supabase, acima de 250 GB); R2 não cobra | Downloads de arquivos e transferências |
| Banco | Cerca de 5 KB por item e 0,5 KB por evento de auditoria | Mil usuários com 200 itens ocupam cerca de 1 GB |
| Web Risk | (consultas − 100 mil) × US$ 0,0005 | Uso justo: 50/dia no Free e 500/dia no Pro |
| E-mail | Acima de 3.000/mês → US$ 20 | Cerca de 3 e-mails por usuário por mês |
| Pagamento | Receita × 3–5%, mais o fixo por transação | Só com receita |

## 3. Capacidade do beta no Supabase Free

O limite real é **1 GB de arquivos**, não o número de contas:

```
usuários_máx ≈ 1.000 MB × 0,8 (margem) ÷ cota média por usuário
```

| Cota média de arquivos | Usuários que cabem |
|---|---|
| 60 MB | 13 |
| 30 MB | 26 |
| 10 MB | 80 |

**Recomendação para o beta no Free:**
- **até 25 usuários**;
- cota de **30 MB** no Free e **60 MB** no Premium do beta;
- banco de 500 MB folgado (25 usuários × 7 a 200 itens é menos de 30 MB);
- 5 GB de tráfego por mês: limitar a 5 downloads por transferência.

**Riscos do Free:**
- **Pausa após 7 dias sem uso:** o uso diário evita.
- **Sem backup automático:** o backup externo 2 vezes por semana é obrigatório.

Ver os gatilhos em [`scaling-triggers.md`](scaling-triggers.md).

## 4. Cenários de custo mensal

| Cenário | Usuários ativos | Infraestrutura | Custo/mês (estimativa) | Por usuário ativo |
|---|---|---|---|---|
| Beta fechado | até 25 | Supabase Free, demais gratuitos | **R$ 3** | ~R$ 0,12 |
| Beta ampliado | até 100 | **Supabase Pro** (o Free não comporta os arquivos), demais gratuitos | **R$ 140** | R$ 1,40 |
| MVP público | 100–1.000 | Pro, Netlify Personal se passar de 30 GB, Resend gratuito | **R$ 140–250** | R$ 0,25–1,40 |
| Crescimento inicial | 1.000–10.000 | Pro + computação maior (US$ 15–60), R2 para arquivos, Resend Pro, monitoramento pago, Web Risk acima da franquia | **R$ 800–1.800** | R$ 0,18–0,80 |
| Expansão | 10.000–50.000 | Pro com computação grande, réplica de leitura, workers dedicados se a rotação crescer | **R$ 3.000–8.000** | R$ 0,15–0,30 |
| Enterprise | acima de 50.000 ou contrato dedicado | Supabase Team/Enterprise ou infraestrutura dedicada por contrato | Sob proposta | Repassado no contrato |

Custos únicos fora da tabela: lojas (cerca de R$ 165), pentest (R$ 10–40 mil por rodada) e abertura de empresa ou contador.

## 5. Receita e ponto de equilíbrio

**Receita líquida por assinante Pro:**
```
líquida = preço × (1 − taxa_gateway − imposto) − fixo_transação
R$ 9,90 × (1 − 0,05 − 0,10) − R$ 0,50 ≈ R$ 7,90 por mês   (estimativa)
```

**Ponto de equilíbrio (margem antes de pessoal):**
```
assinantes_necessários = custo_fixo_mensal ÷ líquida_por_assinante
```

| Custo mensal a cobrir | Assinantes Pro necessários | Com 3% de conversão, usuários totais |
|---|---|---|
| R$ 190 (Pro + domínio + Apple) | **25** | ~830 |
| R$ 1.000 (crescimento inicial) | 127 | ~4.200 |
| R$ 190 + pentest de R$ 20 mil amortizado em 12 meses (R$ 1.857) | 260 | ~8.700 |

**Exemplo de MRR:** 1.000 usuários com 3% no Pro dão 30 assinantes.

| | Valor |
|---|---|
| MRR bruto | R$ 297 |
| Receita líquida | ~R$ 237 |
| Custo | ~R$ 190 |
| Margem antes de pessoal | **~R$ 47** |

Com 5% de conversão, a margem sobe para ~R$ 205. A margem é pequena no começo. O que muda a conta é o **Enterprise**: 1 cliente com 10 usuários a R$ 25 dá R$ 250 de MRR, quase o mesmo que 30 assinantes Pro.

Os dados de entrada da planilha (usuários, conversão, preço, taxas, cotas) ficam nesta seção. Na Fase D, o modelo vira uma planilha editável.

## 6. Métricas de consumo dentro do app

O objetivo é medir custo e abuso **sem tocar no conteúdo do cofre**. Contamos eventos e bytes, nunca dados.

| Métrica | Como medir | Já existe? |
|---|---|---|
| Arquivos guardados por usuário e plano | Soma de `vault_files.size_bytes` | ✅ (cota) |
| Tráfego de transferências | Contador de downloads × tamanho em `transfers` | 🟡 (contador de downloads existe) |
| Consultas de URL | Nova tabela `usage_counters(user_id, metric, period_day, count)` | ❌ |
| Rotações por API | `audit_events` `rotation.*` | ✅ (evento) |
| E-mails enviados | Contador na função que envia | ❌ |
| Compartilhamentos e transferências ativos | Contagem nas tabelas | ✅ |
| Custo estimado por recurso e por plano | Métricas × preço unitário em `app_settings` → painel na Administração | ❌ |

**Proteções:**
- quotas por plano (ver [`../product/plan-strategy.md`](../product/plan-strategy.md));
- limite de uso no banco, e não em memória;
- cache do HIBP no navegador;
- deduplicação de URLs consultadas por dia;
- alerta ao atingir 70% de cada franquia do fornecedor.
