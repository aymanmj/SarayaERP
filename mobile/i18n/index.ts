import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates'; // To reload app if needed

import en from './locales/en.json';
import ar from './locales/ar.json';

const RESOURCES = {
  en: { translation: en },
  ar: { translation: ar },
};

const LANGUAGE_KEY = 'user-language';

const initI18n = async () => {
    let savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    
    if (!savedLanguage) {
        const deviceLanguage = getLocales()[0].languageCode;
        savedLanguage = deviceLanguage === 'ar' ? 'ar' : 'en';
    }

    // Force RTL based on language
    const isRTL = savedLanguage === 'ar';
    if (I18nManager.isRTL !== isRTL) {
        I18nManager.allowRTL(isRTL);
        I18nManager.forceRTL(isRTL);
        // We might need to restart app here for RTL changes to take full effect on some Android versions
    }

    await i18n
       .use(initReactI18next)
       .init({
          resources: RESOURCES,
          lng: savedLanguage,
          fallbackLng: 'en',
          interpolation: {
             escapeValue: false,
          },
       });
};

export default i18n;
export { initI18n, LANGUAGE_KEY };
