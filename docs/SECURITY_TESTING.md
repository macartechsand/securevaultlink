# Pentest do beta: escopo, regras e roteiro

Versão de **2026-11-05** · Código testado: branch `dev` no commit `a9501ab` ou posterior · Quem testa: o dono do produto

Este guia substitui o processo genérico herdado do protótipo de 2024, que continua no histórico do git. Ele descreve **o que existe para atacar**, **onde testar sem colocar usuários em risco**, **o que já é risco aceito** e **o resultado esperado** de cada teste. Os achados vão para a tabela da seção 8 e voltam ao desenvolvimento para correção e reteste.

Contexto do sistema: [`security/mvp-security-model.md`](security/mvp-security-model.md) (modelo de segurança) e [`product/browser-extension.md`](product/browser-extension.md), seção 13 (extensão, fase 2).

---

## 1. Ambiente e regras

| | Desenvolvimento (**alvo do pentest**) | Produção (beta com usuários) |
|---|---|---|
| App | https://securelinkvaultdev.netlify.app | https://securelinkvault.netlify.app |
| Supabase | `sueemdqyhwnmbqokpefz` | `exglsdylytdjwrlmyptk` |
| Código | `dev` (`a9501ab`): **contém tudo o que a produção tem e mais** a extensão 0.2.0 e os prazos de troca | `master` (`e9ec261`) com o site publicado em 2026-11-05 |

**Regras:**
1. **O pentest ativo roda no desenvolvimento.** O código é o mesmo da produção, com as novidades a mais, e um erro não afeta os convidados. Na produção, limite-se a testes **passivos** (cabeçalhos, TLS, configurações públicas de autenticação) e a contas suas.
2. **Nada de carga, DoS ou força bruta em volume.** O Supabase Free e o Netlify têm limites de uso e políticas próprias de teste de segurança; consulte-as antes. Para testar limites de tentativas, bastam algumas dezenas de requisições.
3. **Credenciais falsas ou descartáveis.** Nunca use senhas reais nos cofres de teste nem nos conectores de rotação.
4. **Contas do pentest:** crie 3 contas novas no desenvolvimento (Administração → Beta e limites → convite):
   - **atacante**, Free, sem MFA;
   - **vítima**, Premium, com MFA, com itens, arquivos e compartilhamentos;
   - **admin de teste**, com papel administrativo e MFA. Não use a conta master.
5. **Antes de mexer na produção**, rode um backup (`scripts/backup/backup.mjs`).
6. **Diferença de configuração:** no desenvolvimento o "MFA obrigatório para todos" está **desligado** (para os testes automáticos); na produção está **ligado**. Teste os dois estados: ligue-o no desenvolvimento durante a seção 3.3 e desligue ao final.
7. Ao terminar, apague as contas do pentest pelo painel de administração (ação **Excluir conta**).

**Ferramentas sugeridas:** DevTools do navegador, OWASP ZAP (varredura base e proxy) ou Burp Community, `curl`, um script com `@supabase/supabase-js` usando a chave anon (pública) e o token de sessão de cada conta, `jadx` ou MobSF para o APK.

---

## 2. Superfícies de ataque

| Superfície | O que é | Onde está no código |
|---|---|---|
| App web (SPA) | React servido pelo Netlify, com CSP restritiva | `web-saas/src/`, `netlify.toml` |
| API de dados | PostgREST do Supabase com a chave anon + token do usuário; isolamento por RLS | `supabase/migrations/` |
| Funções RPC | Funções `security definer` (limites, cotas, administração, auditoria) | `supabase/migrations/` |
| Storage | Bucket de arquivos cifrados, URLs assinadas | `20261011000000_file_vault.sql` e seguintes |
| Edge Functions | `account`, `admin`, `check-url`, `cleanup-files`, `rotate`, `storage-r2`, `transfer` | `supabase/functions/` |
| Autenticação | E-mail e senha, Google, GitHub, TOTP, convites do beta | Supabase Auth, `20261020000000_closed_beta.sql` |
| Criptografia no cliente | PBKDF2 → chave de desbloqueio; chave do cofre; uma chave por item; AES-GCM; ECDH P-256 para compartilhar | `web-saas/src/lib/crypto/` |
| Extensão 0.2.0 | Service worker, popup, script em todas as páginas, menu e barra de salvar em iframes da extensão | `web-saas/extension/` |
| App Android | Capacitor, link de retorno `app.securelink.vault://auth-callback` | `web-saas/android/` |
| Links públicos | Transferências com a chave no fragmento da URL (`#`) | `supabase/functions/transfer/` |

