#!/bin/sh
set -eu

if grep -Eq '^(APP_ORIGIN|SESSION_COOKIE_SECURE)=' .env.production.example; then
  echo "production HTTP origin must not be overridden from the legacy env file" >&2
  exit 1
fi

grep -F 'APP_ORIGIN: http://hr.tfoms' compose.yml >/dev/null
if grep -q 'SESSION_COOKIE_SECURE' compose.yml; then
  echo "compose must not override cookie security independently" >&2
  exit 1
fi

grep -F 'listen 80;' deploy/nginx/hr.tfoms.conf >/dev/null
grep -F 'proxy_set_header X-Forwarded-Proto http;' deploy/nginx/hr.tfoms.conf >/dev/null
if grep -Eq 'listen 443|ssl_certificate|Strict-Transport-Security' deploy/nginx/hr.tfoms.conf; then
  echo "internal HTTP Nginx config must not contain TLS-only directives" >&2
  exit 1
fi
