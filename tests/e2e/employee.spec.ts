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

const overtimeMonths = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

async function goToOvertimePeriod(page: Page, year: number, month: number) {
  const periodLabel = page
    .getByLabel("Действия с отчётом")
    .locator("strong")
    .first();

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const currentLabel = (await periodLabel.textContent())?.trim() ?? "";
    const match = /^(\S+)\s+(\d{4})$/.exec(currentLabel);
    const currentMonth = match ? overtimeMonths.indexOf(match[1]) + 1 : 0;
    const currentYear = match ? Number(match[2]) : 0;
    expect(
      currentMonth,
      `Не удалось распознать период: ${currentLabel}`,
    ).toBeGreaterThan(0);

    const delta = (year - currentYear) * 12 + month - currentMonth;
    if (delta === 0) return;

    await page
      .getByRole("button", {
        name: delta < 0 ? "Предыдущий месяц" : "Следующий месяц",
      })
      .click();
    await expect(periodLabel).not.toHaveText(currentLabel);
  }

  throw new Error(`Не удалось открыть период ${month}.${year}`);
}

async function goToVacationMonth(page: Page, month: number) {
  const calendar = page.getByLabel("Календарь отпускных дней");
  const heading = calendar.locator("strong").first();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const label = (await heading.textContent())?.trim() ?? "";
    const current = overtimeMonths.findIndex((name) => label.startsWith(name));
    expect(
      current,
      `Не удалось распознать месяц отпуска: ${label}`,
    ).toBeGreaterThanOrEqual(0);
    if (current + 1 === month) return;
    await calendar
      .getByRole("button", {
        name: current + 1 < month ? "Следующий месяц" : "Предыдущий месяц",
      })
      .click();
  }
  throw new Error(`Не удалось открыть месяц отпуска: ${month}`);
}

async function goToVacationYear(page: Page, year: number) {
  const yearLabel = page
    .getByLabel("Действия с планом")
    .locator("strong")
    .first();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = Number((await yearLabel.textContent())?.trim());
    expect(current, "Не удалось распознать год отпуска").toBeGreaterThan(0);
    if (current === year) return;
    await page
      .getByRole("button", {
        name: current < year ? "Следующий год" : "Предыдущий год",
      })
      .click();
    await expect(yearLabel).not.toHaveText(String(current));
  }
  throw new Error(`Не удалось открыть год отпуска: ${year}`);
}

