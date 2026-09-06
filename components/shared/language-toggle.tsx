"use client";

import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * English ⇄ বাংলা segmented toggle. Lives in the shared sidebar footer so
 * every signed-in screen has it in the same place. The choice persists in
 * localStorage via the LanguageProvider.
 */
export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language / ভাষা"
      className="mb-2 flex w-full rounded-lg border border-charcoal/50 bg-charcoal/60 p-0.5"
    >
      {(["en", "bn"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={cn(
            "flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            lang === code
              ? "bg-gold text-charcoal"
              : "text-cream/60 hover:text-cream"
          )}
        >
          {code === "en" ? "EN" : "বাংলা"}
        </button>
      ))}
    </div>
  );
}