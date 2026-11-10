# Glossário

| Termo | Significado |
|---|---|
| **AAD** | *Additional Authenticated Data*. Contexto (usuário, item, versão) amarrado ao texto cifrado no AES-GCM; trocar o contexto faz a decifragem falhar |
| **AAL (aal1, aal2)** | Nível de garantia da autenticação. `aal2` = senha + segundo fator; a RLS exige `aal2` para ler o cofre quando há MFA |
| **Âncora de auditoria** | Hash do último evento da cadeia, guardado fora do banco a cada backup |
| **Controle duplo** | Exigir a aprovação de outra pessoa para acessar um segredo (PAM) |
| **Check-out / check-in** | Retirar um segredo por um prazo, com exclusividade, e devolvê-lo (PAM) |
| **CPM / PSM / PTA** | Componentes da CyberArk: rotação de senhas, isolamento de sessões, analytics de ameaça |
| **DEK** | *Data Encryption Key*. Chave do cofre, aleatória, que embrulha as chaves dos itens |
| **ECDH / ECIES** | Acordo de chaves por curva elíptica; usado para selar a chave de um item para outra pessoa |
| **Edge Function** | Função do Supabase (Deno) que roda no servidor |
| **Embrulhar (wrap)** | Cifrar uma chave com outra chave |
| **HKDF** | Derivação de chaves a partir de material secreto (RFC 5869) |
| **Idira** | Nova marca da CyberArk sob a Palo Alto Networks |
| **JIT** | *Just-in-time*: acesso concedido só quando preciso e por pouco tempo |
| **k-anonimato (HIBP)** | Consultar vazamentos enviando só os 5 primeiros caracteres do hash |
| **KEK** | *Key Encryption Key*. Chave derivada da senha mestra que embrulha a DEK |
| **MV3** | Manifest V3, modelo atual das extensões Chromium |
| **PAM** | *Privileged Access Management*. Gestão de acessos privilegiados |
| **PBKDF2 / Argon2id** | Derivação de chave a partir de senha; o Argon2id também consome memória (resiste a GPU) |
| **PKCE** | Proteção do fluxo OAuth contra interceptação do código |
| **PRF (WebAuthn)** | Extensão que permite a uma passkey derivar uma chave, usada para desbloquear sem senha |
| **RLS** | *Row Level Security* do Postgres: cada linha só é visível para quem a política permite |
| **Secret Key** | Segunda chave aleatória, guardada só nos aparelhos e no Kit de Emergência (modelo do 1Password) |
| **Secured Item** | Item do cofre além de login: nota, segredo, cartão, com campos e anexos (termo do Idira) |
| **Selar** | Cifrar uma chave para a chave pública de alguém |
| **`security definer`** | Função do Postgres que roda com os direitos do dono; aqui sempre com `search_path` vazio |
| **Zero-knowledge** | O fornecedor não consegue ler o conteúdo: só o usuário tem as chaves |
