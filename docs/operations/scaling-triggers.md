# Gatilhos de escala

> Versão de 2026-11-04. A escala é decidida por **métricas**, não pelo número de usuários. Os limites são pontos de partida e se ajustam com dados reais. Custos em [`finops.md`](finops.md).

Onde medir:
- **Uso do Supabase:** painel do projeto (Usage);
- **Métricas do app:** Administração → Visão geral e Conformidade;
- **Erros e disponibilidade:** monitoramento externo, quando contratado.

| # | Métrica | Limite | Como medir | Ação | Impacto financeiro | Risco de não agir |
|---|---|---|---|---|---|---|
| 1 | Arquivos no Supabase Free | **70% de 1 GB** | Usage → Storage | Reduzir cotas ou migrar para o Pro | +R$ 138/mês | Uploads falham para todos |
| 2 | Banco no Free | 70% de 500 MB | Usage → Database | Pro | +R$ 138/mês | O projeto fica só leitura |
| 3 | Tráfego no Free | 70% de 5 GB/mês | Usage → Egress | Limitar downloads por transferência, ou Pro | +R$ 138/mês | Serviço restrito até o fim do ciclo |
| 4 | Assinaturas abertas ao público | Primeiro cliente pagante | Decisão | **Pro obrigatório**: backup diário, sem pausa | +R$ 138/mês | Cliente pagante sem backup e com risco de pausa |
| 5 | Arquivos no Pro | 70% de 100 GB | Usage | Arquivos Premium para o R2 (já implementado: `fn/storage-r2`) | R2: US$ 0,015/GB, sem tráfego | Excedente de US$ 0,0213/GB, mais tráfego |
| 6 | Tráfego no Pro | 70% de 250 GB/mês | Usage | R2 para arquivos; cache de estáticos | Reduz custo | US$ 0,09/GB excedente |
| 7 | Latência P95 das funções ou do banco | **> 500 ms por 3 dias** | Logs do Supabase ou monitoramento | Índices, depois computação maior | +US$ 15–60/mês | Experiência lenta, sincronização falha |
| 8 | Uso de CPU ou memória do banco | > 70% por 1 semana | Usage → Compute | Computação maior | +US$ 15–60/mês | Quedas no horário de pico |
| 9 | Erros 5xx ou `client.error` | Crescimento por 3 dias seguidos, ou > 1% das requisições | Eventos `client.error`, monitoramento | Investigar antes de escalar; corrigir a causa | — | Perda de confiança |
| 10 | Rotações por API | > 1.000/dia, ou fila parada > 5 min (quando houver fila) | Eventos `rotation.*` | Worker dedicado com fila (fora das Edge Functions) | US$ 5–20/mês | Limites de tempo das funções |
| 11 | Consultas Web Risk | 70% de 100 mil/mês | Contador `usage_counters` | Revisar uso justo; deduplicar | US$ 0,50 por mil acima | Custo sem controle |
| 12 | E-mails | 70% de 100/dia ou de 3.000/mês | Painel do Resend | Resend Pro | +US$ 20/mês | Confirmação e redefinição não chegam |
| 13 | Custo por usuário pagante | Acima de 30% da receita líquida por assinante (> R$ 2,40) | `finops.md`, seção 5, mensalmente | Revisar cotas e preço | — | Margem negativa |
| 14 | Primeiro cliente Enterprise | Contrato | Decisão | Organizações (P4), SSO, revisão de SLA e recuperação de desastre | Conforme contrato | — |

**Ordem da evolução da infraestrutura:**
1. Free (beta).
2. Pro.
3. Pro com R2.
4. Computação maior.
5. Worker e fila para rotação.
6. Réplica de leitura.
7. Infraestrutura dedicada, só por contrato.

Não há Kubernetes, microsserviços ou backend próprio sem um gatilho desta tabela.
