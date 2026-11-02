# App para celular: objetivo, arquitetura e fases

> Especificação de 2026-11-01. **Fase 1 (Android) implementada**: seções 7 e 8. Base: [`open-source-and-business.md`](open-source-and-business.md), seção 2 (uma base de código: React + WebCrypto em web, PWA, extensão e apps).

## 1. Objetivo

Levar o cofre para o celular como **app instalável** (Android primeiro, iOS em seguida), com a **mesma criptografia de ponta a ponta** do app web e sem uma segunda implementação. O app empacota o próprio código: ele não baixa o site a cada abertura.

Isso também reduz o maior risco do cofre web ([`../security/access-recertification.md`](../security/access-recertification.md), risco 1): um site adulterado no Netlify não afeta quem usa o app, porque o código vem do pacote assinado.

## 2. Abordagem: Capacitor

| Opção | Decisão |
|---|---|
| **Capacitor 7** (app React atual dentro de um app nativo) | **Escolhida.** Reaproveita 100% do código e dos testes; WebCrypto funciona no WebView |
| App Expo legado da raiz | Descartado: usa Firebase e outra criptografia |
| Reescrever em React Native | Descartado agora: duplicaria interface e criptografia |

Versões fixadas: `@capacitor/core`, `cli` e `android` 7.6.9; plugins oficiais `app` 7.1.2, `browser` 7.0.5, `filesystem` 7.1.9 e `share` 7.0.4. São compatíveis com o Android SDK 35 e o Java 21 já instalados. O Capacitor 8 exigiria o SDK 36.

## 3. Requisitos de segurança

1. **Mesmo modelo criptográfico.** Chaves só em memória; bloqueio automático do app web (5 min sem uso) e **bloqueio ao ir para segundo plano** por mais de **1 minuto**.
2. **Sem captura de tela.** `FLAG_SECURE` no Android impede capturas, gravações e a miniatura nos apps recentes. No iOS, a tela fica coberta no seletor de apps.
3. **Sem backup do sistema.** `allowBackup=false` e regras de extração vazias: os dados do app (sessão) não vão para o backup do Google.
4. **Sem depuração na versão de produção.** WebView sem inspeção remota na build release, e sem tráfego `http`.
5. **Código assinado.** O APK de produção é assinado com uma chave própria, guardada fora do repositório.
6. **Login social com PKCE.** Google e GitHub abrem no navegador do sistema (Custom Tabs), que volta ao app por `app.securelink.vault://auth-callback`. O `code_verifier` fica só no app, então um código interceptado por outro app não serve. Fase 2: App Links verificados (`https`) no lugar do esquema próprio.
7. **Arquivos.** O download decifra o arquivo no app, grava no cache privado e abre "Compartilhar/Salvar" do sistema. Depois do compartilhamento, a cópia temporária é apagada.

## 4. Fases

### Fase 1: Android (MVP)
| # | Entrega | Critério de aceite |
|---|---|---|
| 1 | Projeto Android (`web-saas/android/`) com o app empacotado | Abre, entra, desbloqueia e usa todas as telas do app web |
| 2 | Builds para desenvolvimento e produção | Cada APK fala só com o seu projeto Supabase |
| 3 | Bloqueio ao ir para segundo plano (1 min) | Voltar depois de 1 min pede a senha mestra |
| 4 | `FLAG_SECURE`, sem backup, sem depuração na release | Captura de tela bloqueada; `adb backup` vazio |
| 5 | Login Google/GitHub pelo navegador do sistema | Volta ao app já autenticado |
| 6 | Download de arquivos e anexos pelo "Compartilhar" do sistema | Arquivo íntegro; cópia temporária apagada |
| 7 | APK release assinado para o piloto (instalação direta) | Instala em Android 8+ |

### Fase 2
- **Desbloqueio por biometria.** Uma chave do Android Keystore que só funciona após a digital ou o rosto embrulha a DEK; a senha mestra continua necessária a cada 7 dias.
- App Links verificados para o OAuth.
- Publicação na Play Store, no teste interno.

### Fase 3
- **Autopreenchimento nativo:** Android Autofill Service e iOS AutoFill Credential Provider.
- **iOS:** precisa de um Mac ou de build na nuvem, e de conta Apple Developer (US$ 99/ano).

