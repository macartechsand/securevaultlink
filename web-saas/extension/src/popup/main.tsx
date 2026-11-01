import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles/theme.css';
import './popup.css';
import { applyTheme, initialTheme } from '../../../src/components/ui/ThemeToggle';
import { Popup } from './Popup';

applyTheme(initialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
