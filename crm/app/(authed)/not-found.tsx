import Link from 'next/link';

export default function AuthedNotFound() {
  return (
    <div className="max-w-[480px] mx-auto my-10 p-6">
      <h1 className="text-xl font-bold mb-2 text-ink">Not found</h1>
      <p className="text-[13px] text-ink-muted mb-4">
        That record doesn&apos;t exist or has been removed.
      </p>
      <Link
        href="/"
        className="inline-block px-3.5 py-2 bg-brand-mint text-brand-charcoal rounded text-[13px] font-semibold hover:bg-brand-mint-dark"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
