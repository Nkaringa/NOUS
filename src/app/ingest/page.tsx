import Link from "next/link";
import { IngestForm } from "@/components/IngestForm";

export default async function IngestPage({
  searchParams,
}: {
  searchParams: Promise<{ heading?: string }>;
}) {
  const { heading } = await searchParams;
  return (
    <main className="mx-auto max-w-[760px] px-9 pb-[90px] pt-11">
      <div className="flex items-baseline justify-between">
        <div>
          <h1>Ingest</h1>
          <p className="mt-1 text-[13px] text-ink-mid">
            Paste anything — one heading, a list, or markdown. NOUS splits it
            for you.
          </p>
        </div>
        <Link href="/activity" className="text-[12px] font-medium text-red hover:underline">
          activity log →
        </Link>
      </div>
      <IngestForm initialHeading={heading} />
    </main>
  );
}
