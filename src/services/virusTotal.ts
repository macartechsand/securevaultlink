export interface URLScanResult {
  isClean: boolean;
  positives: number;
  total: number;
  scanDate: string;
  threats: string[];
}

export class VirusTotalService {
  private static readonly API_KEY = process.env.EXPO_PUBLIC_VIRUSTOTAL_API_KEY;
  private static readonly API_URL = 'https://www.virustotal.com/vtapi/v2';

  /**
   * Verifica uma URL usando o VirusTotal
   * @param url URL para verificar
   * @returns Resultado da verificação
   */
  static async scanURL(url: string): Promise<URLScanResult> {
    try {
      if (!this.API_KEY) {
        throw new Error('API key do VirusTotal não configurada');
      }

      // Primeiro, envia a URL para análise
      const scanResponse = await fetch(`${this.API_URL}/url/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `apikey=${this.API_KEY}&url=${encodeURIComponent(url)}`,
      });

      if (!scanResponse.ok) {
        throw new Error('Falha ao iniciar verificação da URL');
      }

      const scanData = await scanResponse.json();
      
      // Aguarda alguns segundos para o resultado
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Obtém o resultado da análise
      const reportResponse = await fetch(
        `${this.API_URL}/url/report?apikey=${this.API_KEY}&resource=${encodeURIComponent(url)}`
      );

      if (!reportResponse.ok) {
        throw new Error('Falha ao obter resultado da verificação');
      }

      const reportData = await reportResponse.json();

      // Processa os resultados
      const threats = Object.entries(reportData.scans)
        .filter(([_, scan]: [string, any]) => scan.detected)
        .map(([engine, scan]: [string, any]) => `${engine}: ${scan.result}`);

      return {
        isClean: reportData.positives === 0,
        positives: reportData.positives,
        total: reportData.total,
        scanDate: reportData.scan_date,
        threats,
      };
    } catch (error) {
      console.error('Erro ao verificar URL:', error);
      throw new Error('Não foi possível verificar a segurança da URL');
    }
  }

  /**
   * Verifica se uma URL está no cache do VirusTotal
   * Útil para verificações rápidas sem consumir créditos da API
   */
  static async quickScanURL(url: string): Promise<URLScanResult | null> {
    try {
      if (!this.API_KEY) {
        throw new Error('API key do VirusTotal não configurada');
      }

      const response = await fetch(
        `${this.API_URL}/url/report?apikey=${this.API_KEY}&resource=${encodeURIComponent(url)}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // Retorna null se a URL não estiver no cache
      if (data.response_code === 0) {
        return null;
      }

      const threats = Object.entries(data.scans)
        .filter(([_, scan]: [string, any]) => scan.detected)
        .map(([engine, scan]: [string, any]) => `${engine}: ${scan.result}`);

      return {
        isClean: data.positives === 0,
        positives: data.positives,
        total: data.total,
        scanDate: data.scan_date,
        threats,
      };
    } catch (error) {
      console.error('Erro ao verificar URL:', error);
      return null;
    }
  }
} 