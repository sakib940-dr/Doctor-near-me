import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { VisitorLanguageProvider } from './contexts/VisitorLanguageContext';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './styles.css';
import { registerPwaServiceWorker } from './lib/pwa';
import { installGlobalImageUploadGuard } from './lib/imageOptimization';

installGlobalImageUploadGuard();
registerPwaServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <VisitorLanguageProvider>
        <AuthProvider>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </AuthProvider>
      </VisitorLanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
