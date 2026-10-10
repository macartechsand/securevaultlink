# SecureVault MVP: modelo de segurança e limitações

Escopo: `web-saas/` (React + Vite + Supabase). O app Expo da raiz é um protótipo **legado e congelado**, que não criptografa o cofre e não deve guardar senhas reais.

## Modelo de criptografia (zero-knowledge)

| Elemento | Detalhe |
|---|---|
| Senha mestra | Separada da senha da conta Supabase. Nunca sai do navegador. |
| KDF | PBKDF2-HMAC-SHA256, 600 000 iterações, salt de 16 bytes (WebCrypto). Parâmetros salvos no perfil; o cliente recusa valores abaixo do mínimo ou acima do máximo enviados pelo servidor. |
| Chave de dados (DEK) | 256 bits aleatórios. Cifra todos os itens. Mantida só em memória, como `CryptoKey` não extraível. |
| Envelope | A DEK é embrulhada com AES-256-GCM pela chave derivada da senha mestra. Não existe chave de recuperação (decisão de produto). |
| Itens | Todo o conteúdo (título, usuário, senha, URL, notas, categoria) vai em um blob AES-256-GCM com IV aleatório de 96 bits. O AAD liga o blob a `user_id` e ao `id` da linha, impedindo troca de blobs entre linhas ou usuários. |
| Servidor | Guarda apenas ciphertext, IVs, salt/parâmetros do KDF e chaves embrulhadas. |

Implementação: `web-saas/src/lib/crypto/`. Evolução prevista: Argon2id (os parâmetros do KDF já ficam versionados no perfil).

## Perda da senha mestra

- **Não há recuperação de nenhum tipo.** Decisão de produto: a senha mestra é a única chave. A chave de recuperação foi removida em 2026-10-10 (migration `20261010000000_mfa_and_remove_recovery_key.sql`, que também apaga os embrulhos de recuperação existentes).
- Esquecer a senha mestra torna o cofre **permanentemente irrecuperável**, inclusive para os administradores. A criação do cofre exige que o usuário confirme que entende isso.
- Trocar a senha mestra (Settings) mantém os dados; exige a senha atual.
- Redefinir a senha da *conta* (Supabase Auth) não recupera o cofre.

## Isolamento entre usuários

- Migration: `supabase/migrations/20261009000000_vault_e2ee.sql` (`vault_profiles`, `vault_entries`).
- RLS habilitado e forçado. Políticas `auth.uid() = user_id` em USING e WITH CHECK; `anon` sem acesso.
- Testes de isolamento: `web-saas/src/services/rls.integration.test.ts` (executam apenas contra um projeto Supabase **de desenvolvimento**, com contas de teste e variáveis de ambiente).
- **Validado em 2026-10-09** no projeto de desenvolvimento: 6/6 testes passaram (leitura, alteração, exclusão e inserção cruzadas bloqueadas; reatribuição de `user_id` bloqueada; acesso anônimo bloqueado; perfis isolados).

## Cofre de arquivos

| Categoria | Proteção |
|---|---|
| Arquivos do cofre | Chave AES-256-GCM aleatória por arquivo, embrulhada pela DEK do cofre (AAD: dono + arquivo). Conteúdo em blocos de 1 MiB; nonce = índice do bloco; AAD liga arquivo, índice e marcador de bloco final (impede reordenar, trocar ou truncar). Nome, tipo e tamanho original também ficam cifrados. |
| Compartilhados | Cada usuário tem um par ECDH P-256; a privada fica embrulhada pela DEK. A chave do arquivo é selada para a pública do destinatário (ECDH efêmero → HKDF-SHA256 → AES-GCM). A impressão digital da chave aparece para conferência por outro canal. |
| Transferências | Segredo de 256 bits só no fragmento do link (`#k=`), nunca enviado ao servidor; senha opcional (PBKDF2 600k combinada via HKDF). O servidor guarda só a chave embrulhada. Expiração ≤ 7 dias, 1–20 downloads, revogação. |

Controles do servidor (`supabase/migrations/20261011000000_file_vault.sql`):
- Bucket privado `vault-files`, só `application/octet-stream`, 26 MiB por objeto; cada usuário grava apenas na própria pasta e só para uma linha `pending` sua; leitura pelo dono ou por destinatário de compartilhamento.
- Cota no banco: 25 MiB por arquivo, 100 MiB por usuário, 500 arquivos (funções `private.file_quota_bytes`/`max_file_bytes`, prontas para variar por plano). `finalize_vault_file` confere o tamanho real do objeto com o declarado.
- Download anônimo só pela Edge Function `transfer` (consome um download atomicamente com `claim_transfer_download`, exclusiva do service role, e devolve URL assinada de 60 s). O contador de downloads não é editável pelo dono.
- MFA (`aal2`) também exigido em todas as tabelas e no storage de arquivos.
- `cleanup-files` (agendada) remove transferências expiradas/esgotadas/revogadas e uploads abandonados ou rejeitados.
- Preparado para S3: colunas `storage_backend` e `storage_class` (ex.: Standard, Standard-IA, Glacier). Como tudo é cifrado no cliente, migrar de provedor é copiar blobs.

