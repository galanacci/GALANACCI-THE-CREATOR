import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(`console.error: ${message.text()}`);
      }
    });

    page.on("pageerror", (error) => {
      errors.push(`pageerror: ${error.message}`);
    });

    await use(page);

    expect.soft(
      errors,
      `Unexpected browser errors:\n${errors.join("\n")}`
    ).toEqual([]);
  }
});

export { expect };
