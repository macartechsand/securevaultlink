import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Shield, LockKeyhole, Fingerprint, ArrowRight } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';

export default function AuthScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { 
    isAuthenticated, 
    isBiometricSupported, 
    isBiometricEnabled,
    authenticateWithBiometric, 
    authenticateWithPassword 
  } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)/passwords');
    }
    
    // Try biometric auth if enabled
    if (isBiometricSupported && isBiometricEnabled) {
      handleBiometricAuth();
    }
  }, [isAuthenticated, isBiometricSupported, isBiometricEnabled]);

  const handleLogin = async () => {
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const success = await authenticateWithPassword(password);
      if (!success) {
        setError('Incorrect password. Please try again.');
      }
    } catch (err) {
      setError('Authentication failed. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    if (!isBiometricSupported) {
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      await authenticateWithBiometric();
      // If authentication is successful, the hook will update isAuthenticated
      // which will trigger the redirection in the useEffect
    } catch (err) {
      console.error('Biometric auth error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      
      <View style={styles.logoContainer}>
        <View style={styles.logoBackground}>
          <Shield size={40} color={Colors.primary} />
        </View>
        <Text style={styles.logoText}>SecureLink Vault</Text>
        <Text style={styles.tagline}>Your digital security guardian</Text>
      </View>
      
      <View style={styles.formContainer}>
        <Text style={styles.welcomeText}>Welcome back</Text>
        <Text style={styles.instructionsText}>Enter your password to continue</Text>
        
        <View style={styles.inputContainer}>
          <LockKeyhole size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.gray}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
          />
        </View>
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        
        <TouchableOpacity 
          style={styles.loginButton} 
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <>
              <Text style={styles.loginButtonText}>Sign In</Text>
              <ArrowRight size={18} color={Colors.text} />
            </>
          )}
        </TouchableOpacity>
        
        {isBiometricSupported && (
          <TouchableOpacity 
            style={styles.biometricButton} 
            onPress={handleBiometricAuth}
            disabled={isLoading}
          >
            <Fingerprint size={24} color={Colors.primary} />
            <Text style={styles.biometricText}>Sign in with biometrics</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.demoNote}>
        <Text style={styles.demoNoteText}>Demo credentials: "securepass123"</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  logoBackground: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  tagline: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  formContainer: {
    width: '100%',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  instructionsText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    height: 40,
    color: Colors.text,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  errorText: {
    color: Colors.danger,
    marginBottom: 16,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  biometricText: {
    color: Colors.primary,
    fontSize: 16,
    marginLeft: 8,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  demoNote: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  demoNoteText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
  },
});