## 5. Fora do escopo da fase 1
Biometria, autopreenchimento em outros apps, iOS, publicação nas lojas e notificações push.

## 6. Decisões (padrões adotados; ajuste se quiser)
| Decisão | Padrão |
|---|---|
| Identificador do app | `app.securelink.vault` |
| Plataforma inicial | Android (o iOS exige Mac ou build na nuvem) |
| Bloqueio em segundo plano | Após 1 minuto (dá tempo de copiar uma senha e colar em outro app) |
| Distribuição no piloto | APK assinado enviado por mensagem direta; Play Store na fase 2 (taxa única de US$ 25) |

## 7. Situação da fase 1 (2026-11-01)

| # | Entrega | Situação e evidência |
|---|---|---|
| 1 | Projeto Android com o app empacotado | ✅ `web-saas/android/`. Emulador Android 13: entrar, desbloquear, visão geral, cofre e "Mais" funcionando com os dados reais da conta de teste |
| 2 | Builds de desenvolvimento e produção | ✅ O APK fala só com o projeto do build (conferido no pacote: ref de produção presente, de desenvolvimento ausente) |
| 3 | Bloqueio em segundo plano | ✅ 10 s em segundo plano: continua aberto; 65 s: pede a senha mestra |
| 4 | Captura bloqueada, sem backup, sem depuração | ✅ Na release instalada num Android 16 de usuário (`ro.debuggable=0`): janela com `SECURE`, nenhum socket de depuração, `run-as` recusado, `bmgr backupnow` responde "Backup is not allowed" |
| 5 | Login Google/GitHub pelo navegador do sistema | 🟡 Implementado (deep link `app.securelink.vault://auth-callback`, leitura do retorno com testes). Falta testar com conta real depois de incluir o endereço nas Redirect URLs do Supabase |
| 6 | Download de arquivos | ✅ Arquivo decifrado, menu "Compartilhar" do Android; a cópia temporária existe enquanto o menu está aberto e é apagada ao fechar; cancelar não mostra erro |
| 7 | APK release assinado | ✅ `~/.securelink-prod/securelink-vault-0.9.0.apk` (produção, versão 0.9.0, Android 8+). Chave de assinatura em `~/.securelink-prod/` |

**Correções feitas durante o teste:**
- **Depuração do WebView:** passou a ficar desligada por padrão, inclusive com chamada explícita no código nativo da release. Só um build local com `SECURELINK_WEBVIEW_DEBUG=1` liga.
- **Tela de Arquivos:** uma falha na chave de compartilhamento escondia também os arquivos próprios. Agora ela afeta só "Compartilhados comigo".
- **`color-mix`:** WebViews antigos não entendem essa função, então ganhou uma cor sólida alternativa.
- **Ícone e abertura:** os padrões do Capacitor foram trocados pelo escudo do SecureLink, em todas as densidades.

**Pendente de conferência num aparelho real:** layout no Android 15/16 com "edge-to-edge" obrigatório. O emulador do Android 16 sem GPU ficou lento demais para capturar a tela.

## 8. Como gerar e instalar

Ferramentas: Android Studio (com o Java dele, `jbr`) e o Android SDK 35.

```powershell
cd web-saas
# 1. Build web do app (usa .env.local = desenvolvimento; para produção, defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY da produção no terminal antes)
npx vite build --outDir dist-mobile --emptyOutDir
npx cap sync android
# 2. APK
cd android
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleRelease     # assinado com ~/.securelink-prod/android-signing.properties
.\gradlew.bat assembleDebug       # só para testes locais
```

- **Instalar no piloto:** envie o APK de `~/.securelink-prod/` por mensagem direta. No celular: abrir o arquivo → permitir "instalar apps desconhecidos" para o app usado → Instalar. Informe o SHA-256 do arquivo para a pessoa conferir.
- **Chave de assinatura** (`securelink-release.jks` e `android-signing.properties`): guarde uma cópia no envelope de emergência. Sem ela, versões novas não instalam por cima das antigas.
- **Ícones:** `node scripts/make-icons.mjs` gera os da PWA e os do Android.
- **Dependências:** `npm audit` aponta um alerta moderado no `minimatch`, dependência da CLI do Capacitor. Ela só roda no build e não vai para o app; risco aceito até a CLI atualizar.
