import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth-session";
import LoginForm from "@/components/LoginForm";
import { headers } from "next/headers";
import { authConfig } from "@/lib/auth-config";

export const metadata = { title: "Sign in · Jeffventory" };
export default async function LoginPage() {
  const requestHeaders = await headers();
  const { origin } = authConfig();
  if (requestHeaders.get("host") !== new URL(origin).host) redirect(`${origin}/login`);
  const session = await currentSession();
  if (session && !session.user.banned) redirect("/");
  return <LoginForm />;
}
