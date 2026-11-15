#!/bin/bash
# Script này dùng để BẬT lại hệ thống mà KHÔNG mất dữ liệu

echo "Đang bật lại Containers..."
docker compose -f compose/compose-test-net.yaml -f compose/compose-couch.yaml -f compose/compose-ca.yaml -f compose/compose-support.yaml up -d

echo "Đang mở khóa Vault..."
./init_vault_persistent.sh

echo "Hệ thống đã sẵn sàng!"
echo "Token Vault hiện tại: $(cat vault/root_token.txt)"
