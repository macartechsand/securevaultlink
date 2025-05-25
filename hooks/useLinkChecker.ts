import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { LinkCheckResult, UserPlan } from '@/types';

export function useLinkChecker() {
  const [linkChecks, setLinkChecks] = useState<LinkCheckResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userPlan, setUserPlan] = useState<UserPlan>('free');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        // Load user plan first
        const plan = await AsyncStorage.getItem('userPlan');
        if (plan) {
          setUserPlan(plan as UserPlan);
        }

        // Then load link checks
        const storedLinkChecks = await AsyncStorage.getItem('linkChecks');
        if (storedLinkChecks) {
          setLinkChecks(JSON.parse(storedLinkChecks));
        }
      } catch (err) {
        console.error('Failed to load data', err);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initialize();
  }, []);

  const saveLinkChecks = async (updatedLinkChecks: LinkCheckResult[]) => {
    try {
      await AsyncStorage.setItem('linkChecks', JSON.stringify(updatedLinkChecks));
      setLinkChecks(updatedLinkChecks);
    } catch (err) {
      console.error('Failed to save link checks', err);
    }
  };

  const checkLink = async (url: string) => {
    try {
      // Create initial check result with "checking" status
      const timestamp = Date.now();
      const newCheck: LinkCheckResult = {
        id: Crypto.randomUUID(),
        url,
        safeStatus: 'checking',
        checkedAt: timestamp,
      };
      
      // Save to storage immediately with checking status
      const updatedLinkChecks = [newCheck, ...linkChecks];
      await saveLinkChecks(updatedLinkChecks);
      
      // Simulate API call to check link safety
      // In a real app, you would call an actual API like VirusTotal
      setTimeout(async () => {
        const result = simulateLinkCheck(url);
        
        // Update the link check with results
        const index = updatedLinkChecks.findIndex(check => check.id === newCheck.id);
        if (index !== -1) {
          const updated = {
            ...updatedLinkChecks[index],
            safeStatus: result.safeStatus,
            details: result.details,
            checkedAt: Date.now(),
          };
          
          updatedLinkChecks[index] = updated;
          await saveLinkChecks(updatedLinkChecks);
        }
      }, 1500);
      
      return { success: true, linkCheck: newCheck };
    } catch (err) {
      console.error('Failed to check link', err);
      return { success: false, error: 'unknown_error' };
    }
  };

  const simulateLinkCheck = (url: string): Pick<LinkCheckResult, 'safeStatus' | 'details'> => {
    if (url.includes('phishing') || url.includes('malware') || url.includes('scam')) {
      return {
        safeStatus: 'dangerous',
        details: {
          threatType: 'phishing',
          hasHttps: false,
          redirectCount: 3,
        },
      };
    }
    
    if (url.includes('suspicious') || url.includes('unknown') || /bit\.ly|tinyurl|goo\.gl/.test(url)) {
      return {
        safeStatus: 'suspicious',
        details: {
          domainAge: 30,
          hasHttps: true,
          redirectCount: 2,
        },
      };
    }
    
    return {
      safeStatus: 'safe',
      details: {
        hasHttps: true,
        domainAge: 365,
        redirectCount: 0,
      },
    };
  };

  const getLinkCheckById = (id: string) => {
    return linkChecks.find(check => check.id === id) || null;
  };

  return {
    linkChecks,
    loading,
    userPlan,
    initialized,
    checkLink,
    getLinkCheckById,
  };
}