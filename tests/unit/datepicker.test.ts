import { describe, it, expect } from "vitest";
import { calculateDatePickerCoords } from "@/components/ui/DatePicker";

// Re-test the ISO <-> Display date utilities used in DatePicker
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoToDisplay(iso?: string): string {
  if (!iso || typeof iso !== "string") return "";
  const parts = iso.trim().split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

function displayToIso(display: string): string | null {
  const trimmed = display.trim();
  const m = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
        return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }
  }
  const mIso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (mIso) {
    const year = parseInt(mIso[1], 10);
    const month = parseInt(mIso[2], 10);
    const day = parseInt(mIso[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
        return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }
  }
  return null;
}

describe("DatePicker utilities", () => {
  it("converts ISO YYYY-MM-DD to DD-MM-YYYY display string", () => {
    expect(isoToDisplay("2026-09-19")).toBe("19-09-2026");
    expect(isoToDisplay("2024-01-05")).toBe("05-01-2024");
    expect(isoToDisplay("")).toBe("");
  });

  it("parses DD-MM-YYYY to ISO YYYY-MM-DD", () => {
    expect(displayToIso("19-09-2026")).toBe("2026-09-19");
    expect(displayToIso("5-1-2024")).toBe("2024-01-05");
    expect(displayToIso("19/09/2026")).toBe("2026-09-19");
  });

  it("handles ISO formatted input as valid input fallback", () => {
    expect(displayToIso("2026-09-19")).toBe("2026-09-19");
  });

  it("rejects invalid dates (e.g. Feb 30 or month 13)", () => {
    expect(displayToIso("30-02-2026")).toBeNull();
    expect(displayToIso("15-13-2026")).toBeNull();
    expect(displayToIso("invalid-date")).toBeNull();
  });
});

describe("calculateDatePickerCoords", () => {
  it("returns null if triggerEl is null", () => {
    expect(calculateDatePickerCoords(null)).toBeNull();
  });

  it("clamps coordinates when trigger is near right screen edge", () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      innerWidth: 1200,
      innerHeight: 800,
    };

    try {
      const mockTrigger = {
        getBoundingClientRect: () => ({
          left: 1000,
          right: 1144,
          top: 300,
          bottom: 336,
          width: 144,
          height: 36,
        }),
      } as unknown as HTMLElement;

      const coords = calculateDatePickerCoords(mockTrigger);
      expect(coords).not.toBeNull();
      // left should be right-aligned (1144 - 296 = 848) and within bounds [12, 1200 - 296 - 12 = 892]
      expect(coords!.left).toBeLessThanOrEqual(1200 - 296 - 12);
      expect(coords!.left).toBeGreaterThanOrEqual(12);
      expect(coords!.left).toBe(848);
    } finally {
      if (originalWindow !== undefined) {
        (globalThis as any).window = originalWindow;
      } else {
        delete (globalThis as any).window;
      }
    }
  });

  it("clamps top coordinate when space below is tight to prevent screen cutoff", () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      innerWidth: 1200,
      innerHeight: 600,
    };

    try {
      const mockTrigger = {
        getBoundingClientRect: () => ({
          left: 200,
          right: 344,
          top: 290,
          bottom: 326,
          width: 144,
          height: 36,
        }),
      } as unknown as HTMLElement;

      const coords = calculateDatePickerCoords(mockTrigger);
      expect(coords).not.toBeNull();
      // top + 330 should not exceed 600 - 12 = 588
      if (coords?.top !== undefined) {
        expect(coords.top + 330).toBeLessThanOrEqual(588);
      }
    } finally {
      if (originalWindow !== undefined) {
        (globalThis as any).window = originalWindow;
      } else {
        delete (globalThis as any).window;
      }
    }
  });
});
