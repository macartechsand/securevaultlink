/**
 * Clickjacking guard for the extension frames shown inside web pages. Uses IntersectionObserver v2
 * (trackVisibility): the browser reports the frame as visible only when nothing covers it and no
 * opacity, filter or transform from the page applies to it. A click counts only after the frame has
 * been visible for a moment, so a page cannot slide it under the cursor right before a click.
 */
const MIN_VISIBLE_MS = 500;

type V2Entry = IntersectionObserverEntry & { isVisible?: boolean };

export function createClickGuard(): () => boolean {
  let visibleSince = 0;
  let supported = true;
  try {
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1] as V2Entry;
        if (e.isVisible === undefined) supported = false;
        if (e.isVisible || (!supported && e.isIntersecting)) visibleSince ||= performance.now();
        else visibleSince = 0;
      },
      { threshold: [0, 1], trackVisibility: true, delay: 100 } as IntersectionObserverInit,
    );
    io.observe(document.body);
  } catch {
    supported = false;
    visibleSince = performance.now();
  }
  return () => visibleSince > 0 && performance.now() - visibleSince >= MIN_VISIBLE_MS;
}

export const BLOCKED_MESSAGE = 'Clique ignorado: a janela da extensão estava coberta ou acabou de aparecer. Tente de novo.';

/** Asks the content script to fit the frame to its content. */
export function reportHeight(send: (height: number) => void) {
  const fit = () => send(Math.ceil(document.documentElement.scrollHeight));
  new ResizeObserver(fit).observe(document.body);
  fit();
}

export const tokenFromHash = () => decodeURIComponent(location.hash.slice(1));

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
