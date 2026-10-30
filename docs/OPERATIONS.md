# Эксплуатация TFOMS Time

## Контур

- приложение: `time.tfoms` → Nginx → `127.0.0.1:3080`;
- runtime: rootless Podman Compose под отдельным системным пользователем;
- каталог: `$HOME/apps/tfoms-time`;
- данные PostgreSQL: отдельный named volume `tfoms-time_postgres-data`;
- образы: локальные `tfoms-time:<git-sha>` и `tfoms-time-migrator:<git-sha>`;
- релиз: GitHub Actions проверяет сборку → оператор вручную обновляет checkout → Podman собирает тот же commit на production-хосте.

Тег `latest` не используется. Запущенная версия всегда определяется полным Git SHA из `VCS_REF`.

## Однократная подготовка production-хоста

1. Создать отдельного непривилегированного пользователя и каталоги:

   ```sh
   mkdir -m 700 -p "$HOME/apps" "$HOME/backups/tfoms-time-auto"
   git clone https://github.com/BillShifr/work-calendar.git "$HOME/apps/tfoms-time"
   cd "$HOME/apps/tfoms-time"
   git switch main
   ```

2. Установить rootless Podman, `podman compose`, `flock`, `curl`, `git`, `python3` и `sha256sum`.
3. Скопировать `.env.production.example` в `$HOME/apps/tfoms-time/.env`, установить права `600` и заменить все `REPLACE_*` значения. Пароль БД должен быть уникальным и длинным: `POSTGRES_PASSWORD` хранит его как есть, а в `CONTAINER_DATABASE_URL` тот же пароль указывается в URL-кодированном виде.
4. Установить `deploy/systemd/tfoms-time.service` как user unit и включить linger для сервисного пользователя.
5. Установить Nginx-конфигурацию `deploy/nginx/time.tfoms.conf`, подключить внутренний TLS-сертификат и только после успешного smoke-test добавить DNS-запись `time.tfoms`.

После успешного bootstrap `INITIAL_ADMIN_PASSWORD` удаляется из `.env`: повторный bootstrap при существующих пользователях не выполняется. Обязательная смена пароля при первом входе пока не реализована и отдельно зафиксирована в продуктовых висяках, поэтому начальный пароль должен сразу соответствовать боевой политике длины и случайности.

## Проверка релиза в GitHub Actions

Push в `main` проходит следующие неизменяемые этапы:

1. чистый `npm ci`, dependency audit, миграции, reference seed, lint, typecheck, unit, integration, production build и browser E2E;
2. сборка web- и migrator-образов с label `org.opencontainers.image.revision`;
3. runtime-проверка read-only filesystem, dropped capabilities и отсутствия исходников/секретов;
4. образы остаются временными внутри job и не публикуются во внешний registry.

GitHub Actions не хранит production-секреты, не подключается к production-хосту и не запускает миграции на нём.

Автоматический rollback после начавшейся миграции запрещён. Все production-миграции должны быть обратно совместимы с предыдущей web-версией. При ошибке после миграции выпускается исправляющий forward-релиз либо выполняется отдельное подтверждённое восстановление.

## Ручное обновление production

1. Убедиться, что PR слит в `main`; повторно запускать упавший workflow от старого commit не требуется.
2. На production-хосте выполнить одну команду из чистого checkout:

   ```sh
   cd "$HOME/apps/tfoms-time"
   CONTAINER_ENGINE=podman sh scripts/update-production.sh
   ```

`update-production.sh` проверяет ожидаемый remote и ветку `main`, чистоту checkout, fast-forward и успешный push-run workflow `CI` именно для целевого SHA. До воздействия на работающий web-процесс он локально собирает и проверяет оба образа. Если схема БД уже существует, создаётся обязательный проверенный backup; для пустой БД первый backup осознанно пропускается. Затем выполняются миграции, reference seed, bootstrap администратора и HTTP readiness.

Автоматический rollback после начавшихся миграций не выполняется: совместимость старого образа с частично обновлённой схемой нельзя предполагать. Скрипт оставляет точный этап отказа в логе; оператор принимает решение о forward-fix или подтверждённом restore.

## Backup

Backup создаётся online в custom-format PostgreSQL и не останавливает приложение:

```sh
CONTAINER_ENGINE=podman sh scripts/backup-release.sh "$HOME/backups/tfoms-time-auto"
```

Каждый каталог содержит `database.dump`, `MANIFEST` и `SHA256SUMS`. Скрипт проверяет архив через `pg_restore --list`, использует advisory lock и публикует backup атомарно только после завершения всех проверок.

Рекомендуется ежедневный backup вне хоста приложения и ежеквартальный тест восстановления в изолированной БД.

## Restore

Restore полностью заменяет текущее состояние и требует явного подтверждения:

```sh
RESTORE_CONFIRM=replace-current-state \
  CONTAINER_ENGINE=podman \
  sh scripts/restore-release.sh /absolute/path/to/backup
```

Перед остановкой приложения проверяются состав, checksums и читаемость dump. После восстановления запускается тот же release-процесс с миграциями и readiness. Restore нельзя выполнять поверх production без окна работ, внешней копии backup и согласованного плана восстановления.

## Проверка после DNS

```sh
curl --fail --resolve time.tfoms:443:SERVER_IP https://time.tfoms/api/health
```

Дополнительно проверяются вход кадровика, «Структура и штат», сохранение одной безопасной тестовой операции, аудит события и XLSX-выгрузка. Успешный `/api/health` сам по себе не подтверждает пользовательский сценарий.

## Наблюдаемость

Контролируются доступность `/api/health`, p95 latency, доля 5xx, ошибки optimistic locking, заполнение диска с PostgreSQL и возраст последнего успешного backup. Логи не должны содержать пароли, cookie, токены, ФИО и содержимое кадровых записей.
