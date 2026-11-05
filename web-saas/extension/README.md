# SecureLink Vault: extensão de navegador (Chrome e Edge)

Preenche logins do cofre nos sites, com a mesma criptografia de ponta a ponta do app web. Especificação: [`docs/product/browser-extension.md`](../../docs/product/browser-extension.md).

## Build

```powershell
cd web-saas
npm run build:ext          # gera dist-extension/ (usa VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do .env.local)
```

O `npm run build:ext` gera a extensão de **desenvolvimento** (`dist-extension`, projeto e site de dev). Para a **produção**, use só, a partir da raiz:

```powershell
node scripts/build-prod-extension.mjs
```

Ele monta com o projeto e o site de produção em `web-saas/dist-extension-prod`, recusa o pacote se houver qualquer referência ao dev, confere que a única permissão de rede é o Supabase de produção e gera `~/.securelink-prod/securelink-extension-prod.zip`. As duas versões têm o mesmo ID: o navegador só pode ter uma delas carregada por vez.

## Login com Google e GitHub

A extensão usa o mesmo login social do app web. Uma configuração única por projeto Supabase:

1. Supabase → **Authentication → URL Configuration → Redirect URLs** → **Add URL**:
   `https://mcljapeloopnadipmhmojkmbjjgbpdij.chromiumapp.org/`
2. Salvar. Os provedores Google e GitHub já configurados para o app web servem para a extensão; não é preciso mexer neles.

Sem esse passo, o Supabase devolve o login para o site do app em vez da extensão e a janela não fecha.

O ID `mcljapeloopnadipmhmojkmbjjgbpdij` é fixo para instalações sem loja (chave pública em `manifest-key.json`). Para as lojas, gere com `npx vite build -c extension/vite.config.ts --mode store` (sem a chave; a loja atribui o ID) e acrescente `https://<id-da-loja>.chromiumapp.org/` às Redirect URLs.

## Instalar no beta (sem loja)

1. Edge: `edge://extensions` (Chrome: `chrome://extensions`).
2. Ligue o **Modo de desenvolvedor**.
3. **Carregar sem compactação** → escolha a pasta `web-saas/dist-extension`.
4. Fixe o ícone na barra. Atalho de preenchimento: `Ctrl+Shift+L` (troque em `edge://extensions/shortcuts`).

Para distribuir aos usuários do beta, compacte a pasta (`Compress-Archive dist-extension\* securelink-extension.zip`). Eles carregam a pasta extraída da mesma forma. Para a loja, envie o mesmo `.zip` como item **não listado**.

## Testes

```powershell
npm test -- extension            # regras de domínio (phishing, sufixos públicos, IP, http/https)
npm run build:ext:test           # build com permissão para localhost, só para o teste abaixo
npm run test:ext:e2e             # Edge real + projeto de desenvolvimento + conta de teste A
```

O teste ponta a ponta substitui o cofre da conta de teste A (como `session.integration`) e apaga os itens que criou.

## Estrutura

| Arquivo | Papel |
|---|---|
| `src/background.ts` | Único lugar com chaves e itens decifrados; sessão, bloqueio, preenchimento |
| `src/domainMatch.ts` | Regras de correspondência de domínio (anti-phishing) |
| `src/pageScripts.ts` | Funções injetadas na página: localizar campos (sem segredos) e preencher (um frame) |
| `src/popup/` | Interface (React, mesmo `theme.css` do app) |
| `src/offscreen.ts` | Limpa a área de transferência 30 s depois de copiar uma senha |
| `src/supabase.ts` | Cliente Supabase da extensão (sessão em `chrome.storage.local`) |
| `vite.config.ts` | Build e `manifest.json` (permissões mínimas) |
