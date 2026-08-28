import { AppNav } from "@/app/components/AppNav";
import { OnboardingGate } from "@/components/OnboardingGate";
import { JobProgressBar } from "@/components/JobProgressBar";

export const dynamic =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? "force-static" : "force-dynamic";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <JobProgressBar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <OnboardingGate>{children}</OnboardingGate>
      </div>
    </div>
  );
}
