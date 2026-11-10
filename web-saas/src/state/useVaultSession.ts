import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type VaultProfile,
  changeMasterPassword,
  createVault,
  disableRecoveryKey,
  enableRecoveryKey,
  hasRecoveryKey,
  resetPasswordWithRecoveryKey,
  unlockWithPassword,
  sealItemKeyForRecipient,
  unlockWithRecoveryKey,
} from '../lib/crypto';
import { passwordStrength } from '../lib/health/passwordHealth';
import type { SecuredItemData } from '../lib/items';
import { friendlyError } from '../lib/messages';
import { ARRIVED_TO_SET_PASSWORD, AUTH_REDIRECT_ERROR, PENDING_OTP, clearAuthParamsFromUrl } from '../lib/authRedirect';
import { logClientEvent } from '../services/auditService';
import * as auth from '../services/authService';
import { type KeyContext, type UserKeyPair, ensureUserKeyPair } from '../services/fileService';
import * as mfa from '../services/mfaService';
import { fetchMfaRequired, fetchVaultStatus } from '../services/supportService';
import { reportError } from '../lib/errorReporter';
import { TRASH_DAYS } from '../lib/plan';
import type { UsageAction, UsageRecord } from '../lib/usage';
import * as pins from '../services/pinService';
import { signOutOtherSessions } from '../services/postureService';
import * as usageService from '../services/usageService';
import * as vault from '../services/vaultService';
import * as ops from './itemOps';

export const MASTER_PASSWORD_MIN_LENGTH = 12;
export const IDLE_LOCK_MS = 5 * 60 * 1000;

export type { Folder, ItemShareInfo, VaultItem } from './itemOps';

export type SessionStatus =
  | 'loading'
  | 'signed-out'
  | 'needs-mfa'
  | 'needs-mfa-enrollment'
  | 'needs-setup'
  | 'locked'
  | 'unlocked'
  | 'load-error';

