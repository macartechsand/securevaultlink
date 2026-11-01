# Extensão de navegador: objetivo, escopo e requisitos

> Especificação de 2026-11-01. **Fase 1 implementada** (seção 12); código em [`web-saas/extension/`](../../web-saas/extension/README.md). Base: [`open-source-and-business.md`](open-source-and-business.md), seção 4 (a extensão é o item nº 1 para disputar clientes do 1Password).

## 1. Objetivo

Levar o cofre para onde a senha é usada: **preencher e salvar logins direto nos sites**, sem copiar e colar, **mantendo o conhecimento zero**. A extensão é um segundo cliente do mesmo cofre: cifra e decifra só no navegador, com a mesma criptografia do app web. O servidor continua sem ver nenhuma senha.

**Resultado esperado:** o usuário abre a página de login, clica no ícone (ou usa o atalho) e o login certo é preenchido em até 2 ações, só no domínio correto.

## 2. Princípios (não negociáveis)

1. **Mesmo modelo criptográfico do app:** PBKDF2-SHA256 (600 mil iterações) → KEK → DEK → chave por item (AES-256-GCM); compartilhados via ECDH P-256. Código de criptografia **importado** de `web-saas/src/lib/crypto`, nunca reescrito.
2. **Nada em claro em disco.** Senha mestra nunca é guardada. Chaves e itens decifrados só em memória (`chrome.storage.session`, que fica em RAM e some ao fechar o navegador).
3. **Página da web não é confiável.** O script injetado no site não tem acesso ao cofre; recebe **apenas** o usuário e a senha do item escolhido, no momento do preenchimento.
4. **Preenchimento só com gesto do usuário.** Nada de preencher ao carregar a página (bloqueia ataques de formulários invisíveis que capturam senhas).
5. **Domínio exato.** Só sugere e preenche itens cujo site corresponde ao domínio da aba; em domínio diferente, exige confirmação explícita com aviso.
6. **Permissões mínimas** no manifesto, sem scripts remotos, sem `eval`, CSP estrita.
7. **Mesmas regras do servidor:** MFA (`aal2`) obrigatório quando o RLS exige; auditoria registra desbloqueio e preenchimentos com `source: 'extension'` (sem conteúdo do item).

## 3. Escopo por fase

### Fase 1: MVP (Chrome e Edge, Manifest V3)
| # | Funcionalidade | Critério de aceite |
|---|---|---|
| 1 | Entrar na conta (e-mail/senha da conta, Google ou GitHub + TOTP) dentro da extensão | Sessão Supabase própria da extensão; recusa sem MFA quando exigido |
| 2 | Desbloquear com a senha mestra; bloquear manualmente | Senha errada falha pela tag GCM, igual ao app |
| 3 | Bloqueio automático: 10 min sem uso, fechar o navegador, bloqueio do sistema | Após bloqueio, nenhuma chave ou item em memória |
| 4 | Popup: itens que correspondem à aba no topo, busca por título/usuário/site, favoritos | Busca nunca considera a senha |
| 5 | **Preencher** usuário e senha na aba atual (clique no item ou `Ctrl+Shift+L`) | Só no frame do domínio correspondente; nunca em `http://` sem aviso; nunca em iframe de outro domínio |
| 6 | Copiar usuário/senha com limpeza da área de transferência em 30 s | Igual ao app |
| 7 | Abrir o site do item | Só `http(s)` (reaproveita `safeHref`) |
| 8 | Gerador de senha no popup | Mesmo gerador do app (`crypto.getRandomValues`) |
| 9 | Itens compartilhados comigo (leitura/edição) | Abertos com a chave privada ECDH; respeitam a expiração |
| 11 | Avisos de segurança no popup: site sem HTTPS, domínio parecido (punycode/homógrafo), senha vazada já conhecida | Reaproveita `urlCheck` e a saúde já calculada |

### Fase 2: salvar e preencher no campo
| # | Funcionalidade | Critério de aceite |
|---|---|---|
| 10 | Selo no ícone com o número de logins para o site atual (movido da fase 1: exige ler a URL de todas as abas) | Calculado localmente |
| 12 | Detectar envio de login/cadastro e oferecer **salvar** ou **atualizar** a senha | Pergunta em barra própria da extensão; nada é enviado sem confirmação |
| 13 | Ícone dentro do campo de login com menu de sugestões | Menu renderizado em **iframe da própria extensão** (a página não lê nem sobrepõe), resistente a *clickjacking* |
| 14 | Gerar senha forte direto no campo de cadastro e salvar o item | Item criado cifrado antes do envio |
| 15 | Vários endereços por login (ex.: `app.` e `login.` do mesmo serviço) | Exige campo `urls[]` no item (mudança compatível no formato) |
| 16 | Regras de correspondência por item: domínio base, host exato, nunca sugerir | Padrão: domínio base (eTLD+1) |

