import { AgentDetail } from "@/components/AgentDetail";
import { LiveDataGate } from "@/components/LiveDataGate";
import { loadRoster } from "@/lib/roster";
import { toSlug } from "@/lib/slug";

export function generateStaticParams() {
  const roster = loadRoster();
  return roster.agents.map((a) => ({ slug: toSlug(a.name) }));
}

export default function AgentDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  return (
    <LiveDataGate>
      <AgentDetail slug={params.slug} />
    </LiveDataGate>
  );
}
