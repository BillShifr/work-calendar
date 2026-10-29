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
  await page.getByRole("button", { name: "Отправить кадровику" }).click();
  await expect(page.getByRole("status")).toContainText("Отправлено");

  await page.getByRole("link", { name: "Отпуска" }).click();
  const planResponse = await page.request.get("/api/vacations?year=2026");
  const plan = await planResponse.json();
  const overLimitResponse = await page.request.put("/api/vacations", {
    data: {
      year: 2026,
      version: plan.version,
      periods: [
        {
          id: "server-limit-regression",
          startsOn: "2026-04-01",
          endsOn: "2026-04-29",
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
  await page.getByRole("button", { name: /^20 май/ }).click();
  await page.getByRole("button", { name: /^1 июн/ }).click();
  await page.getByRole("button", { name: /^30 июн/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Нельзя добавить период",
  );
  await expect(page.getByText("11", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("из 28 дней", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await page.getByRole("button", { name: "Отправить кадровику" }).click();
  await expect(page.getByRole("status")).toContainText("отправлен");

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "hr", "CI-only-password-2026!");
  await expect(
    page.getByRole("heading", { name: "Кабинет кадровика" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Подразделения" }).click();
  await page.getByLabel("Название").first().fill("Финансовое управление");
  await page.getByLabel("Штат", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Создать" }).click();
  await expect(
    page.getByText("Финансовое управление", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Сотрудники" }).click();
  await page.getByLabel("ФИО").first().fill("Мария Тестова");
  await page.getByLabel("Логин").fill("maria.test");
  await page.getByLabel("Временный пароль").fill("Employee-Test-2026!");
  await page.getByLabel("Должность").first().fill("Ведущий специалист");
  await page.getByRole("button", { name: "Добавить сотрудника" }).click();
  await expect(
    page.getByText("Мария Тестова", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Дней отпуска для всех").fill("30");
  await page.getByRole("button", { name: "Установить всем" }).click();
  await expect(page.getByRole("status")).toContainText("Лимит обновлён");
  await page.getByRole("link", { name: "Кабинет кадровика" }).click();
  await page.getByRole("link", { name: "Внеурочное время" }).last().click();
  await expect(page).toHaveURL(/type=overtime/);
  await page.getByRole("link", { name: "Отпуска" }).last().click();
  await expect(page).toHaveURL(/type=vacation/);
  await page.getByRole("link", { name: "Все" }).click();
  await page.locator('a[href^="/hr/overtime/"]').click();
  await page.locator('button[aria-label*="15 минут"]').click();
  await page.getByRole("button", { name: "30 мин" }).click();
  await page
    .getByLabel("Причина кадровой правки")
    .fill("Уточнение по данным табеля подразделения");
  await page.getByRole("button", { name: "Предложить сотруднику" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Предложение отправлено",
  );

  await page.goto("/hr");
  await page.locator('a[href^="/hr/vacations/"]').click();
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
  await page.getByRole("button", { name: "Предыдущий месяц" }).click();
  const day = page.locator('button[data-calendar-day="1"]');
  await expect(day).toBeVisible();
  await expect
    .poll(async () => (await day.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await day.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await day.click();
  await expect(
    page.getByRole("button", { name: "5 мин", exact: true }),
  ).toBeEnabled();
});
