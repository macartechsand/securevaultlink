import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native app shell (Android now, iOS later). The app ships its own build (dist-mobile/): nothing is
 * loaded from the web at startup, so a tampered website cannot change the app's code.
 * Build: `npm run build:mobile` (see docs/product/mobile-app.md).
 */
const config: CapacitorConfig = {
  appId: 'app.securelink.vault',
  appName: 'SecureLink Vault',
  webDir: 'dist-mobile',
  android: {
    // Served from https://localhost inside the app; no http.
    allowMixedContent: false,
    // Remote WebView inspection is OFF unless explicitly requested for a local test build
    // (SECURELINK_WEBVIEW_DEBUG=1 npx cap sync). Never set it when building the release.
    webContentsDebuggingEnabled: process.env.SECURELINK_WEBVIEW_DEBUG === '1',
    adjustMarginsForEdgeToEdge: 'auto',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
