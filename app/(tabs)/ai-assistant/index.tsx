import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import Colors from '@/constants/Colors';

export default function AIAssistantScreen() {
  // Custom user agent based on platform
  const userAgent = Platform.select({
    ios: 'SecureVault-iOS',
    android: 'SecureVault-Android',
    default: 'SecureVault-Web'
  });

  return (
    <WebView
      source={{ uri: 'https://security-ai.macartech.net' }}
      style={styles.webview}
      userAgent={userAgent}
      startInLoadingState={true}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      scalesPageToFit={true}
      bounces={false}
      scrollEnabled={true}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      mixedContentMode="compatibility"
      allowsInlineMediaPlayback={true}
      mediaPlaybackRequiresUserAction={false}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});