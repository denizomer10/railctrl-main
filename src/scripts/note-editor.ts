/**
 * Modern Zengin Not Editörü
 *
 * Sürükle-bırak ve panodan resim ekleme, resim boyutlandırma/hizalama/altyazı,
 * görev listeleri, tablolar, kod blokları, renk paletleri, geri al/yinele
 * yığını, Markdown benzeri hızlı giriş ve otomatik taslak kaydı içerir.
 *
 * Komut yürütme tek bir `runCommand` sarmalayıcısından geçer; böylece
 * `document.execCommand` bağımlılığı tek noktada izole edilir.
 */

import { sanitizeHtml, isSafeUrl, escapeHtml } from '../lib/sanitize';

export interface UploadedMedia {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  type: 'image' | 'video' | 'audio' | 'file';
}

export interface NoteEditorOptions {
  editor: HTMLElement;
  toolbar: HTMLElement;
  statusbar?: HTMLElement | null;
  dropzone?: HTMLElement | null;
  placeholder?: string;
  draftKey?: string;
  onChange?: (html: string) => void;
  onUpload?: (files: File[]) => Promise<UploadedMedia[]>;
  onDeleteMedia?: (paths: string[]) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}

export interface NoteEditorHandle {
  getHTML(): string;
  setHTML(html: string): void;
  clear(): void;
  focus(): void;
  isEmpty(): boolean;
  getStats(): { words: number; chars: number };
  insertMedia(items: UploadedMedia[]): void;
  destroy(): void;
}

const HISTORY_LIMIT = 100;

interface ToolDef {
  cmd: string;
  title: string;
  icon: string;
  shortcut?: string;
  group: string;
  value?: () => string | null;
  activeWhen?: () => boolean;
}

