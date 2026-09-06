"use client";

import { useLanguage } from "@/lib/i18n";

/**
 * Translates its (English) text child in the active language. Lets
 * server-rendered page headings join the translation system without
 * converting the whole page to a client component:
 *
 *   <h1><T>Batch list</T></h1>
 */
export function T({ children }: { children: string }) {
  const { t } = useLanguage();
  return <>{t(children)}</>;
}