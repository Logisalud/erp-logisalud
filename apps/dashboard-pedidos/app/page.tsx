import { AuthGate } from "@/components/auth-gate";
import { DashboardView } from "@/components/dashboard-view";

export default function HomePage() {
  return (
    <AuthGate>
      <DashboardView />
    </AuthGate>
  );
}
