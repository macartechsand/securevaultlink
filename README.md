# SecureLink Vault

Gerenciador de senhas e proteção digital em evolução para um SaaS Freemium/Premium.

## Estado atual

- **`web-saas/`** — produto principal do MVP (React + Vite + Supabase). Cofre com criptografia no cliente (zero-knowledge).
- **Raiz (Expo / React Native)** — **protótipo legado, congelado.** Não use para guardar senhas reais: o cofre mobile não criptografa os dados e parte das rotinas de criptografia é inválida. Será reconstruído sobre o módulo de criptografia da web.

Progresso e roteiro de testes: `docs/mvp-progress.md`. Ações pendentes: `docs/pending-actions.md`. Segurança e limitações: `docs/security/mvp-security-model.md`.

## Web

```bash
cd web-saas
npm install
npm run dev
```

Copie `web-saas/.env.example` para `web-saas/.env.local` e preencha com os dados do projeto Supabase de **desenvolvimento**.

## Fluxo de desenvolvimento

- Trabalhar em `dev`; abrir PR de `dev` para `main` após validação.
- Manter `.env*` fora do controle de versão.