Limitações dos arquivos:
- Revogar um compartilhamento impede novos downloads, mas não apaga cópias já baixadas e não troca a chave do arquivo.
- O servidor poderia, se comprometido, entregar uma chave pública falsa; por isso a conferência da impressão digital.
- `find_share_recipient` confirma se um e-mail tem conta (só com e-mail exato, para usuários autenticados).
- Quem tem o link de transferência (e a senha, se houver) baixa o arquivo; o link aparece uma única vez.
- O arquivo é cifrado inteiro em memória (limite de 25 MiB no plano gratuito); streaming fica para arquivos grandes do Premium.
- Os limites por IP/usuário nas Edge Functions são aproximados (por instância).

## MFA (TOTP)

- Opcional por usuário, em Settings: app autenticador (TOTP) via Supabase Auth MFA. Ativar exige escanear o QR code e confirmar um código.
- No login, quem tem MFA ativo precisa informar o código antes de qualquer acesso ao cofre (sessão `aal2`).
- **Aplicado no banco**, não só na interface: políticas RLS *restritivas* em `vault_profiles` e `vault_entries` exigem `aal2` para usuários com fator verificado. Uma sessão só com senha (`aal1`) não lê nem grava o cofre.
- A checagem roda na função `private.vault_mfa_satisfied()` (SECURITY DEFINER, schema não exposto pela API), porque o papel `authenticated` não tem acesso a `auth.mfa_factors`. Ver `20261010000100_fix_mfa_policy_permissions.sql`.
- Sem códigos de backup (o Supabase não os fornece). Perda do autenticador: um administrador remove o fator no painel (Authentication → Users). Recomenda-se aos usuários cadastrar o autenticador em mais de um dispositivo.
- A política `aal2` ainda **não** tem teste automatizado (exige TOTP real); validar manualmente no projeto de desenvolvimento.

## Dados em repouso e em trânsito no cliente

- Nenhum segredo do cofre é gravado em `localStorage`, `sessionStorage` ou IndexedDB. A sessão Supabase usa o armazenamento padrão da biblioteca (token de acesso).
- O cofre trava após 5 minutos de inatividade, no logout, e descarta a DEK e os itens decifrados.
- A cópia de senhas para a área de transferência é limpa após 30 s, se ela ainda contiver o valor copiado e o navegador permitir a leitura.
- Falhas de rede ou de RLS são exibidas como erro. Não há mais fallback silencioso nem sucesso falso.

## Verificações

- **Fraca/reutilizada:** calculadas localmente (zxcvbn-ts e comparação em memória).
- **Exposta:** HIBP Pwned Passwords com k-anonymity (só os 5 primeiros caracteres do SHA-1 saem do dispositivo; cabeçalho `Add-Padding`). Falha de rede aparece como "Check failed", nunca como "seguro".
- **URL (local):** heurísticas no navegador (esquema, IP, punycode, credenciais embutidas, TLD, subdomínios). `href` só aceita http(s).
- **URL (reputação):** Google Safe Browsing Lookup API v4 pela Edge Function `supabase/functions/check-url` (JWT obrigatório, até 50 URLs por chamada, limite de 60 chamadas/hora por usuário; chave só como secret `SAFE_BROWSING_API_KEY`). Proativo **dentro do app**: o site é verificado automaticamente ao salvar um item (se for perigoso, salvar exige confirmação) e todos os sites salvos são verificados em "Run security check". As URLs são enviadas ao Google nessas ações.
  - Safe Browsing é gratuito apenas para uso **não comercial**. Para o produto pago, trocar por Web Risk (o provedor está isolado em `lookupThreats`).
  - "No known threats" não é garantia de segurança.
  - Não verifica links acessados fora do app (navegador, e-mail, outros apps): isso exigiria extensão de navegador ou recursos mobile específicos (fora do escopo do MVP).

## Cabeçalhos (Netlify)

CSP restritiva, HSTS, `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP. Ver `netlify.toml`.

## Limitações conhecidas

- **XSS** em qualquer parte do app expõe o cofre desbloqueado (memória) e o token de sessão. Mitigação: CSP, sem HTML dinâmico, dependências mínimas.
- Metadados de tamanho, quantidade de itens e datas de criação/alteração são visíveis ao servidor.
- MFA é opcional. Sem ele, um atacante com e-mail e senha da conta não lê o cofre (precisa da senha mestra), mas pode apagá-lo.
- Sem proteção contra malware/keylogger no dispositivo do usuário.
- PBKDF2 é resistente a CPU, mas menos que Argon2id contra GPU. A senha mestra deve ser longa (mínimo de 12 caracteres e validação de força no cadastro).
- Sem exportação/importação, compartilhamento, rotação de senhas, notificações ou planos pagos (adiados).
- Tabelas do protótipo antigo (`vault_items`/`secure_links`, texto puro): remoção aprovada; script em `supabase/migrations/20261009000100_drop_legacy_plaintext_tables.sql`.
- Não há revisão externa de segurança. Fazer pentest/revisão antes de armazenar credenciais reais de usuários.
