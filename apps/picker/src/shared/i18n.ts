export type UiLanguage = "zh" | "en";
export const PICKER_LANGUAGE_KEY = "sourcebook-picker-language";

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

export function storedPickerLanguage(value: unknown): UiLanguage {
  return value === "zh" ? "zh" : "en";
}
