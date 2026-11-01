# SecureLink Vault: extensão de navegador (Chrome e Edge)

Preenche logins do cofre nos sites, com a mesma criptografia de ponta a ponta do app web. Especificação: [`docs/product/browser-extension.md`](../../docs/product/browser-extension.md).

## Build

```powershell
cd web-saas
npm run build:ext          # gera dist-extension/ (usa VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do .env.local)
```

Para gerar contra o projeto de **produção**, crie `web-saas/.env.production.local` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_WEB_APP_URL` (endereço do app web) de produção; ele tem prioridade sobre o `.env.local` no `npm run build:ext`. A única permissão de rede do pacote é o Supabase configurado ali. **Atenção:** esse arquivo também vale para o `npm run build` do app web; apague-o depois de gerar o pacote de produção para não publicar o site de desenvolvimento apontando para a produção.

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
