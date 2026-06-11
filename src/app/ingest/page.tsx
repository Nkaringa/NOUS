import Link from "next/link";
import { IngestForm } from "@/components/IngestForm";

export default async function IngestPage({
  searchParams,
}: {
  searchParams: Promise<{ heading?: string }>;
}) {
  const { heading } = await searchParams;
  return (
    <main className="mx-auto max-w-[820px] px-8 py-10">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1>Ingest</h1>
          <p className="mt-1 text-[13px] text-ink-mid">
            Paste a heading or a list. NOUS will categorize, define, and store
            each one.
          </p>
        </div>
        <Link href="/activity" className="text-[12px] text-ink-mid hover:text-red">
          View activity log →
        </Link>
      </div>
      <IngestForm initialHeading={heading} />
    </main>
  );
}
