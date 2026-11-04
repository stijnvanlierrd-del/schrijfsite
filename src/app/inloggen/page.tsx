import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { Star } from "@/components/Ornaments";
import { getSessionUserSafe } from "@/lib/auth";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage() {
  if (await getSessionUserSafe()) redirect("/studio");
  return (
    <div className="wrap auth">
      <span className="kicker">
        <Star /> Abonnees
      </span>
      <h1 className="headline" style={{ fontSize: "clamp(40px, 6vw, 64px)" }}>
        Welkom terug
      </h1>
      <div className="panel">
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}
