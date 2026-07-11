#!/bin/bash
docker compose down
docker compose up -d --build

# Apply any new schema migrations (IF NOT EXISTS is safe to re-run)
sleep 3
docker compose exec -T db psql -U chess -c "
CREATE TABLE IF NOT EXISTS friendships (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, friend_id),
    CHECK (user_id < friend_id)
);
" 2>/dev/null

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