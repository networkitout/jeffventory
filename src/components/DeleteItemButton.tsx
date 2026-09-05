"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteItemButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      alert("Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={deleting}
      className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950 disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
