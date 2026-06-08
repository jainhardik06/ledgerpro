"use client";

import React from "react";
import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { BetaBadge } from "./BetaBadge";

interface LogoProps {
  size?: number; // Size of the BrandMark icon
  showText?: boolean; // Whether to display "Money OS" text
  className?: string; // Class name for the container
  textClass?: string; // Custom class for the "Money OS" text
  variant?: "default" | "monochrome" | "emerald";
  href?: string; // If provided, wraps logo in a next/link
  showBeta?: boolean; // If true, renders the BetaBadge next to the wordmark
}

export function Logo({
  size = 18,
  showText = true,
  className = "",
  textClass = "text-[14px]",
  variant = "default",
  href,
  showBeta = false,
}: LogoProps) {
  const content = (
    <div className={`flex items-center gap-2.5 group select-none ${className}`}>
      {/* Premium logo mark wrapper */}
      <div className="p-1.5 rounded-md bg-white/[0.04] border border-white/[0.04] group-hover:bg-white/[0.08] group-hover:border-white/[0.08] transition-all duration-200 flex items-center justify-center">
        <BrandMark size={size} variant={variant} />
      </div>
      {showText && (
        <div className="flex items-center gap-2">
          <span className={`font-semibold tracking-[-0.015em] text-white transition-colors duration-200 ${textClass}`}>
            Money OS
          </span>
          {showBeta && <BetaBadge />}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="no-underline">
        {content}
      </Link>
    );
  }

  return content;
}

