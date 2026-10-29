import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, login: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

test("employee and HR complete a bilateral vacation approval", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Full workflow runs once on desktop",
  );
  await login(page, "employee", "Employee-2026!");
  await expect(
    page.getByRole("heading", { name: "Внеурочное время" }),
  ).toBeVisible();
  const availableDay = page
    .locator('button[aria-label*="не заполнено"]:not([disabled])')
    .first();
  await availableDay.click();
  await page.getByRole("button", { name: "15 мин" }).click();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");

  await page.getByRole("link", { name: "Отпуска" }).click();
  await page.getByRole("button", { name: /^10 май/ }).click();
  await expect(page.getByText(/Начало: 10 мая/i)).toBeVisible();
  await page.getByRole("button", { name: /^20 май/ }).click();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await page.getByRole("button", { name: "Отправить кадровику" }).click();
  await expect(page.getByRole("status")).toContainText("отправлен");

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "hr", "CI-only-password-2026!");
  await expect(
    page.getByRole("heading", { name: "Что требует решения" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Открыть" }).first().click();
  await page.getByRole("button", { name: /Удалить период/ }).click();
  await page.getByRole("button", { name: /^12 май/ }).click();
  await page.getByRole("button", { name: /^22 май/ }).click();
  await page
    .getByLabel("Причина кадровой правки")
    .fill("Устранение пересечения с отпуском дежурного специалиста");
  await page.getByRole("button", { name: "Предложить сотруднику" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "employee", "Employee-2026!");
  await page.getByRole("link", { name: "Отпуска" }).click();
  await expect(page.getByText("предложено кадровиком")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить правку" }).click();
  await expect(page.getByRole("status")).toContainText("утверждено");
});

test("monthly overtime calendar remains usable on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only layout check");
  await login(page, "employee", "Employee-2026!");
  await expect(
    page.getByRole("heading", { name: "Внеурочное время" }),
  ).toBeVisible();
  const day = page.locator('button[data-calendar-day="1"]');
  const box = await day.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await day.click();
  await expect(
    page.getByRole("button", { name: "5 мин", exact: true }),
  ).toBeEnabled();
});
