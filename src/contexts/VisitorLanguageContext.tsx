import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type VisitorLanguage = 'bn' | 'en';

interface VisitorLanguageValue {
  language: VisitorLanguage;
  setLanguage: (language: VisitorLanguage) => void;
  toggleLanguage: () => void;
}

const STORAGE_KEY = 'docbd-visitor-language';
const VisitorLanguageContext = createContext<VisitorLanguageValue | null>(null);

function initialLanguage(): VisitorLanguage {
  if (typeof window === 'undefined') return 'bn';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'en' ? 'en' : 'bn';
  } catch {
    return 'bn';
  }
}

export function VisitorLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<VisitorLanguage>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en';
    try { window.localStorage.setItem(STORAGE_KEY, language); } catch { /* storage may be unavailable */ }
  }, [language]);

  const value = useMemo<VisitorLanguageValue>(() => ({
    language,
    setLanguage: setLanguageState,
    toggleLanguage: () => setLanguageState((current) => current === 'bn' ? 'en' : 'bn'),
  }), [language]);

  return <VisitorLanguageContext.Provider value={value}>{children}</VisitorLanguageContext.Provider>;
}

export function useVisitorLanguage() {
  const value = useContext(VisitorLanguageContext);
  if (!value) throw new Error('useVisitorLanguage must be used inside VisitorLanguageProvider');
  return value;
}
