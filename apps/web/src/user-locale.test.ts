import { describe, expect, it } from "vitest";
import { resolveLocaleFromLanguage } from "./user-locale";

describe("user locale", () => {
  it("keeps Indonesian for id locales", () => {
    expect(resolveLocaleFromLanguage("id-ID")).toBe("id-ID");
    expect(resolveLocaleFromLanguage("id")).toBe("id-ID");
  });

  it("maps non-id locales to English", () => {
    expect(resolveLocaleFromLanguage("en-US")).toBe("en-US");
    expect(resolveLocaleFromLanguage("fr-FR")).toBe("en-US");
    expect(resolveLocaleFromLanguage("")).toBe("en-US");
  });
});
