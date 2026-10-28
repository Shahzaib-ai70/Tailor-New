import { createContext, useContext } from 'react'

export type Language = 'en' | 'ur'

export type LocaleContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (text: string) => string
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)

export function useLocale() {
  const locale = useContext(LocaleContext)
  if (!locale) throw new Error('useLocale must be used within LocaleProvider.')
  return locale
}
