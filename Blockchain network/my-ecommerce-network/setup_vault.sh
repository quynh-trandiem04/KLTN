#!/bin/bash

export VAULT_ADDR=${VAULT_ADDR:-"http://127.0.0.1:8200"}

if [ -f "vault/root_token.txt" ]; then
VAULT_TOKEN=$(cat vault/root_token.txt)
else
    echo "LỖI: Không tìm thấy file token 'vault/root_token.txt'!"
    exit 1
fi

echo "BẮT ĐẦU CẤU HÌNH VAULT TẠI: $VAULT_ADDR"

# ===========================================================
# 1. BẬT KHO BÍ MẬT (SECRETS ENGINE)
# ===========================================================
echo "Đang bật Secrets Engine tại đường dẫn 'secret/'..."

curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
     --request POST \
     --data '{"type": "kv", "options": {"version": "2"}}' \
     "${VAULT_ADDR}/v1/sys/mounts/secret" > /dev/null

# ===========================================================
# 2. HÀM UPLOAD
# ===========================================================
upload_crypto_admin() {
    ORG_NAME=$1
    USER_NAME=$2
    MSP_PATH=$3
    VAULT_PATH="secret/data/fabric/${ORG_NAME}/${USER_NAME}"

    echo "   -> Đang xử lý: ${ORG_NAME} / ${USER_NAME}..."

    KEY_DIR="${MSP_PATH}/keystore"
    if [ ! -d "$KEY_DIR" ]; then
        echo "      CẢNH BÁO: Không thấy thư mục MSP tại $MSP_PATH"
        return
    fi
    
    PRIV_KEY=$(cat $(find ${KEY_DIR} -name "*_sk" -o -name "priv_sk" | head -n 1))
    CERT_DIR="${MSP_PATH}/signcerts"
    CERT=$(cat $(find ${CERT_DIR} -name "*.pem" | head -n 1))

    if [ -z "$PRIV_KEY" ] || [ -z "$CERT" ]; then
        echo "      LỖI: Thiếu Key hoặc Cert trong thư mục MSP."
        return
    fi

    # Payload JSON
    PAYLOAD=$(python3 -c "import json; print(json.dumps({'data': {'privateKey': '''$PRIV_KEY''', 'certificate': '''$CERT'''}}))")

    # Upload và kiểm tra HTTP Code
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --header "X-Vault-Token: $VAULT_TOKEN" \
        --request POST \
        --data "$PAYLOAD" \
        "${VAULT_ADDR}/v1/${VAULT_PATH}")

    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "204" ]; then
        echo "      Đã upload thành công vào: ${VAULT_PATH}"
    else
        echo "      THẤT BẠI (HTTP $HTTP_CODE). Kiểm tra lại Token hoặc Path."
    fi
}

enroll_and_upload_ca_admin() {
    ORG_NAME=$1
    CA_PORT=$2
    DOMAIN=$3
    CA_NAME=$4
    CA_ADMIN_NAME="admin-ca-${ORG_NAME}"

    echo "[CA Admin] Đang Enroll cho ${ORG_NAME}..."
    TEMP_DIR="/tmp/hyperledger/ca-admin/${ORG_NAME}"
    rm -rf $TEMP_DIR
    mkdir -p $TEMP_DIR
    export FABRIC_CA_CLIENT_HOME=$TEMP_DIR

    TLS_CERT_PATH="${PWD}/organizations/peerOrganizations/${DOMAIN}/ca/ca.${DOMAIN}-cert.pem"

    if [ ! -f "$TLS_CERT_PATH" ]; then
       echo "      Không tìm thấy TLS Cert CA."
        return
    fi

    # Enroll
    fabric-ca-client enroll -u https://admin:adminpw@localhost:${CA_PORT} --caname ${CA_NAME} --tls.certfiles "${TLS_CERT_PATH}" --mspdir msp 

    if [ $? -eq 0 ]; then
        upload_crypto_admin "${ORG_NAME}" "${CA_ADMIN_NAME}" "${TEMP_DIR}/msp"
    else
        echo "      Enroll thất bại cho $ORG_NAME"
    fi
}

# ===========================================================
# 3. THỰC THI
# ===========================================================

# Upload Peer Admin (Có sẵn từ Cryptogen)
upload_crypto_admin "platform" "admin" "organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp"
upload_crypto_admin "seller" "admin" "organizations/peerOrganizations/seller.com/users/Admin@seller.com/msp"
upload_crypto_admin "shipper" "admin" "organizations/peerOrganizations/shipper.com/users/Admin@shipper.com/msp"
upload_crypto_admin "tax" "admin" "organizations/peerOrganizations/tax.com/users/Admin@tax.com/msp"

echo "-----------------------------------------------------"

# Enroll và Upload CA Admin
enroll_and_upload_ca_admin "platform" 7054 "ecommerce.com" "ca-org1"
enroll_and_upload_ca_admin "seller" 8054 "seller.com" "ca-org2"
enroll_and_upload_ca_admin "shipper" 11054 "shipper.com" "ca-org3"
enroll_and_upload_ca_admin "tax" 13054 "tax.com" "ca-tax"

echo "HOÀN TẤT SETUP VAULT!"
