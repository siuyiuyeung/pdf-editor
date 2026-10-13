import { SITE_NAME } from '@/site';

export function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-gray-500">
        <p>Most tools run in your browser. Uploaded files are deleted within 1 hour.</p>
        <p className="mt-1">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
