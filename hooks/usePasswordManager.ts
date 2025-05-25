import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Password, UserPlan } from '@/types';

const STORAGE_KEY = 'passwords';
const PLAN_KEY = 'userPlan';

export function usePasswordManager() {
  const [passwords, setPasswords] = useState<Password[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan>('free');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        // Load user plan first
        const plan = await AsyncStorage.getItem(PLAN_KEY);
        if (plan) {
          setUserPlan(plan as UserPlan);
        }

        // Then load passwords
        const storedPasswords = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedPasswords) {
          setPasswords(JSON.parse(storedPasswords));
        }
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initialize();
  }, []);

  const savePasswords = async (updatedPasswords: Password[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPasswords));
      setPasswords(updatedPasswords);
      return true;
    } catch (err) {
      setError('Failed to save passwords');
      console.error(err);
      return false;
    }
  };

  const addPassword = async (passwordData: Omit<Password, 'id' | 'createdAt' | 'updatedAt' | 'favorite'>) => {
    try {
      // For free plan, limit to 10 passwords
      if (userPlan === 'free' && passwords.length >= 10) {
        return { success: false, error: 'free_limit_reached' };
      }
      
      const timestamp = Date.now();
      const newPassword: Password = {
        ...passwordData,
        id: Crypto.randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
        favorite: false,
      };
      
      const updatedPasswords = [...passwords, newPassword];
      const saved = await savePasswords(updatedPasswords);
      
      if (!saved) {
        return { success: false, error: 'save_failed' };
      }
      
      return { success: true, password: newPassword };
    } catch (err) {
      setError('Failed to add password');
      console.error(err);
      return { success: false, error: 'unknown_error' };
    }
  };

  const updatePassword = async (id: string, updates: Partial<Omit<Password, 'id' | 'createdAt'>>) => {
    try {
      const index = passwords.findIndex(p => p.id === id);
      if (index === -1) {
        return { success: false, error: 'not_found' };
      }
      
      const updatedPassword = {
        ...passwords[index],
        ...updates,
        updatedAt: Date.now(),
      };
      
      const updatedPasswords = [...passwords];
      updatedPasswords[index] = updatedPassword;
      
      const saved = await savePasswords(updatedPasswords);
      
      if (!saved) {
        return { success: false, error: 'save_failed' };
      }
      
      return { success: true, password: updatedPassword };
    } catch (err) {
      setError('Failed to update password');
      console.error(err);
      return { success: false, error: 'unknown_error' };
    }
  };

  const deletePassword = async (id: string) => {
    try {
      const updatedPasswords = passwords.filter(p => p.id !== id);
      const saved = await savePasswords(updatedPasswords);
      
      if (!saved) {
        return { success: false, error: 'save_failed' };
      }
      
      return { success: true };
    } catch (err) {
      setError('Failed to delete password');
      console.error(err);
      return { success: false, error: 'unknown_error' };
    }
  };

  const toggleFavorite = async (id: string) => {
    try {
      const index = passwords.findIndex(p => p.id === id);
      if (index === -1) {
        return { success: false, error: 'not_found' };
      }
      
      const updatedPassword = {
        ...passwords[index],
        favorite: !passwords[index].favorite,
        updatedAt: Date.now(),
      };
      
      const updatedPasswords = [...passwords];
      updatedPasswords[index] = updatedPassword;
      
      const saved = await savePasswords(updatedPasswords);
      
      if (!saved) {
        return { success: false, error: 'save_failed' };
      }
      
      return { success: true, password: updatedPassword };
    } catch (err) {
      setError('Failed to update favorite status');
      console.error(err);
      return { success: false, error: 'unknown_error' };
    }
  };

  const getPasswordById = (id: string) => {
    return passwords.find(p => p.id === id) || null;
  };

  const upgradeUserPlan = async () => {
    try {
      await AsyncStorage.setItem(PLAN_KEY, 'premium');
      setUserPlan('premium');
      return { success: true };
    } catch (err) {
      console.error('Failed to upgrade plan:', err);
      return { success: false, error: 'upgrade_failed' };
    }
  };

  return {
    passwords,
    loading,
    error,
    userPlan,
    initialized,
    addPassword,
    updatePassword,
    deletePassword,
    toggleFavorite,
    getPasswordById,
    upgradeUserPlan,
  };
}