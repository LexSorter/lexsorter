import Image from "next/image";
import { redirect } from "next/navigation";
import logo from "@/logo.png";
import { getCurrentSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type UnlockPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function UnlockPage({ searchParams }: UnlockPageProps) {
  if (await getCurrentSession()) redirect("/");

  const { error } = await searchParams;
  const errorMessage =
    error === "rate"
      ? "Too many attempts. Try again later."
      : error === "service"
        ? "Authentication is temporarily unavailable."
        : error
          ? "Invalid or inactive access code."
          : "";

  return (
    <main className="lock-shell">
      <section className="lock-card" aria-labelledby="access-title">
        <div className="lock-brand">
          <Image src={logo} alt="Lex Sorter" priority sizes="220px" />
        </div>
        <p className="eyebrow">ACCESS RESTRICTED</p>
        <h1 id="access-title">Access restricted</h1>
        <p className="lock-copy">Enter your access code to continue.</p>

        <form className="lock-form" action="/api/auth/login" method="post">
          <label htmlFor="access-code">Access code</label>
          <input
            id="access-code"
            name="accessCode"
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={256}
            required
            autoFocus
          />
          {errorMessage && <div className="error-banner lock-error" role="alert">{errorMessage}</div>}
          <button className="primary-button" type="submit">Unlock</button>
        </form>
      </section>
    </main>
  );
}