---

## 3. Roteiro de testes

Cada linha diz o que tentar e o **resultado esperado**. Qualquer diferença é um achado.

### 3.1 Isolamento entre usuários (RLS)
| Teste | Esperado |
|---|---|
| Com o token do **atacante**, ler, alterar ou apagar por id os itens, pastas, arquivos, compartilhamentos e eventos da **vítima** (PostgREST direto, trocando `user_id` e ids) | Lista vazia ou erro; nada muda |
| Inserir linhas com `user_id` da vítima | Recusado |
| Chamar cada função RPC com parâmetros de outro usuário | Recusado ou só dados próprios |
| Baixar objeto do Storage pelo caminho de outro usuário; reutilizar URL assinada depois de revogado o compartilhamento | Recusado; a URL assinada expira |
| Ler tabelas administrativas (`app_admins`, `app_settings`, `beta_allowlist`, licenças, auditoria) como usuário comum | Recusado ou só o próprio |
| Alterar o próprio plano, cota, limite de itens ou papel (`update` direto) | Recusado |
| Passar do limite de itens do Free (7) e da cota de verificações de sites pela API | Recusado pelo banco, não só pela tela |

### 3.2 Criptografia e zero-knowledge
| Teste | Esperado |
|---|---|
| Inspecionar o banco (tabela de itens, como dono) e o tráfego: título, usuário, senha, notas, URL | Só texto cifrado; nada legível |
| `localStorage`, `sessionStorage`, IndexedDB e cache do service worker após desbloquear e após bloquear | Nenhum segredo em claro; após bloquear, nada que permita abrir o cofre |
| Alterar 1 byte do texto cifrado de um item ou arquivo | O app recusa abrir (falha na tag do AES-GCM), sem mostrar lixo |
| Trocar o texto cifrado de um item pelo de outro item do mesmo usuário | Recusado (a chave é por item) |
| Senha mestra errada várias vezes | Atraso crescente entre as tentativas |
| Link de transferência: a chave fica só no fragmento `#` e não aparece nos logs do servidor nem no `Referer` | Confirmado; sem a chave, o conteúdo é ilegível |
| Compartilhamento: o destinatário recebe só a chave do item, cifrada para a chave pública dele | O resto do cofre do dono continua inacessível |

### 3.3 Autenticação, sessão e MFA
| Teste | Esperado |
|---|---|
| Cadastro com e-mail fora da lista de convidados | Recusado |
| Com MFA ativo, usar o token de nível `aal1` (antes do TOTP) para ler dados protegidos | Recusado pela RLS |
| Com "MFA obrigatório para todos" ligado, conta sem MFA acessa o cofre | Só consegue configurar o MFA |
| Reutilizar o token depois de sair; encerrar sessão de outro aparelho e reutilizar o token dele | Recusado após expirar o token de acesso (até 1 h) |
| Redirecionamento aberto: alterar `redirect_to` no login social e na recuperação de senha | Só os endereços cadastrados no Supabase |
| Conta suspensa pelo admin tenta usar a API | Recusado |

