export interface PasswordStrengthResult {
  score: number; // 0-4 (muito fraca, fraca, média, forte, muito forte)
  feedback: string[];
  color: string;
}

export function analyzePasswordStrength(password: string): PasswordStrengthResult {
  const result: PasswordStrengthResult = {
    score: 0,
    feedback: [],
    color: '#ff4444' // vermelho por padrão
  };

  if (!password) {
    result.feedback.push('Digite uma senha');
    return result;
  }

  // Critérios básicos
  const hasLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const hasRepeatingChars = /(.)\\1{2,}/.test(password);
  const hasSequentialNumbers = /(?:012|123|234|345|456|567|678|789)/.test(password);
  const hasCommonWords = /(password|123456|qwerty|admin|welcome)/i.test(password);

  // Calcula o score base no comprimento
  if (password.length >= 12) result.score++;
  if (password.length >= 16) result.score++;

  // Adiciona pontos por complexidade
  if (hasUpperCase) result.score++;
  if (hasLowerCase) result.score++;
  if (hasNumbers) result.score++;
  if (hasSpecialChars) result.score++;

  // Remove pontos por padrões fracos
  if (hasRepeatingChars) result.score--;
  if (hasSequentialNumbers) result.score--;
  if (hasCommonWords) result.score = 0;

  // Garante que o score esteja entre 0 e 4
  result.score = Math.max(0, Math.min(4, result.score));

  // Define o feedback baseado nos critérios
  if (!hasLength) {
    result.feedback.push('Use pelo menos 8 caracteres');
  }
  if (!hasUpperCase) {
    result.feedback.push('Inclua letras maiúsculas');
  }
  if (!hasLowerCase) {
    result.feedback.push('Inclua letras minúsculas');
  }
  if (!hasNumbers) {
    result.feedback.push('Inclua números');
  }
  if (!hasSpecialChars) {
    result.feedback.push('Inclua caracteres especiais');
  }
  if (hasRepeatingChars) {
    result.feedback.push('Evite caracteres repetidos');
  }
  if (hasSequentialNumbers) {
    result.feedback.push('Evite sequências numéricas');
  }
  if (hasCommonWords) {
    result.feedback.push('Evite palavras comuns');
  }

  // Define a cor baseada no score
  switch (result.score) {
    case 0:
      result.color = '#ff4444'; // Vermelho
      break;
    case 1:
      result.color = '#ff8c00'; // Laranja
      break;
    case 2:
      result.color = '#ffd700'; // Amarelo
      break;
    case 3:
      result.color = '#90ee90'; // Verde claro
      break;
    case 4:
      result.color = '#32cd32'; // Verde
      break;
  }

  return result;
} 