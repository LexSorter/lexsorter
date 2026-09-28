import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import Sorter from "./sorter";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/unlock");
  }

  return <Sorter />;
}


<div className="fixed bottom-6 right-6 z-50">
  <a
    href="/extract"
    className="inline-flex items-center rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-zinc-800"
  >
    Extract Emails
  </a>
</div>
