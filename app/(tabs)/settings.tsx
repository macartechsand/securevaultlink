import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Switch, TouchableOpacity,
  ScrollView, Alert
} from 'react-native';
import {
  User, Shield, Lock, Bell, Key,
  LogOut, ChevronRight, Crown
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { usePasswordManager } from '@/hooks/usePasswordManager';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const { isBiometricSupported, isBiometricEnabled, toggleBiometric, logout } = useAuth();
  const { userPlan } = usePasswordManager();

  const [autoLock, setAutoLock] = useState(true);
  const [notifications, setNotifications] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const autoLockValue = await AsyncStorage.getItem('autoLock');
      const notificationsValue = await AsyncStorage.getItem('notifications');
      if (autoLockValue !== null) setAutoLock(autoLockValue === 'true');
      if (notificationsValue !== null) setNotifications(notificationsValue === 'true');
    };
    loadSettings();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('autoLock', autoLock.toString());
  }, [autoLock]);

  useEffect(() => {
    AsyncStorage.setItem('notifications', notifications.toString());
  }, [notifications]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            logout();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  const handleUpgrade = () => {
    router.push('/modal/premium');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Account Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <User size={18} color={Colors.textSecondary} />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <View style={styles.subscriptionCard}>
          <View style={styles.subscriptionHeader}>
            <View style={[
              styles.crownIconContainer,
              { borderColor: userPlan === 'premium' ? Colors.warning : Colors.border }
            ]}>
              <Crown
                size={24}
                color={userPlan === 'premium' ? Colors.warning : Colors.gray}
                fill={userPlan === 'premium' ? Colors.warning : 'transparent'}
              />
            </View>
            <View>
              <Text style={styles.planName}>
                {userPlan === 'premium' ? 'Premium Plan' : 'Free Plan'}
              </Text>
              <Text style={styles.planDescription}>
                {userPlan === 'premium'
                  ? 'You have access to all premium features'
                  : 'Upgrade to unlock all features'}
              </Text>
            </View>
          </View>

          {userPlan === 'free' && (
            <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
              <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingLabel}>Email</Text>
          <View style={styles.settingValueContainer}>
            <Text style={styles.settingValue}>demo@securevault.com</Text>
            <ChevronRight size={18} color={Colors.gray} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingLabel}>Change Password</Text>
          <ChevronRight size={18} color={Colors.gray} />
        </TouchableOpacity>
      </View>

      {/* Security Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Shield size={18} color={Colors.textSecondary} />
          <Text style={styles.sectionTitle}>Security</Text>
        </View>

        {isBiometricSupported && (
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Biometric Authentication</Text>
            <Switch
              value={isBiometricEnabled}
              onValueChange={toggleBiometric}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        )}

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Auto-Lock App</Text>
          <Switch
            value={autoLock}
            onValueChange={setAutoLock}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.text}
          />
        </View>

        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingLabel}>Auto-Lock Timeout</Text>
          <View style={styles.settingValueContainer}>
            <Text style={styles.settingValue}>1 minute</Text>
            <ChevronRight size={18} color={Colors.gray} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Bell size={18} color={Colors.textSecondary} />
          <Text style={styles.sectionTitle}>Notifications</Text>
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Security Alerts</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.text}
          />
        </View>
      </View>

      {/* Data Management Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Lock size={18} color={Colors.textSecondary} />
          <Text style={styles.sectionTitle}>Data Management</Text>
        </View>

        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingLabel}>Export Passwords</Text>
          <ChevronRight size={18} color={Colors.gray} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingLabel}>Import Passwords</Text>
          <ChevronRight size={18} color={Colors.gray} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.settingItem, styles.dangerItem]}>
          <Text style={[styles.settingLabel, styles.dangerText]}>Clear All Data</Text>
          <ChevronRight size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Key size={18} color={Colors.textSecondary} />
          <Text style={styles.sectionTitle}>About</Text>
        </View>

        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingLabel}>Privacy Policy</Text>
          <ChevronRight size={18} color={Colors.gray} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingLabel}>Terms of Service</Text>
          <ChevronRight size={18} color={Colors.gray} />
        </TouchableOpacity>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>App Version</Text>
          <Text style={styles.versionText}>1.0.0</Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <LogOut size={20} color={Colors.text} />
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 10,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  subscriptionCard: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  crownIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  planDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  upgradeButton: {
    backgroundColor: Colors.warning,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: Colors.background,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingLabel: {
    fontSize: 15,
    color: Colors.text,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  settingValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginRight: 8,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  dangerItem: {
    borderBottomWidth: 0,
  },
  dangerText: {
    color: Colors.danger,
  },
  versionText: {
    fontSize: 14,
    color: Colors.gray,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: Colors.danger,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  logoutButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
});
