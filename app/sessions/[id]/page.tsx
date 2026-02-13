import { WorkshopView } from "@/components/workshop/WorkshopView";

type SessionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params;
  return <WorkshopView sessionId={id} />;
}
