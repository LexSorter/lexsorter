import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import Extractor from "./extractor";

export const dynamic = "force-dynamic";

export default async function ExtractPage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/unlock");
  }

  return <Extractor />;
}
