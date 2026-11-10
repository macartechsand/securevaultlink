---
aside: false
pageClass: diagram-page
---

# Arquitetura: visão geral

Diagramas no estilo C4 (contexto, contêineres, fronteiras de confiança). A criptografia está em [Criptografia e chaves](./cryptography) e os passo a passo em [Fluxos](./flows). A comparação com o mercado está na [revisão comparada](./security-architecture-review).

## 1. Contexto

```mermaid
flowchart LR
  user([Usuário ou equipe])
  admin([Administrador da plataforma])
  sv[[SecureLink Vault]]
  hibp[(Have I Been Pwned)]
  gwr[(Google Web Risk)]
  apis[(APIs de rotação<br/>AWS, Microsoft, Google, GitLab, Cloudflare)]
  idp[(Google e GitHub<br/>OAuth)]
  user -- "cofre cifrado no aparelho" --> sv
  admin -- "só metadados" --> sv
  sv -- "5 caracteres do SHA-1 (k-anonimato)" --> hibp
  sv -- "URL do item, pela função check-url" --> gwr
  sv -- "credencial, só na rotação em 1 clique com consentimento" --> apis
  sv -- "login social" --> idp
```

## 2. Contêineres

```mermaid
flowchart TB
  subgraph Clientes["Clientes (onde está a criptografia)"]
    web["App web / PWA<br/>React 19 + Vite"]
    ext["Extensão Chrome/Edge<br/>MV3: service worker, popup,<br/>script de página, iframes"]
    android["App Android<br/>Capacitor 7"]
  end
  subgraph Netlify["Netlify (CDN)"]
    static["Site estático<br/>CSP, HSTS, frame-ancestors none"]
  end
  subgraph Supabase["Supabase, AWS sa-east-1"]
    auth["Auth (GoTrue)<br/>senha, OAuth+PKCE, TOTP aal2"]
    db[("Postgres + RLS<br/>itens, chaves embrulhadas, compartilhamentos,<br/>auditoria encadeada, planos, PIN, uso")]
    storage[("Storage / Cloudflare R2<br/>blocos cifrados")]
    fn["Edge Functions (Deno)<br/>account, admin, check-url,<br/>cleanup-files, rotate, storage-r2, transfer"]
    cron["pg_cron<br/>limpeza de arquivos e da lixeira"]
  end
  web --> static
  web -- "JWT" --> auth
  web -- "REST (PostgREST) + RLS" --> db
  web -- "URLs assinadas" --> storage
  web --> fn
  ext -- "JWT próprio" --> auth
  ext --> db
  android --> auth
  android --> db
  fn --> db
  fn --> storage
  cron --> db
```

## 3. Fronteiras de confiança

```mermaid
flowchart LR
  subgraph T0["Confiável: aparelho do usuário desbloqueado"]
    mem["DEK e chaves dos itens<br/>só em memória"]
  end
  subgraph T1["Semi-confiável: página visitada"]
    page["Script de página da extensão<br/>nunca recebe segredos"]
  end
  subgraph T2["Não confiável para conteúdo: servidor"]
    srv["Supabase e Netlify<br/>guardam e entregam texto cifrado"]
  end
  subgraph T3["Terceiros"]
    third["HIBP, Web Risk, APIs de rotação, OAuth"]
  end
  mem -- "texto cifrado + JWT" --> srv
  mem -- "credencial só após checar o site" --> page
  srv -- "consultas sem conteúdo do cofre" --> third
  mem -. "rotação em 1 clique: credencial por TLS,<br/>consentimento por item" .-> srv
```

| Fronteira | Ameaça | Controle |
|---|---|---|
| Aparelho e servidor | Servidor ou banco comprometido | Zero-knowledge: só texto cifrado, chave por item, RLS e auditoria encadeada |
| Aparelho e página | Página maliciosa ou clickjacking | Script de página sem segredos, iframes da extensão, Intersection Observer v2, remetente conferido, preenchimento só no mesmo site |
| Servidor e terceiros | Vazamento por consulta | k-anonimato no HIBP; só a URL vai ao Web Risk; a rotação é a exceção documentada |
| Operador e produção | Computador do dono comprometido | Bloqueio B2: chaves físicas, cofre para os segredos, publicação só pela CI |
| Entrega do código web | Deploy malicioso | Script de publicação verificado; B8: CI com tag assinada e hash do bundle |

## 4. Ambientes e publicação

```mermaid
flowchart LR
  dev[branch dev] -->|CI: lint, testes, audit, Gitleaks, CodeQL| pr{PR dev → master}
  dev -->|engenheiros: netlify deploy --no-build| devsite[securelinkvaultdev.netlify.app<br/>Supabase dev]
  pr -->|dono| master[branch master]
  master -->|"dono: node scripts/deploy-prod-site.mjs<br/>(build de produção conferido, --no-build)"| prodsite[securelinkvault.netlify.app<br/>Supabase prod]
  master -->|"dono: build-prod-extension.mjs"| extzip[zip da extensão de produção]
  master -->|"dono: SQL Editor"| prodsql[(migrations na produção)]
```

## 5. Modelo de dados (simplificado)

```mermaid
erDiagram
  USERS ||--|| VAULT_PROFILES : "DEK embrulhada"
  USERS ||--o| USER_KEYS : "par ECDH (privada embrulhada)"
  USERS ||--o{ VAULT_ENTRIES : "itens cifrados"
  VAULT_ENTRIES ||--o{ ITEM_SHARES : "chave selada por destinatário"
  VAULT_ENTRIES ||--o{ ITEM_USAGE : "último uso cifrado"
  USERS ||--o{ VAULT_FILES : "arquivos cifrados"
  VAULT_FILES ||--o{ FILE_SHARES : "chave selada"
  VAULT_FILES ||--o{ TRANSFERS : "link com chave no #"
  USERS ||--o{ AUDIT_EVENTS : "só acréscimo, cadeia SHA-256"
  USERS ||--o| USER_PLANS : "free ou premium"
  USERS ||--o{ PIN_UNLOCK : "verificador + parte da chave (privado)"
```
