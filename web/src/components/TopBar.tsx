import Link from 'next/link';
import { SITE_NAME } from '@/site';

export function TopBar() {
  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
        <Link href="/" className="text-xl font-bold text-gray-800">
          {SITE_NAME}
        </Link>
      </div>
    </header>
  );
}
