import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, login: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

async function setEntryWindow(
  page: Page,
  kind: "vacation" | "overtime",
  year: number,
  month: number,
  isOpen: boolean,
) {
  const response = await page.request.put("/api/hr/entry-windows", {
    data: { kind, year, month, isOpen },
  });
  expect(response.ok()).toBe(true);
}

test("employee and HR complete a bilateral vacation approval", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Full workflow runs once on desktop",
  );
  await login(page, "hr", "CI-only-password-2026!");
  await setEntryWindow(page, "overtime", 2026, 10, true);
  await setEntryWindow(page, "vacation", 2027, 0, true);
  await setEntryWindow(page, "vacation", 2028, 0, false);
  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "employee", "Employee-2026!");
  await expect(
    page.getByRole("heading", { name: "Внеурочное время" }),
  ).toBeVisible();
  const availableDay = page
    .locator('button[aria-label*="не заполнено"]:not([disabled])')
    .first();
  await availableDay.click();
  await page.getByRole("button", { name: "Добавить 15 минут" }).click();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Отправить на согласование" }).click();
  await expect(
    page.getByText("Отправлено на согласование", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Отпуска" }).click();
  await page.getByRole("button", { name: "Следующий год" }).click();
  await expect(
    page.getByText("Заполнение на 2028 год закрыто кадровой службой"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^10 май/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Сохранить черновик" }),
  ).toBeDisabled();
  const closedPlanResponse = await page.request.get("/api/vacations?year=2028");
  const closedPlan = await closedPlanResponse.json();
  const closedSaveResponse = await page.request.put("/api/vacations", {
    data: { year: 2028, version: closedPlan.version, periods: [] },
  });
  expect(closedSaveResponse.status()).toBe(409);
  await expect(closedSaveResponse.json()).resolves.toMatchObject({
    error: "Кадровая служба закрыла заполнение этого года.",
  });
  const closedSubmitResponse = await page.request.post("/api/workflow", {
    data: {
      aggregate: "vacation_plan",
      id: closedPlan.id,
      to: "submitted",
    },
  });
  expect(closedSubmitResponse.status()).toBe(409);
  await expect(closedSubmitResponse.json()).resolves.toMatchObject({
    error: "Период заполнения закрыт кадровой службой",
  });
  await page.getByRole("button", { name: "Предыдущий год" }).click();
  const planResponse = await page.request.get("/api/vacations?year=2027");
  const plan = await planResponse.json();
  const overLimitResponse = await page.request.put("/api/vacations", {
    data: {
      year: 2027,
      version: plan.version,
      periods: [
        {
          id: "server-limit-regression",
          startsOn: "2027-04-01",
          endsOn: "2027-04-29",
          source: "employee",
        },
      ],
    },
  });
  expect(overLimitResponse.status()).toBe(409);
  await expect(overLimitResponse.json()).resolves.toMatchObject({
    error: "Количество дней превышает доступный лимит.",
  });
  const vacationMatrix = page.getByLabel(
    "Матрица отпускных дней; прокручивается горизонтально",
  );
  await expect
    .poll(() =>
      vacationMatrix.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Сохранить черновик" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: /^10 май/ }).click();
  await expect(page.getByText(/Начало: 10 мая/i)).toBeVisible();
  await page.getByRole("button", { name: /^14 май/ }).click();
  await page.getByRole("button", { name: /^15 май/ }).click();
  await page.getByRole("button", { name: /^20 май/ }).click();
  const adjacentPeriodStart = page.getByRole("button", {
    name: /^15 май, период/,
  });
  await expect(
    adjacentPeriodStart.locator("span[aria-hidden=true]"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: /Удалить период 15 мая/ }).click();
  await page.getByRole("button", { name: /^1 июн/ }).click();
  await page.getByRole("button", { name: /^30 июн/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Нельзя добавить период",
  );
  await expect(page.getByText("5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("из 28 дней", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await page.getByRole("button", { name: "Отправить кадровику" }).click();
  await expect(
    page.getByText("План отправлен кадровой службе", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "hr", "CI-only-password-2026!");
  await page.getByRole("link", { name: "Согласование" }).click();
  const fourthQuarter = page
    .locator("article")
    .filter({ hasText: "4 квартал" });
  await expect(fourthQuarter).toContainText("6 из 6 отчётов");
  await fourthQuarter.getByRole("button", { name: "Согласовано" }).click();
  await expect(page.getByRole("status")).toContainText("Согласован 4 квартал");
  await page.getByRole("link", { name: "Свод" }).click();
  await page.getByLabel("Максимум дней для всех", { exact: true }).fill("11");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Обновлено сотрудников");
  await page
    .getByRole("textbox", { name: "Дней по договору: Алексей Морозов" })
    .fill("10");
  await page
    .getByRole("textbox", {
      name: "Предложение на следующий год: Алексей Морозов",
    })
    .fill("9");
  await page
    .locator("article")
    .filter({ hasText: "Алексей Морозов" })
    .getByRole("button", { name: "Сохранить" })
    .click();
  await expect(page.getByRole("status")).toContainText("Значения сохранены");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Выгрузить Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("tfoms-overtime-summary-2026.xlsx");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exportedFile = await readFile(downloadPath!);
  expect(exportedFile.byteLength).toBeGreaterThan(5_000);
  expect(exportedFile.subarray(0, 2).toString()).toBe("PK");
  await page.getByRole("link", { name: "Кабинет кадровика" }).click();
  await expect(
    page.getByRole("heading", { name: "Кабинет кадровика" }),
  ).toBeVisible();
  await expect(page.getByText("Ожидает проверки")).toHaveCount(0);
  await page.getByRole("link", { name: "Внеурочное время" }).last().click();
  await expect(page).toHaveURL(/type=overtime/);
  await page.getByRole("link", { name: "Отпуска" }).last().click();
  await expect(page).toHaveURL(/type=vacation/);
  await page.getByRole("link", { name: "Все" }).click();
  await page
    .locator("article")
    .filter({ hasText: "Алексей Морозов" })
    .filter({ hasText: /Внеурочное время · 10\.2026/ })
    .getByRole("link", { name: "Проверить время" })
    .click();
  await expect(
    page.getByRole("button", { name: "Утвердить без изменений" }),
  ).toBeVisible();
  await page
    .locator('button[data-calendar-day][aria-label*="15 минут"]')
    .click();
  await page.getByRole("button", { name: "Добавить 30 минут" }).click();
  await page
    .getByLabel("Причина изменений")
    .fill("Уточнение по данным табеля подразделения");
  await page.getByRole("button", { name: "Предложить изменения" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Предложение отправлено",
  );

  await page.goto("/hr");
  await page.locator('a[href^="/hr/vacations/"]').click();
  await page.getByRole("button", { name: /Удалить период/ }).click();
  await page.getByRole("button", { name: /^12 май/ }).click();
  await page.getByRole("button", { name: /^22 май/ }).click();
  await page
    .getByLabel("Причина изменений")
    .fill("Устранение пересечения с отпуском дежурного специалиста");
  await page.getByRole("button", { name: "Предложить изменения" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "employee", "Employee-2026!");
  await expect(
    page.getByText("Кадровая служба предложила корректировку"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить правку" }).click();
  await expect(
    page.getByText("Предложение кадровика утверждено", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Отпуска" }).click();
  await expect(page.getByText(/Правка HR/)).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить правку" }).click();
  await expect(
    page.getByText("Предложение кадровика утверждено", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "hr", "CI-only-password-2026!");
  await page.getByRole("link", { name: "Структура и штат" }).click();
  await page.getByRole("link", { name: "Подразделения", exact: true }).click();
  await page.getByLabel("Название").first().fill("Финансовое управление");
  await page.getByLabel("Штат", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Создать" }).click();
  await expect(
    page.getByRole("heading", { name: "Финансовое управление", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Должности", exact: true }).click();
  await page.getByLabel("Название должности").fill("Специалист E2E");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/hr/job-titles") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Добавить должность" }).click(),
  ]);
  await expect(page.locator('input[value="Специалист E2E"]')).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Сотрудники" }).click();
  await page.getByRole("button", { name: "Добавить сотрудника" }).click();
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  const allowanceDecrease = page.getByRole("button", {
    name: "Уменьшить: Дней отпуска нового сотрудника",
  });
  await expect
    .poll(async () => (await allowanceDecrease.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(
      async () =>
        (await page.getByLabel("Должность нового сотрудника").boundingBox())
          ?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(44);
  await page.getByLabel("ФИО").first().fill("Мария Тестова");
  await page.getByLabel("Логин").fill("maria.test");
  await page.getByLabel("Временный пароль").fill("Employee-Test-2026!");
  await page
    .getByLabel("Подразделение нового сотрудника")
    .selectOption({ label: "Информационные технологии" });
  await page
    .getByLabel("Должность нового сотрудника")
    .selectOption({ label: "Специалист E2E" });
  await page.getByRole("button", { name: "Создать сотрудника" }).click();
  await expect(
    page.getByText("Мария Тестова", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Дней отпуска для всех", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Применить ко всем" }).click();
  await expect(page.getByRole("status")).toContainText("Лимит обновлён");
  await page.getByRole("link", { name: "Согласование" }).click();
  const reopenedQuarter = page
    .locator("article")
    .filter({ hasText: "4 квартал" });
  await expect(reopenedQuarter).toContainText("6 из 9 отчётов");
  await expect(
    reopenedQuarter.getByRole("button", { name: "Согласовано" }),
  ).toBeDisabled();
});

test("monthly overtime calendar remains usable on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only layout check");
  await login(page, "hr", "CI-only-password-2026!");
  await setEntryWindow(page, "overtime", 2026, 9, true);
  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "employee", "Employee-2026!");
  await expect(
    page.getByRole("heading", { name: "Внеурочное время" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Предыдущий месяц" }).click();
  const day = page.locator('button[data-calendar-day="1"]');
  await expect(day).toBeVisible();
  await expect
    .poll(async () => (await day.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await day.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(() =>
      page
        .locator("body")
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
    )
    .toBeGreaterThanOrEqual(16);
  await day.click();
  const tenMinutes = page.getByRole("button", {
    name: "Добавить 10 минут",
    exact: true,
  });
  await expect(tenMinutes).toBeEnabled();
  await expect
    .poll(async () => (await tenMinutes.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(52);
  await tenMinutes.click();
  await tenMinutes.click();
  await expect(day).toHaveAttribute("aria-label", /20 минут/);
  await tenMinutes.focus();
  await expect
    .poll(() =>
      tenMinutes.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineOffset),
      ),
    )
    .toBeLessThan(0);
});

test("HR screens use the shared readable UI system", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop UI contract check");
  await login(page, "hr", "CI-only-password-2026!");

  await page.goto("/hr/periods");
  await expect(
    page.getByRole("heading", { name: "Периоды заполнения" }),
  ).toBeVisible();
  const november = page.locator(
    '[data-period-kind="overtime"][data-month="11"]',
  );
  await november.getByRole("button", { name: "Открыть" }).click();
  await expect(november).toContainText("Открыт");
  await november.getByRole("button", { name: "Закрыть" }).click();
  await expect(november).toContainText("Закрыт");

  await page.goto("/hr/departments");
  const mainNavigation = page.getByRole("navigation", {
    name: "Основная навигация",
  });
  await expect(
    mainNavigation.getByRole("link", { name: "Структура и штат" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    mainNavigation.getByRole("link", { name: "Подразделения" }),
  ).toHaveCount(0);
  const workforceNavigation = page.getByRole("navigation", {
    name: "Структура и штат",
  });
  await expect(
    workforceNavigation.getByRole("link", { name: "Сотрудники" }),
  ).toBeVisible();
  await expect(
    workforceNavigation.getByRole("link", { name: "Подразделения" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    workforceNavigation.getByRole("link", { name: "Должности" }),
  ).toBeVisible();
  const headcountIncrease = page.getByRole("button", {
    name: "Увеличить: Штат",
    exact: true,
  });
  await expect
    .poll(async () => (await headcountIncrease.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(52);
  await expect
    .poll(() =>
      page
        .getByLabel("Название")
        .first()
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
    )
    .toBeGreaterThanOrEqual(16);

  await page.goto("/hr/reference-data");
  const availabilitySwitch = page
    .getByRole("switch", { name: "Доступна для назначения" })
    .first();
  await expect
    .poll(async () => (await availabilitySwitch.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(52);

  await page.goto("/hr");
  const queueFilter = page.getByRole("link", { name: "Все", exact: true });
  await expect
    .poll(async () => (await queueFilter.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(48);
});
