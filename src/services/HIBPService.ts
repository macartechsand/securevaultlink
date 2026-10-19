import * as Crypto from 'expo-crypto';

const HIBP_API_URL = 'https://api.pwnedpasswords.com/range/';

export interface BreachCheckResult {
  isBreached: boolean;
  occurrences: number;
}

export class HIBPService {
  private static instance: HIBPService;

  private constructor() {}

  static getInstance(): HIBPService {
    if (!HIBPService.instance) {
      HIBPService.instance = new HIBPService();
    }
    return HIBPService.instance;
  }

  async checkPassword(password: string): Promise<BreachCheckResult> {
    // Gerar hash SHA-1 da senha
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      password
    );
    
    // Dividir o hash para k-anonimity
    const prefix = hash.substring(0, 5).toUpperCase();
    const suffix = hash.substring(5).toUpperCase();

    try {
      // Fazer requisição para API do HIBP
      const response = await fetch(`${HIBP_API_URL}${prefix}`);
      
      if (!response.ok) {
        throw new Error('Falha ao verificar vazamentos');
      }

      const data = await response.text();
      const hashes = data.split('\n');

      // Procurar por matches
      for (const line of hashes) {
        const [hashSuffix, count] = line.split(':');
        if (hashSuffix.trim() === suffix) {
          return {
            isBreached: true,
            occurrences: parseInt(count.trim(), 10)
          };
        }
      }

      // Nenhum match encontrado
      return {
        isBreached: false,
        occurrences: 0
      };

    } catch (error) {
      console.error('Erro ao verificar vazamentos:', error);
      throw error;
    }
  }

  async checkPasswordSafely(password: string): Promise<BreachCheckResult> {
    try {
      const result = await this.checkPassword(password);
      
      // Limpar a senha da memória
      password = '';
      
      return result;
    } catch (error) {
      // Limpar a senha da memória mesmo em caso de erro
      password = '';
      throw error;
    }
  }
}

export const hibpService = HIBPService.getInstance(); 