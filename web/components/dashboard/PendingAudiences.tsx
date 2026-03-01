import Panel from "@/web/components/ui/Panel";
import EmptyState from "@/web/components/ui/EmptyState";
import MeetingRequestCard from "@/web/components/dashboard/MeetingRequestCard";
import type { MeetingMeta } from "@/lib/meetings";

interface PendingAudiencesProps {
  requests: MeetingMeta[];
}

/**
 * Dashboard panel listing pending meeting requests across all projects.
 * Server component that receives pre-scanned request data from the page.
 * Each request renders as a MeetingRequestCard with Open/Defer/Ignore actions.
 */
export default function PendingAudiences({ requests }: PendingAudiencesProps) {
  return (
    <Panel title="Pending Audiences">
      {requests.length === 0 ? (
        <EmptyState message="No pending meeting requests." />
      ) : (
        requests.map((request) => (
          <MeetingRequestCard
            key={`${request.projectName}-${request.meetingId}`}
            request={request}
          />
        ))
      )}
    </Panel>
  );
}
