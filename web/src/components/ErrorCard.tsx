'use client';

import { ERROR_MESSAGES, type PdfToolError } from '@/lib/pdf/errors';

export function ErrorCard({ error, onDismiss }: { error: PdfToolError; onDismiss: () => void }) {
  const headline = ERROR_MESSAGES[error.code];
  return (
    <div role="alert" className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{headline}</p>
      {error.message && error.message !== headline && <p className="mt-1 text-sm">{error.message}</p>}
      <button type="button" onClick={onDismiss} className="mt-3 text-sm font-semibold underline">
        Try again
      </button>
    </div>
  );
}
