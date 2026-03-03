import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import 'intl-pluralrules';

import ko from './ko.json';
import en from './en.json';
import ja from './ja.json';

const deviceLocales = getLocales();
const deviceLang = deviceLocales[0]?.languageCode ?? 'en';

// Map device language to supported languages; fallback to English
const supportedLangs = ['ko', 'en', 'ja'];
const resolvedLang = supportedLangs.includes(deviceLang) ? deviceLang : 'en';

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: resolvedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
