// A small button in the window corner that shows or hides the panel, sized for a finger; the panel opens below it
const MARGIN = 8;
const BUTTON_SIZE = 32;
const GAP = 4;
const BUTTON_STYLE = `position: fixed; top: ${MARGIN}px; right: ${MARGIN}px; z-index: 1000; width: ${BUTTON_SIZE}px; height: ${BUTTON_SIZE}px; padding: 0; border: none; border-radius: 6px; background: var(--tp-base-background-color, #28292e); color: var(--tp-button-foreground-color, #dddde0); font-size: 18px; line-height: ${BUTTON_SIZE}px; opacity: 0.7; cursor: pointer; touch-action: manipulation;`;
const ICON = '⚙';
// Whether the panel was left open, kept per browser
const STORAGE_KEY = 'tuningPanelOpen';

function remembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function remember(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Not kept; it starts hidden next time
  }
}

/**
 * Hide the panel (its fixed container) behind a corner button, hidden at first unless it was left open; key toggles it
 * too. Returns the toggle.
 */
export function addPaneToggle(container: HTMLElement, key: string): () => void {
  container.style.top = `${MARGIN + BUTTON_SIZE + GAP}px`;
  container.style.maxHeight = `calc(100vh - ${2 * MARGIN + BUTTON_SIZE + GAP}px)`;
  const button = document.createElement('button');
  button.textContent = ICON;
  button.title = `Tuning (${key.toUpperCase()})`;
  button.style.cssText = BUTTON_STYLE;
  document.body.appendChild(button);

  const show = (open: boolean) => {
    container.style.display = open ? '' : 'none';
    remember(open);
  };
  const toggle = () => show(container.style.display === 'none');
  button.addEventListener('click', toggle);
  show(remembered());
  return toggle;
}
