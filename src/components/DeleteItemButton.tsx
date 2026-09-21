"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, fetchJson } from "@/lib/client-api";
import Icon from "./Icon";

export default function DeleteItemButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function onDelete() {
    if (!window.confirm(`Permanently delete "${name}", its photos, and its history? Archive it instead if you want to keep a record.`)) return;
    setDeleting(true);
    setError("");
    try {
      await fetchJson(`/api/items/${id}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onDelete} disabled={deleting} className="button button-small button-danger">
        <Icon name="trash" />{deleting ? "Deleting..." : "Delete item"}
      </button>
      {error && <p className="notice notice-error mt-3" role="alert">{error}</p>}
    </div>
  );
}
