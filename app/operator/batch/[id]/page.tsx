import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default function BatchDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PagePlaceholder
      title="Batch Details"
      description="Inspect a single fabric batch and its production history."
    />
  );
}