### 3.4 Administração
| Teste | Esperado |
|---|---|
| Usuário comum chama a função `admin` (cada ação: `health`, `reset_mfa`, `suspend`, `unsuspend`, `invite_link`, `recovery_link`, `delete_user`) | 403 |
| Admin sem MFA (`aal1`) chama a função `admin` | Recusado |
| `delete_user`: sem `confirm`, com e-mail errado, contra si mesmo, contra outro admin | Recusado em todos |
| Admin tenta ver conteúdo de cofres (painel, API, diagnóstico) | Só metadados: contagens, datas e tamanhos |
| Adulterar ou apagar eventos da auditoria (como admin, via API) | Recusado; "Verificar log de auditoria" acusa qualquer quebra |

### 3.5 Edge Functions
| Teste | Esperado |
|---|---|
| Chamar cada função sem token, com token expirado e de outra origem (`Origin` falso) | 401 ou 403; CORS só para as origens do app |
| `cleanup-files` sem o segredo | 403 |
| `check-url`: SSRF (endereços internos, `file:`, `localhost`, IP de metadados), URLs enormes, excesso de chamadas | Só consulta a API do Google; respeita a cota diária |
| `rotate`: credenciais de outro usuário, parâmetros manipulados; conferir se os logs guardam segredos | Recusado; nenhum segredo nos logs |
| `transfer`: enumerar ids, baixar após expirar ou após o limite de downloads | Recusado |
| `account` (exportação e exclusão da própria conta): agir sobre outra conta | Recusado |

### 3.6 App web
| Teste | Esperado |
|---|---|
| XSS armazenado: `<img src=x onerror=alert(1)>` e `javascript:alert(1)` em título, usuário, URL, notas, campos personalizados, nome de arquivo, pasta e etiqueta; abrir também pelo compartilhamento | Exibido como texto; links `javascript:` não executam |
| Cabeçalhos: CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy` (ZAP baseline nos dois sites) | Presentes; o app não pode ser embutido em outro site |
| Upload de arquivo acima da cota, de tipo estranho, com nome malicioso | Recusado ou tratado como dado |
| Prazos de troca: as notificações do navegador mostram nomes de sites? | Não, só quantidades |

### 3.7 Extensão 0.2.0 (carregar `web-saas/dist-extension` no Edge ou Chrome)
| Teste | Esperado |
|---|---|
| Em `about:blank` ou numa página sua, `chrome.runtime.sendMessage` para o ID da extensão | Sem resposta: a página não tem acesso |
| Carregar `inline.html` ou `save.html` num iframe com token inventado ou reutilizado | "Menu expirado"; nenhum dado |
| Cobrir o menu ou a barra com elemento transparente, `opacity` baixa, `transform` ou `filter`, e clicar (clickjacking) | O clique é ignorado |
| Preenchimento em domínio parecido: subdomínio de outro dono, `http` em vez de `https`, punycode, porta diferente | Só oferece logins do site certo; o preenchimento automático ao abrir exige endereço exato em https |
| Iframe de outro domínio dentro de um site confiável | Não recebe os logins do site pai |
| Página falsa pede para mostrar a barra "Salvar" com dados inventados | Nada é salvo sem o clique do usuário na barra |
| "Nunca neste site": o armazenamento local guarda o endereço? | Só o hash |
| Bloquear o cofre (ou esperar 10 min) e abrir o menu | Pede para desbloquear; tokens e senhas pendentes apagados |
| `chrome.storage.local` e `session` depois de usar | Nenhuma senha em claro em `local` |
| Popup embutido num site | Recusado (`frame-ancestors`) |

### 3.7b Acesso temporário com aprovação (JIT, desde 2026-11-10)
| Teste | Esperado |
|---|---|
| Solicitante lê `item_shares`, `vault_entries` ou a chave selada antes da aprovação | Nada |
| Solicitante chama `jit_approve`, `jit_requester_key` ou insere em `item_shares` com `jit_request_id` | Recusado ("only by jit_approve") |
| Dono tenta criar um compartilhamento JIT fora de `jit_approve` | Recusado |
| Solicitante altera `expires_at` do próprio compartilhamento | Sem permissão |
| Pedido com mais minutos que o máximo, sem justificativa, repetido enquanto pendente, mais de 20 por dia | Recusado |
| Terceiro lê elegibilidades, pedidos ou o rótulo selado de outra pessoa | Nada; o rótulo só abre com a chave do destinatário |
| Depois do prazo ou de "Encerrar agora", ler o item | Nada; a limpeza remove a linha |
| Remover a elegibilidade com acesso ativo | O acesso termina na hora |
| Risco aceito | Durante o prazo, o solicitante pode copiar a senha; por isso a troca após o uso é recomendada |

### 3.8 App Android (APK de produção, versão 0.9.1)
| Teste | Esperado |
|---|---|
| `AndroidManifest.xml` | `allowBackup=false`, sem `debuggable`, sem tráfego HTTP em claro |
| Captura de tela e tela de apps recentes | Tela preta |
| Abrir `app.securelink.vault://auth-callback` com parâmetros forjados a partir de outro app | Não entra em nenhuma conta |
| Inspecionar o WebView com `chrome://inspect` | Não aparece no build de produção |
| App em segundo plano por mais de 1 minuto | Pede a senha mestra de novo |

