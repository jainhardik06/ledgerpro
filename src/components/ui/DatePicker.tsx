"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  useTransition,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value?: string; // Standard ISO "YYYY-MM-DD"
  onChange?: (e: { target: { value: string; name?: string; id?: string } }) => void;
  onValueChange?: (value: string) => void;
  min?: string; // "YYYY-MM-DD"
  max?: string; // "YYYY-MM-DD"
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  wrapperClassName?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function isoToDisplay(iso?: string): string {
  if (!iso || typeof iso !== "string") return "";
  const parts = iso.trim().split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

export function displayToIso(display: string): string | null {
  const trimmed = display.trim();
  // dd-mm-yyyy or dd/mm/yyyy
  const m = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (
        d.getFullYear() === year &&
        d.getMonth() === month - 1 &&
        d.getDate() === day
      ) {
        return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }
  }
  // yyyy-mm-dd
  const mIso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (mIso) {
    const year = parseInt(mIso[1], 10);
    const month = parseInt(mIso[2], 10);
    const day = parseInt(mIso[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (
        d.getFullYear() === year &&
        d.getMonth() === month - 1 &&
        d.getDate() === day
      ) {
        return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }
  }
  return null;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function formatFriendlyDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface DatePickerCoords {
  top?: number;
  bottom?: number;
  left: number;
  placeAbove?: boolean;
}

export function calculateDatePickerCoords(
  triggerEl: HTMLElement | null,
  popoverEl?: HTMLElement | null
): DatePickerCoords | null {
  if (!triggerEl || typeof window === "undefined") return null;
  const rect = triggerEl.getBoundingClientRect();
  const margin = 12;
  const popoverWidth = 296;
  const popoverHeight = popoverEl ? popoverEl.offsetHeight || 330 : 330;

  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  // If space below is insufficient and space above has more clearance, flip above
  const placeAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

  // Horizontal position:
  // If trigger is in the right half of the screen or left + width would overflow right margin,
  // align with right edge of the trigger (extending inward), clamped to viewport bounds.
  let left: number;
  if (
    rect.left + popoverWidth > window.innerWidth - margin ||
    rect.left > window.innerWidth / 2
  ) {
    const idealLeft = rect.right - popoverWidth;
    left = Math.min(
      Math.max(margin, idealLeft),
      window.innerWidth - popoverWidth - margin
    );
  } else {
    const idealLeft = rect.left;
    left = Math.min(
      Math.max(margin, idealLeft),
      window.innerWidth - popoverWidth - margin
    );
  }

  // Vertical position:
  let top: number | undefined;
  let bottom: number | undefined;

  if (placeAbove) {
    const idealBottom = window.innerHeight - rect.top + 6;
    bottom = Math.max(margin, Math.min(idealBottom, window.innerHeight - margin));
  } else {
    const idealTop = rect.bottom + 6;
    const maxTop = Math.max(margin, window.innerHeight - popoverHeight - margin);
    top = Math.min(idealTop, maxTop);
  }

  return {
    top,
    bottom,
    left,
    placeAbove,
  };
}

export function DatePicker({
  value = "",
  onChange,
  onValueChange,
  min,
  max,
  placeholder = "dd-mm-yyyy",
  disabled = false,
  required = false,
  id,
  name,
  className,
  wrapperClassName,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const yearsContainerRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [coords, setCoords] = useState<DatePickerCoords | null>(null);

  // Active view date in calendar
  const initialYearMonth = () => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  };

  const [{ year: viewYear, month: viewMonth }, setViewDate] =
    useState(initialYearMonth);
  const [viewMode, setViewMode] = useState<"days" | "months" | "years">("days");

  // Local text input for manual typing / editing
  const [inputValue, setInputValue] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sync input value with external value prop changes
  useEffect(() => {
    setInputValue(isoToDisplay(value));
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      setViewDate({ year: y, month: m - 1 });
    }
  }, [value]);

  // Update popover coordinates
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || isMobile) return;
    const newCoords = calculateDatePickerCoords(
      triggerRef.current,
      popoverRef.current
    );
    if (newCoords) setCoords(newCoords);
  }, [isMobile]);

  const openCalendar = useCallback(() => {
    if (disabled) return;
    if (!isMobile && triggerRef.current) {
      const newCoords = calculateDatePickerCoords(
        triggerRef.current,
        popoverRef.current
      );
      if (newCoords) setCoords(newCoords);
    }
    setIsOpen(true);
  }, [disabled, isMobile]);

  const toggleCalendar = useCallback(() => {
    if (disabled) return;
    if (!isOpen) {
      if (!isMobile && triggerRef.current) {
        const newCoords = calculateDatePickerCoords(
          triggerRef.current,
          popoverRef.current
        );
        if (newCoords) setCoords(newCoords);
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [disabled, isOpen, isMobile]);

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      setViewMode("days");
      return;
    }
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, isMobile, updatePosition]);

  // Auto-scroll selected year into view when opening year picker
  useEffect(() => {
    if (viewMode === "years" && yearsContainerRef.current) {
      const activeEl = yearsContainerRef.current.querySelector(
        '[data-selected="true"]'
      );
      if (activeEl) {
        activeEl.scrollIntoView({ block: "center" });
      }
    }
  }, [viewMode]);

  // Handle outside clicks and Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
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
  }, [isOpen]);

  const emitDate = (isoString: string) => {
    startTransition(() => {
      onChange?.({
        target: {
          value: isoString,
          name,
          id: inputId,
        },
      });
      onValueChange?.(isoString);
    });
  };

  const handleSelectDay = (dayIso: string) => {
    if (isDateDisabled(dayIso)) return;
    setInputValue(isoToDisplay(dayIso));
    emitDate(dayIso);
    setIsOpen(false);
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setInputValue("");
    emitDate("");
    setIsOpen(false);
  };

  const handleToday = () => {
    const todayIso = getTodayIso();
    if (isDateDisabled(todayIso)) return;
    const [y, m] = todayIso.split("-").map(Number);
    setViewDate({ year: y, month: m - 1 });
    handleSelectDay(todayIso);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const txt = e.target.value;
    setInputValue(txt);
    if (!txt.trim()) {
      emitDate("");
      return;
    }
    const parsedIso = displayToIso(txt);
    if (parsedIso && !isDateDisabled(parsedIso)) {
      emitDate(parsedIso);
      const [y, m] = parsedIso.split("-").map(Number);
      setViewDate({ year: y, month: m - 1 });
    }
  };

  const isDateDisabled = (isoString: string): boolean => {
    if (min && isoString < min) return true;
    if (max && isoString > max) return true;
    return false;
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewDate({ year: viewYear + 1, month: 0 });
    } else {
      setViewDate({ year: viewYear, month: viewMonth + 1 });
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewDate({ year: viewYear - 1, month: 11 });
    } else {
      setViewDate({ year: viewYear, month: viewMonth - 1 });
    }
  };

  // Calendar day calculation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sun
    const mondayFirstOffset = (firstDayIndex + 6) % 7; // 0 is Mo, 6 is Su

    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      month: number;
      year: number;
      iso: string;
      isCurrentMonth: boolean;
    }> = [];

    // Prev month days
    for (let i = mondayFirstOffset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({
        day: d,
        month: m,
        year: y,
        iso: `${y}-${pad2(m + 1)}-${pad2(d)}`,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({
        day: i,
        month: viewMonth,
        year: viewYear,
        iso: `${viewYear}-${pad2(viewMonth + 1)}-${pad2(i)}`,
        isCurrentMonth: true,
      });
    }

    // Next month days to make complete 42 cells (6 rows)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({
        day: i,
        month: m,
        year: y,
        iso: `${y}-${pad2(m + 1)}-${pad2(i)}`,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  const todayIso = getTodayIso();
  const selectedIso = value;

  // Calendar body UI
  const calendarBody = (
    <div className="w-full">
      {/* Header controls: Month / Year toggle & Navigation */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setViewMode(viewMode === "months" ? "days" : "months")
            }
            className={cn(
              "px-2 py-1 rounded-md text-[12.5px] font-semibold text-neutral-200 hover:text-white transition-colors inline-flex items-center gap-1",
              viewMode === "months"
                ? "bg-white/15 text-white"
                : "hover:bg-white/[0.08]"
            )}
          >
            <span>{MONTHS[viewMonth]}</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </button>
          <button
            type="button"
            onClick={() =>
              setViewMode(viewMode === "years" ? "days" : "years")
            }
            className={cn(
              "px-2 py-1 rounded-md text-[12.5px] font-semibold text-neutral-200 hover:text-white transition-colors inline-flex items-center gap-1",
              viewMode === "years"
                ? "bg-white/15 text-white"
                : "hover:bg-white/[0.08]"
            )}
          >
            <span>{viewYear}</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </button>
        </div>

        {viewMode === "days" && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors active:scale-95"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Month picker view */}
      {viewMode === "months" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "6px",
          }}
          className="py-1"
        >
          {MONTHS.map((m, idx) => {
            const isSelected = idx === viewMonth;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setViewDate({ year: viewYear, month: idx });
                  setViewMode("days");
                }}
                className={cn(
                  "py-2 px-1 text-[12px] font-medium rounded-lg transition-all text-center",
                  isSelected
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-neutral-300 hover:bg-white/[0.08] hover:text-white"
                )}
              >
                {m.slice(0, 3)}
              </button>
            );
          })}
        </div>
      )}

      {/* Year picker view */}
      {viewMode === "years" && (
        <div
          ref={yearsContainerRef}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "5px",
          }}
          className="max-h-52 overflow-y-auto py-1 pr-1"
        >
          {Array.from({ length: 61 }, (_, i) => viewYear - 30 + i).map((y) => {
            const isSelected = y === viewYear;
            return (
              <button
                key={y}
                type="button"
                data-selected={isSelected}
                onClick={() => {
                  setViewDate({ year: y, month: viewMonth });
                  setViewMode("days");
                }}
                className={cn(
                  "py-1.5 text-[11.5px] font-medium rounded-lg transition-all text-center",
                  isSelected
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-neutral-300 hover:bg-white/[0.08] hover:text-white"
                )}
              >
                {y}
              </button>
            );
          })}
        </div>
      )}

      {/* Days grid view */}
      {viewMode === "days" && (
        <div>
          {/* Weekday headers — explicitly 7 columns */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "2px",
            }}
            className="mb-1 text-center"
          >
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 py-0.5"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* 42 Days grid — explicitly 7 columns */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "2px",
            }}
          >
            {calendarDays.map(({ day, iso, isCurrentMonth }) => {
              const isSelected = iso === selectedIso;
              const isToday = iso === todayIso;
              const disabledDay = isDateDisabled(iso);

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => handleSelectDay(iso)}
                  className={cn(
                    "h-8 w-full flex flex-col items-center justify-center text-[12px] rounded-lg transition-all relative font-medium select-none",
                    disabledDay && "text-neutral-700 opacity-25 cursor-not-allowed",
                    !disabledDay &&
                      !isSelected &&
                      isCurrentMonth &&
                      "text-neutral-200 hover:bg-white/[0.1] hover:text-white cursor-pointer active:scale-95",
                    !disabledDay &&
                      !isSelected &&
                      !isCurrentMonth &&
                      "text-neutral-600 hover:bg-white/[0.04] hover:text-neutral-400 cursor-pointer",
                    isToday &&
                      !isSelected &&
                      "ring-1 ring-white/30 text-white font-semibold bg-white/[0.04]",
                    isSelected &&
                      "bg-white text-black font-bold shadow-md shadow-white/20 active:scale-95"
                  )}
                >
                  <span className="leading-none">{day}</span>
                  {isToday && (
                    <span
                      className={cn(
                        "w-1 h-1 rounded-full mt-0.5",
                        isSelected ? "bg-black" : "bg-emerald-400"
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer bar */}
      <div className="mt-2.5 pt-2 border-t border-white/[0.08] flex items-center justify-between text-[11.5px]">
        <button
          type="button"
          onClick={handleToday}
          className="text-neutral-300 hover:text-white font-medium transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.06]"
        >
          Today
        </button>

        {value ? (
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 font-normal">
              {formatFriendlyDate(value)}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="text-neutral-400 hover:text-rose-400 transition-colors font-medium px-1.5 py-0.5 rounded hover:bg-white/[0.06]"
              >
                Clear
              </button>
            )}
          </div>
        ) : (
          <span className="text-neutral-600 text-[11px]">No date chosen</span>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      {/* Input container */}
      <div
        ref={triggerRef}
        className={cn(
          "group relative flex items-center w-full rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-white transition-all",
          "hover:border-white/20 focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20",
          disabled && "opacity-50 cursor-not-allowed bg-white/[0.01]",
          className
        )}
      >
        <input
          id={inputId}
          name={name}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onClick={openCalendar}
          onFocus={openCalendar}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          className="w-full bg-transparent px-2.5 py-1.5 text-[12.5px] text-white placeholder:text-neutral-600 focus:outline-none disabled:cursor-not-allowed cursor-pointer"
        />

        <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear date"
              className="p-1 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={toggleCalendar}
            aria-label="Open calendar"
            className="p-1 rounded-md text-neutral-400 group-hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Render calendar popover / bottom sheet */}
      {mounted &&
        isOpen &&
        (isMobile
          ? createPortal(
              <div className="fixed inset-0 z-[99999] flex flex-col justify-end bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
                <div
                  className="absolute inset-0"
                  onClick={() => setIsOpen(false)}
                />
                <div
                  ref={popoverRef}
                  role="dialog"
                  aria-label="Calendar modal"
                  className="relative w-full max-w-sm mx-auto bg-[#0d0d0f] border-t border-white/[0.14] rounded-t-2xl p-4 shadow-2xl pb-8 animate-in slide-in-from-bottom duration-200"
                >
                  <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/[0.08]">
                    <span className="text-[13px] font-semibold text-white">
                      Select Date
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="p-1 rounded-md text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {calendarBody}
                </div>
              </div>,
              document.body
            )
          : coords &&
            createPortal(
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Calendar"
                className="w-[296px] max-h-[calc(100vh-24px)] overflow-y-auto bg-[#0d0d0f]/98 border border-white/[0.14] rounded-2xl shadow-[0_24px_50px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)] p-3 text-white select-none backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
                style={{
                  position: "fixed",
                  top: coords.top !== undefined ? `${coords.top}px` : undefined,
                  bottom:
                    coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
                  left: `${coords.left}px`,
                  zIndex: 99999,
                }}
              >
                {calendarBody}
              </div>,
              document.body
            ))}
    </div>
  );
}

export default DatePicker;
