#!/bin/bash
# init_vault_persistent.sh

export VAULT_ADDR='http://127.0.0.1:8200'

echo "Đang đợi Vault khởi động..."
# Vòng lặp đợi Vault sẵn sàng nhận kết nối (Chấp nhận mã 200, 501, 503)
while true; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" ${VAULT_ADDR}/v1/sys/health)
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "501" ] || [ "$STATUS" = "503" ]; then
        break
    fi
    echo "   ... Vault chưa sẵn sàng (Mã phản hồi: $STATUS), đợi 2s ..."
    sleep 2
done

# Kiểm tra xem Vault đã được Init chưa
STATUS=$(curl -s $VAULT_ADDR/v1/sys/init | jq .initialized)

if [ "$STATUS" == "false" ]; then
    echo "Vault chưa Init. Đang khởi tạo..."

    # Init với 1 key share
    INIT_RES=$(curl -s --request POST --data '{"secret_shares": 1, "secret_threshold": 1}' $VAULT_ADDR/v1/sys/init)

    # Lưu keys vào file
    echo $INIT_RES > vault/keys.json

    echo "Đã Init xong. Key được lưu tại vault/keys.json"
else
    echo "Vault báo đã Init (Nhưng lẽ ra script reset phải xóa rồi!)."
    echo "   Kiểm tra xem file vault/keys.json có tồn tại không?"
    if [ ! -f "vault/keys.json" ]; then
        echo "LỖI: Vault đã init nhưng không thấy file keys.json. Không thể Unseal!"
        exit 1
    fi
fi

# Đọc Unseal Key và Root Token
UNSEAL_KEY=$(cat vault/keys.json | jq -r ".keys_base64[0]")
ROOT_TOKEN=$(cat vault/keys.json | jq -r ".root_token")

# Unseal
echo "Đang Unseal Vault..."
curl -s --request POST --data "{\"key\": \"$UNSEAL_KEY\"}" $VAULT_ADDR/v1/sys/unseal > /dev/null

echo "------------------------------------------------"
echo "VAULT ROOT TOKEN: $ROOT_TOKEN"
echo "------------------------------------------------"

# Xuất Token ra file
echo $ROOT_TOKEN > vault/root_token.txt