---

## 4. Riscos já aceitos (não reportar como achado novo)
- A chave **anon** do Supabase e a URL do projeto aparecem no app: são públicas por natureza; a proteção é a RLS.
- O servidor vê **metadados**: quantidade de itens, tamanhos, datas e eventos de auditoria.
- Esquecer a senha mestra sem a chave de recuperação significa perder o cofre (zero-knowledge).
- Revogar um compartilhamento não apaga cópias que o destinatário já fez.
- Um site consegue descobrir que a extensão está instalada (as páginas do menu têm URL fixa).
- Um renderizador comprometido pode pedir a barra de salvar com dados falsos, mas não lê senhas nem salva sem clique.
- A área de transferência é limpa após 30 s sem conferir o conteúdo.
- A data em que cada risco de senha foi encontrado fica no aparelho (`localStorage`, sem segredos); prazos podem diferir entre aparelhos.
- Confirmação de e-mail com PKCE precisa ser aberta no mesmo navegador do cadastro.
- No desenvolvimento, "MFA obrigatório para todos" fica desligado de propósito (regra 6).

---

## 5. Classificação
| Severidade | Exemplos | Prazo de correção |
|---|---|---|
| **Crítica** | Ler o cofre ou os arquivos de outro usuário; segredo em claro no servidor; virar admin | Antes de qualquer novo convidado; a produção pode ser pausada |
| **Alta** | Contornar MFA; XSS armazenado; preencher senha no site errado; alterar dados de outro usuário | Antes de seguir o beta |
| **Média** | Falta de limite de tentativas; vazamento de metadados além do aceito; CORS amplo | Antes da abertura das assinaturas |
| **Baixa** | Cabeçalho faltando sem impacto direto; mensagem de erro detalhada demais | Planejar |

---

## 6. Varredura automática (complemento)
- **OWASP ZAP baseline** contra os dois sites (passiva, sem carga): `docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://securelinkvaultdev.netlify.app`.
- A CI do GitHub já roda `npm audit`, Gitleaks e CodeQL em todo PR (`.github/workflows`).

---

## 7. Depois do pentest
1. Registrar cada achado na seção 8, sem colar senhas, tokens ou chaves; descreva o passo a passo.
2. Corrigir no `dev` com teste automatizado que reproduza o achado, sempre que possível.
3. Retestar o achado e marcar como corrigido com o commit.
4. Levar à produção pelo fluxo normal (PR `dev` → `master`, funções, `scripts/deploy-prod-site.mjs`).
5. Atualizar o portão 3 de [`operations/release-readiness.md`](operations/release-readiness.md). O pentest **externo** continua exigido antes das lojas.

## 8. Achados

| # | Data | Superfície | Severidade | Resumo | Estado | Commit da correção |
|---|---|---|---|---|---|---|
| | | | | | | |
