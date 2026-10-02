import type { BladeApi, FolderApi, Pane } from 'tweakpane';

// Filter box just above the first folder; it stays put while the panel scrolls
const FONT = 'font-family: var(--tp-base-font-family, Roboto Mono, Source Code Pro, Menlo, Courier, monospace); font-size: 11px;';
const BOX_STYLE = 'position: sticky; top: 0; z-index: 1; display: flex; gap: 4px; padding: 4px; background: var(--tp-base-background-color, #28292e);';
const INPUT_STYLE = FONT + 'flex: 1; min-width: 0; padding: 2px 6px; border: none; border-radius: 2px; background: var(--tp-input-background-color, #3a3c42); color: var(--tp-input-foreground-color, #bbbcc4);';
const CLEAR_STYLE = FONT + 'padding: 0 8px; border: none; border-radius: 2px; background: var(--tp-button-background-color, #4a4c54); color: var(--tp-button-foreground-color, #dddde0); cursor: pointer;';

type Container = { children: BladeApi[] };

const isFolder = (blade: BladeApi): blade is FolderApi => 'children' in blade && 'expanded' in blade;

/** The words a blade can be found by: a folder's or button's title, a binding's label and key. */
function names(blade: BladeApi): string[] {
  const b = blade as Partial<Record<'title' | 'label' | 'key', unknown>>;
  return [b.title, b.label, b.key].filter((n): n is string => typeof n === 'string');
}

/**
 * A text box that shows only the tuning items whose name contains it (ignoring case). A folder whose title matches
 * shows everything in it. While filtering, folders with matches open and the rest hide; clearing the filter brings
 * back every item and each folder's open state from before.
 */
export function addPaneFilter(pane: Pane): void {
  const box = document.createElement('div');
  box.style.cssText = BOX_STYLE;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Filter';
  input.style.cssText = INPUT_STYLE;
  const clear = document.createElement('button');
  clear.textContent = '✕';
  clear.title = 'Clear filter';
  clear.style.cssText = CLEAR_STYLE;
  box.append(input, clear);
  const first = pane.children.find(isFolder);
  if (first) first.element.before(box);
  else pane.element.append(box);

  // Folder open states from before filtering began
  let saved: Map<FolderApi, boolean> | null = null;

  const folders = (parent: Container): FolderApi[] =>
    parent.children.filter(isFolder).flatMap((folder) => [folder, ...folders(folder)]);

  /** Show what matches under parent; true if anything there does. */
  const apply = (parent: Container, query: string, all: boolean): boolean => {
    let any = false;
    for (const blade of parent.children) {
      const matched = all || names(blade).some((n) => n.toLowerCase().includes(query));
      const shown = isFolder(blade) ? apply(blade, query, matched) : matched;
      blade.hidden = !shown;
      if (isFolder(blade) && shown) blade.expanded = true;
      any ||= shown;
    }
    return any;
  };

  const update = () => {
    const query = input.value.trim().toLowerCase();
    clear.style.visibility = query ? 'visible' : 'hidden';
    if (query) {
      saved ??= new Map(folders(pane).map((folder) => [folder, folder.expanded]));
      apply(pane, query, false);
      return;
    }
    if (!saved) return;
    apply(pane, '', true);
    for (const [folder, expanded] of saved) folder.expanded = expanded;
    saved = null;
  };

  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    input.value = '';
    update();
  });
  clear.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus();
  });
  update();
}
