"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  wrapperClassName?: string;
  placeholder?: string;
};

interface ParsedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

/** Recursively extracts option objects from React children */
function extractOptions(children: React.ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    const el = child as React.ReactElement<{
      value?: unknown;
      children?: React.ReactNode;
      disabled?: boolean;
    }>;

    if (el.type === "option") {
      const value =
        el.props.value !== undefined
          ? String(el.props.value)
          : String(el.props.children ?? "");
      const label = el.props.children ?? value;
      options.push({
        value,
        label,
        disabled: Boolean(el.props.disabled),
      });
    } else if (el.props?.children) {
      options.push(...extractOptions(el.props.children));
    }
  });

  return options;
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface SelectCoords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  placeAbove?: boolean;
}

function calculateSelectCoords(triggerEl: HTMLElement | null): SelectCoords | null {
  if (!triggerEl || typeof window === "undefined") return null;
  const rect = triggerEl.getBoundingClientRect();
  const menuHeight = 240;
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < menuHeight && rect.top > menuHeight;

  const menuWidth = Math.max(rect.width, 180);
  let left = rect.left;

  if (left + menuWidth > window.innerWidth - 16) {
    left = Math.max(16, window.innerWidth - menuWidth - 16);
  }
  if (left < 16) {
    left = 16;
  }

  return {
    top: placeAbove ? undefined : rect.bottom + 4,
    bottom: placeAbove ? window.innerHeight - rect.top + 4 : undefined,
    left,
    width: menuWidth,
    placeAbove,
  };
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      wrapperClassName,
      children,
      value,
      defaultValue,
      onChange,
      disabled = false,
      required = false,
      id,
      name,
      placeholder,
      title,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const selectId = id || autoId;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const hiddenSelectRef = useRef<HTMLSelectElement | null>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [coords, setCoords] = useState<SelectCoords | null>(null);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);

    // Parse options from children
    const options = useMemo(() => extractOptions(children), [children]);

    // Internal selected value tracking
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState<string>(() => {
      if (defaultValue !== undefined) return String(defaultValue);
      if (options.length > 0) return options[0].value;
      return "";
    });

    const currentValue = isControlled ? String(value ?? "") : uncontrolledValue;

    // Find currently selected option
    const selectedOption = useMemo(() => {
      const match = options.find((o) => o.value === currentValue);
      if (match) return match;
      if (!isControlled && options.length > 0) return options[0];
      return null;
    }, [options, currentValue, isControlled]);

    useEffect(() => {
      setMounted(true);
      const checkMobile = () => setIsMobile(window.innerWidth < 640);
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Keep hidden select value in sync
    useEffect(() => {
      if (hiddenSelectRef.current) {
        hiddenSelectRef.current.value = currentValue;
      }
    }, [currentValue]);

    // Calculate menu position relative to trigger
    const updatePosition = useCallback(() => {
      if (!triggerRef.current || isMobile) return;
      const newCoords = calculateSelectCoords(triggerRef.current);
      if (newCoords) setCoords(newCoords);
    }, [isMobile]);

    const openSelect = useCallback(() => {
      if (disabled) return;
      if (!isMobile && triggerRef.current) {
        const newCoords = calculateSelectCoords(triggerRef.current);
        if (newCoords) setCoords(newCoords);
      }
      setIsOpen(true);
    }, [disabled, isMobile]);

    const toggleSelect = useCallback(() => {
      if (disabled) return;
      if (!isOpen) {
        if (!isMobile && triggerRef.current) {
          const newCoords = calculateSelectCoords(triggerRef.current);
          if (newCoords) setCoords(newCoords);
        }
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    }, [disabled, isOpen, isMobile]);

    useIsomorphicLayoutEffect(() => {
      if (!isOpen) return;
      updatePosition();

      const activeIdx = options.findIndex((o) => o.value === currentValue);
      setFocusedIndex(activeIdx >= 0 ? activeIdx : 0);

      const handleScrollOrResize = () => updatePosition();
      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
      return () => {
        window.removeEventListener("scroll", handleScrollOrResize, true);
        window.removeEventListener("resize", handleScrollOrResize);
      };
    }, [isOpen, updatePosition, options, currentValue]);

    // Scroll active item into view when opening
    useEffect(() => {
      if (isOpen && menuRef.current && focusedIndex >= 0) {
        const item = menuRef.current.querySelector(`[data-index="${focusedIndex}"]`);
        if (item) {
          item.scrollIntoView({ block: "nearest" });
        }
      }
    }, [isOpen, focusedIndex]);

    // Click outside and Escape handling
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent | TouchEvent) => {
        const target = e.target as Node;
        if (
          triggerRef.current?.contains(target) ||
          menuRef.current?.contains(target)
        ) {
          return;
        }
        setIsOpen(false);
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsOpen(false);
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
    }, [isOpen]);

    const emitChange = (val: string) => {
      if (!isControlled) {
        setUncontrolledValue(val);
      }

      // Update hidden select and trigger native change event
      if (hiddenSelectRef.current) {
        hiddenSelectRef.current.value = val;
        const nativeEvent = new Event("change", { bubbles: true });
        hiddenSelectRef.current.dispatchEvent(nativeEvent);
      }

      // Synthetic React change event for callers
      if (onChange) {
        const syntheticEvent = {
          target: {
            value: val,
            name: name || "",
            id: selectId,
          },
          currentTarget: {
            value: val,
            name: name || "",
            id: selectId,
          },
          bubbles: true,
          cancelable: true,
          defaultPrevented: false,
          stopPropagation: () => {},
          preventDefault: () => {},
        } as unknown as React.ChangeEvent<HTMLSelectElement>;

        onChange(syntheticEvent);
      }
    };

    const handleSelectOption = (opt: ParsedOption) => {
      if (opt.disabled) return;
      emitChange(opt.value);
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    // Keyboard navigation on trigger / menu
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter") {
        if (!isOpen) {
          e.preventDefault();
          openSelect();
          return;
        }
      }

      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          let next = prev + 1;
          while (next < options.length && options[next]?.disabled) {
            next++;
          }
          return next < options.length ? next : prev;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          let prevIdx = prev - 1;
          while (prevIdx >= 0 && options[prevIdx]?.disabled) {
            prevIdx--;
          }
          return prevIdx >= 0 ? prevIdx : prev;
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          const opt = options[focusedIndex];
          if (opt && !opt.disabled) {
            handleSelectOption(opt);
          }
        }
      } else if (e.key === "Tab") {
        setIsOpen(false);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Quick letter jump
        const char = e.key.toLowerCase();
        const found = options.findIndex(
          (o, i) =>
            i > focusedIndex &&
            String(o.label).toLowerCase().startsWith(char) &&
            !o.disabled
        );
        if (found >= 0) {
          setFocusedIndex(found);
        } else {
          const wrapFound = options.findIndex(
            (o) => String(o.label).toLowerCase().startsWith(char) && !o.disabled
          );
          if (wrapFound >= 0) setFocusedIndex(wrapFound);
        }
      }
    };

    // Menu options list UI
    const menuList = (
      <div className="w-full max-h-60 overflow-y-auto overscroll-contain py-1 select-none space-y-0.5">
        {options.length === 0 ? (
          <div className="px-3 py-2 text-[12.5px] text-neutral-500 text-center">
            No options available
          </div>
        ) : (
          options.map((opt, index) => {
            const isSelected = opt.value === currentValue;
            const isFocused = index === focusedIndex;

            return (
              <button
                key={`${opt.value}-${index}`}
                type="button"
                data-index={index}
                disabled={opt.disabled}
                onClick={() => handleSelectOption(opt)}
                onMouseEnter={() => !opt.disabled && setFocusedIndex(index)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] text-left transition-colors",
                  opt.disabled && "opacity-40 cursor-not-allowed text-neutral-500",
                  !opt.disabled && !isSelected && !isFocused && "text-neutral-200 hover:bg-white/[0.08] hover:text-white",
                  !opt.disabled && !isSelected && isFocused && "bg-white/[0.08] text-white",
                  isSelected && "bg-white/15 text-white font-medium"
                )}
              >
                <span className="truncate pr-2">{opt.label}</span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1.5" />
                )}
              </button>
            );
          })
        )}
      </div>
    );

    // Extract layout/width tokens from className to also apply to wrapper if wrapperClassName not explicitly overriding
    const extractedWrapperClasses = className
      ? className
          .split(/\s+/)
          .filter((c) =>
            /^(w-|sm:w-|md:w-|lg:w-|xl:w-|min-w-|max-w-|flex-|shrink-|grow-)/.test(c)
          )
          .join(" ")
      : "";

    return (
      <div className={cn("relative w-full", extractedWrapperClasses, wrapperClassName)}>
        {/* Hidden native select for form validation, screen readers & form libraries */}
        <select
          ref={(node) => {
            hiddenSelectRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = node;
          }}
          id={selectId}
          name={name}
          value={currentValue}
          onChange={(e) => emitChange(e.target.value)}
          disabled={disabled}
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only pointer-events-none"
          {...props}
        >
          {children}
        </select>

        {/* Custom trigger button */}
        <button
          ref={triggerRef}
          type="button"
          id={`${selectId}-button`}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`${selectId}-menu`}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          title={title}
          disabled={disabled}
          onClick={toggleSelect}
          onKeyDown={handleKeyDown}
          className={cn(
            "group flex items-center justify-between w-full h-9 px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white text-left transition-all",
            "hover:border-white/20 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20",
            isOpen && "border-white/40 ring-1 ring-white/20",
            disabled && "opacity-50 cursor-not-allowed bg-white/[0.01]",
            className
          )}
        >
          <span className="truncate pr-2">
            {selectedOption ? (
              selectedOption.label
            ) : placeholder ? (
              <span className="text-neutral-500">{placeholder}</span>
            ) : (
              <span className="text-neutral-500">Select…</span>
            )}
          </span>

          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200 group-hover:text-neutral-200",
              isOpen && "rotate-180 text-white"
            )}
            aria-hidden="true"
          />
        </button>

        {/* Portal popover / bottom sheet */}
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
                    ref={menuRef}
                    id={`${selectId}-menu`}
                    role="listbox"
                    aria-label={ariaLabel || "Options"}
                    className="relative w-full max-w-md mx-auto bg-[#121212] border-t border-white/[0.12] rounded-t-2xl p-4 shadow-2xl pb-8 animate-in slide-in-from-bottom duration-250"
                  >
                    <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08]">
                      <span className="text-[13px] font-semibold text-white">
                        {placeholder || ariaLabel || "Select an option"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="p-1 rounded-md text-neutral-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {menuList}
                  </div>
                </div>,
                document.body
              )
            : coords &&
              createPortal(
                <div
                  ref={menuRef}
                  id={`${selectId}-menu`}
                  role="listbox"
                  aria-label={ariaLabel || "Options"}
                  className="bg-[#111111] border border-white/[0.12] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.9)] p-1 text-white select-none backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    position: "fixed",
                    top: coords.top !== undefined ? `${coords.top}px` : undefined,
                    bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
                    left: `${coords.left}px`,
                    width: `${coords.width}px`,
                    zIndex: 99999,
                  }}
                >
                  {menuList}
                </div>,
                document.body
              ))}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
