import { BoardView } from "@/components/BoardView";

export default function BoardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50">
          Work board
        </h1>
        <p className="mt-2 text-sm text-ink-300">
          Kanban view of agent tasks — move cards between Backlog, In progress,
          Review and Done.
        </p>
      </div>
      <BoardView />
    </div>
  );
}
