export default {
  name: 'SecureLink Vault',
  slug: 'securelink-vault',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#2196F3'
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.macartech.securelinkapp',
    buildNumber: '1',
    infoPlist: {
      NSFaceIDUsageDescription: 'Este app usa Face ID/Touch ID para autenticação segura',
      NSCameraUsageDescription: 'Este app usa a câmera para escanear QR codes de compartilhamento',
      NSPhotoLibraryUsageDescription: 'Este app usa a galeria para importar/exportar backups'
    },
    config: {
      usesNonExemptEncryption: false
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#2196F3'
    },
    package: 'com.yourcompany.securelinkapp',
    permissions: [
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT'
    ],
    softwareKeyboardLayoutMode: 'pan'
  },
  web: {
    favicon: './assets/favicon.png'
  },
  plugins: [
    'expo-router',
    'expo-local-authentication',
    'expo-secure-store',
    'expo-crypto',
    'expo-clipboard',
    'expo-file-system'
  ],
  scheme: 'securelinkapp',
  extra: {
    firebaseApiKey: process.env.FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: process.env.FIREBASE_APP_ID,
    eas: {
      projectId: '1macartetest'
    }
  },
  updates: {
    fallbackToCacheTimeout: 0,
    url: 'https://u.expo.dev/1macartetest'
  },
  runtimeVersion: {
    policy: 'sdkVersion'
  }
}; 