const ICONS: Record<string, string> = {
  bold: '<path d="M6 4h6.5a3.5 3.5 0 0 1 0 7H6z"/><path d="M6 11h7.5a3.5 3.5 0 0 1 0 7H6z"/>',
  italic: '<path d="M14 4h-4"/><path d="M14 20h-4"/><path d="M14.5 4 9.5 20"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M5 20h14"/>',
  strike: '<path d="M4 12h16"/><path d="M7.5 7a4 4 0 0 1 4-2.5h2A3.5 3.5 0 0 1 16 8"/><path d="M16.5 15a4 4 0 0 1-4 3h-2A3.5 3.5 0 0 1 8 14"/>',
  code: '<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>',
  quote: '<path d="M6 17h3l2-4V7H5v6h3z"/><path d="M16 17h3l2-4V7h-6v6h3z"/>',
  ul: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  ol: '<path d="M10 6h10"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="M4 5h1.5v4"/><path d="M3.5 15.5h2l-2 2.5h2"/>',
  task: '<rect x="3.5" y="4.5" width="7" height="7" rx="1.5"/><path d="m5.5 8 1.6 1.6L10.5 6"/><path d="M13 8h7"/><rect x="3.5" y="14.5" width="7" height="7" rx="1.5"/><path d="M13 18h7"/>',
  indentInc: '<path d="M4 6h16"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="m4 10 3 2-3 2z"/>',
  indentDec: '<path d="M4 6h16"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="m7 10-3 2 3 2z"/>',
  alignLeft: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h13"/>',
  alignCenter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M5.5 18h13"/>',
  alignRight: '<path d="M4 6h16"/><path d="M10 12h10"/><path d="M7 18h13"/>',
  alignJustify: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  link: '<path d="M10 13a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7L11 6.6"/><path d="M14 11a4 4 0 0 0-5.7-.3L5.7 13.3a4 4 0 0 0 5.7 5.7L13 17.4"/>',
  unlink: '<path d="M15 9l3-3a3.5 3.5 0 0 0-5-5l-3 3"/><path d="M9 15l-3 3a3.5 3.5 0 0 0 5 5l3-3"/><path d="M4 4l16 16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 3-2 4 4"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M9 4v16"/><path d="M15 4v16"/>',
  hr: '<path d="M4 12h16"/><path d="M6 7h12"/><path d="M6 17h12"/>',
  undo: '<path d="M4 8h10a5 5 0 0 1 0 10h-4"/><path d="m8 4-4 4 4 4"/>',
  redo: '<path d="M20 8H10a5 5 0 0 0 0 10h4"/><path d="m16 4 4 4-4 4"/>',
  clear: '<path d="M5 5h14"/><path d="M8 5V3h8v2"/><path d="M7 5v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5"/><path d="m10 10 4 6"/><path d="m14 10-4 6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8.6z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  highlight: '<path d="m9 11 6-6 4 4-6 6z"/><path d="M7 21h10"/><path d="m11 13-4 4v4h4l4-4"/>',
  caption: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h10"/><path d="M7 12h6"/>',
  shrink: '<path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M4 4l6 6"/><path d="m20 20-6-6"/>',
  grow: '<path d="M9 4H4v5"/><path d="M15 20h5v-5"/><path d="m4 4 6 6"/><path d="m20 20-6-6"/>',
  heading: '<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/>',
};

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function createNoteEditor(options: NoteEditorOptions): NoteEditorHandle {
  const {
    editor,
    toolbar,
    statusbar = null,
    dropzone = null,
    placeholder = 'Not içeriği…',
    draftKey,
    onChange,
    onUpload,
    onDeleteMedia,
    onBusyChange,
  } = options;

  editor.setAttribute('contenteditable', 'true');
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('spellcheck', 'true');
  editor.dataset.placeholder = placeholder;
  editor.classList.add('note-editor-surface');

  let history: string[] = [];
  let historyIndex = -1;
  let applyingHistory = false;
  let suppressChange = false;
  let selectedImage: HTMLImageElement | null = null;
  let savedRange: Range | null = null;
  let busyCount = 0;
  let draftTimer: number | undefined;

  // ---------------------------------------------------------------- Durum

  const setBusy = (busy: boolean) => {
    busyCount = Math.max(0, busyCount + (busy ? 1 : -1));
    onBusyChange?.(busyCount > 0);
  };

  const emitChange = () => {
    if (suppressChange) return;
    updateStatus();
    scheduleDraft();
    onChange?.(editor.innerHTML);
  };

  const updateStatus = () => {
    if (!statusbar) return;
    const text = (editor.innerText || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    statusbar.textContent = `${words} kelime · ${chars} karakter`;
  };

  const scheduleDraft = () => {
    if (!draftKey) return;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      try {
        const html = editor.innerHTML.trim();
        if (html) localStorage.setItem(draftKey, html);
        else localStorage.removeItem(draftKey);
      } catch {
        /* kota dolu olabilir */
      }
    }, 600);
  };

  // ------------------------------------------------------------- Geçmiş

  const pushHistory = () => {
    if (applyingHistory) return;
    const snapshot = editor.innerHTML;
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    if (history.length > HISTORY_LIMIT) history.shift();
    historyIndex = history.length - 1;
    refreshToolbarState();
  };

  const applyHistory = (index: number) => {
    if (index < 0 || index >= history.length) return;
    applyingHistory = true;
    historyIndex = index;
    // Savunma derinliği: geçmiş anlık görüntüleri de beyaz listeden geçir.
    editor.innerHTML = sanitizeHtml(history[index]);
    applyingHistory = false;
    emitChange();
    refreshToolbarState();
  };

  const undo = () => applyHistory(historyIndex - 1);
  const redo = () => applyHistory(historyIndex + 1);

  // ------------------------------------------------------------ Seçim

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    // Geçerli bir seçim zaten editörün içindeyse onu koru.
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) return;

    if (!savedRange || !editor.contains(savedRange.commonAncestorContainer)) {
      savedRange = null;
      editor.focus();
      return;
    }
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };

  const runCommand = (cmd: string, value?: string) => {
    restoreSelection();
    if (!savedRange) editor.focus();
    try {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(cmd, false, value);
    } catch {
      /* komut desteklenmiyor */
    }
    saveSelection();
    pushHistory();
    emitChange();
    refreshToolbarState();
  };

  const insertHtmlAtCursor = (html: string) => {
    restoreSelection();
    if (!savedRange) editor.focus();
    try {
      document.execCommand('insertHTML', false, html);
    } catch {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const fragment = document.createRange().createContextualFragment(html);
        range.insertNode(fragment);
        range.collapse(false);
      }
    }
    saveSelection();
    pushHistory();
    emitChange();
  };

  // --------------------------------------------------------- Araç çubuğu

  const TOOLS: ToolDef[] = [
    { cmd: 'undo', title: 'Geri al', icon: 'undo', shortcut: 'Ctrl+Z', group: 'history' },
    { cmd: 'redo', title: 'Yinele', icon: 'redo', shortcut: 'Ctrl+Y', group: 'history' },
    { cmd: 'bold', title: 'Kalın', icon: 'bold', shortcut: 'Ctrl+B', group: 'inline' },
    { cmd: 'italic', title: 'İtalik', icon: 'italic', shortcut: 'Ctrl+I', group: 'inline' },
    { cmd: 'underline', title: 'Altı çizili', icon: 'underline', shortcut: 'Ctrl+U', group: 'inline' },
    { cmd: 'strikeThrough', title: 'Üstü çizili', icon: 'strike', group: 'inline' },
    { cmd: 'code', title: 'Satır içi kod', icon: 'code', group: 'inline' },
    { cmd: 'blockquote', title: 'Alıntı', icon: 'quote', group: 'block' },
    { cmd: 'ul', title: 'Madde listesi', icon: 'ul', group: 'block' },
    { cmd: 'ol', title: 'Numaralı liste', icon: 'ol', group: 'block' },
    { cmd: 'task', title: 'Görev listesi', icon: 'task', group: 'block' },
    { cmd: 'indentDec', title: 'Girintiyi azalt', icon: 'indentDec', group: 'block' },
    { cmd: 'indentInc', title: 'Girintiyi artır', icon: 'indentInc', group: 'block' },
    { cmd: 'alignLeft', title: 'Sola hizala', icon: 'alignLeft', group: 'align' },
    { cmd: 'alignCenter', title: 'Ortala', icon: 'alignCenter', group: 'align' },
    { cmd: 'alignRight', title: 'Sağa hizala', icon: 'alignRight', group: 'align' },
    { cmd: 'alignJustify', title: 'İki yana yasla', icon: 'alignJustify', group: 'align' },
    { cmd: 'link', title: 'Bağlantı ekle', icon: 'link', shortcut: 'Ctrl+K', group: 'insert' },
    { cmd: 'unlink', title: 'Bağlantıyı kaldır', icon: 'unlink', group: 'insert' },
    { cmd: 'image', title: 'Resim ekle', icon: 'image', group: 'insert' },
    { cmd: 'table', title: 'Tablo ekle', icon: 'table', group: 'insert' },
    { cmd: 'hr', title: 'Ayraç', icon: 'hr', group: 'insert' },
    { cmd: 'removeFormat', title: 'Biçimi temizle', icon: 'clear', group: 'misc' },
  ];

  const toolButtons = new Map<string, HTMLButtonElement>();

  const buildToolbar = () => {
    toolbar.classList.add('note-toolbar');
    toolbar.innerHTML = '';

    // Blok stili seçici
    const blockWrap = document.createElement('div');
    blockWrap.className = 'note-toolbar-group note-block-select';
    const blockSelect = document.createElement('select');
    blockSelect.className = 'note-block-style';
    blockSelect.title = 'Paragraf stili';
    blockSelect.innerHTML = `
      <option value="P">Paragraf</option>
      <option value="H1">Başlık 1</option>
      <option value="H2">Başlık 2</option>
      <option value="H3">Başlık 3</option>
      <option value="H4">Başlık 4</option>
    `;
    blockSelect.addEventListener('change', () => {
      runCommand('formatBlock', blockSelect.value);
    });
    blockWrap.appendChild(blockSelect);
    toolbar.appendChild(blockWrap);

    let currentGroup = '';
    for (const tool of TOOLS) {
      if (tool.group !== currentGroup) {
        const sep = document.createElement('span');
        sep.className = 'note-toolbar-sep';
        sep.setAttribute('aria-hidden', 'true');
        toolbar.appendChild(sep);
        currentGroup = tool.group;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'note-tool';
      btn.dataset.tool = tool.cmd;
      btn.title = tool.shortcut ? `${tool.title} (${tool.shortcut})` : tool.title;
      btn.setAttribute('aria-label', tool.title);
      btn.innerHTML = icon(tool.icon);
      toolButtons.set(tool.cmd, btn);
      toolbar.appendChild(btn);
    }

    // Renk seçiciler (kendi gruplarında)
    const colorSep = document.createElement('span');
    colorSep.className = 'note-toolbar-sep';
    colorSep.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(colorSep);

    const foreSwatch = buildColorPicker('Yazı rengi', ['#111827', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#64748b'], (color) => {
      runCommand('foreColor', color);
    });
    const backSwatch = buildColorPicker('Vurgu rengi', ['#fef08a', '#fecaca', '#fed7aa', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8', '#e2e8f0'], (color) => {
      runCommand('hiliteColor', color);
    });
    toolbar.appendChild(foreSwatch);
    toolbar.appendChild(backSwatch);

    // Resim boyut/hiza araçları (yalnızca resim seçilince görünür)
    const imgTools = document.createElement('div');
    imgTools.className = 'note-img-tools';
    imgTools.style.display = 'none';
    imgTools.innerHTML = `
      <span class="note-toolbar-sep" aria-hidden="true"></span>
      <button type="button" class="note-tool" data-img="shrink" title="Resmi küçült">${icon('shrink')}</button>
      <button type="button" class="note-tool" data-img="grow" title="Resmi büyüt">${icon('grow')}</button>
      <button type="button" class="note-tool" data-img="caption" title="Altyazı ekle">${icon('caption')}</button>
      <button type="button" class="note-tool" data-img="align-left" title="Resmi sola hizala">${icon('alignLeft')}</button>
      <button type="button" class="note-tool" data-img="align-center" title="Resmi ortala">${icon('alignCenter')}</button>
      <button type="button" class="note-tool" data-img="align-right" title="Resmi sağa hizala">${icon('alignRight')}</button>
      <button type="button" class="note-tool note-tool-danger" data-img="remove" title="Resmi kaldır">${icon('clear')}</button>
    `;
    toolbar.appendChild(imgTools);
    (toolbar as any).__imgTools = imgTools as HTMLElement;
  };

  function buildColorPicker(title: string, colors: string[], onPick: (color: string) => void): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'note-color-picker';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'note-tool';
    trigger.title = title;
    trigger.setAttribute('aria-label', title);
    trigger.innerHTML = icon(title.startsWith('Yazı') ? 'palette' : 'highlight');

    const panel = document.createElement('div');
    panel.className = 'note-color-panel';
    panel.style.display = 'none';

    for (const color of colors) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'note-swatch';
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener('mousedown', (e) => e.preventDefault());
      swatch.addEventListener('click', () => {
        onPick(color);
        panel.style.display = 'none';
      });
      panel.appendChild(swatch);
    }

    const custom = document.createElement('input');
    custom.type = 'color';
    custom.className = 'note-swatch-custom';
    custom.title = 'Özel renk';
    custom.value = '#111827';
    custom.addEventListener('input', () => onPick(custom.value));
    panel.appendChild(custom);

    trigger.addEventListener('mousedown', (e) => e.preventDefault());
    trigger.addEventListener('click', () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'grid' : 'none';
    });

    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    return wrap;
  }

  // -------------------------------------------------------- Komutlar

  const currentBlockTag = (): string => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return 'P';
    let node: Node | null = sel.anchorNode;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as HTMLElement).tagName;
        if (['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'LI'].includes(tag)) {
          return tag === 'LI' ? 'P' : tag;
        }
      }
      node = node.parentNode;
    }
    return 'P';
  };

  const refreshToolbarState = () => {
    const states: Record<string, boolean> = {
      bold: safeQuery('bold'),
      italic: safeQuery('italic'),
      underline: safeQuery('underline'),
      strikeThrough: safeQuery('strikeThrough'),
      ul: safeQuery('insertUnorderedList'),
      ol: safeQuery('insertOrderedList'),
    };

    for (const [cmd, btn] of toolButtons) {
      btn.classList.toggle('is-active', !!states[cmd]);
    }

    const blockSelect = toolbar.querySelector<HTMLSelectElement>('.note-block-style');
    if (blockSelect) blockSelect.value = currentBlockTag();

    const imgTools = (toolbar as any).__imgTools as HTMLElement | undefined;
    if (imgTools) {
      imgTools.style.display = selectedImage ? 'flex' : 'none';
    }
  };

  const safeQuery = (cmd: string): boolean => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };

  const closestBlock = (node: Node | null): HTMLElement | null => {
    let current: Node | null = node;
    while (current && current !== editor) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement;
        if (/^(P|H1|H2|H3|H4|BLOCKQUOTE|PRE|DIV|LI)$/.test(el.tagName)) return el;
      }
      current = current.parentNode;
    }
    return null;
  };

  /**
   * Markdown kısaltmasını yeni bir blok düğümüyle değiştirir.
   * `execCommand('formatBlock')` boş düğümde etkisiz olduğundan DOM elle kurulur.
   */
  const replaceWithBlock = (anchor: Node | null, build: () => Node) => {
    const node = build();
    const host = anchor && anchor.parentNode && editor.contains(anchor) ? anchor.parentNode : editor;
    if (anchor && anchor.parentNode && editor.contains(anchor)) {
      anchor.parentNode.replaceChild(node, anchor);
    } else {
      editor.appendChild(node);
    }
    void host;

    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedRange = range.cloneRange();

    pushHistory();
    emitChange();
  };

  const makeBlock = (tag: string): Node => {
    const el = document.createElement(tag);
    el.appendChild(document.createElement('br'));
    return el;
  };

  const makeList = (ordered: boolean): Node => {
    const list = document.createElement(ordered ? 'ol' : 'ul');
    const li = document.createElement('li');
    li.appendChild(document.createElement('br'));
    list.appendChild(li);
    return list;
  };

  const makeTaskList = (): Node => {
    const list = document.createElement('ul');
    list.className = 'task-list';
    for (let i = 0; i < 2; i += 1) {
      const li = document.createElement('li');
      li.dataset.checked = '0';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.contentEditable = 'false';
      li.appendChild(box);
      li.appendChild(document.createTextNode(' Görev'));
      list.appendChild(li);
    }
    return list;
  };

  const makeRule = (): Node => {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createElement('hr'));
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    frag.appendChild(p);
    return frag;
  };

  const execTool = (cmd: string) => {
    switch (cmd) {
      case 'undo':
        undo();
        return;
      case 'redo':
        redo();
        return;
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strikeThrough':
        runCommand(cmd);
        return;
      case 'code':
        toggleInlineCode();
        return;
      case 'blockquote':
        toggleBlock('BLOCKQUOTE');
        return;
      case 'ul':
        runCommand('insertUnorderedList');
        return;
      case 'ol':
        runCommand('insertOrderedList');
        return;
      case 'task':
        insertTaskList();
        return;
      case 'indentInc':
        runCommand('indent');
        return;
      case 'indentDec':
        runCommand('outdent');
        return;
      case 'alignLeft':
        runCommand('justifyLeft');
        return;
      case 'alignCenter':
        runCommand('justifyCenter');
        return;
      case 'alignRight':
        runCommand('justifyRight');
        return;
      case 'alignJustify':
        runCommand('justifyFull');
        return;
      case 'link':
        promptLink();
        return;
      case 'unlink':
        runCommand('unlink');
        return;
      case 'image':
        pickAndUploadImages();
        return;
      case 'table':
        insertTable();
        return;
      case 'hr':
        insertHtmlAtCursor('<hr>');
        return;
      case 'removeFormat':
        runCommand('removeFormat');
        runCommand('unlink');
        return;
      default:
        return;
    }
  };

  const toggleInlineCode = () => {
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const anchorEl = anchor
      ? anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement
      : null;
    const codeEl = anchorEl?.closest('code') ?? null;
    if (codeEl && editor.contains(codeEl)) {
      const parent = codeEl.parentNode!;
      while (codeEl.firstChild) parent.insertBefore(codeEl.firstChild, codeEl);
      parent.removeChild(codeEl);
      pushHistory();
      emitChange();
      return;
    }
    const text = sel?.toString();
    if (text) {
      insertHtmlAtCursor(`<code>${escapeHtml(text)}</code>`);
    } else {
      insertHtmlAtCursor('<code>kod</code>');
    }
  };

  const toggleBlock = (tag: string) => {
    const sel = window.getSelection();
    const block = closestBlock(sel?.anchorNode || null);
    if (block && block.tagName === tag) {
      runCommand('formatBlock', 'P');
    } else {
      runCommand('formatBlock', tag);
    }
  };

  const insertTaskList = () => {
    insertHtmlAtCursor(
      '<ul class="task-list">' +
        '<li data-checked="0"><input type="checkbox" contenteditable="false"> Görev</li>' +
        '<li data-checked="0"><input type="checkbox" contenteditable="false"> Görev</li>' +
      '</ul>'
    );
  };

  const insertTable = () => {
    const rows = window.prompt('Satır sayısı', '3');
    const cols = window.prompt('Sütun sayısı', '3');
    const r = Math.min(20, Math.max(1, Number.parseInt(rows || '3', 10) || 3));
    const c = Math.min(10, Math.max(1, Number.parseInt(cols || '3', 10) || 3));

    let html = '<table class="note-table"><thead><tr>';
    for (let i = 0; i < c; i += 1) html += `<th>Başlık ${i + 1}</th>`;
    html += '</tr></thead><tbody>';
    for (let i = 0; i < r - 1; i += 1) {
      html += '<tr>';
      for (let j = 0; j < c; j += 1) html += '<td>&nbsp;</td>';
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    insertHtmlAtCursor(html);
  };

  const promptLink = () => {
    const sel = window.getSelection();
    const anchorEl = sel?.anchorNode
      ? sel.anchorNode.nodeType === Node.ELEMENT_NODE
        ? (sel.anchorNode as Element)
        : sel.anchorNode.parentElement
      : null;
    const existing = anchorEl?.closest('a') ?? null;
    const current = existing?.getAttribute('href') || '';
    const url = window.prompt('Bağlantı adresi (https://…)', current);
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      if (existing) runCommand('unlink');
      return;
    }
    const normalized = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (!isSafeUrl(normalized)) {
      window.alert('Geçersiz bağlantı adresi.');
      return;
    }
    if (sel && sel.isCollapsed && existing) {
      existing.setAttribute('href', normalized);
      pushHistory();
      emitChange();
      return;
    }
    runCommand('createLink', normalized);
  };

  // ----------------------------------------------------------- Resimler

  const hiddenFileInput = document.createElement('input');
  hiddenFileInput.type = 'file';
  hiddenFileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';
  hiddenFileInput.multiple = true;
  hiddenFileInput.style.display = 'none';
  document.body.appendChild(hiddenFileInput);

  const pickAndUploadImages = () => {
    saveSelection();
    hiddenFileInput.value = '';
    hiddenFileInput.click();
  };

  hiddenFileInput.addEventListener('change', async () => {
    const files = hiddenFileInput.files;
    if (!files || files.length === 0) return;
    await uploadAndInsert(Array.from(files));
    hiddenFileInput.value = '';
  });

  const uploadAndInsert = async (files: File[]) => {
    if (!onUpload || files.length === 0) return;
    setBusy(true);
    try {
      const uploaded = await onUpload(files);
      insertMedia(uploaded);
    } catch (error) {
      console.error('Medya yükleme hatası:', error);
      window.alert(error instanceof Error ? error.message : 'Dosya yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const insertMedia = (items: UploadedMedia[]) => {
    if (!items.length) return;
    let html = '';
    for (const item of items) {
      const src = escapeHtml(item.path);
      const name = escapeHtml(item.name || 'dosya');
      if (item.type === 'image') {
        html += `<figure class="note-figure"><img src="${src}" alt="${name}" width="420"><figcaption>${name}</figcaption></figure>`;
      } else if (item.type === 'video') {
        html += `<figure class="note-figure"><video src="${src}" controls preload="metadata"></video><figcaption>${name}</figcaption></figure>`;
      } else if (item.type === 'audio') {
        html += `<figure class="note-figure"><audio src="${src}" controls preload="metadata"></audio><figcaption>${name}</figcaption></figure>`;
      } else {
        html += `<p><a href="${src}" target="_blank" rel="noopener noreferrer">📎 ${name}</a></p>`;
      }
    }
    insertHtmlAtCursor(html);
  };

  const selectImage = (img: HTMLImageElement | null) => {
    if (selectedImage) selectedImage.classList.remove('is-selected');
    selectedImage = img;
    if (selectedImage) selectedImage.classList.add('is-selected');
    refreshToolbarState();
  };

  const handleImageTool = (action: string) => {
    if (!selectedImage) return;
    switch (action) {
      case 'shrink':
      case 'grow': {
        const current = selectedImage.width || 420;
        const delta = action === 'grow' ? 80 : -80;
        const next = Math.min(1600, Math.max(120, current + delta));
        selectedImage.setAttribute('width', String(next));
        selectedImage.style.width = `${next}px`;
        break;
      }
      case 'caption': {
        const figure = selectedImage.closest('figure');
        const current = figure?.querySelector('figcaption')?.textContent || '';
        const text = window.prompt('Resim altyazısı', current);
        if (text === null) break;
        if (!figure) {
          const wrapper = document.createElement('figure');
          wrapper.className = 'note-figure';
          selectedImage.replaceWith(wrapper);
          wrapper.appendChild(selectedImage);
          const cap = document.createElement('figcaption');
          cap.textContent = text;
          wrapper.appendChild(cap);
        } else {
          let cap = figure.querySelector('figcaption');
          if (!cap) {
            cap = document.createElement('figcaption');
            figure.appendChild(cap);
          }
          cap.textContent = text;
        }
        break;
      }
      case 'align-left':
      case 'align-center':
      case 'align-right': {
        const figure = selectedImage.closest('figure') || selectedImage;
        (figure as HTMLElement).style.float = '';
        (figure as HTMLElement).style.marginLeft = '';
        (figure as HTMLElement).style.marginRight = '';
        (figure as HTMLElement).style.display = '';
        if (action === 'align-left') {
          (figure as HTMLElement).style.float = 'left';
          (figure as HTMLElement).style.marginRight = '1rem';
        } else if (action === 'align-right') {
          (figure as HTMLElement).style.float = 'right';
          (figure as HTMLElement).style.marginLeft = '1rem';
        } else {
          (figure as HTMLElement).style.display = 'block';
          (figure as HTMLElement).style.marginLeft = 'auto';
          (figure as HTMLElement).style.marginRight = 'auto';
        }
        break;
      }
      case 'remove': {
        const target = selectedImage.closest('figure') || selectedImage;
        const src = selectedImage.getAttribute('src') || '';
        target.remove();
        selectImage(null);
        if (src && onDeleteMedia) {
          void onDeleteMedia([src]).catch(() => undefined);
        }
        break;
      }
      default:
        return;
    }
    pushHistory();
    emitChange();
  };

  // -------------------------------------------------- Sürükle-bırak & Pano

  const highlightDrop = (on: boolean) => {
    (dropzone || editor).classList.toggle('is-dragover', on);
  };

  const collectFiles = (dt: DataTransfer | null): File[] => {
    if (!dt) return [];
    const files: File[] = [];
    if (dt.items) {
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (files.length === 0 && dt.files) {
      files.push(...Array.from(dt.files));
    }
    return files;
  };

  const dropTarget = dropzone || editor;

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    highlightDrop(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    if (!dropTarget.contains(e.relatedTarget as Node)) highlightDrop(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    highlightDrop(false);

    // İmlecin bırakıldığı noktaya yerleştir
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range && editor.contains(range.startContainer)) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        savedRange = range.cloneRange();
      }
    }

    const files = collectFiles(e.dataTransfer);
    if (files.length) {
      void uploadAndInsert(files);
      return;
    }

    // Metin/HTML sürüklenmişse olduğu gibi yerleştir
    const text = e.dataTransfer?.getData('text/html');
    if (text) insertHtmlAtCursor(sanitizeHtml(text));
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      void uploadAndInsert(files);
      return;
    }
    const html = e.clipboardData?.getData('text/html');
    if (html) {
      e.preventDefault();
      insertHtmlAtCursor(sanitizeHtml(html));
      return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      e.preventDefault();
      insertHtmlAtCursor(escapeHtml(text).replace(/\n/g, '<br>'));
    }
  };

  // ------------------------------------------------------ Klavye & Markdown

  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') { e.preventDefault(); execTool('bold'); return; }
      if (key === 'i') { e.preventDefault(); execTool('italic'); return; }
      if (key === 'u') { e.preventDefault(); execTool('underline'); return; }
      if (key === 'k') { e.preventDefault(); execTool('link'); return; }
      if (key === 'z') { e.preventDefault(); undo(); return; }
      if (key === 'y') { e.preventDefault(); redo(); return; }
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      redo();
      return;
    }

    // Tab / Shift+Tab liste girintisi
    if (e.key === 'Tab') {
      const sel = window.getSelection();
      const anchorEl = sel?.anchorNode
        ? sel.anchorNode.nodeType === Node.ELEMENT_NODE
          ? (sel.anchorNode as Element)
          : sel.anchorNode.parentElement
        : null;
      const li = anchorEl?.closest('li') ?? null;
      if (li && editor.contains(li)) {
        e.preventDefault();
        runCommand(e.shiftKey ? 'outdent' : 'indent');
      }
      return;
    }

    // Markdown benzeri hızlı giriş
    if (e.key === ' ' && !mod) {
      const sel = window.getSelection();
      const anchor = sel?.anchorNode || null;
      const textSource = anchor?.nodeType === Node.TEXT_NODE ? anchor : closestBlock(anchor);
      const text = (textSource?.textContent || '').trim();
      if (!text) return;

      const headings: Record<string, string> = {
        '#': 'h1', '##': 'h2', '###': 'h3', '####': 'h4',
      };
      const convert = (build: () => Node) => {
        e.preventDefault();
        replaceWithBlock(anchor, build);
      };

      if (headings[text]) {
        const tag = headings[text];
        convert(() => makeBlock(tag));
        return;
      }
      if (text === '>') {
        convert(() => makeBlock('blockquote'));
        return;
      }
      if (text === '-' || text === '*') {
        convert(() => makeList(false));
        return;
      }
      if (text === '1.') {
        convert(() => makeList(true));
        return;
      }
      if (text === '[]') {
        convert(makeTaskList);
        return;
      }
      if (text === '---') {
        convert(makeRule);
      }
    }
  };

  // ------------------------------------------------------------- Olaylar

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const toolBtn = target.closest?.('.note-tool') as HTMLButtonElement | null;
    if (toolBtn && toolbar.contains(toolBtn)) {
      e.preventDefault();
      const imgAction = toolBtn.dataset.img;
      if (imgAction) {
        handleImageTool(imgAction);
        return;
      }
      const cmd = toolBtn.dataset.tool;
      if (cmd) execTool(cmd);
      return;
    }

    const checkbox = target.closest?.('li[data-checked] input[type="checkbox"]') as HTMLInputElement | null;
    if (checkbox) {
      const li = checkbox.closest('li') as HTMLElement;
      const checked = checkbox.checked;
      li.dataset.checked = checked ? '1' : '0';
      li.classList.toggle('is-checked', checked);
      pushHistory();
      emitChange();
      return;
    }

    const img = target.closest?.('img') as HTMLImageElement | null;
    if (img && editor.contains(img)) {
      selectImage(img);
      return;
    }

    if (editor.contains(target)) selectImage(null);
  };

  const onSelectionChange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      saveSelection();
      refreshToolbarState();
    }
  };

  const onInput = () => {
    pushHistory();
    emitChange();
    updatePlaceholder();
  };

  const updatePlaceholder = () => {
    const empty = editor.textContent?.trim() === '' && !editor.querySelector('img,video,hr,table');
    editor.classList.toggle('is-empty', empty);
  };

  // Dokunmatik: resimleri çift dokunuşla boyutlandır
  editor.addEventListener('dblclick', (e) => {
    const img = (e.target as HTMLElement).closest?.('img') as HTMLImageElement | null;
    if (img) handleImageTool('grow');
  });

  // Araç çubuğu tıklamaları seçimi kaybetmemeli: mousedown'de seçimi kaydet.
  toolbar.addEventListener('mousedown', (e) => {
    saveSelection();
    e.preventDefault();
  });
  toolbar.addEventListener('click', onClick);
  editor.addEventListener('click', onClick);
  editor.addEventListener('input', onInput);
  editor.addEventListener('keydown', onKeyDown);
  editor.addEventListener('paste', onPaste);
  editor.addEventListener('dragover', onDragOver);
  editor.addEventListener('dragleave', onDragLeave);
  editor.addEventListener('drop', onDrop);
  document.addEventListener('selectionchange', onSelectionChange);

  if (dropzone && dropzone !== editor) {
    dropzone.addEventListener('dragover', onDragOver);
    dropzone.addEventListener('dragleave', onDragLeave);
    dropzone.addEventListener('drop', onDrop);
  }

  // ---------------------------------------------------------- Yaşam döngüsü

  buildToolbar();
  updatePlaceholder();
  updateStatus();

  const setHTML = (html: string) => {
    suppressChange = true;
    editor.innerHTML = sanitizeHtml(html || '');
    suppressChange = false;
    history = [editor.innerHTML];
    historyIndex = 0;
    selectImage(null);
    updatePlaceholder();
    updateStatus();
    refreshToolbarState();
  };

  const clear = () => {
    setHTML('');
    try {
      if (draftKey) localStorage.removeItem(draftKey);
    } catch {
      /* yoksay */
    }
  };

  const getHTML = () => sanitizeHtml(editor.innerHTML);

  const destroy = () => {
    window.clearTimeout(draftTimer);
    document.removeEventListener('selectionchange', onSelectionChange);
    hiddenFileInput.remove();
  };

  return {
    getHTML,
    setHTML,
    clear,
    focus: () => editor.focus(),
    isEmpty: () => editor.textContent?.trim() === '' && !editor.querySelector('img,video,hr,table'),
    getStats: () => {
      const text = (editor.innerText || '').trim();
      return { words: text ? text.split(/\s+/).filter(Boolean).length : 0, chars: text.length };
    },
    insertMedia,
    destroy,
  };
}