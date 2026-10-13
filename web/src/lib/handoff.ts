import type { InputFile } from './pdf/types';

// Module-level store survives client-side navigation (next/link, router.push).
let pending: InputFile[] | null = null;

export function setHandoff(files: InputFile[]): void {
  pending = files;
}

export function peekHandoff(): InputFile[] | null {
  return pending;
}

export function takeHandoff(): InputFile[] | null {
  const files = pending;
  pending = null;
  return files;
}

export function clearHandoff(): void {
  pending = null;
}
