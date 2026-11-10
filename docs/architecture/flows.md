---
aside: false
pageClass: diagram-page
---

# Fluxos (diagramas de sequência)

Úteis para o desenvolvimento e para o pentest: cada passo mostra **o que atravessa a rede** e quem decide.

## Entrar e desbloquear

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuário
  participant C as App (navegador)
  participant A as Supabase Auth
  participant D as Postgres (RLS)
  U->>C: e-mail + senha da conta
  C->>A: signInWithPassword
  A-->>C: JWT (aal1)
  opt MFA ativo
    U->>C: código TOTP
    C->>A: challengeAndVerify
    A-->>C: JWT (aal2)
  end
  C->>D: vault_profiles (RLS: aal2 se houver MFA)
  D-->>C: sal, parâmetros do KDF, DEK embrulhada
  U->>C: senha mestra
  Note over C: PBKDF2 → KEK → desembrulha a DEK (só em memória)
  C->>D: vault_entries (RLS: próprios + compartilhados)
  D-->>C: itens cifrados
  Note over C: DEK → chave do item → item em claro (só em memória)
```

## Salvar um item

```mermaid
sequenceDiagram
  participant C as App
  participant D as Postgres
  Note over C: gera ou usa a chave do item, AES-GCM com AAD (usuário, item, versão)
  C->>D: update vault_entries set ciphertext, iv where id = ? and updated_at = ?
  alt alguém editou antes
    D-->>C: 0 linhas → conflito, recarregar
  else ok
    D-->>C: nova linha (updated_at do servidor)
    Note over D: gatilho grava 'vault.entry_updated' na cadeia de auditoria
  end
```

## Compartilhar e revogar

```mermaid
sequenceDiagram
  participant O as Dono (cliente)
  participant D as Postgres
  participant R as Destinatário (cliente)
  O->>D: find_share_recipient(e-mail)
  D-->>O: chave pública do destinatário
  Note over O: ECDH efêmero + HKDF → sela a chave do item
  O->>D: insert item_shares(sealed_key, permissão, prazo)
  R->>D: select vault_entries (RLS: destinatário com prazo válido e item fora da lixeira)
  D-->>R: item cifrado + chave selada
  Note over R: abre a chave com a chave privada → decifra o item
  O->>D: revogar
  Note over O: gira a chave do item, recifra e ressela para quem continua
```

## Preencher pela extensão

```mermaid
sequenceDiagram
  participant P as Página (script de página)
  participant F as Iframe da extensão (menu)
  participant S as Service worker
  P->>S: cs.focus (campo de login), sem segredos
  S-->>P: token de uso único (sessão)
  P->>F: abre inline.html#token
  F->>S: fr.inlineData(token)
  S-->>F: títulos e usuários do mesmo site
  Note over F: clique conferido pelo Intersection Observer v2
  F->>S: fr.inlineFill(token, item)
  Note over S: confere: item do site, aba no mesmo site, https se o item é https
  S->>P: executeScript(fillLoginFields) só no frame verificado
  S-->>S: auditoria 'item.filled' (só id) + uso cifrado (Premium)
```

## Desbloquear com PIN

```mermaid
sequenceDiagram
  participant C as App
  participant D as Postgres (pin_unlock)
  C->>C: PBKDF2(PIN, sal do aparelho) → verificador, metade do aparelho
  C->>D: pin_unlock(aparelho, verificador)
  alt certo
    D-->>C: parte do servidor (zera as tentativas)
    C->>C: HKDF(metade + parte) → desembrulha a DEK
  else errado
    D-->>C: restantes = 5 − tentativas
  else 5º erro ou vencido
    D-->>C: locked / expired (registro apagado → senha mestra)
  end
```

## Rotação em 1 clique (exceção ao zero-knowledge)

```mermaid
sequenceDiagram
  participant C as App
  participant F as Função rotate
  participant P as API do provedor
  Note over C: item com consentimento de rotação automática, plano Premium
  C->>F: credencial atual (TLS), JWT aal2
  F->>F: confere plano, interruptor da plataforma, MFA e limite por hora
  F->>P: cria a credencial nova
  F->>P: verifica a nova
  F-->>C: credencial nova (nada gravado, nada no log)
  C->>C: recifra e salva no cofre
  C->>F: revoke_old (assinado com a nova)
```

## Auditoria encadeada

```mermaid
flowchart LR
  e1["evento n−1<br/>row_hash = H(prev, dados)"] --> e2["evento n<br/>prev_hash = row_hash(n−1)"] --> e3["evento n+1"]
  e3 -.-> anchor["Âncora no backup<br/>(audit-anchors.jsonl)"]
  anchor -.-> verify["verify-anchors.mjs e<br/>'Verificar log' no painel"]
```
