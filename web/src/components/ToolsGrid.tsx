import Link from 'next/link';
import { TOOLS } from '@/tools';
import { ToolIcon } from './ToolIcon';

export function ToolsGrid({ currentSlug, acceptingExt }: { currentSlug?: string; acceptingExt?: string }) {
  return (
    <section id="tools" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-12">
      <h2 className="mb-8 text-center font-display text-3xl text-gray-800">All Our PDF Tools</h2>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {TOOLS.map((t) => {
          const dim = !t.available || (acceptingExt !== undefined && !t.accept.includes(acceptingExt));
          const cls = [
            'flex min-h-36 flex-col items-center justify-center rounded-md border-2 bg-white p-6 text-center text-gray-700',
            t.slug === currentSlug ? 'border-brand' : 'border-transparent',
            dim ? 'opacity-50' : '',
            t.available ? 'transition-shadow hover:shadow-md' : 'cursor-default',
          ].join(' ');
          const body = (
            <>
              <ToolIcon tool={t} />
              <span className="mt-3">{t.title}</span>
              {!t.available && <span className="mt-1 text-xs uppercase tracking-wide text-gray-400">Coming soon</span>}
            </>
          );
          return (
            <li key={t.slug} data-testid="tool-tile">
              {t.available ? (
                <Link href={`/${t.slug}`} className={cls}>
                  {body}
                </Link>
              ) : (
                <div className={cls} aria-disabled="true">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
