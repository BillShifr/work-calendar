# TFOMS Time

Самостоятельная система учёта внеурочного времени и планирования отпусков ТФОМС.

Продукт разворачивается независимо на `time.tfoms` и не использует код, базу данных или модели других внутренних систем.

Техническая и продуктовая документация находится в каталоге [`docs`](docs).

## Реализованный первый production-срез

- локальная Argon2id-авторизация с отзываемыми server-side сессиями и ролями employee/HR/HR lead/admin;
- крупный календарь внеурочного времени со значениями 5/10/15/30/60 минут, будущими датами и явным нулевым отчётом;
- годовая матрица отпусков 12×31 с немедленным выделением начала, несколькими периодами и контролем лимита;
- двусторонний цикл `submitted → hr_proposed → approved` с обязательной причиной HR, цветовой семантикой, optimistic version и audit trail;
- кадровая очередь и представление пересечений отдела;
- PostgreSQL 18, SQL-миграции, CI, desktop/mobile E2E, Nginx, контейнер, backup/restore и OpenTelemetry.

## Локальный запуск

Требуется Node.js 26 и PostgreSQL 18.

```sh
cp .env.example .env.local
npm ci
npm run db:migrate
npm run db:seed
npm run dev -- --port 3080
```

Seed создаёт `employee / Employee-2026!`; пароль `hr` берётся из `INITIAL_ADMIN_PASSWORD` и должен быть сменён сразу после первого входа.

Проверки: `npm run verify`, затем с отдельной тестовой БД `npm run test:integration` и `npm run test:e2e`.
