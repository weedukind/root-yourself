import Link from "next/link";

// Rahmen der öffentlichen Seiten: Header, Main, Footer (docs/concept.md, „Seitenlayout“).
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link href="/" className="text-lg font-semibold">
            rootyourself
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-zinc-200">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-zinc-500">© rootyourself</div>
      </footer>
    </div>
  );
}