export function validateMasterPassword(password: string): string | null {
  if (password.length < MASTER_PASSWORD_MIN_LENGTH) {
    return `A senha mestra deve ter pelo menos ${MASTER_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (passwordStrength(password) === 'Weak') {
    return 'A senha mestra é fácil de adivinhar. Use uma frase mais longa.';
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
  const [items, setItems] = useState<ops.VaultItem[]>([]);
  /** Own items in the trash (Premium), newest first. */
  const [trash, setTrash] = useState<ops.VaultItem[]>([]);
  /** Last use of each item, decrypted (Premium). */
  const [usage, setUsage] = useState<Map<string, UsageRecord>>(new Map());
  /** This device has a valid PIN for the signed-in user. */
  const [pinAvailable, setPinAvailable] = useState(false);
  const [folders, setFolders] = useState<ops.Folder[]>([]);
  const [undecryptable, setUndecryptable] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [hasRecovery, setHasRecovery] = useState(false);
  // Arrived through an invite or password-reset link: the account password must be set first.
  const [needsAccountPassword, setNeedsAccountPassword] = useState(ARRIVED_TO_SET_PASSWORD);
  const [linkError, setLinkError] = useState(AUTH_REDIRECT_ERROR ?? '');
  const dekRef = useRef<CryptoKey | null>(null);
  const keyPairRef = useRef<Promise<UserKeyPair> | null>(null);
  const itemKeysRef = useRef<ops.ItemKeys>(new Map());
  const profileRef = useRef<VaultProfile | null>(null);
  const userRef = useRef<User | null>(null);

  const clearSecrets = useCallback(() => {
    dekRef.current = null;
    keyPairRef.current = null;
    itemKeysRef.current = new Map();
    setItems([]);
    setTrash([]);
    setUsage(new Map());
    setFolders([]);
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
      // Set when an invite/reset link was redeemed and cleared when the account password is saved,
      // so a reload or a closed tab never leaves an account without a password (it could not sign in
      // with e-mail and password on another device, e.g. the Android app).
      if (auth.mustSetAccountPassword(nextUser)) setNeedsAccountPassword(true);
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
        // Policy set by an administrator: no vault access until a second factor is enrolled.
        if (level.next !== 'aal2' && (await fetchMfaRequired())) {
          setStatus('needs-mfa-enrollment');
          return;
        }
        // A vault the policy hides must never look like "no vault yet" (that would show the
        // "create master password" screen to an existing user).
        const vaultStatus = await fetchVaultStatus();
        if (vaultStatus?.hasProfile && !vaultStatus.mfaSatisfied) {
          setStatus(vaultStatus.hasFactor ? 'needs-mfa' : 'needs-mfa-enrollment');
          return;
        }
        const profile = await vault.fetchProfile();
        if (!profile && vaultStatus?.hasProfile) {
          throw new Error('Seu cofre existe, mas não pôde ser lido agora. Saia, entre de novo e tente outra vez.');
        }
        profileRef.current = profile;
        setHasRecovery(profile ? hasRecoveryKey(profile) : false);
        setPinAvailable(Boolean(profile && pins.readPinRecord(nextUser.id)));
        setStatus(profile ? 'locked' : 'needs-setup');
      } catch (error) {
        // Never fall back to "locked"/"needs-setup" on failure: show the real problem instead.
        profileRef.current = null;
        setLoadError(friendlyError(error, 'Não foi possível carregar o cofre.'));
        setStatus('load-error');
      }
    },
    [clearSecrets],
  );

  useEffect(() => {
    let active = true;
    const start = async () => {
      // Admin-generated invite / reset link: exchange the one-time token for a session first.
      if (PENDING_OTP) {
        const { error } = await auth.redeemOtp(PENDING_OTP.tokenHash, PENDING_OTP.type);
        if (error) setLinkError('Este link de acesso é inválido ou expirou. Peça um novo ao administrador.');
        else {
          setNeedsAccountPassword(true);
          await auth.markAccountPasswordPending().catch(() => undefined);
        }
      }
      return auth.getSession();
    };
    void start().then(({ data }) => {
      if (!active) return;
      if (data.session?.user) void bootstrap(data.session.user);
      else setStatus('signed-out');
    });
    const { data: listener } = auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsAccountPassword(true);
        window.setTimeout(() => void auth.markAccountPasswordPending().catch(() => undefined), 0);
      }
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

  const loadAll = useCallback(async (ctx: KeyContext, keyPair: UserKeyPair | null) => {
    const keys: ops.ItemKeys = new Map();
    const [{ items: loaded, failed }, loadedFolders] = await Promise.all([
      ops.loadItems(ctx, keyPair, keys),
      ops.loadFolders(ctx).catch(() => [] as ops.Folder[]),
    ]);
    itemKeysRef.current = keys;
    // Items past the 14 days in the trash are removed here too, in case the scheduled purge is off.
    const expired = Date.now() - TRASH_DAYS * 86_400_000;
    const trashed = loaded.filter((i) => i.deletedAt);
    for (const i of trashed.filter((t) => Date.parse(t.deletedAt!) < expired)) void vault.deleteEntry(i.id).catch(() => undefined);
    setTrash(trashed.filter((t) => Date.parse(t.deletedAt!) >= expired).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!)));
    setItems(loaded.filter((i) => !i.deletedAt));
    void usageService
      .fetchUsageRows()
      .then((rows) => usageService.decryptUsageRows(rows, keys, ctx.userId))
      .then(setUsage)
      .catch(() => undefined);
    setFolders(loadedFolders);
    setUndecryptable(failed);
  }, []);

  const finishUnlock = useCallback(
    async (dek: CryptoKey) => {
      const current = userRef.current;
      if (!current) throw new Error('Not signed in.');
      dekRef.current = dek;
      const ctx = { dek, userId: current.id };
      // The sharing key pair is needed to open items others shared with me; it is also created
      // here so others can share with this user right away. A failure must not block own items.
      keyPairRef.current = ensureUserKeyPair(ctx).catch((error) => {
        keyPairRef.current = null;
        throw error;
      });
      const keyPair = await keyPairRef.current.catch(() => null);
      await loadAll(ctx, keyPair);
      setStatus('unlocked');
    },
    [loadAll],
  );

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await auth.signUp(email, password);
    if (error) throw new Error(error.message);
    // Supabase answers a sign-up for an address that already has an account (e.g. created by an
    // invite link) with a user that has no identities, and stores nothing: say so instead of
    // asking for an e-mail confirmation that never comes.
    if (data.user && !data.session && (data.user.identities ?? []).length === 0) throw new Error('ACCOUNT_EXISTS');
    return { needsConfirmation: !data.session };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await auth.requestPasswordReset(email);
    if (error) throw new Error(error.message);
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await auth.resendConfirmation(email);
    if (error) throw new Error(error.message);
  }, []);

  const setAccountPassword = useCallback(async (password: string) => {
    const { error } = await auth.setAccountPassword(password);
    if (error) throw new Error(error.message);
    setNeedsAccountPassword(false);
    clearAuthParamsFromUrl();
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
        throw new Error(message(error, 'Não foi possível desbloquear o cofre.'));
      }
      try {
        await finishUnlock(dek);
      } catch (error) {
        // The master password was right; loading failed. Say so (and record it for support).
        dekRef.current = null;
        reportError(error, 'unlock.load');
        throw new Error(`Senha mestra correta, mas não foi possível carregar o cofre: ${friendlyError(error)}`);
      }
      logClientEvent('vault.unlocked');
    },
    [finishUnlock],
  );

  /** Quick unlock with this device's PIN (server-limited to 5 wrong tries). */
  const unlockWithPin = useCallback(
    async (pin: string) => {
      const current = userRef.current;
      if (!current) throw new Error('Not signed in.');
      const result = await pins.unlockWithPin(current.id, pin);
      if ('error' in result) {
        if (result.gone) setPinAvailable(false);
        logClientEvent('vault.unlock_failed', undefined, { method: 'pin' });
        throw new Error(result.error);
      }
      try {
        await finishUnlock(result.dek);
      } catch (error) {
        dekRef.current = null;
        reportError(error, 'unlock.load');
        throw new Error(`PIN correto, mas não foi possível carregar o cofre: ${friendlyError(error)}`);
      }
      logClientEvent('vault.unlocked', undefined, { method: 'pin' });
    },
    [finishUnlock],
  );

  /** Turns on the PIN for this device (asks the master password to get the vault key once). */
  const enablePin = useCallback(async (masterPassword: string, pin: string) => {
    const profile = profileRef.current;
    const current = userRef.current;
    if (!profile || !current) throw new Error('No vault found.');
    let dek: CryptoKey;
    try {
      dek = await unlockWithPassword(profile, masterPassword, true);
    } catch {
      throw new Error('Senha mestra incorreta.');
    }
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
    try {
      const result = await pins.enablePin(current.id, pin, raw);
      setPinAvailable(true);
      return result;
    } finally {
      raw.fill(0);
    }
  }, []);

  const disablePin = useCallback(async (all = false) => {
    const current = userRef.current;
    if (!current) return;
    await pins.disablePin(current.id, all);
    setPinAvailable(false);
  }, []);

  /**
   * Premium emergency mode: signs out every other session, removes the PIN of every device and
   * records the event. The user then changes the account and master passwords (guided in the UI).
   */
  const emergencyMode = useCallback(async () => {
    const current = userRef.current;
    if (!current) throw new Error('Not signed in.');
    await signOutOtherSessions();
    await pins.disablePin(current.id, true).catch(() => undefined);
    setPinAvailable(false);
    logClientEvent('security.emergency_mode');
  }, []);

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

  /**
   * Forgotten master password without a recovery key: erases the vault on the server (nobody can
   * decrypt it) and keeps the account. The user then creates a new master password.
   */
  const resetVault = useCallback(async () => {
    await auth.resetMyVault();
    clearSecrets();
    profileRef.current = null;
    setHasRecovery(false);
    setStatus('needs-setup');
  }, [clearSecrets]);

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

  /** Checks a recovery key against this vault without changing anything (contingency drill). */
  const testRecoveryKey = useCallback(async (recoveryKey: string) => {
    const profile = profileRef.current;
    if (!profile) throw new Error('No vault found.');
    try {
      await unlockWithRecoveryKey(profile, recoveryKey);
      return true;
    } catch {
      return false;
    }
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

  const keyPairOrNull = () => (keyPairRef.current ? keyPairRef.current.catch(() => null) : Promise.resolve(null));

  const replaceItem = (item: ops.VaultItem) => setItems((list) => list.map((i) => (i.id === item.id ? item : i)));

  const addItem = useCallback(async (data: SecuredItemData) => {
    const item = await ops.createItem(requireKey(), itemKeysRef.current, data);
    setItems((list) => [item, ...list]);
    return item;
  }, []);

  const saveItem = useCallback(async (item: ops.VaultItem, data: SecuredItemData) => {
    const saved = await ops.saveItem(requireKey(), itemKeysRef.current, item, data);
    replaceItem(saved);
    return saved;
  }, []);

  const removeItem = useCallback(async (item: ops.VaultItem) => {
    requireKey();
    if (item.access !== 'owner') throw new Error('Só o dono pode excluir este item.');
    await vault.deleteEntry(item.id);
    itemKeysRef.current.delete(item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
  }, []);

  /** Premium: moves an own item to the trash (kept 14 days). The server checks the plan. */
  const trashItem = useCallback(async (item: ops.VaultItem) => {
    requireKey();
    if (item.access !== 'owner') throw new Error('Só o dono pode excluir este item.');
    const moved = await vault.trashEntry(item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
    setTrash((list) => [{ ...item, deletedAt: moved.deleted_at, updatedAt: moved.updated_at }, ...list]);
  }, []);

  const restoreItem = useCallback(async (item: ops.VaultItem) => {
    requireKey();
    const updatedAt = await vault.restoreEntry(item.id);
    setTrash((list) => list.filter((i) => i.id !== item.id));
    setItems((list) => [{ ...item, deletedAt: null, updatedAt }, ...list]);
  }, []);

  /** Deletes an item from the trash for good. */
  const purgeItem = useCallback(async (item: ops.VaultItem) => {
    requireKey();
    await vault.deleteEntry(item.id);
    itemKeysRef.current.delete(item.id);
    setTrash((list) => list.filter((i) => i.id !== item.id));
  }, []);

  /** Premium: records where and when a password or code was used (encrypted with the item key). */
  const recordUse = useCallback(async (item: ops.VaultItem, action: UsageAction, host = '') => {
    const key = itemKeysRef.current.get(item.id);
    const current = userRef.current;
    if (!key || !current) return;
    const rec = await usageService.recordUsage(item.id, key, current.id, action, host);
    if (rec) setUsage((map) => new Map(map).set(item.id, rec));
  }, []);

  /**
   * JIT approval: seals the key of an own item to the requester, on this device. The server never
   * sees the item key; it only stores the sealed copy with the deadline it computes itself.
   */
  const sealItemKeyFor = useCallback(async (itemId: string, recipientPublicKey: string, recipientId: string) => {
    requireKey();
    const key = itemKeysRef.current.get(itemId);
    if (!key) throw new Error('Abra e salve este item uma vez antes de liberar acesso (itens antigos ainda não têm chave própria).');
    return sealItemKeyForRecipient(recipientPublicKey, key, itemId, recipientId);
  }, []);

  /** Recipient removes an item shared with them from their own list. */
  const leaveSharedItem = useCallback(async (item: ops.VaultItem) => {
    if (!item.shareId) return;
    await vault.deleteItemShare(item.shareId);
    itemKeysRef.current.delete(item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
  }, []);

  const getHistory = useCallback(async (item: ops.VaultItem) => {
    if (item.access !== 'owner') return [];
    return ops.loadHistory(requireKey(), item.id);
  }, []);

  const shareItem = useCallback(
    async (item: ops.VaultItem, recipient: { userId: string; publicKey: string }, permission: 'view' | 'edit', expiresAt: string | null) => {
      const ctx = requireKey();
      const shared = await ops.shareItem(ctx, itemKeysRef.current, item, recipient, permission, expiresAt);
      // Reload to pick up the new share row (emails are filled in by the server).
      const keyPair = await keyPairOrNull();
      await loadAll(ctx, keyPair);
      return shared;
    },
    [loadAll],
  );

  const revokeItemShare = useCallback(async (item: ops.VaultItem, share: ops.ItemShareInfo) => {
    const updated = await ops.revokeItemShare(requireKey(), itemKeysRef.current, item, share);
    replaceItem(updated);
  }, []);

  const setSharePermission = useCallback(async (item: ops.VaultItem, share: ops.ItemShareInfo, permission: 'view' | 'edit') => {
    await vault.updateItemShare(share.id, { permission });
    replaceItem({ ...item, sharedWith: item.sharedWith.map((s) => (s.id === share.id ? { ...s, permission } : s)) });
  }, []);

  const createFolder = useCallback(async (name: string) => {
    const folder = await ops.createFolder(requireKey(), name);
    setFolders((list) => [...list, folder].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    return folder;
  }, []);

  const renameFolder = useCallback(async (folder: ops.Folder, name: string) => {
    const renamed = await ops.renameFolder(requireKey(), folder, name);
    setFolders((list) => list.map((f) => (f.id === folder.id ? renamed : f)));
  }, []);

  const deleteFolder = useCallback(async (folder: ops.Folder) => {
    requireKey();
    await vault.deleteFolder(folder.id);
    setFolders((list) => list.filter((f) => f.id !== folder.id));
  }, []);

  const reload = useCallback(async () => {
    const ctx = requireKey();
    await loadAll(ctx, await keyPairOrNull());
  }, [loadAll]);

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
    items,
    folders,
    undecryptable,
    signUp,
    signIn,
    requestPasswordReset,
    resendConfirmation,
    needsAccountPassword,
    setAccountPassword,
    linkError,
    signOut,
    setupVault,
    unlock,
    recover,
    resetVault,
    hasRecovery,
    enableRecovery,
    disableRecovery,
    testRecoveryKey,
    verifyMfa,
    changePassword,
    lock,
    getKeyContext,
    getKeyPair,
    addItem,
    saveItem,
    removeItem,
    trash,
    trashItem,
    restoreItem,
    purgeItem,
    usage,
    recordUse,
    pinAvailable,
    unlockWithPin,
    enablePin,
    disablePin,
    emergencyMode,
    sealItemKeyFor,
    leaveSharedItem,
    getHistory,
    shareItem,
    revokeItemShare,
    setSharePermission,
    createFolder,
    renameFolder,
    deleteFolder,
    reload,
  };
}