### Fase 3: além
- Firefox (MV3) e Safari (exige conta Apple Developer e Xcode).
- Códigos TOTP como campo do item e preenchimento do código.
- Passkeys (WebAuthn) guardadas no cofre.
- Desbloqueio por biometria (WebAuthn PRF ou Windows Hello) sem digitar a senha mestra.
- Preenchimento de cartões e endereços.

## 4. Arquitetura

```
web-saas/extension/         (usa as dependências do web-saas; build com Vite)
  manifest.json             MV3, permissões mínimas
  src/background/           service worker: sessão, cofre em memória, correspondência de domínio, bloqueio
  src/popup/                React + o mesmo design system (theme.css)
  src/content/              script mínimo: detecta campos e preenche quando o background manda
  src/shared/               importa web-saas/src/lib/{crypto,items,passwordGenerator,urlCheck}
```

| Peça | Responsabilidade | O que pode ver |
|---|---|---|
| **Service worker** (background) | Supabase, desbloqueio, cofre decifrado, decisão de preencher | Tudo, só em memória |
| **Popup** | Interface; pede ações ao background | Lista de itens e o item aberto |
| **Content script** (na página) | Encontrar campos de login e escrever valores | **Só** usuário/senha do item escolhido, no instante do preenchimento |

**Permissões previstas:** `storage`, `activeTab`, `scripting`, `alarms`, `clipboardWrite`, `idle`, `contextMenus` (fase 2) e `host_permissions` só para o Supabase do projeto. Injeção do content script **sob demanda** (`activeTab` + `scripting`) na fase 1, sem acesso automático a todos os sites. A fase 2 precisa de `<all_urls>` para detectar formulários; isso será declarado e justificado na loja.

**Ciclo de vida do MV3:** o navegador encerra o service worker após ~30 s ocioso. Para não pedir a senha mestra a cada reinício, a DEK e as chaves privadas ficam em `chrome.storage.session` com acesso restrito a contextos confiáveis (`TRUSTED_CONTEXTS`, invisível ao content script). É memória, não disco, e é apagada no bloqueio, no fechamento do navegador e pelo alarme de inatividade. Isso exige gerar a DEK como **extraível só dentro da extensão**; no app web ela continua não extraível. É a mesma troca aceita por gerenciadores abertos do mercado e fica registrada como risco residual.

**Sessão da conta:** login próprio na extensão. O *refresh token* fica em `chrome.storage.local` (o mesmo nível de proteção do app web, que o guarda no `localStorage`); sem a senha mestra, ele não abre nada do cofre.

## 5. Correspondência de domínio (núcleo de segurança)

1. Normaliza a URL do item e a da aba (minúsculas, punycode, sem `www.`, porta padrão).
2. Compara pelo **domínio base** (eTLD+1, com a lista de sufixos públicos embutida e versionada, sem chamada externa). `conta.exemplo.com.br` corresponde a `exemplo.com.br`; `exemplo.com.br.evil.io` não corresponde.
3. Esquema: item `https` nunca é preenchido em página `http`.
4. Frames: preenche no frame principal ou em iframe **do mesmo domínio base**; nunca em iframe de terceiros.
5. IP, `localhost` e portas: só correspondência exata de host e porta.
6. Suite de testes com casos de phishing (subdomínio enganoso, homógrafo, sufixo público, `@` na URL, redirecionamento).

## 6. Segurança: ameaças e controles

| Ameaça | Controle |
|---|---|
| Página maliciosa lê o cofre | Content script sem acesso ao cofre; mensagens validadas por origem (`sender.id`, `sender.tab`, `frameId`) |
| Formulário invisível captura a senha (*autofill on load*) | Preenche só com gesto do usuário; checa visibilidade do campo |
| *Clickjacking* no menu de sugestões | Menu em iframe da extensão; clique exige o iframe visível e por cima (fase 2) |
| Phishing por domínio parecido | Correspondência por eTLD+1; aviso de homógrafo/punycode; confirmação em domínio diferente |
| Outra extensão ou malware local | Fora do controle do navegador; mitigado por bloqueio automático curto e pela chave fora do disco |
| Atualização maliciosa da extensão | Publicação só pela conta do dono com MFA (*tier 0*); build reproduzível a partir do Git; revisão da loja |
| Vazamento por logs | Nenhum dado de item em `console`, erros ou telemetria (o *error reporter* já filtra) |
| Sessão roubada | Sem a senha mestra não decifra nada; MFA exigido |

## 7. Qualidade e testes

