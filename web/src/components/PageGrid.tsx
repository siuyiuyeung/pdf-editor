'use client';

interface PageGridProps {
  thumbs: string[];
  isSelected?: (index: number) => boolean;
  rotationOf?: (index: number) => number;
  onPageClick?: (index: number) => void;
}

export function PageGrid({ thumbs, isSelected, rotationOf, onPageClick }: PageGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {thumbs.map((src, i) => {
        const selected = isSelected?.(i);
        const content = (
          <>
            <span className="flex h-44 items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL thumbnails */}
              <img
                src={src}
                alt=""
                className="max-h-40 max-w-full shadow transition-transform"
                style={{ transform: `rotate(${rotationOf?.(i) ?? 0}deg)` }}
              />
            </span>
            <span className="mt-1 block text-center text-xs text-gray-500">{i + 1}</span>
          </>
        );
        const cls = `block w-full rounded border-2 p-2 ${selected ? 'border-brand bg-red-50' : 'border-transparent'}`;
        return (
          <li key={i}>
            {onPageClick ? (
              <button
                type="button"
                data-testid="page-thumb"
                aria-label={`Page ${i + 1}`}
                aria-pressed={isSelected ? selected : undefined}
                onClick={() => onPageClick(i)}
                className={`${cls} hover:border-gray-300`}
              >
                {content}
              </button>
            ) : (
              <div data-testid="page-thumb" aria-label={`Page ${i + 1}`} className={cls}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
