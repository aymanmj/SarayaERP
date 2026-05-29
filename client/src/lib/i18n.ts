import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import translationAr from "../locales/ar.json";
import translationEn from "../locales/en.json";

// Read from localStorage or default to 'ar'
const savedLanguage = localStorage.getItem("language") || "ar";

// Update document properties on load
const dir = savedLanguage === "ar" ? "rtl" : "ltr";
document.documentElement.dir = dir;
document.documentElement.lang = savedLanguage;
if (savedLanguage === "ar") {
  document.documentElement.classList.add("rtl");
  document.documentElement.classList.remove("ltr");
} else {
  document.documentElement.classList.add("ltr");
  document.documentElement.classList.remove("rtl");
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: {
        translation: translationAr,
      },
      en: {
        translation: translationEn,
      },
    },
    lng: savedLanguage,
    fallbackLng: "ar",
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

// Setup hook to automatically update document HTML direction when language changes
i18n.on("languageChanged", (lng) => {
  localStorage.setItem("language", lng);
  const currentDir = lng === "ar" ? "rtl" : "ltr";
  document.documentElement.dir = currentDir;
  document.documentElement.lang = lng;
  if (lng === "ar") {
    document.documentElement.classList.add("rtl");
    document.documentElement.classList.remove("ltr");
  } else {
    document.documentElement.classList.add("ltr");
    document.documentElement.classList.remove("rtl");
  }
});

export default i18n;
