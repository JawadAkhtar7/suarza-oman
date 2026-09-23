import '@testing-library/jest-dom/vitest';

/*
 * Tests run as a desktop browser: `min-width` queries match, so the components
 * that pick a layout render the table rather than the phone cards. jsdom's own
 * matchMedia answers `false` to everything, which would quietly test only the
 * mobile half of every screen.
 */
window.matchMedia = ((query: string) => ({
  matches: query.includes('min-width'),
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

window.scrollTo ??= (() => {}) as typeof window.scrollTo;

/* jsdom has no FontFaceSet; Mantine's autosizing Textarea listens on it to
   re-measure once webfonts land. Without this the modal crashes on mount. */
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: { addEventListener: () => {}, removeEventListener: () => {}, ready: Promise.resolve() },
    configurable: true,
  });
}

/*
 * Mantine renders modals, tooltips and the spotlight into a shared portal node
 * attached to <body>. React Testing Library's cleanup only unmounts the
 * container it created, so an open modal — and the aria-hidden it puts on
 * everything behind it — survives into the next test and hides that test's page
 * from every query. Clearing it here keeps tests independent of their order.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { modals } from '@mantine/modals';

afterEach(() => {
  /* Unmounted explicitly rather than relying on the library's auto-cleanup:
     without it the previous test's markup is still in the document, and a
     `findBy` happily matches the OLD screen before the new one has rendered —
     which fails in a way that looks like a component bug. */
  cleanup();

  /* The modal manager is a module-level store, so a confirm dialog left open
     by one test re-opens itself the moment the next test mounts a provider. */
  modals.closeAll();

  for (const node of document.querySelectorAll('[data-mantine-shared-portal-node]')) {
    node.remove();
  }
  document.body.removeAttribute('aria-hidden');
  document.body.style.removeProperty('overflow');
});
