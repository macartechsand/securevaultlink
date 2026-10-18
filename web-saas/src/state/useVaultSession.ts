import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type VaultItemData,
  type VaultProfile,
  changeMasterPassword,
  createVault,
  decryptEntry,
  disableRecoveryKey,
  enableRecoveryKey,
  encryptEntry,
  hasRecoveryKey,
  resetPasswordWithRecoveryKey,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from '../lib/crypto';
import { passwordStrength } from '../lib/health/passwordHealth';
import { logClientEvent } from '../services/auditService';
import * as auth from '../services/authService';
import { type KeyContext, type UserKeyPair, ensureUserKeyPair } from '../services/fileService';
import * as mfa from '../services/mfaService';
import * as vault from '../services/vaultService';

export const MASTER_PASSWORD_MIN_LENGTH = 12;
export const IDLE_LOCK_MS = 5 * 60 * 1000;

export type VaultEntry = VaultItemData & { id: string; createdAt: string; updatedAt: string };

export type SessionStatus =
  | 'loading'
  | 'signed-out'
  | 'needs-mfa'
  | 'needs-setup'
  | 'locked'
  | 'unlocked'
  | 'load-error';

export function validateMasterPassword(password: string): string | null {
  if (password.length < MASTER_PASSWORD_MIN_LENGTH) {
    return `Master password must have at least ${MASTER_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (passwordStrength(password) === 'Weak') {
    return 'Master password is too easy to guess. Use a longer passphrase.';
  }
  return null;
}

const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Holds the decrypted vault in memory only. The data key lives in a ref (never in React state,
 * storage or logs) and is dropped on lock, sign-out and idle timeout.
 */
export function useVaultSession() {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [undecryptable, setUndecryptable] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [hasRecovery, setHasRecovery] = useState(false);
  const dekRef = useRef<CryptoKey | null>(null);
  const keyPairRef = useRef<Promise<UserKeyPair> | null>(null);
  const profileRef = useRef<VaultProfile | null>(null);
  const userRef = useRef<User | null>(null);

  const clearSecrets = useCallback(() => {
    dekRef.current = null;
    keyPairRef.current = null;
    setEntries([]);
    setUndecryptable(0);
  }, []);

  const lock = useCallback(() => {
    if (dekRef.current) logClientEvent('vault.locked');
    clearSecrets();
    setStatus((current) => (current === 'unlocked' ? 'locked' : current));
  }, [clearSecrets]);

  const resetAll = useCallback(() => {
    clearSecrets();
    profileRef.current = null;
    userRef.current = null;
    setUser(null);
    setStatus('signed-out');
  }, [clearSecrets]);

  const bootstrap = useCallback(
    async (nextUser: User) => {
      if (userRef.current?.id === nextUser.id && dekRef.current) return;
      userRef.current = nextUser;
      setUser(nextUser);
      clearSecrets();
      setLoadError('');
      setStatus('loading');
      try {
        // With MFA enrolled, RLS hides the vault until the session reaches aal2. Check first so
        // an aal1 session is never mistaken for "no vault yet".
        const level = await mfa.getAssuranceLevel();
        if (level.next === 'aal2' && level.current !== 'aal2') {
          setStatus('needs-mfa');
          return;
        }
        const profile = await vault.fetchProfile();
        profileRef.current = profile;
        setHasRecovery(profile ? hasRecoveryKey(profile) : false);
        setStatus(profile ? 'locked' : 'needs-setup');
      } catch (error) {
        // Never fall back to "locked"/"needs-setup" on failure: show the real problem instead.
        profileRef.current = null;
        setLoadError(message(error, 'Could not load your vault.'));
        setStatus('load-error');
      }
    },
    [clearSecrets],
  );

  useEffect(() => {
    let active = true;
    auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user) void bootstrap(data.session.user);
      else setStatus('signed-out');
    });
    const { data: listener } = auth.onAuthStateChange((_event, session) => {
      // supabase-js warns against awaiting other Supabase calls inside this callback (it can
      // deadlock the auth lock), so defer the work to the next tick.
      window.setTimeout(() => {
        if (!active) return;
        if (session?.user) void bootstrap(session.user);
        else resetAll();
      }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [bootstrap, resetAll]);

  // Idle auto-lock.
  useEffect(() => {
    if (status !== 'unlocked') return;
    let timer = window.setTimeout(lock, IDLE_LOCK_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, IDLE_LOCK_MS);
    };
    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
    events.forEach((name) => window.addEventListener(name, reset));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [status, lock]);

  const loadEntries = useCallback(async (dek: CryptoKey, userId: string) => {
    const rows = await vault.fetchEntries();
    const decrypted: VaultEntry[] = [];
    let failed = 0;
    for (const row of rows) {
      try {
        const data = await decryptEntry(dek, userId, row.id, row);
        decrypted.push({ ...data, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at });
      } catch {
        failed += 1;
      }
    }
    setEntries(decrypted);
    setUndecryptable(failed);
  }, []);

  const finishUnlock = useCallback(
    async (dek: CryptoKey) => {
      const current = userRef.current;
      if (!current) throw new Error('Not signed in.');
      dekRef.current = dek;
      await loadEntries(dek, current.id);
      setStatus('unlocked');
      // Create (or load) the sharing key pair right away, so others can share files with this user
      // without them having to open Files first. Best effort: Files retries on demand.
      if (!keyPairRef.current) {
        keyPairRef.current = ensureUserKeyPair({ dek, userId: current.id }).catch((error) => {
          keyPairRef.current = null;
          throw error;
        });
        keyPairRef.current.catch(() => undefined);
      }
    },
    [loadEntries],
  );

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await auth.signUp(email, password);
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await auth.signIn(email, password);
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    resetAll();
    await auth.signOut();
  }, [resetAll]);

  /** Creates the vault. Recovery is opt-in later (Settings). */
  const setupVault = useCallback(
    async (masterPassword: string) => {
      const problem = validateMasterPassword(masterPassword);
      if (problem) throw new Error(problem);
      const created = await createVault(masterPassword);
      await vault.createProfile(created.profile);
      profileRef.current = created.profile;
      await finishUnlock(created.dek);
    },
    [finishUnlock],
  );

  const unlock = useCallback(
    async (masterPassword: string) => {
      const profile = profileRef.current;
      if (!profile) throw new Error('No vault found.');
      let dek: CryptoKey;
      try {
        dek = await unlockWithPassword(profile, masterPassword);
      } catch (error) {
        dekRef.current = null;
        logClientEvent('vault.unlock_failed');
        throw new Error(message(error, 'Could not unlock the vault.'));
      }
      await finishUnlock(dek);
      logClientEvent('vault.unlocked');
    },
    [finishUnlock],
  );

  /** Resets the master password with the recovery key, then unlocks. */
  const recover = useCallback(
    async (recoveryKey: string, newMasterPassword: string) => {
      const profile = profileRef.current;
      const current = userRef.current;
      if (!profile || !current) throw new Error('No vault found.');
      const problem = validateMasterPassword(newMasterPassword);
      if (problem) throw new Error(problem);
      const dek = await unlockWithRecoveryKey(profile, recoveryKey);
      const next = await resetPasswordWithRecoveryKey(profile, recoveryKey, newMasterPassword);
      await vault.updateProfile(current.id, next);
      profileRef.current = next;
      await finishUnlock(dek);
      logClientEvent('vault.recovered');
    },
    [finishUnlock],
  );

  /** Turns on or regenerates the recovery key. Returns it once; it is never stored. */
  const enableRecovery = useCallback(async (masterPassword: string) => {
    const profile = profileRef.current;
    const current = userRef.current;
    if (!profile || !current) throw new Error('No vault found.');
    const { profile: next, recoveryKey } = await enableRecoveryKey(profile, masterPassword);
    await vault.updateProfile(current.id, next);
    profileRef.current = next;
    setHasRecovery(true);
    return recoveryKey;
  }, []);

  const disableRecovery = useCallback(async (masterPassword: string) => {
    const profile = profileRef.current;
    const current = userRef.current;
    if (!profile || !current) throw new Error('No vault found.');
    const next = await disableRecoveryKey(profile, masterPassword);
    await vault.updateProfile(current.id, next);
    profileRef.current = next;
    setHasRecovery(false);
  }, []);

  const verifyMfa = useCallback(
    async (code: string) => {
      const current = userRef.current;
      if (!current) throw new Error('Not signed in.');
      const [factor] = (await mfa.listVerifiedTotpFactors()).filter((f) => f.status === 'verified');
      if (!factor) throw new Error('No authenticator is enrolled for this account.');
      await mfa.verifyTotp(factor.id, code);
      userRef.current = null;
      await bootstrap(current);
    },
    [bootstrap],
  );

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const profile = profileRef.current;
    const current = userRef.current;
    if (!profile || !current) throw new Error('No vault found.');
    const problem = validateMasterPassword(newPassword);
    if (problem) throw new Error(problem);
    const next = await changeMasterPassword(profile, currentPassword, newPassword);
    await vault.updateProfile(current.id, next);
    profileRef.current = next;
  }, []);

  const requireKey = () => {
    const dek = dekRef.current;
    const current = userRef.current;
    if (!dek || !current) throw new Error('The vault is locked.');
    return { dek, userId: current.id };
  };

  /** Key material for file operations. Throws when the vault is locked. */
  const getKeyContext = useCallback((): KeyContext => requireKey(), []);

  /** Sharing key pair (created on first use), cached in memory until the vault locks. */
  const getKeyPair = useCallback((): Promise<UserKeyPair> => {
    const ctx = requireKey();
    if (!keyPairRef.current) {
      keyPairRef.current = ensureUserKeyPair(ctx).catch((error) => {
        keyPairRef.current = null;
        throw error;
      });
    }
    return keyPairRef.current;
  }, []);

  const addEntry = useCallback(async (data: VaultItemData) => {
    const { dek, userId } = requireKey();
    const id = crypto.randomUUID();
    await vault.insertEntry(id, await encryptEntry(dek, userId, id, data));
    const now = new Date().toISOString();
    setEntries((list) => [{ ...data, id, createdAt: now, updatedAt: now }, ...list]);
  }, []);

  const editEntry = useCallback(async (id: string, data: VaultItemData) => {
    const { dek, userId } = requireKey();
    await vault.updateEntry(id, await encryptEntry(dek, userId, id, data));
    const now = new Date().toISOString();
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...data, updatedAt: now } : e)));
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    requireKey();
    await vault.deleteEntry(id);
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  const retry = useCallback(() => {
    const current = userRef.current;
    if (!current) return;
    userRef.current = null;
    void bootstrap(current);
  }, [bootstrap]);

  return {
    status,
    loadError,
    retry,
    user,
    entries,
    undecryptable,
    signUp,
    signIn,
    signOut,
    setupVault,
    unlock,
    recover,
    hasRecovery,
    enableRecovery,
    disableRecovery,
    verifyMfa,
    changePassword,
    lock,
    getKeyContext,
    getKeyPair,
    addEntry,
    editEntry,
    removeEntry,
  };
}
