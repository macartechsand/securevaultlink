# Experiência de login e autenticação

Referência: Bitwarden (e-mail primeiro, "Lembrar e-mail", logins ligados à mesma conta). Atualizado em 2026-11-11.

## O problema encontrado no beta

Um testador abriu o link de convite, chegou à tela "Defina a senha da sua conta" e, no app Android, não conseguiu entrar com e-mail e senha, embora o painel mostrasse a conta criada.

**Causa:** a tela "Defina a senha da conta" só aparecia enquanto o link estava no endereço. O convite cria a conta **sem senha**. Se a pessoa recarregasse, fechasse a aba ou seguisse direto para a senha mestra, a conta continuava sem senha de entrada. No celular, o login com e-mail e senha falhava com "E-mail ou senha incorretos".

Outras causas que geram o mesmo sintoma, agora tratadas:

| Situação | Antes | Agora |
|---|---|---|
| Convite aberto, senha da conta não salva | Conta sem senha, sem aviso | Pendência gravada no perfil (`sv_set_password`); a tela volta em qualquer aparelho até a senha ser salva |
| Pessoa já convidada usa "Criar conta" | Supabase responde sucesso falso e nada é gravado; espera um e-mail que não chega | Mensagem clara: a conta já existe, abra o convite, use "Esqueci a senha" ou entre com Google/GitHub |
| Pessoa digita a senha mestra no login | "E-mail ou senha incorretos" | Mesmo erro, mais um painel de ajuda explicando senha da conta x senha mestra |
| Conta criada com Google, tenta e-mail e senha no app | Sem caminho | Configurações → Formas de entrar → Definir senha |
| Admin não sabe quem ficou sem senha | Invisível | Selo "Sem senha da conta" na lista de usuários (migração `20261111000000_login_methods.sql`) |

## Fluxo de entrada (estilo Bitwarden)

1. **E-mail** → "Continuar", com a opção "Lembrar e-mail neste dispositivo". Só o endereço é guardado, depois do opt-in; nunca a senha.
2. **Formas de entrar** para aquele e-mail:
   - o endereço aparece no topo, com "Não é você?";
   - senha da conta, com "Mostrar";
   - "Continuar com Google/GitHub".
3. **MFA** (TOTP), quando ativado.
4. **Senha mestra ou PIN**: abre o cofre no aparelho. A senha da conta nunca abre o cofre.

Diferença para o Bitwarden: lá uma só senha (a mestra) autentica e cifra. Aqui são duas, a da conta (Supabase Auth) e a mestra (cofre). A unificação faz parte da criptografia v2 (Secret Key obrigatória, ver [security-assurance](../security/security-assurance.md)). Até lá, a interface sempre diz qual das duas está pedindo.

## Contas ligadas (e-mail + OAuth)

- **Automático:** ao "Continuar com Google" usando o **mesmo e-mail confirmado** de uma conta existente, o Supabase entra nessa conta (vínculo automático por e-mail verificado). Não cria uma segunda conta.
- **Manual:** em Configurações → **Formas de entrar**, a pessoa conecta Google/GitHub mesmo com e-mails diferentes (`linkIdentity`), desconecta (mínimo de uma forma) e define ou troca a senha da conta.
- **Vínculo é só da conta.** O cofre continua pedindo a senha mestra. Entrar com Google não dá acesso aos dados.
- No app Android, o vínculo abre o navegador do sistema e volta por `app.securelink.vault://auth-callback` (PKCE), como o login.

## Configuração (dev e prod)

1. Supabase → Authentication → Sign In / Providers → **Allow manual linking**: ligar. Sem isso, "Conectar" mostra a mensagem de vínculo desativado.
2. Supabase → Authentication → URL Configuration → Redirect URLs: incluir `app.securelink.vault://auth-callback` (pendência antiga do app Android).
3. Aplicar `supabase/migrations/20261111000000_login_methods.sql` no SQL Editor.
4. Gerar um APK novo. O APK carrega o código do app dentro dele, então a correção só chega ao celular com um build novo.

## Para destravar o testador agora

1. Painel → IAM → usuário → **Gerar link de redefinição**, enviado por um canal seguro.
2. A pessoa abre o link, salva a senha da conta e entra no app com e-mail e essa senha.
3. Alternativa: se o e-mail dela é Gmail, "Continuar com Google" com o mesmo endereço.

## Casos de teste

- L1: convite → fechar a aba antes de salvar → abrir o app → a tela "Defina a senha" volta.
- L2: convite → salvar senha → APK entra com e-mail e senha.
- L3: "Criar conta" com e-mail já convidado → mensagem "já tem conta".
- L4: senha errada → painel de ajuda; senha mestra no lugar da conta → mesmo painel.
- L5: conta e-mail + "Continuar com Google" com o mesmo e-mail → mesma conta (mesmo cofre).
- L6: Formas de entrar → Conectar GitHub → aparece "Conectado"; desconectar a última forma é bloqueado.
- L7: conta só Google → Definir senha → APK entra com e-mail e senha.
- L8 (pentest): tentar vincular uma identidade de provedor que já pertence a outra conta → recusado.
