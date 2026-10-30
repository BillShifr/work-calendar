# Эксплуатация TFOMS Time

## Контур

- приложение: `time.tfoms` → Nginx → `127.0.0.1:3080`;
- runtime: rootless Podman Compose под отдельным системным пользователем;
- каталог: `$HOME/apps/tfoms-time`;
- данные PostgreSQL: отдельный named volume `tfoms-time_postgres-data`;
- образы: `docker.io/billshifr/tfoms-time:<git-sha>` и `docker.io/billshifr/tfoms-time-migrator:<git-sha>`;
- релиз: GitHub Actions → проверенные образы и bundle → ручное обновление оператором.

Тег `latest` не используется. Запущенная версия всегда определяется полным Git SHA из `VCS_REF`.

## Однократная подготовка production-хоста

1. Создать отдельного непривилегированного пользователя и каталоги:

   ```sh
   mkdir -m 700 -p "$HOME/apps/tfoms-time" "$HOME/backups/tfoms-time-auto"
   ```

2. Установить rootless Podman, `podman compose`, `flock`, `curl`, `tar` и `sha256sum`.
3. Выполнить `podman login docker.io` под тем же непривилегированным пользователем, который обновляет и запускает приложение.
4. Скопировать `.env.production.example` в `$HOME/apps/tfoms-time/.env`, установить права `600` и заменить все `REPLACE_*` значения. Пароль БД должен быть уникальным и длинным: `POSTGRES_PASSWORD` хранит его как есть, а в `CONTAINER_DATABASE_URL` тот же пароль указывается в URL-кодированном виде.
5. Добавить в GitHub secrets репозитория `DOCKERHUB_USERNAME` и `DOCKERHUB_TOKEN`. Эти секреты используются только для публикации образов из GitHub Actions и не дают CI доступ к production-серверу.
6. Установить `deploy/systemd/tfoms-time.service` как user unit и включить linger для сервисного пользователя.
7. Установить Nginx-конфигурацию `deploy/nginx/time.tfoms.conf`, подключить внутренний TLS-сертификат и только после успешного smoke-test добавить DNS-запись `time.tfoms`.

После успешного bootstrap `INITIAL_ADMIN_PASSWORD` удаляется из `.env`: повторный bootstrap при существующих пользователях не выполняется. Обязательная смена пароля при первом входе пока не реализована и отдельно зафиксирована в продуктовых висяках, поэтому начальный пароль должен сразу соответствовать боевой политике длины и случайности.

## Сборка релиза в GitHub Actions

Push в `main` проходит следующие неизменяемые этапы:

1. чистый `npm ci`, dependency audit, миграции, reference seed, lint, typecheck, unit, integration, production build и browser E2E;
2. сборка web- и migrator-образов с label `org.opencontainers.image.revision`;
3. runtime-проверка read-only filesystem, dropped capabilities и отсутствия исходников/секретов;
4. сборка bundle с `SHA256SUMS` и файлом `RELEASE`;
5. публикация образов только после всех проверок;
6. сохранение bundle как GitHub Actions artifact с именем `tfoms-time-deploy-<git-sha>`.

GitHub Actions не подключается к production-хосту и не запускает миграции на нём.

Автоматический rollback после начавшейся миграции запрещён. Все production-миграции должны быть обратно совместимы с предыдущей web-версией. При ошибке после миграции выпускается исправляющий forward-релиз либо выполняется отдельное подтверждённое восстановление.

## Ручное обновление production

1. Открыть успешный запуск `CI` для нужного commit в GitHub Actions.
2. Скачать artifact `tfoms-time-deploy-<git-sha>` и передать архив на production-хост.
3. Распаковать архив в отдельный каталог релиза и проверить `SHA256SUMS`:

   ```sh
   release_sha=REPLACE_WITH_FULL_GIT_SHA
   release_dir="$HOME/releases/tfoms-time/$release_sha"
   mkdir -m 700 -p "$release_dir"
   tar -xzf "tfoms-time-deploy-$release_sha.tar.gz" -C "$release_dir"
   cd "$release_dir/tfoms-time-deploy"
   sha256sum -c SHA256SUMS
   test "$(sed -n 's/^VCS_REF=//p' RELEASE)" = "$release_sha"
   ```

4. Выполнить backup, скопировать проверенный bundle в каталог приложения и запустить deploy:

   ```sh
   app_dir="$HOME/apps/tfoms-time"
   bundle_dir="$HOME/releases/tfoms-time/$release_sha/tfoms-time-deploy"
   cd "$app_dir"
   CONTAINER_ENGINE=podman sh scripts/backup-release.sh "$HOME/backups/tfoms-time-auto"
   cp -a "$bundle_dir/." "$app_dir/"
   chmod 600 "$app_dir/.env"
   VCS_REF="$release_sha" CONTAINER_ENGINE=podman sh scripts/deploy-release.sh
   ```

При самой первой установке, когда production-БД ещё не существует, шаг backup пропускается: сначала bundle копируется в каталог приложения, создаётся закрытый правами `600` файл `.env`, затем запускается `deploy-release.sh`. При всех последующих обновлениях backup обязателен.

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
