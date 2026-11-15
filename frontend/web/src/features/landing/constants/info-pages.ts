/**
 * Public About / Privacy / Terms pages: the translation keys for each page.
 * The copy itself lives in info-page-translations.ts (en / fr / vi).
 */

export type InfoPageKey = "about" | "privacy" | "terms";

export interface InfoPageKeys {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

function pageKeys(page: InfoPageKey, sections: number): InfoPageKeys {
  return {
    title: `landing.${page}.title`,
    intro: `landing.${page}.intro`,
    sections: Array.from({ length: sections }, (_, i) => ({
      heading: `landing.${page}.s${i + 1}.heading`,
      body: `landing.${page}.s${i + 1}.body`,
    })),
  };
}

export const INFO_PAGES: Record<InfoPageKey, InfoPageKeys> = {
  about: pageKeys("about", 2),
  privacy: pageKeys("privacy", 3),
  terms: pageKeys("terms", 3),
};
