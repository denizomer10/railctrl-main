import { en } from '../i18n/en';

const TRANSLATED_MARKER = 'data-i18n-original';
const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);
const englishKeys = Object.keys(en).sort((a, b) => b.length - a.length);
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const englishPattern = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${englishKeys.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
  'gu'
);
const originalText = new WeakMap<Text, string>();
let localizationObserver: MutationObserver | null = null;
const pendingNodes = new Set<Node>();
let localizationFrame = 0;

const translateValue = (value: string): string => {
  if (en[value]) return en[value];
  return value.replace(englishPattern, (match) => en[match] ?? match);
};

const translateElement = (element: Element): void => {
  if (element.matches('[data-i18n]')) {
    const textNode = Array.from(element.childNodes).find((child): child is Text => child.nodeType === Node.TEXT_NODE);
    const key = element.getAttribute('data-i18n');
    const translation = key ? en[key] : undefined;
    if (textNode && translation) textNode.data = translation;
  }

  for (const attribute of ['placeholder', 'aria-label', 'title', 'alt']) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const marker = `${TRANSLATED_MARKER}-${attribute}`;
    const original = element.getAttribute(marker) ?? value;
    const translated = translateValue(original);
    if (translated !== original) {
      element.setAttribute(marker, original);
      element.setAttribute(attribute, translated);
    }
  }
};

const translateTextNode = (node: Text): void => {
  const parent = node.parentElement;
  if (!parent || ignoredTags.has(parent.tagName) || parent.closest('[contenteditable="true"], [data-no-translate]') || !node.data.trim()) return;
  const original = originalText.get(node) ?? node.data.trim();
  const translated = translateValue(original);
  if (translated !== original) {
    originalText.set(node, original);
    node.data = node.data.replace(node.data.trim(), translated);
  }
};

const translateSubtree = (root: Node): void => {
  if (root.nodeType === Node.ELEMENT_NODE) {
    const element = root as Element;
    translateElement(element);
    element.querySelectorAll('[data-i18n], [placeholder], [aria-label], [title], [alt]').forEach(translateElement);
  }

  if (root.nodeType === Node.TEXT_NODE) translateTextNode(root as Text);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateTextNode(walker.currentNode as Text);
};

export const applyEnglishDocument = (root: Node = document.documentElement): void => {
  translateSubtree(root);
};

export const getPreferredLanguage = (): 'tr' | 'en' => {
  try {
    const savedLanguage = localStorage.getItem('lang');
    if (savedLanguage === 'tr' || savedLanguage === 'en') return savedLanguage;
  } catch {
    // Fall back to the browser language when storage is unavailable.
  }
  const systemLanguage = navigator.languages?.[0] || navigator.language || 'en';
  return systemLanguage.toLowerCase().startsWith('tr') ? 'tr' : 'en';
};

export const initLocalization = (): void => {
  document.documentElement.lang = getPreferredLanguage();
  if (document.documentElement.lang !== 'en') return;

  applyEnglishDocument();
  if (!localizationObserver && document.body) {
    localizationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => pendingNodes.add(node));
      }
      if (!pendingNodes.size || localizationFrame) return;
      localizationFrame = requestAnimationFrame(() => {
        pendingNodes.forEach(translateSubtree);
        pendingNodes.clear();
        localizationFrame = 0;
      });
    });
    localizationObserver.observe(document.body, { childList: true, subtree: true });
  }
};
