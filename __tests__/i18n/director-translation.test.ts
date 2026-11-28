import { describe, expect, it } from "vitest";
import directorTranslations from "#/i18n/director-translation.json";
import upstreamTranslations from "#/i18n/translation.json";
import translationChecker from "../../scripts/check-translation-completeness.cjs";

const { getSupportedLanguageCodes, checkTranslations } = translationChecker;

type TranslationMap = Record<string, Record<string, string>>;

const own = directorTranslations as TranslationMap;
const upstream = upstreamTranslations as TranslationMap;

const placeholders = (value: string) =>
  (value.match(/{{\s*[^}]+}}/g) ?? []).sort();

// The director's keys are kept apart from OpenHands' translation.json, so
// that merging upstream never conflicts in that file. They are held to the
// same rules.
describe("director-translation.json", () => {
  it("has complete, translated coverage for every key", () => {
    const { missingTranslations, extraLanguages, untranslatedKeys } =
      checkTranslations(own, getSupportedLanguageCodes());

    expect(missingTranslations).toEqual({});
    expect(extraLanguages).toEqual({});
    expect(untranslatedKeys).toEqual({});
  });

  it("preserves interpolation placeholders in every translation", () => {
    const mismatches = Object.entries(own).flatMap(([key, translations]) =>
      Object.entries(translations)
        .filter(
          ([, value]) =>
            placeholders(value).join() !== placeholders(translations.en).join(),
        )
        .map(([lang]) => `${key} (${lang})`),
    );

    expect(mismatches).toEqual([]);
  });

  it("says otherwise of OpenHands' own keys only where it means to", () => {
    const overridden = Object.keys(own).filter((key) => key in upstream);

    expect(overridden).toEqual(["BRANDING$OPENHANDS_LOGO"]);
  });
});
