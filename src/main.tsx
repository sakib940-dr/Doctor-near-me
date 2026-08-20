import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { VisitorLanguageProvider } from './contexts/VisitorLanguageContext';
import App from './App';
import './styles.css';
import { registerPwaServiceWorker } from './lib/pwa';

registerPwaServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <VisitorLanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </VisitorLanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
