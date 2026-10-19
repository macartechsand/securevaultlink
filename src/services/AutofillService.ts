import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';
import { cryptoService } from './CryptoService';
import { secureCacheService } from './SecureCacheService';

const AUTOFILL_CACHE_PREFIX = 'autofill:';
const AUTOFILL_TTL = 30 * 1000; // 30 segundos

export interface AutofillCredential {
  id: string;
  url: string;
  username: string;
  password: string;
}

interface AutofillMatch {
  score: number;
  credential: AutofillCredential;
}

export class AutofillService {
  private static instance: AutofillService;
  private credentials: AutofillCredential[] = [];

  private constructor() {}

  static getInstance(): AutofillService {
    if (!AutofillService.instance) {
      AutofillService.instance = new AutofillService();
    }
    return AutofillService.instance;
  }

  async initialize(credentials: AutofillCredential[]): Promise<void> {
    this.credentials = credentials;
  }

  async findMatches(url: string): Promise<AutofillCredential[]> {
    // Normalizar URL
    const normalizedUrl = this.normalizeUrl(url);

    // Procurar no cache primeiro
    const cached = await secureCacheService.get<AutofillCredential[]>(
      `${AUTOFILL_CACHE_PREFIX}${normalizedUrl}`
    );

    if (cached) {
      return cached;
    }

    // Encontrar correspondências
    const matches: AutofillMatch[] = this.credentials
      .map(credential => ({
        score: this.calculateMatchScore(normalizedUrl, credential.url),
        credential
      }))
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score);

    const results = matches.map(match => match.credential);

    // Cachear resultados
    await secureCacheService.set(
      `${AUTOFILL_CACHE_PREFIX}${normalizedUrl}`,
      results,
      { ttl: AUTOFILL_TTL }
    );

    return results;
  }

  async autofill(credential: AutofillCredential): Promise<void> {
    if (Platform.OS === 'web') {
      // Implementar autopreenchimento web
      this.autofillWeb(credential);
    } else {
      // Em dispositivos móveis, copiar para a área de transferência
      await this.copyToClipboard(credential);
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url.toLowerCase();
    }
  }

  private calculateMatchScore(target: string, source: string): number {
    const normalizedTarget = this.normalizeUrl(target);
    const normalizedSource = this.normalizeUrl(source);

    if (normalizedTarget === normalizedSource) {
      return 100;
    }

    if (normalizedSource.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedSource)) {
      return 75;
    }

    // Implementar lógica de matching mais sofisticada aqui
    // Por exemplo, usando distância de Levenshtein ou outros algoritmos

    return 0;
  }

  private async copyToClipboard(
    credential: AutofillCredential
  ): Promise<void> {
    try {
      // Copiar nome de usuário
      await Clipboard.setStringAsync(credential.username);

      // Aguardar um momento para dar tempo do usuário colar
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Copiar senha
      await Clipboard.setStringAsync(credential.password);

      // Limpar área de transferência após um tempo
      setTimeout(async () => {
        await Clipboard.setStringAsync('');
      }, 30000);

    } catch (error) {
      console.error('Erro ao copiar credenciais:', error);
      throw new Error('Falha ao copiar credenciais');
    }
  }

  private autofillWeb(credential: AutofillCredential): void {
    // Implementar preenchimento automático no navegador
    // Isso requer injeção de script no contexto da página
    console.warn('Autopreenchimento web não implementado');
  }

  async suggestCredentials(url: string): Promise<AutofillCredential[]> {
    const matches = await this.findMatches(url);
    return matches.slice(0, 3); // Retornar top 3 matches
  }

  async clearAutofillCache(): Promise<void> {
    const allKeys = Object.keys(
      (await secureCacheService.get<Record<string, any>>(
        AUTOFILL_CACHE_PREFIX
      )) || {}
    );

    await Promise.all(
      allKeys.map(key => secureCacheService.delete(key))
    );
  }
}

export const autofillService = AutofillService.getInstance(); 