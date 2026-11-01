# Login social (OAuth) no SecureLink Vault

Status: implementado em 2026-10-21 (Google e GitHub). Os botões aparecem automaticamente quando o provedor é ativado no Supabase.

## 1. A ideia
Mesmo padrão do Secora: **OAuth 2.0 Authorization Code com PKCE**. O app nunca recebe a senha do Google ou do GitHub. A diferença é a execução: aqui o protocolo roda no **Supabase Auth** (GoTrue), em vez de um backend próprio.

| Proteção (Secora) | Como fica aqui |
|---|---|
| `state` aleatório, uso único e validade curta | O Supabase gera e valida o `state` no fluxo `/authorize` → `/callback` |
| PKCE S256 | `flowType: 'pkce'` em `web-saas/src/lib/supabase.ts`. O `code_verifier` fica no navegador que iniciou o login; só ele troca o `?code=` |
| `client_secret` só no canal servidor↔servidor | O segredo fica nas configurações do provedor no Supabase, nunca no app |
| Só e-mail verificado | O Supabase só vincula identidades com e-mail verificado pelo provedor. O GitHub usa o e-mail primário verificado |
| Vinculação pelo id do provedor | `auth.identities` (provedor + id). Ver "Identidade" no painel de administração |
| Tokens do provedor não guardados | O app não pede nem guarda `provider_token` |
| Endpoints fixos e `redirect_uri` cadastrado | O retorno é sempre `https://<ref>.supabase.co/auth/v1/callback`, e o app só aceita voltar para URLs da lista de Redirect URLs |
| Mensagem de erro genérica | Erros voltam como `error_description` e o app mostra uma mensagem em português |

**Diferença importante:** o OAuth substitui só a **senha da conta**. O cofre continua exigindo a **senha mestra**, que nunca sai do dispositivo. Sem ela, entrar com Google não dá acesso aos dados.

**Beta fechado:** o login social também passa pelo trigger de convites. Um e-mail não convidado recebe "Cadastro indisponível: o acesso está restrito a convidados…".

## 2. Fluxo
1. O usuário clica em **Continuar com Google** (`OAuthButtons.tsx` → `signInWithOAuth`).
2. O Supabase redireciona ao provedor, com `state` e `code_challenge`.
3. O provedor autentica e devolve um código ao `…supabase.co/auth/v1/callback`.
4. O Supabase troca o código, lê a identidade, cria ou vincula a conta (e-mail verificado) e redireciona ao app com `?code=`.
5. O app (`detectSessionInUrl`) troca o `?code=` pela sessão usando o `code_verifier` local.
6. O usuário desbloqueia (ou cria) o cofre com a senha mestra; o MFA continua valendo.

## 3. Configuração (uma vez, no painel)
**Google**
1. Google Cloud Console → APIs e serviços → Tela de consentimento OAuth (tipo Externo, escopos `openid email profile`). Em modo Teste, adicione os testadores como usuários de teste.
2. Credenciais → Criar ID do cliente OAuth → Aplicativo da Web.
   - Origens JavaScript: `https://securelinkvaultdev.netlify.app`
   - URI de redirecionamento: `https://sueemdqyhwnmbqokpefz.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → **Google** → ativar, colar Client ID e Client Secret.

**GitHub**
1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage: `https://securelinkvaultdev.netlify.app`
   - Authorization callback URL: `https://sueemdqyhwnmbqokpefz.supabase.co/auth/v1/callback`
2. Gere um Client Secret.
3. Supabase → Authentication → Providers → **GitHub** → ativar, colar Client ID e Client Secret.

**Supabase → Authentication → URL Configuration** (obrigatório também para os links de convite)
- Site URL: `https://securelinkvaultdev.netlify.app`
- Redirect URLs: `https://securelinkvaultdev.netlify.app/**` e `http://localhost:5173/**`

## 4. Links de convite e redefinição (sem e-mail)
Gerados pelo administrador (função `admin`, ações `invite_link` e `recovery_link`) com `auth.admin.generateLink`, **sem enviar e-mail**:
- O link tem a forma `https://…/#sv_token_hash=…&sv_type=invite|recovery`. O token vai no **fragmento**, que o navegador nunca envia a servidores.
- O app resgata com `verifyOtp({ token_hash, type })`, que funciona com PKCE, remove o token da barra de endereço e pede a senha da conta.
- O link é de uso único, expira (prazo do OTP no Supabase) e fica registrado na auditoria.

## 5. Erros comuns
| Sintoma | Causa | O que fazer |
|---|---|---|
| O botão não aparece | Provedor não ativado no Supabase | Ativar em Authentication → Providers |
| `redirect_uri_mismatch` no Google | Callback cadastrado errado | Usar exatamente `https://<ref>.supabase.co/auth/v1/callback` |
| Volta para a página errada | Site URL ou Redirect URLs desatualizados | Ajustar URL Configuration |
| "Cadastro indisponível…" | E-mail não convidado ou beta cheio | Convidar em Administração → Beta e limites |
| Google bloqueia alguns e-mails | App em modo Teste | Adicionar usuários de teste ou publicar o app |
| A confirmação por e-mail não conclui em outro dispositivo | PKCE: o `code_verifier` fica no navegador que fez o cadastro | Abrir o link no mesmo navegador, ou usar link de convite |
