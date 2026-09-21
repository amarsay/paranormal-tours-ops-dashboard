import { CodexQueue } from "@/components/CodexQueue";

export default function CodexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50">
          Codex Ignota queue
        </h1>
        <p className="mt-2 text-sm text-ink-300">
          Validate paranormal claims before publication. Entries flow from
          Submitted through In review to Published or Rejected.
        </p>
      </div>
      <CodexQueue />
    </div>
  );
}
