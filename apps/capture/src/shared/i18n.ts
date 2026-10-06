export type UiLanguage = "zh" | "en";

export function languageFromTag(tag?: string): UiLanguage {
  return tag?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function browserLanguage(getUiLanguage?: () => string | undefined): UiLanguage {
  let language: string | undefined;
  try {
    language = getUiLanguage?.();
  } catch {
    language = undefined;
  }

  language ||= globalThis.navigator?.language;
  return languageFromTag(language);
}
