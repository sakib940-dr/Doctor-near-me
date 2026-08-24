import { useVisitorLanguage } from '../../contexts/VisitorLanguageContext';

export type HospitalCopy = { bn: string; en: string };

export function useHospitalLanguage() {
  const { language, setLanguage } = useVisitorLanguage();
  const text = (copy: HospitalCopy) => copy[language];
  return { language, setLanguage, text };
}

export const bi = (bn: string, en: string): HospitalCopy => ({ bn, en });
