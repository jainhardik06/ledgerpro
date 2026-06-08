"use client";

import React from "react";

interface BrandMarkProps {
  size?: number;
  className?: string;
  variant?: "default" | "monochrome" | "emerald";
}

export function BrandMark({
  size = 24,
  className = "",
  variant = "default",
}: BrandMarkProps) {
  // Define colors based on variant
  // In 'default' variant, we use currentColor to naturally adapt to parent text colors (supporting light/dark mode)
  let strokeColor = "currentColor";
  if (variant === "monochrome") {
    strokeColor = "currentColor";
  } else if (variant === "emerald") {
    strokeColor = "#10b981"; // Emerald green accent
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      {/* Dynamic Ledger Gate - Interlocking Offset Chevrons */}
      {/* Upper Chevron pointing downwards, representing input / credit */}
      <path
        d="M 6 11 L 16 21 L 26 11"
        stroke={strokeColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-colors duration-200"
      />
      {/* Lower Chevron pointing upwards, representing output / debit */}
      <path
        d="M 6 21 L 16 11 L 26 21"
        stroke={variant === "default" ? "currentColor" : strokeColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={variant === "default" ? 0.5 : 1}
        className="transition-colors duration-200"
      />
    </svg>
  );
}
