"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useDialog } from "@/components/DialogProvider";

interface Props {
  campaignId: string;
  campaignName: string;
  redirectAfterDelete?: boolean;
  compact?: boolean;
}

export default function DeleteCampaignButton({
  campaignId,
  campaignName,
  redirectAfterDelete = false,
  compact = false,
}: Props) {
  const router = useRouter();
  const dialog = useDialog();
  const [deleting, setDeleting] = useState(false);

  async function removeCampaign() {
    const confirmed = await dialog.confirm(
      `Campaign “${campaignName}” beserta semua link dan assignment di dalamnya akan dihapus permanen.`,
      {
        title: "Hapus campaign?",
        confirmText: "Ya, hapus",
        variant: "danger",
      }
    );
    if (!confirmed) return;

    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaignId);

    if (error) {
      setDeleting(false);
      await dialog.alert(`Campaign gagal dihapus: ${error.message}`, {
        title: "Gagal menghapus",
        variant: "danger",
      });
      return;
    }

    if (redirectAfterDelete) {
      router.replace("/campaigns");
    } else {
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={removeCampaign}
      disabled={deleting}
      className={cn(
        compact
          ? "p-2 text-muted hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
          : "btn-danger",
        "shrink-0"
      )}
      title={`Hapus campaign ${campaignName}`}
      aria-label={`Hapus campaign ${campaignName}`}
    >
      {deleting ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      {!compact && (deleting ? "Menghapus..." : "Hapus campaign")}
    </button>
  );
}
