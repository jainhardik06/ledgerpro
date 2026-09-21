import { describe, it, expect } from "vitest";
import { confirmModal, alertModal } from "@/components/ui/Dialog";

describe("Dialog System - confirmModal and alertModal", () => {
  it("resolves confirmModal without throwing in server/headless environment", async () => {
    // In node/vitest environment, activeDialogListener is null and window.confirm is not available
    const result = await confirmModal({
      title: "Test Confirm",
      message: "Are you sure?",
      confirmText: "Yes",
      cancelText: "No",
      variant: "danger",
    });
    expect(typeof result).toBe("boolean");
  });

  it("handles string shorthand with extra options", async () => {
    const result = await confirmModal("Are you sure?", {
      title: "Confirm Action",
      variant: "warning",
    });
    expect(typeof result).toBe("boolean");
  });

  it("resolves alertModal without throwing in server/headless environment", async () => {
    const promise = alertModal({
      title: "Test Alert",
      message: "Something happened",
      variant: "info",
    });
    await expect(promise).resolves.toBeUndefined();
  });

  it("handles alertModal string shorthand with extra options", async () => {
    const promise = alertModal("Quick message", {
      title: "Notice",
      variant: "success",
    });
    await expect(promise).resolves.toBeUndefined();
  });
});
