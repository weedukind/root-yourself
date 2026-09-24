import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <ul className="list-inside list-disc text-zinc-700">
        <li>
          <Link href="/admin/tags" className="underline">
            Tags verwalten
          </Link>
        </li>
      </ul>
    </div>
  );
}
