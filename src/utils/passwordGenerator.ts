const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

interface PasswordOptions {
  length?: number;
  includeLowercase?: boolean;
  includeUppercase?: boolean;
  includeNumbers?: boolean;
  includeSymbols?: boolean;
}

export const generatePassword = (options: PasswordOptions = {}): string => {
  const {
    length = 16,
    includeLowercase = true,
    includeUppercase = true,
    includeNumbers = true,
    includeSymbols = true,
  } = options;

  let chars = '';
  if (includeLowercase) chars += LOWERCASE;
  if (includeUppercase) chars += UPPERCASE;
  if (includeNumbers) chars += NUMBERS;
  if (includeSymbols) chars += SYMBOLS;

  if (!chars) {
    throw new Error('Pelo menos um conjunto de caracteres deve ser selecionado');
  }

  let password = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    password += chars[randomValues[i] % chars.length];
  }

  // Garante que a senha contenha pelo menos um caractere de cada conjunto selecionado
  const requirements = [
    { condition: includeLowercase, chars: LOWERCASE },
    { condition: includeUppercase, chars: UPPERCASE },
    { condition: includeNumbers, chars: NUMBERS },
    { condition: includeSymbols, chars: SYMBOLS },
  ];

  requirements.forEach(({ condition, chars }) => {
    if (condition && !password.split('').some(char => chars.includes(char))) {
      const pos = Math.floor(Math.random() * length);
      const randomChar = chars[Math.floor(Math.random() * chars.length)];
      password = password.substring(0, pos) + randomChar + password.substring(pos + 1);
    }
  });

  return password;
}; 