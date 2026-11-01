import CryptoJS from 'crypto-js';

export interface BreachResult {
  isBreached: boolean;
  count: number;
}

export class HIBPService {
  private static readonly API_URL = 'https://api.pwnedpasswords.com/range';

  /**
   * Verifica se uma senha foi comprometida usando o serviço Have I Been Pwned
   * Usa o método k-anonimity para proteger a privacidade da senha
   */
  static async checkPassword(password: string): Promise<BreachResult> {
    try {
      // Gera o hash SHA-1 da senha
      const hash = CryptoJS.SHA1(password).toString().toUpperCase();
      
      // Divide o hash em prefixo (5 primeiros caracteres) e sufixo
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      // Faz a requisição para a API do HIBP
      const response = await fetch(`${this.API_URL}/${prefix}`);
      
      if (!response.ok) {
        throw new Error('Falha ao verificar a senha');
      }

      // Obtém a lista de hashes e contagens
      const data = await response.text();
      const hashes = data.split('\n');

      // Procura por correspondência no sufixo
      for (const line of hashes) {
        const [hashSuffix, count] = line.split(':');
        if (hashSuffix.trim() === suffix) {
          return {
            isBreached: true,
            count: parseInt(count.trim(), 10)
          };
        }
      }

      // Se não encontrou correspondência, a senha não foi comprometida
      return {
        isBreached: false,
        count: 0
      };
    } catch (error) {
      console.error('Erro ao verificar senha:', error);
      throw new Error('Não foi possível verificar a segurança da senha');
    }
  }
} 