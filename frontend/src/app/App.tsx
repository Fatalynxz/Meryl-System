import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';

function hasVisibleModal() {
  const modalSelector = [
    '[data-slot="dialog-content"]',
    '[data-slot="alert-dialog-content"]',
    '[data-slot="sheet-content"]',
    '[data-slot="drawer-content"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
  ].join(', ');

  return Array.from(document.querySelectorAll(modalSelector)).some((element) => {
    const node = element as HTMLElement;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();

    return (
      node.dataset.state !== 'closed' &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  });
}

function unlockStuckUi() {
  if (typeof document === 'undefined') return;

  if (!hasVisibleModal()) {
    const overlaySelector = [
      '[data-slot="dialog-overlay"]',
      '[data-slot="alert-dialog-overlay"]',
      '[data-slot="sheet-overlay"]',
      '[data-slot="drawer-overlay"]',
      '[data-radix-dialog-overlay]',
      '.fixed.inset-0',
    ].join(', ');

    document.querySelectorAll(overlaySelector).forEach((element) => {
      const node = element as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const coversViewport = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
      const isLikelyOverlay =
        node.dataset.slot?.includes('overlay') ||
        node.hasAttribute('data-radix-dialog-overlay') ||
        (style.position === 'fixed' && coversViewport);

      if (isLikelyOverlay) {
        node.remove();
      }
    });
  }

  document.body.style.pointerEvents = '';
  document.body.style.overflow = '';
  document.body.style.removeProperty('pointer-events');
  document.body.style.removeProperty('overflow');
  document.body.removeAttribute('data-scroll-locked');
  document.body.removeAttribute('aria-hidden');
  document.documentElement.style.removeProperty('pointer-events');
  document.documentElement.style.removeProperty('overflow');

  const appRoot = document.getElementById('root');
  appRoot?.removeAttribute('aria-hidden');
  appRoot?.removeAttribute('data-aria-hidden');
  appRoot?.removeAttribute('inert');
}

function UiUnlocker() {
  useEffect(() => {
    unlockStuckUi();

    const timers = [
      window.setTimeout(unlockStuckUi, 100),
      window.setTimeout(unlockStuckUi, 500),
      window.setTimeout(unlockStuckUi, 1500),
    ];
    const interval = window.setInterval(unlockStuckUi, 1000);
    const stopInterval = window.setTimeout(() => window.clearInterval(interval), 15000);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        unlockStuckUi();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('focus', unlockStuckUi);
    document.addEventListener('visibilitychange', unlockStuckUi);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
      window.clearTimeout(stopInterval);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('focus', unlockStuckUi);
      document.removeEventListener('visibilitychange', unlockStuckUi);
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <>
      <UiUnlocker />
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
