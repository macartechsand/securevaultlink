import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';

const HIBP_API_URL = 'https://api.haveibeenpwned.com/v3';
const VIRUS_TOTAL_API_URL = 'https://www.virustotal.com/vtapi/v2';

// Check if a password has been exposed in data breaches
export async function checkPasswordBreaches(password: string): Promise<number> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA1,
    password
  );
  
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  
  try {
    const response = await fetch(`${HIBP_API_URL}/range/${prefix}`);
    const data = await response.text();
    
    const breaches = data.split('\n')
      .map(line => line.split(':'))
      .find(([hash]) => hash === suffix);
      
    return breaches ? parseInt(breaches[1]) : 0;
  } catch (error) {
    console.error('Error checking password breaches:', error);
    return 0;
  }
}

// Check if a URL is malicious using VirusTotal API
export async function checkUrlSafety(url: string): Promise<{
  isSafe: boolean;
  threats: string[];
}> {
  const apiKey = process.env.EXPO_PUBLIC_VIRUS_TOTAL_API_KEY;
  
  try {
    // First, get the scan results or submit for scanning
    const response = await fetch(`${VIRUS_TOTAL_API_URL}/url/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `apikey=${apiKey}&resource=${encodeURIComponent(url)}`,
    });

    const data = await response.json();
    
    return {
      isSafe: data.positives === 0,
      threats: Object.entries(data.scans)
        .filter(([_, scan]: [string, any]) => scan.detected)
        .map(([_, scan]: [string, any]) => scan.result)
    };
  } catch (error) {
    console.error('Error checking URL safety:', error);
    return {
      isSafe: false,
      threats: ['Error checking URL safety']
    };
  }
}

// Calculate password rotation date (90 days from creation/last update)
export function calculateNextRotation(lastUpdated: Date): Date {
  const nextRotation = new Date(lastUpdated);
  nextRotation.setDate(nextRotation.getDate() + 90);
  return nextRotation;
}

// Check password strength
export function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback = [];
  let score = 0;

  // Length
  if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters long');

  // Complexity
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');
  
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');
  
  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Add numbers');
  
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push('Add special characters');

  // Common patterns
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeated characters');
  }

  if (/^(?:abc|123|qwerty|password|admin|letmein)$/i.test(password)) {
    score -= 2;
    feedback.push('Avoid common passwords');
  }

  return { score, feedback };
}