import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 40px",
          background: "hsl(222, 84%, 5%)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>{children}</div>
      </main>
    </div>
  );
}
