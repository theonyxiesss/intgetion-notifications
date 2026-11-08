import en from "./messages/en.json";
import es from "./messages/es.json";
import de from "./messages/de.json";
import fr from "./messages/fr.json";
import it from "./messages/it.json";
import ptBR from "./messages/pt-BR.json";
import ru from "./messages/ru.json";
import type { AppLocale } from "@intgetion/kit";

export type Messages = typeof en;

/** D404: the company story lives only in English. Other catalogs reuse it. */
function withEnglishCompany(
  catalog: Omit<Messages, "companyMarketing">,
): Messages {
  return { ...catalog, companyMarketing: en.companyMarketing };
}

const catalogs: Record<AppLocale, Messages> = {
  en,
  ru: withEnglishCompany(ru),
  es: withEnglishCompany(es),
  "pt-BR": withEnglishCompany(ptBR),
  de: withEnglishCompany(de),
  fr: withEnglishCompany(fr),
  it: withEnglishCompany(it),
};

/**
 * D336: the message catalog for server code that renders outside a React
 * request (emails, Telegram, notifications). Pages use next-intl instead.
 */
export function messagesFor(locale: string): Messages {
  return catalogs[locale as AppLocale] ?? en;
}
