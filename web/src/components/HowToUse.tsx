import { Download, FilePenLine, MousePointerClick } from 'lucide-react';
import { SITE_NAME } from '@/site';

const STEPS = [
  { icon: MousePointerClick, title: 'Choose Functionality', text: 'Click on the document editing option you need' },
  { icon: FilePenLine, title: 'Edit Your Document', text: 'Use our user-friendly tool to get your work done' },
  { icon: Download, title: 'Download Your Document', text: 'Save your document. Done!' },
];

export function HowToUse() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="mb-10 text-center font-display text-3xl text-gray-800">How to Use {SITE_NAME}?</h2>
      <ol className="grid gap-10 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="text-center">
            <Icon className="mx-auto h-20 w-20 text-sky-500" strokeWidth={1.25} aria-hidden />
            <h3 className="mt-4 text-xl font-bold text-gray-800">{title}</h3>
            <p className="mt-1 text-gray-500">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
