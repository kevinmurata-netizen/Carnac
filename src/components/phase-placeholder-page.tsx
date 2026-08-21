import { PageHeader } from "@/components/layout/page-header";
import { PhaseComingSoon } from "@/components/phase-coming-soon";

export function PhasePlaceholderPage({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: number;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <PhaseComingSoon feature={title} phase={phase} />
    </div>
  );
}
