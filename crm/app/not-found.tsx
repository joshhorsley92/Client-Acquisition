import Link from 'next/link';

export default function RootNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-surface border border-edge rounded-lg p-8 w-[420px] shadow-card text-center">
        <h1 className="text-xl font-bold mb-2 text-ink">Page not found</h1>
        <p className="text-[13px] text-ink-muted mb-4">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="inline-block px-3.5 py-2 bg-brand-mint text-brand-charcoal rounded text-[13px] font-semibold hover:bg-brand-mint-dark"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