- Testes unitários: correspondência de domínio, detecção de formulário (páginas de exemplo locais), mensagens entre partes.
- Teste de integração com o Supabase de desenvolvimento (contas descartáveis, igual aos existentes): entrar, desbloquear, listar, preencher, item compartilhado, expiração.
- Teste ponta a ponta: Edge com a extensão carregada (Puppeteer) em páginas de login locais, incluindo páginas de phishing simuladas.
- Revisão de permissões e do CSP do manifesto antes de cada publicação.

## 8. Publicação

| Loja | Custo | Observação |
|---|---|---|
| Chrome Web Store | US$ 5, uma vez | Revisão mais rígida para `<all_urls>`; exige política de privacidade |
| Microsoft Edge Add-ons | Grátis | Mesmo pacote do Chrome |
| Firefox Add-ons | Grátis | Fase 3 |
| Safari | US$ 99/ano (Apple Developer) | Fase 3 |

Durante o beta, a distribuição pode ser como extensão **não listada** (link direto) para os 5 usuários.

## 9. Fora do escopo do MVP

Edição completa de itens (fica no app web; a extensão só cria pelo "salvar" da fase 2), arquivos e transferências, administração, rotação e configurações de conta.

## 10. Decisões (aprovadas em 2026-11-01)

| Decisão | Escolha |
|---|---|
| Cofre aberto entre reinícios do service worker | Sim, em `chrome.storage.session`, com **bloqueio após 10 min sem uso** |
| Login próprio na extensão | Sim |
| Extensão grátis ou só Premium | Grátis em todos os planos |
| Navegadores do MVP | Chrome e Edge (mesmo pacote) |

## 11. Entregáveis da fase 1

1. Pacote `extension/` com build, manifesto e ícones.
2. Biblioteca compartilhada sem duplicar criptografia.
3. Popup (entrar, desbloquear, lista, busca, preencher, copiar, gerador, bloqueio).
4. Correspondência de domínio com testes de phishing.
5. Testes unitários, de integração e ponta a ponta.
6. Atualização de `mvp-security-model.md` e `access-recertification.md` com a extensão como novo cliente.
7. Pacote `.zip` para instalação não listada no Edge e no Chrome.

## 12. Situação da fase 1

| Entregável | Situação |
|---|---|
| Pacote, build (`npm run build:ext`) e manifesto | ✅ `web-saas/extension/`, saída em `dist-extension/` |
| Biblioteca compartilhada | ✅ importa `web-saas/src` (criptografia, itens, serviços); o cliente Supabase é trocado no build |
| Popup | ✅ entrar (e-mail/senha + TOTP), desbloquear, lista com "Para este site", busca, preencher, copiar, abrir site, gerador, bloquear, sair |
| Correspondência de domínio | ✅ `domainMatch.ts` com 10 testes (sufixo enganoso, punycode, `@` na URL, `github.io`/`netlify.app`/`gov.br`, http×https, IP e porta) |
| Testes ponta a ponta | ✅ 6 testes no Edge real com a conta de teste A: login, senha errada, lista sem senhas, preenchimento, confirmação em outro site, iframe de terceiro ignorado, página web sem acesso à extensão, bloqueio limpa as chaves |
| Auditoria | ✅ desbloqueio, falha e bloqueio com `client: extension`; preenchimento como `item.filled` (só o ID do item) após a migration `20261104000000_extension_fill_event.sql` |
| Documentos de segurança | ✅ `mvp-security-model.md` e `access-recertification.md` |

**Diferenças em relação à especificação:**
- **Só logins** aparecem na extensão; notas, segredos e cartões continuam no app web.
- O **selo no ícone** foi para a fase 2 (precisaria da permissão de ler a URL de todas as abas).
- A **área de transferência** é limpa após 30 s sem conferir o conteúdo (conferir exigiria a permissão de leitura da área de transferência).
- **Login com Google e GitHub** (adicionado em 2026-11-01): mesmo fluxo do app (Supabase, Authorization Code + PKCE) via `chrome.identity.launchWebAuthFlow`. O provedor devolve o código só para o endereço da própria extensão (`https://<id>.chromiumapp.org/`), e o `code_verifier` fica no armazenamento dela, então um código vazado não serve para outra pessoa. A resposta é validada (origem exata, formato do código) e testada (`oauthCallback.test.ts`).
- **ID fixo da extensão** em instalações sem loja: `mcljapeloopnadipmhmojkmbjjgbpdij` (chave pública em `extension/manifest-key.json`). Nas lojas o ID é outro e precisa ser incluído nas Redirect URLs do projeto de produção.
- **Preenchimento:** a extensão injeta o script sob demanda (`activeTab`); sem script permanente nas páginas.
