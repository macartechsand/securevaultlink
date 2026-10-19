import { MD3LightTheme } from 'react-native-paper';
import { Platform } from 'react-native';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#2196F3',      // Azul principal
    secondary: '#03DAC6',    // Azul claro
    error: '#B00020',        // Vermelho erro
    warning: '#FB8C00',      // Amarelo aviso
    success: '#4CAF50',      // Verde sucesso
    background: '#F5F5F5',    // Fundo branco
    surface: '#FFFFFF',      // Fundo branco
    accent: '#03DAC6',        // Azul claro
    text: '#000000',         // Texto preto
    onSurface: '#000000',     // Texto sobre superfície
    disabled: '#00000061',    // Elementos desabilitados
    placeholder: '#00000099',  // Texto placeholder
    backdrop: '#00000099',    // Fundo de fundo
    notification: '#f50057',   // Notificação
    outline: '#0000001F',     // Contorno
  },
  roundness: 8,
};

export type AppTheme = typeof theme; 