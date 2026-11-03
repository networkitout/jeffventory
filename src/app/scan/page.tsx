import { requirePageSession } from "@/lib/auth-session";
import ScanWorkbench from "@/components/ScanWorkbench";

export default async function ScanPage() {
  await requirePageSession();
  return <ScanWorkbench />;
}
