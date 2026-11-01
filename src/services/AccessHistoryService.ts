import * as SecureStore from 'expo-secure-store';

const HISTORY_KEY = '@secure_vault:access_history';
const MAX_HISTORY_ITEMS = 1000;

export interface AccessHistoryEntry {
  id: string;
  passwordId: string;
  action: 'view' | 'edit' | 'delete' | 'share';
  timestamp: number;
  metadata?: {
    sharedWith?: string;
    shareExpiration?: number;
    deviceInfo?: string;
    location?: string;
  };
}

export class AccessHistoryService {
  private static instance: AccessHistoryService;
  private history: AccessHistoryEntry[] = [];

  private constructor() {}

  static getInstance(): AccessHistoryService {
    if (!AccessHistoryService.instance) {
      AccessHistoryService.instance = new AccessHistoryService();
    }
    return AccessHistoryService.instance;
  }

  async initialize(): Promise<void> {
    const historyStr = await SecureStore.getItemAsync(HISTORY_KEY);
    if (historyStr) {
      this.history = JSON.parse(historyStr);
    }
  }

  async addEntry(entry: Omit<AccessHistoryEntry, 'id' | 'timestamp'>): Promise<void> {
    const newEntry: AccessHistoryEntry = {
      ...entry,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    this.history.unshift(newEntry);

    // Manter apenas os últimos MAX_HISTORY_ITEMS itens
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
    }

    await this.saveHistory();
  }

  async getHistory(
    options: {
      passwordId?: string;
      action?: AccessHistoryEntry['action'];
      startDate?: number;
      endDate?: number;
      limit?: number;
    } = {}
  ): Promise<AccessHistoryEntry[]> {
    let filteredHistory = this.history;

    if (options.passwordId) {
      filteredHistory = filteredHistory.filter(
        entry => entry.passwordId === options.passwordId
      );
    }

    if (options.action) {
      filteredHistory = filteredHistory.filter(
        entry => entry.action === options.action
      );
    }

    if (options.startDate) {
      filteredHistory = filteredHistory.filter(
        entry => entry.timestamp >= options.startDate!
      );
    }

    if (options.endDate) {
      filteredHistory = filteredHistory.filter(
        entry => entry.timestamp <= options.endDate!
      );
    }

    if (options.limit) {
      filteredHistory = filteredHistory.slice(0, options.limit);
    }

    return filteredHistory;
  }

  async getPasswordHistory(passwordId: string): Promise<AccessHistoryEntry[]> {
    return this.getHistory({ passwordId });
  }

  async getRecentActivity(limit: number = 10): Promise<AccessHistoryEntry[]> {
    return this.getHistory({ limit });
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    await this.saveHistory();
  }

  async clearPasswordHistory(passwordId: string): Promise<void> {
    this.history = this.history.filter(
      entry => entry.passwordId !== passwordId
    );
    await this.saveHistory();
  }

  async deleteEntry(entryId: string): Promise<void> {
    this.history = this.history.filter(entry => entry.id !== entryId);
    await this.saveHistory();
  }

  async getActivityStats(
    startDate?: number,
    endDate?: number
  ): Promise<{
    totalAccesses: number;
    viewCount: number;
    editCount: number;
    deleteCount: number;
    shareCount: number;
  }> {
    const history = await this.getHistory({ startDate, endDate });

    return history.reduce(
      (stats, entry) => {
        stats.totalAccesses++;
        switch (entry.action) {
          case 'view':
            stats.viewCount++;
            break;
          case 'edit':
            stats.editCount++;
            break;
          case 'delete':
            stats.deleteCount++;
            break;
          case 'share':
            stats.shareCount++;
            break;
        }
        return stats;
      },
      {
        totalAccesses: 0,
        viewCount: 0,
        editCount: 0,
        deleteCount: 0,
        shareCount: 0
      }
    );
  }

  private async saveHistory(): Promise<void> {
    await SecureStore.setItemAsync(
      HISTORY_KEY,
      JSON.stringify(this.history)
    );
  }
}

export const accessHistoryService = AccessHistoryService.getInstance(); 