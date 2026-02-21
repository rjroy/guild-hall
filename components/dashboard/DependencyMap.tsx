import Panel from "@/components/ui/Panel";
import EmptyState from "@/components/ui/EmptyState";

export default function DependencyMap() {
  return (
    <Panel title="Task Dependency Map">
      <EmptyState message="No active commissions." />
    </Panel>
  );
}
