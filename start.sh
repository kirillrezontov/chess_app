#!/bin/bash
docker compose up -d --build

echo ""
echo "========================================"
echo "  Ждём ссылку Cloudflare Tunnel..."
echo "========================================"

# Ждём пока появится ссылка (максимум 30 секунд)
for i in $(seq 1 30); do
  URL=$(docker compose logs tunnel 2>&1 | grep -oP 'https://[a-z0-9\-]+\.trycloudflare\.com' | tail -1)
  if [ -n "$URL" ]; then
    echo ""
    echo "  >>> $URL <<<"
    echo ""
    echo "$URL" > tunnel-url.txt
    break
  fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "  Туннель ещё не готов. Подожди и проверь:"
  echo "  docker compose logs tunnel | grep https://"
fi