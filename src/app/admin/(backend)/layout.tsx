import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { logout } from "../login/actions";
import { secondaryButton } from "../ui";

const NAV = [
  { href: "/admin/posts", label: "Posts" },
  { href: "/admin/media", label: "Mediathek" },
  { href: "/admin/tags", label: "Tags" },
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <Link href="/admin" className="font-semibold">
            rootyourself · Admin
          </Link>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-zinc-600 hover:text-zinc-900">
              {item.label}
            </Link>
          ))}
          <form action={logout} className="ml-auto flex items-center gap-3">
            <Link href="/admin/account" className="text-sm text-zinc-600 hover:text-zinc-900">
              Konto ({user.email})
            </Link>
            <button type="submit" className={secondaryButton}>
              Abmelden
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
