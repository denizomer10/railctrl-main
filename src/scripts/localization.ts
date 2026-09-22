import { en } from '../i18n/en';

const translateValue = (value: string): string => {
  if (en[value]) return en[value];
  const key = Object.keys(en).sort((a, b) => b.length - a.length).find((candidate) => value.includes(candidate));
  return key ? value.replaceAll(key, en[key]) : value;
};

export const applyEnglishDocument = (): void => {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key && en[key]) element.textContent = en[key];
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
    const translated = translateValue(trimmed);
    if (translated !== trimmed) node.data = node.data.replace(trimmed, translated);
  }

  document.title = translateValue(document.title);
  document.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title], [alt]').forEach((element) => {
    for (const attribute of ['placeholder', 'aria-label', 'title', 'alt']) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, translateValue(value));
    }
  });
  document.querySelectorAll<HTMLInputElement>('input[placeholder="kullanici_adi"]').forEach((input) => {
    input.placeholder = 'username';
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
  if (language !== 'en') return;

  applyEnglishDocument();
  new MutationObserver(applyEnglishDocument).observe(document.body, { childList: true, subtree: true });
};