test("vacation ranges work over internal HTTP in every selection mode", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Both calendar layouts are covered in the desktop run",
  );
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
  });

  await login(page, "hr", "CI-only-password-2026!");
  await setEntryWindow(page, "vacation", 2029, 0, true);
  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "employee", "Employee-2026!");
  await page.getByRole("link", { name: "Отпуска" }).click();
  await goToVacationYear(page, 2029);

  await page.setViewportSize({ width: 1600, height: 900 });
  const matrix = page.getByLabel("Матрица отпускных дней");
  const matrixDay = (label: RegExp) =>
    matrix.getByRole("button", { name: label });

  await matrixDay(/^4 января/).click();
  await expect(matrixDay(/^4 января/)).toHaveClass(/start/);
  await matrixDay(/^4 января/).click();
  await expect(matrixDay(/^4 января, период/)).toHaveClass(/segmentStart/);
  await expect(matrixDay(/^4 января, период/)).toHaveClass(/segmentEnd/);

  await matrixDay(/^12 января/).click();
  await matrixDay(/^8 января/).click();
  await expect(
    page.getByRole("button", { name: /Изменить период 8 янв.*12 янв/ }),
  ).toBeVisible();

  await matrixDay(/^30 января/).click();
  await matrixDay(/^2 февраля/).click();
  await expect(matrixDay(/^30 января, период/)).toHaveClass(/segmentStart/);
  await expect(matrixDay(/^2 февраля, период/)).toHaveClass(/segmentEnd/);

  await matrixDay(/^3 февраля/).click();
  await matrixDay(/^5 февраля/).click();
  await expect(
    matrixDay(/^3 февраля, период/).locator("span[aria-hidden=true]"),
  ).toHaveCount(2);

  await matrixDay(/^10 января, период/).click();
  await matrixDay(/^15 января/).click();
  await expect(page.getByRole("status")).toContainText(
    "Этот период пересекается",
  );
  await expect(
    page.getByRole("button", { name: "Отменить выбор" }),
  ).toBeDisabled();

  await page
    .getByRole("button", { name: /Изменить период 8 янв.*12 янв/ })
    .click();
  await matrixDay(/^14 января/).click();
  await expect(
    page.getByRole("button", { name: /Изменить период 8 янв.*14 янв/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.reload();
  await goToVacationYear(page, 2029);
  await expect(matrixDay(/^30 января, период/)).toBeVisible();

  await page.setViewportSize({ width: 1366, height: 768 });
  await goToVacationMonth(page, 2);
  const mobileCalendar = page.getByLabel("Календарь отпускных дней");
  const adjacentStart = mobileCalendar.getByRole("button", {
    name: /^3 февраля, период/,
  });
  await expect(adjacentStart.locator("span[aria-hidden=true]")).toHaveCount(2);
  const selectedBackground = await adjacentStart.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  const emptyBackground = await mobileCalendar
    .getByRole("button", { name: /^10 февраля/ })
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(selectedBackground).not.toBe(emptyBackground);

  await goToVacationMonth(page, 5);
  await mobileCalendar.getByRole("button", { name: /^20 мая/ }).click();
  await mobileCalendar.getByRole("button", { name: /^15 мая/ }).click();
  await expect(
    page.getByRole("button", { name: /Изменить период 15 мая.*20 мая/ }),
  ).toBeVisible();

  await goToVacationMonth(page, 6);
  await mobileCalendar.getByRole("button", { name: /^1 июня/ }).click();
  await mobileCalendar.getByRole("button", { name: /^15 июня/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Нельзя добавить период",
  );
  await mobileCalendar.getByRole("button", { name: /^7 июня/ }).click();
  await expect(page.getByText("28", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("из 28 дней", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.reload();
  await goToVacationYear(page, 2029);
  await goToVacationMonth(page, 6);
  await expect(
    page.getByLabel("Календарь отпускных дней").getByRole("button", {
      name: /^7 июня, период/,
    }),
  ).toBeVisible();
});

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
  await goToOvertimePeriod(page, 2026, 10);
  const availableDay = page
    .locator('button[aria-label*="не заполнено"]:not([disabled])')
    .first();
  await availableDay.click();
  await page.getByRole("button", { name: "Добавить 15 минут" }).click();
  const limitDay = page
    .locator('button[aria-label*="не заполнено"]:not([disabled])')
    .nth(1);
  await limitDay.click();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "Добавить 1 час" }).click();
  }
  await expect(
    page.getByRole("button", { name: "Добавить 1 час" }),
  ).toBeDisabled();
  await expect(page.getByText("Осталось 0 мин из 4 часов")).toBeVisible();
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
  await goToVacationMonth(page, 5);
  await expect(page.getByRole("button", { name: /^10 мая/ })).toBeDisabled();
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
  const vacationMatrix = page.getByLabel("Календарь отпускных дней");
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
  await goToVacationMonth(page, 5);
  await page.getByRole("button", { name: /^10 мая/ }).click();
  await expect(page.getByText(/Начало: 10 мая/i)).toBeVisible();
  await page.getByRole("button", { name: /^14 мая/ }).click();
  await page.getByRole("button", { name: /^15 мая/ }).click();
  await page.getByRole("button", { name: /^20 мая/ }).click();
  const adjacentPeriodStart = page.getByRole("button", {
    name: /^15 мая, период/,
  });
  await expect(
    adjacentPeriodStart.locator("span[aria-hidden=true]"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: /Удалить период 15 мая/ }).click();
  await goToVacationMonth(page, 6);
  await page.getByRole("button", { name: /^1 июня/ }).click();
  await page.getByRole("button", { name: /^30 июня/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Нельзя добавить период",
  );
  await expect(page.getByText("5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("из 28 дней", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Отменить выбор" }).click();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.reload();
  await goToVacationMonth(page, 5);
  await expect(
    page.getByRole("button", { name: /^10 мая, период/ }),
  ).toBeVisible();
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
    .getByRole("link", { name: "Открыть" })
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
  await goToVacationMonth(page, 5);
  await page.getByRole("button", { name: /Удалить период/ }).click();
  await page.getByRole("button", { name: /^12 мая/ }).click();
  await page.getByRole("button", { name: /^22 мая/ }).click();
  await page
    .getByLabel("Причина изменений")
    .fill("Устранение пересечения с отпуском дежурного специалиста");
  await page.getByRole("button", { name: "Предложить изменения" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "employee", "Employee-2026!");
  await goToOvertimePeriod(page, 2026, 10);
  await expect(
    page.getByText("Кадровая служба предложила корректировку"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить правку" }).click();
  await expect(
    page.getByText("Предложение кадровика утверждено", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Отпуска" }).click();
  await expect(page.getByText(/Правка кадровика/)).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить правку" }).click();
  await expect(
    page.getByText("Предложение кадровика утверждено", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "hr", "CI-only-password-2026!");
  await page.getByRole("link", { name: "Структура и штат" }).click();
  await page.getByRole("link", { name: "Подразделения", exact: true }).click();
  await page.getByRole("button", { name: "Добавить подразделение" }).click();
  await page.getByLabel("Название").first().fill("Финансовое управление");
  await page.getByLabel("Штат", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Создать" }).click();
  await expect(
    page.getByRole("heading", { name: "Финансовое управление", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Должности", exact: true }).click();
  await page.getByRole("button", { name: "Добавить должность" }).click();
  await page.getByLabel("Название должности").fill("Специалист E2E");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/hr/job-titles") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Добавить должность" }).click(),
  ]);
  await expect(page.getByText("Специалист E2E", { exact: true })).toBeVisible();
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
  await page.getByLabel("Логин", { exact: true }).fill("maria.test");
  await page.getByLabel("Временный пароль").fill("Employee-Test-2026!");
  await page.getByLabel("Подразделение нового сотрудника").click();
  await page
    .getByRole("option", { name: "Информационные технологии", exact: true })
    .click();
  await page.getByLabel("Должность нового сотрудника").click();
  await page
    .getByRole("option", { name: "Специалист E2E", exact: true })
    .click();
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
  const [assignmentYear, assignmentMonth] = new Date()
    .toISOString()
    .slice(0, 7)
    .split("-")
    .map(Number);
  const assignedQuarterMonths =
    assignmentYear < 2026
      ? 3
      : assignmentYear === 2026
        ? Math.max(0, 13 - Math.max(10, assignmentMonth))
        : 0;
  await expect(reopenedQuarter).toContainText(
    `6 из ${6 + assignedQuarterMonths} отчётов`,
  );
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
  await goToOvertimePeriod(page, 2026, 9);
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
    .toBeGreaterThanOrEqual(44);
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
  await page.getByRole("button", { name: "Добавить подразделение" }).click();
  const headcountIncrease = page.getByRole("button", {
    name: "Увеличить: Штат",
    exact: true,
  });
  await expect
    .poll(async () => (await headcountIncrease.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
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
  await page.getByRole("button", { name: "Редактировать" }).first().click();
  const availabilitySwitch = page
    .getByRole("switch", { name: "Доступна для назначения" })
    .first();
  await expect
    .poll(async () => (await availabilitySwitch.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);

  await page.goto("/hr");
  const queueFilter = page.getByRole("link", { name: "Все", exact: true });
  await expect
    .poll(async () => (await queueFilter.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(40);
});
