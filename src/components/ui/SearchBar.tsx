"use client";

import React, { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchBarProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  wrapperClassName?: string;
  inputClassName?: string;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      value,
      onChange,
      onValueChange,
      onClear,
      placeholder = "Search…",
      wrapperClassName,
      inputClassName,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onClear) {
        onClear();
      }
      if (onValueChange) {
        onValueChange("");
      }
      if (onChange) {
        const syntheticEvent = {
          target: { value: "" },
          currentTarget: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      onValueChange?.(e.target.value);
    };

    const hasValue = Boolean(value && value.length > 0);

    return (
      <div className={cn("relative flex-1 min-w-0", wrapperClassName)}>
        <Search
          className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none shrink-0"
          aria-hidden="true"
        />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full h-9 pl-9 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-white placeholder:text-neutral-500",
            "hover:border-white/20 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all",
            hasValue ? "pr-8" : "pr-3",
            disabled && "opacity-50 cursor-not-allowed",
            inputClassName,
            className
          )}
          {...props}
        />
        {hasValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
);

SearchBar.displayName = "SearchBar";

export default SearchBar;
