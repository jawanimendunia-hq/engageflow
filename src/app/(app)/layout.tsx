import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { DialogProvider } from "@/components/DialogProvider";
import NavigationFeedback from "@/components/NavigationFeedback";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DialogProvider>
      <NavigationFeedback />
      <div className="min-h-screen flex items-start">
        <Sidebar email={user.email ?? ""} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </DialogProvider>
  );
}
