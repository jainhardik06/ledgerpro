"use client";

import React, {
  useState,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { Filter, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  isFilterActive?: boolean;
  activeCount?: number;
  onClearAll?: () => void;
  title?: string;
  children: React.ReactNode;
}

interface Coords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function calculateCoords(trigger: HTMLElement | null): Coords | null {
  if (!trigger || typeof window === "undefined") return null;
  const rect = trigger.getBoundingClientRect();
  const margin = 16;
  const width = Math.min(340, window.innerWidth - margin * 2);

  // Align the right edge of the popover with the right edge of the trigger button
  let left = rect.right - width;

  // Clamp left so it never overflows the left edge of the viewport
  if (left < margin) {
    left = margin;
  }
  // Clamp right so it never overflows the right edge of the viewport
  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - width - margin;
  }

  // Calculate available vertical space
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const popoverIdealHeight = 480;

  let top = rect.bottom + 8;
  let maxHeight = Math.max(260, spaceBelow - 8);

  // If space below is restricted (< 300px) and there's more room above, flip above
  if (spaceBelow < 300 && spaceAbove > spaceBelow) {
    const calculatedHeight = Math.min(popoverIdealHeight, spaceAbove - 8);
    top = Math.max(margin, rect.top - calculatedHeight - 8);
    maxHeight = calculatedHeight;
  }

  return { top, left, width, maxHeight };
}

export function FilterPopover({
  isOpen,
  onClose,
  triggerRef,
  isFilterActive = false,
  activeCount = 0,
  onClearAll,
  title = "Filters",
  children,
}: FilterPopoverProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Position recalculation
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const newCoords = calculateCoords(triggerRef.current);
      if (newCoords) setCoords(newCoords);
    };

    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, isMobile, triggerRef]);

  // Click outside and Escape handling
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      // Click on trigger button is handled by trigger onClick
      if (triggerRef.current?.contains(target)) return;
      // Click inside popover content
      if (popoverRef.current?.contains(target)) return;
      // Click inside a portal Select menu or listbox
      if (
        (target as Element).closest?.('[role="listbox"]') ||
        (target as Element).closest?.('[data-select-menu]') ||
        (target as Element).closest?.('.select-portal')
      ) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // If a select menu is currently open, don't close the filter modal yet
        if (document.querySelector('[role="listbox"]')) return;
        onClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!mounted || !isOpen) return null;

  // Mobile Bottom Sheet
  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[99998] flex flex-col justify-end bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="absolute inset-0" onClick={onClose} />
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative w-full bg-[#0e0e11] border-t border-white/[0.12] rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-250"
        >
          {/* Handle */}
          <div className="pt-3 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-white tracking-tight flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-neutral-400" /> {title}
              </span>
              {activeCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full">
                  {activeCount} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {onClearAll && isFilterActive && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-neutral-400 hover:text-white rounded-md transition-colors"
                aria-label="Close filters"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4.5">
            {children}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/[0.08] flex items-center gap-3 shrink-0 bg-[#0a0a0c]">
            {onClearAll && isFilterActive && (
              <button
                type="button"
                onClick={onClearAll}
                className="px-4 py-2.5 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-white text-black text-[13px] font-semibold rounded-lg hover:bg-neutral-200 transition-colors text-center"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Desktop Anchored & Clamped Popover
  if (!coords) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cn(
        "bg-[#0e0e11] border border-white/[0.12] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)]",
        "backdrop-blur-2xl flex flex-col text-white select-none z-[99998] animate-in fade-in zoom-in-95 duration-150"
      )}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        width: `${coords.width}px`,
        maxHeight: `${coords.maxHeight}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white tracking-tight flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-neutral-400" /> {title}
          </span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {onClearAll && isFilterActive && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-2.5 h-2.5" /> Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded-md transition-colors"
            aria-label="Close filters"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
        {children}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-white/[0.08] flex items-center justify-between shrink-0 bg-white/[0.01]">
        <span className="text-[11px] text-neutral-500">
          {isFilterActive ? "Filters active" : "No filters active"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 bg-white text-black text-[12px] font-semibold rounded-lg hover:bg-neutral-200 transition-colors shadow-sm"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
