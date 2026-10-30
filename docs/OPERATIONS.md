# Эксплуатация TFOMS Time

## Контур

- приложение: `time.tfoms` → Nginx → `127.0.0.1:3080`;
- runtime: rootless Podman Compose под отдельным системным пользователем;
- каталог: `$HOME/apps/tfoms-time`;
- данные PostgreSQL: отдельный named volume `tfoms-time_postgres-data`;
- образы: `docker.io/billshifr/tfoms-time:<git-sha>` и `docker.io/billshifr/tfoms-time-migrator:<git-sha>`;
- релиз: GitHub Actions → проверенный bundle → self-hosted runner `ofoms-production`.

Тег `latest` не используется. Запущенная версия всегда определяется полным Git SHA из `VCS_REF`.

## Однократная подготовка production-хоста

1. Создать отдельного непривилегированного пользователя и каталоги:

   ```sh
   mkdir -m 700 -p "$HOME/apps/tfoms-time" "$HOME/backups/tfoms-time-auto"
   ```

2. Установить rootless Podman, `podman compose`, `flock`, `curl`, `tar` и зарегистрировать GitHub Actions runner с метками `self-hosted`, `linux`, `x64`, `ofoms-production`.
3. Выполнить `podman login docker.io`. Файл `$HOME/.config/containers/auth.json` должен читаться пользователем runner.
4. Скопировать `.env.production.example` в `$HOME/apps/tfoms-time/.env`, установить права `600` и заменить все `REPLACE_*` значения. Пароль БД должен быть уникальным и длинным: `POSTGRES_PASSWORD` хранит его как есть, а в `CONTAINER_DATABASE_URL` тот же пароль указывается в URL-кодированном виде.
5. Добавить в GitHub secrets репозитория `DOCKERHUB_USERNAME` и `DOCKERHUB_TOKEN`. Environment `production` рекомендуется защитить обязательным ручным подтверждением.
6. Установить `deploy/systemd/tfoms-time.service` как user unit и включить linger для сервисного пользователя.
7. Установить Nginx-конфигурацию `deploy/nginx/time.tfoms.conf`, подключить внутренний TLS-сертификат и только после успешного smoke-test добавить DNS-запись `time.tfoms`.

После успешного bootstrap `INITIAL_ADMIN_PASSWORD` удаляется из `.env`: повторный bootstrap при существующих пользователях не выполняется. Обязательная смена пароля при первом входе пока не реализована и отдельно зафиксирована в продуктовых висяках, поэтому начальный пароль должен сразу соответствовать боевой политике длины и случайности.

## Автоматический релиз

Push в `main` проходит следующие неизменяемые этапы:

1. чистый `npm ci`, dependency audit, миграции, reference seed, lint, typecheck, unit, integration, production build и browser E2E;
2. сборка web- и migrator-образов с label `org.opencontainers.image.revision`;
3. runtime-проверка read-only filesystem, dropped capabilities и отсутствия исходников/секретов;
4. сборка bundle с `SHA256SUMS` и файлом `RELEASE`;
5. публикация образов только после всех проверок;
6. backup текущей БД на production-хосте;
7. проверка bundle и SHA, миграция и reference seed до замены web-контейнера;
8. запуск нового web-контейнера и ожидание `/api/health`.

Автоматический rollback после начавшейся миграции запрещён. Все production-миграции должны быть обратно совместимы с предыдущей web-версией. При ошибке после миграции выпускается исправляющий forward-релиз либо выполняется отдельное подтверждённое восстановление.

## Ручной deploy проверенного bundle

```sh
cd "$HOME/apps/tfoms-time"
CONTAINER_ENGINE=podman sh scripts/backup-release.sh "$HOME/backups/tfoms-time-auto"
CONTAINER_ENGINE=podman sh scripts/deploy-release.sh
```

`deploy-release.sh` принимает только полный SHA из `RELEASE`/`VCS_REF`, проверяет checksums и labels образов, ждёт готовность БД, применяет миграции, синхронизирует справочники и проверяет HTTP readiness.

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
