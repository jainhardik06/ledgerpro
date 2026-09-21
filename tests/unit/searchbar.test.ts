import { describe, it, expect, vi } from "vitest";
import React from "react";
import { SearchBar } from "@/components/ui/SearchBar";

describe("SearchBar component", () => {
  it("exports SearchBar with displayName", () => {
    expect(SearchBar).toBeDefined();
    expect(SearchBar.displayName).toBe("SearchBar");
  });

  it("can be instantiated with basic props", () => {
    const element = React.createElement(SearchBar, {
      value: "hello",
      placeholder: "Search anything...",
    });
    expect(element.props.value).toBe("hello");
    expect(element.props.placeholder).toBe("Search anything...");
  });

  it("accepts wrapperClassName and inputClassName", () => {
    const element = React.createElement(SearchBar, {
      value: "",
      wrapperClassName: "w-full sm:w-64",
      inputClassName: "h-9",
    });
    expect(element.props.wrapperClassName).toBe("w-full sm:w-64");
    expect(element.props.inputClassName).toBe("h-9");
  });
});
