import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import jp from "./locales/jp.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";

const resources = {
  en: {
    translation: en,
  },
  zh: {
    translation: zh,
  },
  jp: {
    translation: jp,
  },
  ko: {
    translation: ko,
  },
} as const;

const langDetector = new LanguageDetector();
langDetector.addDetector({
  name: "vscodeStorage",
  lookup(_options: unknown): string | undefined {
    return undefined;
  },
  cacheUserLanguage(lng: string) {
    if (isVSCodeEnvironment() && globalThis.POCHI_WEBVIEW_KIND === "sidebar") {
      vscodeHost.readLang().then((res) => res.updateLang(lng));
    }
  },
});

i18n
  .use(langDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS: "translation",
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["vscodeStorage", "localStorage", "navigator", "htmlTag"],
      caches: ["vscodeStorage", "localStorage"],
    },
  });

if (isVSCodeEnvironment() && globalThis.POCHI_WEBVIEW_KIND === "pane") {
  vscodeHost.readLang().then((lang) => {
    const langSignal = threadSignal(lang.value);
    i18n.changeLanguage(langSignal.value);

    langSignal.subscribe((lang) => {
      i18n.changeLanguage(lang);
    });
  });
}

export default i18n;
