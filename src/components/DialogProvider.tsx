"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogVariant = "default" | "danger" | "info";

interface DialogOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
}

interface DialogState extends DialogOptions {
  kind: "confirm" | "alert";
  message: string;
  resolve: (value: boolean) => void;
}

interface DialogApi {
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
  alert: (message: string, options?: DialogOptions) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const confirm = useCallback(
    (message: string, options: DialogOptions = {}) =>
      new Promise<boolean>((resolve) => {
        setDialog({ kind: "confirm", message, resolve, ...options });
      }),
    []
  );

  const alert = useCallback(
    (message: string, options: DialogOptions = {}) =>
      new Promise<void>((resolve) => {
        setDialog({
          kind: "alert",
          message,
          resolve: () => resolve(),
          variant: "info",
          ...options,
        });
      }),
    []
  );

  const close = useCallback(
    (result: boolean) => {
      if (!dialog) return;
      setDialog(null);
      dialog.resolve(result);
    },
    [dialog]
  );

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      if (event.key === "Enter" && dialog.kind === "alert") close(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, close]);

  const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);
  const danger = dialog?.variant === "danger";

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 animate-glass-fade"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="glass-dialog-title"
            aria-describedby="glass-dialog-description"
            className="glass-dialog relative w-full max-w-md overflow-hidden rounded-[32px] border border-border bg-white p-7"
          >
            <div className="relative flex gap-4">
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-2xl border",
                  danger
                    ? "border-[#f34646]/30 bg-[#f34646]/15 text-[#d93232]"
                    : "border-[#466cf3]/25 bg-[#466cf3]/10 text-[#466cf3]"
                )}
              >
                {danger ? (
                  <AlertTriangle className="size-5" />
                ) : dialog.kind === "alert" ? (
                  <Info className="size-5" />
                ) : (
                  <Sparkles className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="glass-dialog-title" className="text-lg font-semibold">
                  {dialog.title ??
                    (dialog.kind === "alert" ? "Informasi" : "Konfirmasi")}
                </h2>
                <p
                  id="glass-dialog-description"
                  className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted"
                >
                  {dialog.message}
                </p>
              </div>
            </div>

            <div className="relative mt-6 flex justify-end gap-2">
              {dialog.kind === "confirm" && (
                <button
                  type="button"
                  autoFocus
                  onClick={() => close(false)}
                  className="btn-ghost border border-black"
                >
                  {dialog.cancelText ?? "Batal"}
                </button>
              )}
              <button
                type="button"
                autoFocus={dialog.kind === "alert"}
                onClick={() => close(true)}
                className={danger ? "btn-danger" : "btn-primary"}
              >
                {dialog.confirmText ??
                  (dialog.kind === "alert" ? "Mengerti" : "Lanjutkan")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog harus digunakan di dalam DialogProvider");
  }
  return context;
}
