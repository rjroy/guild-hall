import Panel from "@/components/ui/Panel";
import EmptyState from "@/components/ui/EmptyState";

export default function PendingAudiences() {
  return (
    <Panel title="Pending Audiences">
      <EmptyState message="No pending audiences." />
    </Panel>
  );
}
