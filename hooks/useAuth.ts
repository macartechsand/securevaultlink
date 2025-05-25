import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [hasInitialized, setHasInitialized] = useState<boolean>(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState<boolean>(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState<boolean>(false);

  useEffect(() => {
    const initialize = async () => {
      // Check if the device supports biometric authentication
      if (Platform.OS !== 'web') {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        setIsBiometricSupported(compatible);
        
        // Check if user enabled biometric
        const biometricEnabled = await AsyncStorage.getItem('useBiometric');
        setIsBiometricEnabled(biometricEnabled === 'true');
      }
      
      // Check if user was previously authenticated in this session
      const auth = await AsyncStorage.getItem('isAuthenticated');
      if (auth === 'true') {
        setIsAuthenticated(true);
      }
      
      setHasInitialized(true);
    };
    
    initialize();
  }, []);

  const authenticateWithBiometric = async () => {
    if (Platform.OS === 'web' || !isBiometricSupported) {
      return false;
    }
    
    try {
      const results = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access SecureLink Vault',
        fallbackLabel: 'Use PIN',
      });
      
      if (results.success) {
        await AsyncStorage.setItem('isAuthenticated', 'true');
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Biometric auth error:', error);
      return false;
    }
  };

  const authenticateWithPassword = async (password: string) => {
    // In a real app, you would validate against a securely stored password
    // This is a placeholder for demonstration purposes
    const demoPassword = 'securepass123';
    
    if (password === demoPassword) {
      await AsyncStorage.setItem('isAuthenticated', 'true');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };

  const toggleBiometric = async (enabled: boolean) => {
    await AsyncStorage.setItem('useBiometric', enabled ? 'true' : 'false');
    setIsBiometricEnabled(enabled);
  };

  return {
    isAuthenticated,
    hasInitialized,
    isBiometricSupported,
    isBiometricEnabled,
    authenticateWithBiometric,
    authenticateWithPassword,
    logout,
    toggleBiometric,
  };
}