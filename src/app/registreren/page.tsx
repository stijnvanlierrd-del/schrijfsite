import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { Star } from "@/components/Ornaments";
import { getSessionUserSafe } from "@/lib/auth";

export const metadata: Metadata = { title: "Account maken" };

export default async function RegisterPage() {
  if (await getSessionUserSafe()) redirect("/studio");
  return (
    <div className="wrap auth">
      <span className="kicker">
        <Star /> Gratis abonnement
      </span>
      <h1 className="headline" style={{ fontSize: "clamp(40px, 6vw, 64px)" }}>
        Word lid van de redactie
      </h1>
      <p className="muted">Met een account bewaart u uw handschriften en teksten veilig, en kunt u de AI-analyse gebruiken.</p>
      <div className="panel">
        <Suspense>
          <AuthForm mode="register" />
        </Suspense>
      </div>
    </div>
  );
}
