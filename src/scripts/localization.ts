import { en } from '../i18n/en';

const TRANSLATED_MARKER = 'data-i18n-original';

const translateValue = (value: string): string => {
  if (en[value]) return en[value];
  const key = Object.keys(en).sort((a, b) => b.length - a.length).find((candidate) => value.includes(candidate));
  return key ? value.split(key).join(en[key]) : value;
};

export const applyEnglishDocument = (): void => {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    const translation = key ? en[key] : undefined;
    if (translation && element.textContent !== translation) element.textContent = translation;
  });

  const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement && !ignoredTags.has(node.parentElement.tagName) && node.data.trim()) nodes.push(node);
  }
  for (const node of nodes) {
    const trimmed = node.data.trim();
    const original = node.parentElement?.getAttribute(TRANSLATED_MARKER) ?? trimmed;
    const translated = translateValue(original);
    if (translated !== original) {
      node.parentElement?.setAttribute(TRANSLATED_MARKER, original);
      node.data = node.data.replace(trimmed, translated);
    }
  }

  const title = document.querySelector('title');
  if (title) {
    const original = title.getAttribute(TRANSLATED_MARKER) ?? title.textContent ?? '';
    const translated = translateValue(original);
    if (translated !== original) {
      title.setAttribute(TRANSLATED_MARKER, original);
      title.textContent = translated;
    }
  }
  document.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title], [alt]').forEach((element) => {
    for (const attribute of ['placeholder', 'aria-label', 'title', 'alt']) {
      const value = element.getAttribute(attribute);
      const marker = `${TRANSLATED_MARKER}-${attribute}`;
      const original = element.getAttribute(marker) ?? value;
      if (original) {
        const translated = translateValue(original);
        if (translated !== original) {
          element.setAttribute(marker, original);
          element.setAttribute(attribute, translated);
        }
      }
    }
  });
};

export const getPreferredLanguage = (): 'tr' | 'en' => {
  const savedLanguage = localStorage.getItem('lang');
  if (savedLanguage === 'tr' || savedLanguage === 'en') return savedLanguage;
  const systemLanguage = navigator.languages?.[0] || navigator.language || 'en';
  return systemLanguage.toLowerCase().startsWith('tr') ? 'tr' : 'en';
};

export const initLocalization = (): void => {
  const language = getPreferredLanguage();
  document.documentElement.lang = language;
  const applyLanguage = (): void => {
    if (document.documentElement.lang === 'en') applyEnglishDocument();
  };
  applyLanguage();
  new MutationObserver(applyLanguage).observe(document.body, { childList: true, subtree: true });
};
