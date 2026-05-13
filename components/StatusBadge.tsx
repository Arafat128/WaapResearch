import { Badge } from "@/components/ui/badge";
import type { TxStatus } from "@/types";

const variants: Record<TxStatus, "default" | "warning" | "success" | "danger" | "muted"> = {
  draft: "muted",
  pending: "warning",
  confirmed: "success",
  failed: "danger",
  stopped: "danger",
  paused: "warning"
};

export function StatusBadge({ status }: { status: TxStatus }) {
  return <Badge variant={variants[status]}>{status}</Badge>;
}
