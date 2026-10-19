export interface Password {
  id: string;
  title: string;
  username?: string;
  password: string;
  url?: string;
  category?: string;
  notes?: string;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  strength: number; // 0-4 baseado no zxcvbn
  isCompromised: boolean; // Indica se a senha foi vazada
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface PasswordFilter {
  search?: string;
  category?: string;
  favoritesOnly?: boolean;
  sortBy?: 'title' | 'createdAt' | 'updatedAt' | 'strength';
  sortOrder?: 'asc' | 'desc';
}

export interface PasswordGeneratorOptions {
  length: number;
  includeUppercase: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  excludeAmbiguous: boolean;
  excludeSimilar: boolean;
  customExclude?: string;
} 