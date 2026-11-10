# Guia dos engenheiros

Para a equipe de **2026-11-10**: o dono do produto, **2 engenheiros de solução** e **1 engenheiro de segurança ofensiva**.

## Papéis

| Papel | Responsável por | Não faz |
|---|---|---|
| **Dono do produto** | Decisões de produto e de risco; acesso à produção (painéis Supabase, Netlify, Google, GitHub); aplicar migrations na produção; publicar na produção pelos scripts | — |
| **Engenheiro de solução A: plataforma** | App web (`web-saas/src`), banco (`supabase/migrations`), Edge Functions (`supabase/functions`), criptografia (`web-saas/src/lib/crypto`) | Publicar na produção; usar dados reais |
| **Engenheiro de solução B: clientes** | Extensão (`web-saas/extension`), Android (`web-saas/android`), futuros iOS e desktop (Tauri), preenchimento nativo | Idem |
| **Engenheiro de segurança ofensiva** | Pentest do desenvolvimento, revisão de PRs sensíveis (criptografia, RLS, funções, extensão), reteste de correções, manter o [roteiro de pentest](/SECURITY_TESTING) | Testar a produção de forma ativa; carga ou DoS |

**Revisão obrigatória pelo engenheiro de segurança** em qualquer PR que mexa em:
- `lib/crypto`;
- migrations com RLS ou `security definer`;
- `supabase/functions`;
- `extension/src/background.ts`, `content.ts` ou `frames/`;
- autenticação e sessão.

## Mapa do repositório

| Caminho | Conteúdo |
|---|---|
| `web-saas/src` | App web (React 19 + Vite): `lib/` (lógica pura e criptografia), `services/` (chamadas ao Supabase), `state/` (sessão e cofre em memória), `components/` |
| `web-saas/extension` | Extensão MV3 (service worker, popup, script de página, iframes) e testes de ponta a ponta no Edge |
| `web-saas/android` | Projeto Capacitor do Android |
| `supabase/migrations` | Esquema, RLS e funções. **Toda mudança no banco é uma migration nova**, nunca edição de uma antiga |
| `supabase/functions` | Edge Functions (Deno) |
| `scripts/` | Publicação da produção, backup e restauração, extensão de produção |
| `docs/` | Esta documentação (Markdown) e o portal (`docs/.vitepress`) |
| raiz (`app/`, `src/`) | Protótipo Expo de 2024, **congelado**. Não usar |

## Ambientes

| | Desenvolvimento | Produção |
|---|---|---|
| App | https://securelinkvaultdev.netlify.app | https://securelinkvault.netlify.app |
| Supabase | `sueemdqyhwnmbqokpefz` | `exglsdylytdjwrlmyptk` (só o dono) |
| Branch | `dev` | `master` |
| Quem publica | Engenheiros (site e funções de desenvolvimento) | **Só o dono**, pelos scripts `deploy-prod-site.mjs` e `build-prod-extension.mjs` |

## Regras que valem sempre
1. **Testes nunca rodam contra a produção.** Os testes de integração usam contas descartáveis do desenvolvimento, em `web-saas/.env.test.local` (fora do git).
2. **Nada de segredos no repositório**, que é público: nem em código, nem em documentação, nem em issues. O Gitleaks roda na CI.
3. **Banco:** migration nova, revisada pelo engenheiro de segurança. Toda tabela nova com RLS forçada e `revoke all` para `authenticated`; permissões por coluna; `security definer` sempre com `set search_path = ''`.
4. **Dependências npm** com pelo menos 2 semanas de publicação, versão exata.
5. **Criptografia:** só WebCrypto ou bibliotecas auditadas; nunca primitivas próprias; teste com vetores reais, sem mocks.
6. **O servidor nunca recebe conteúdo em claro.** Quando uma funcionalidade precisa disso (como a rotação em 1 clique), ela exige consentimento por item e é documentada.
7. **Nunca use `netlify deploy` sem `--no-build`** (incidente de 2026-11-05).

## Rodar localmente
```powershell
git checkout dev; git pull
cd web-saas; npm ci
npm run dev          # app em http://localhost:5173 (usa .env.local = desenvolvimento)
npm test             # unitários (+ integração, se houver .env.test.local)
npm run lint
npm run build:ext    # extensão em web-saas/dist-extension
npm run build:ext:test; npm run test:ext:e2e   # ponta a ponta no Edge real

cd ../docs; npm ci; npm run dev   # este portal em http://localhost:5173 (só localhost)
```
Para validar uma migration sem o painel, use o Postgres do Supabase em Docker. O passo a passo está em [Validação do desenvolvimento](/operations/dev-validation).

## Fluxo de trabalho
1. Branch a partir de `dev` (`feat/...`, `fix/...`, `sec/...`).
2. PR para `dev` com a CI verde: lint, build, testes, `npm audit`, Gitleaks e CodeQL.
3. Revisão de um engenheiro de solução, e do engenheiro de segurança nos caminhos sensíveis.
4. Depois da validação, o dono abre o PR `dev` → `master` e publica.

## Comunicação e achados
- **Achados de pentest ainda não corrigidos não entram no repositório público.** Registre no canal privado combinado (GitHub Security Advisory privado do repositório ou documento privado do time). Depois da correção, o resumo vai para a tabela da seção 8 do [roteiro de pentest](/SECURITY_TESTING).
- **Severidade e prazos:** seção 5 do [roteiro de pentest](/SECURITY_TESTING). Crítico ou alto bloqueia novos convidados.
- **Toda correção** vem com um teste automatizado que reproduz o achado, sempre que possível.
