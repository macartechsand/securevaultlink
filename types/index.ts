export interface Password {
  id: string;
  title: string;
  username: string;
  password: string;
  website?: string;
  category: PasswordCategory;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
}

export type PasswordCategory = 
  | 'social' 
  | 'finance' 
  | 'email' 
  | 'shopping' 
  | 'entertainment'
  | 'work'
  | 'other';

export type UserPlan = 'free' | 'premium';