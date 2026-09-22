import { tr } from './tr';
import { en } from './en';

export const i18n = { tr, en };
export type Lang = 'tr' | 'en';
export type I18nKey = keyof typeof tr;

export const translate = (value: string, lang: Lang): string =>
  lang === 'en' ? en[value] ?? value : tr[value as I18nKey] ?? value;
