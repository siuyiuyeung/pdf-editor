'use client';

import { useEffect } from 'react';

/** Stops the browser from opening a file dropped outside a drop zone (which would lose the page state). */
export function usePreventWindowDrop(): void {
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);
}
