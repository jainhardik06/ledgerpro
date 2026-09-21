"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, Info, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info" | "default";
}

export interface AlertOptions {
  title?: string;
  message: string;
  okText?: string;
  variant?: "info" | "error" | "warning" | "success";
}

type DialogState =
  | {
      type: "confirm";
      options: ConfirmOptions;
      resolve: (val: boolean) => void;
    }
  | {
      type: "alert";
      options: AlertOptions;
      resolve: () => void;
    }
  | null;

let activeDialogListener: ((dialog: DialogState) => void) | null = null;

export function confirmModal(
  options: ConfirmOptions | string,
  extra?: Partial<ConfirmOptions>
): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof options === "string"
      ? { message: options, ...extra }
      : { ...options, ...extra };

  return new Promise<boolean>((resolve) => {
    if (activeDialogListener) {
      activeDialogListener({
        type: "confirm",
        options: opts,
        resolve,
      });
    } else {
      // Fallback if not mounted
      if (typeof window !== "undefined") {
        resolve(window.confirm(opts.message));
      } else {
        resolve(true);
      }
    }
  });
}

export function alertModal(
  options: AlertOptions | string,
  extra?: Partial<AlertOptions>
): Promise<void> {
  const opts: AlertOptions =
    typeof options === "string"
      ? { message: options, ...extra }
      : { ...options, ...extra };

  return new Promise<void>((resolve) => {
    if (activeDialogListener) {
      activeDialogListener({
        type: "alert",
        options: opts,
        resolve,
      });
    } else {
      if (typeof window !== "undefined") {
        window.alert(opts.message);
      }
      resolve();
    }
  });
}

export function DialogContainer() {
  const [currentDialog, setCurrentDialog] = useState<DialogState>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeDialogListener = setCurrentDialog;
    return () => {
      activeDialogListener = null;
    };
  }, []);

  const handleClose = useCallback(() => {
    if (!currentDialog) return;
    if (currentDialog.type === "confirm") {
      currentDialog.resolve(false);
    } else {
      currentDialog.resolve();
    }
    setCurrentDialog(null);
  }, [currentDialog]);

  const handleConfirm = useCallback(() => {
    if (!currentDialog) return;
    if (currentDialog.type === "confirm") {
      currentDialog.resolve(true);
    } else {
      currentDialog.resolve();
    }
    setCurrentDialog(null);
  }, [currentDialog]);

  useEffect(() => {
    if (currentDialog) {
      // Lock scroll while dialog is visible
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Focus action button
      const timer = setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          handleClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
        clearTimeout(timer);
      };
    }
  }, [currentDialog, handleClose]);

  if (!currentDialog) return null;

  const isConfirm = currentDialog.type === "confirm";
  const variant = currentDialog.options.variant || (isConfirm ? "danger" : "info");

  const getVariantStyles = () => {
    switch (variant) {
      case "danger":
      case "error":
        return {
          icon: <AlertCircle className="w-5 h-5 text-rose-400" aria-hidden />,
          badgeCls: "bg-rose-500/10 border-rose-500/20 text-rose-400",
          confirmCls: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm shadow-rose-600/30",
        };
      case "warning":
        return {
          icon: <AlertCircle className="w-5 h-5 text-amber-400" aria-hidden />,
          badgeCls: "bg-amber-500/10 border-amber-500/20 text-amber-400",
          confirmCls: "bg-amber-600 text-white hover:bg-amber-500 shadow-sm shadow-amber-600/30",
        };
      case "success":
        return {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" aria-hidden />,
          badgeCls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
          confirmCls: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-600/30",
        };
      case "info":
      default:
        return {
          icon: <Info className="w-5 h-5 text-sky-400" aria-hidden />,
          badgeCls: "bg-sky-500/10 border-sky-500/20 text-sky-400",
          confirmCls: "bg-white text-black hover:bg-neutral-200 shadow-sm",
        };
    }
  };

  const styles = getVariantStyles();
  const defaultTitle = isConfirm
    ? variant === "danger"
      ? "Confirm Deletion"
      : "Confirm Action"
    : variant === "error"
    ? "Something went wrong"
    : "Notification";

  const title = currentDialog.options.title || defaultTitle;
  const confirmText =
    (currentDialog.options as ConfirmOptions).confirmText ||
    (isConfirm ? "Confirm" : "OK");
  const cancelText = (currentDialog.options as ConfirmOptions).cancelText || "Cancel";

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      {/* Click outside to dismiss */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Modal Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md bg-[#111111] border border-white/[0.12] rounded-2xl p-5 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-150 text-white"
      >
        {/* Top-Right Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close dialog"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 10,
          }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content Header with Icon */}
        <div className="flex items-start gap-3.5" style={{ paddingRight: '36px' }}>
          <div
            className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
              styles.badgeCls
            )}
          >
            {styles.icon}
          </div>

          <div className="flex-1 pt-0.5 min-w-0">
            <h3 className="text-[15px] font-semibold text-white tracking-tight">
              {title}
            </h3>
            <p className="mt-2 text-[13px] text-neutral-300 leading-relaxed whitespace-pre-wrap">
              {currentDialog.options.message}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-white/[0.08]">
          {isConfirm && (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg border border-white/[0.1] text-[13px] font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              {cancelText}
            </button>
          )}

          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            className={cn(
              "px-4 py-2 rounded-lg text-[13px] font-semibold transition-all active:scale-95",
              styles.confirmCls
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
