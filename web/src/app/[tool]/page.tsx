import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HowToUse } from '@/components/HowToUse';
import { ToolShell } from '@/components/ToolShell';
import { ToolsGrid } from '@/components/ToolsGrid';
import { SITE_NAME } from '@/site';
import { TOOLS, getTool } from '@/tools';

type Params = { params: Promise<{ tool: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const tool = getTool((await params).tool);
  return tool ? { title: `${tool.title} — ${SITE_NAME}`, description: tool.subtitle } : {};
}

export default async function ToolPage({ params }: Params) {
  const tool = getTool((await params).tool);
  if (!tool) notFound();
  return (
    <main>
      <header className="pb-8 pt-12 text-center">
        <h1 className="font-display text-4xl uppercase text-gray-800">{tool.title}</h1>
        <p className="mt-2 font-semibold text-gray-700">{tool.subtitle}</p>
      </header>
      <ToolShell slug={tool.slug} />
      <HowToUse />
      <ToolsGrid currentSlug={tool.slug} />
    </main>
  );
}
