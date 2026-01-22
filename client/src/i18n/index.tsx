import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ptBR, type TranslationKeys } from "./translations/pt-BR";
import { en } from "./translations/en";

export type Language = "pt-BR" | "en";

const translations: Record<Language, TranslationKeys> = {
  "pt-BR": ptBR,
  "en": en,
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKeys;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "instagram-ai-language";

// Detect browser language
function detectBrowserLanguage(): Language {
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang?.startsWith("pt")) {
    return "pt-BR";
  }
  return "en";
}

// Get initial language from storage or browser
function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt-BR" || stored === "en") {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return detectBrowserLanguage();
}

interface LanguageProviderProps {
  children: React.ReactNode;
  defaultLanguage?: Language;
}

export function LanguageProvider({ children, defaultLanguage }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => {
    return defaultLanguage || getInitialLanguage();
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage not available
    }
    // Update HTML lang attribute
    document.documentElement.lang = lang;
  }, []);

  // Set initial HTML lang attribute
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Export translations type for components
export type { TranslationKeys };

// Export available languages
export const availableLanguages: { code: Language; name: string; flag: string }[] = [
  { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
  { code: "en", name: "English", flag: "🇺🇸" },
];
