import { useEffect, useState } from 'react';
import {
  type ComposerElement,
  findBestComposer,
  findComposerFromElement,
} from '../utils/domUtils';

export function useComposerObserver(): ComposerElement | null {
  const [composer, setComposer] = useState<ComposerElement | null>(() => findBestComposer());

  useEffect(() => {
    const refreshComposer = (candidate: Element | null): void => {
      setComposer((currentComposer) => {
        if (currentComposer && currentComposer.isConnected) {
          return findComposerFromElement(candidate) ?? currentComposer;
        }

        return findComposerFromElement(candidate) ?? findBestComposer();
      });
    };

    const handleFocusOrClick = (event: Event): void => {
      refreshComposer(event.target instanceof Element ? event.target : null);
    };

    window.addEventListener('focusin', handleFocusOrClick);
    window.addEventListener('click', handleFocusOrClick);

    const observer = new MutationObserver(() => {
      refreshComposer(document.activeElement instanceof Element ? document.activeElement : null);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      window.removeEventListener('focusin', handleFocusOrClick);
      window.removeEventListener('click', handleFocusOrClick);
    };
  }, []);

  return composer;
}
