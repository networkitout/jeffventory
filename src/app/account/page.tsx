import { requirePageSession } from "@/lib/auth-session";
import AccountSettings from "@/components/AccountSettings";

export const metadata = { title: "Account & access · Jeffventory" };
export default async function AccountPage() {
  const { user } = await requirePageSession();
  return <AccountSettings name={user.name} email={user.email} owner={user.role === "admin"} />;
}
