import Panel from "@/apps/web/components/ui/Panel";
import EmptyState from "@/apps/web/components/ui/EmptyState";
import ActiveMeetingCard from "@/apps/web/components/dashboard/ActiveMeetingCard";
import type { MeetingMeta } from "@/lib/meetings";

interface ActiveMeetingsProps {
  meetings: MeetingMeta[];
  workerPortraits: Record<string, string>;
}

/**
 * Dashboard panel listing active (open) meetings across all projects.
 * Server component that receives pre-fetched meeting data from the page.
 * Each meeting renders as a navigation-only ActiveMeetingCard.
 */
export default function ActiveMeetings({ meetings, workerPortraits }: ActiveMeetingsProps) {
  return (
    <Panel title="Active Audiences" variant="parchment">
      {meetings.length === 0 ? (
        <EmptyState message="No active meetings." />
      ) : (
        meetings.map((meeting) => (
          <ActiveMeetingCard
            key={`${meeting.projectName}-${meeting.meetingId}`}
            meeting={meeting}
            portraitUrl={workerPortraits[meeting.worker]}
          />
        ))
      )}
    </Panel>
  );
}
