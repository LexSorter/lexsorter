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
