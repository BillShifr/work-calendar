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

Локальный seed создаёт только тестовые учётные записи `employee` и `hr`; он не используется в production. Пароль `hr` берётся из `INITIAL_ADMIN_PASSWORD`.

Проверки: `npm run verify`, затем с отдельной тестовой БД `npm run test:integration` и `npm run test:e2e`.

## Production

Production-релиз собирается в два immutable-образа по полному Git SHA: web и migrator. После merge в `main` GitHub Actions проверяет код, миграции, browser E2E и контейнеры, публикует образы и сохраняет проверенный deployment bundle. Обновление production-сервера выполняется оператором вручную из этого bundle.

Справочники production заполняются отдельно от локальных тестовых данных:

```sh
npm run db:migrate
npm run db:seed:reference
npm run db:bootstrap-admin
```

`db:seed:reference` идемпотентно синхронизирует структуру подразделений и должности из утверждённого кадрового XLSX. `db:bootstrap-admin` создаёт первого кадрового администратора только в пустой организации и никогда не меняет пароль существующего пользователя.

Порядок подготовки хоста, секретов, TLS, backup и восстановления описан в [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
