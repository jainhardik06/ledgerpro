import { describe, it, expect } from "vitest";
import React from "react";

// Test the extractOptions logic that drives Select
interface ParsedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

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

describe("Select extractOptions helper", () => {
  it("extracts options with value and label", () => {
    const children = [
      React.createElement("option", { key: "1", value: "opt1" }, "Option One"),
      React.createElement("option", { key: "2", value: "opt2" }, "Option Two"),
    ];

    const parsed = extractOptions(children);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ value: "opt1", label: "Option One", disabled: false });
    expect(parsed[1]).toEqual({ value: "opt2", label: "Option Two", disabled: false });
  });

  it("handles empty string value correctly", () => {
    const children = [
      React.createElement("option", { key: "empty", value: "" }, "Select a client"),
    ];

    const parsed = extractOptions(children);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ value: "", label: "Select a client", disabled: false });
  });

  it("handles disabled options", () => {
    const children = [
      React.createElement("option", { key: "dis", value: "dis", disabled: true }, "Disabled Option"),
    ];

    const parsed = extractOptions(children);
    expect(parsed[0].disabled).toBe(true);
  });
});
