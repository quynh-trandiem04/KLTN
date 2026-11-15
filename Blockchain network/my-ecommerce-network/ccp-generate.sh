#!/bin/bash

# Hàm này chuyển file PEM nhiều dòng thành 1 dòng với ký tự \n để nhét vào JSON
function one_line_pem {
    sed ':a;N;$!ba;s/\n/\\\\n/g' $1
}

function json_ccp {
    local PP=$(one_line_pem $4)
    local CP=$(one_line_pem $5)
    sed -e "s/\${ORG}/$1/" \
        -e "s/\${P0PORT}/$2/" \
        -e "s/\${CAPORT}/$3/" \
        -e "s#\${PEERPEM}#$PP#" \
        -e "s#\${CAPEM}#$CP#" \
        -e "s/\${ORGMSP}/$6/" \
        -e "s/\${ORGDOMAIN}/$7/" \
        ccp-template.json
}

echo "Đang tạo Connection Profile..."

# 1. ECOMMERCE PLATFORM (Port 7051)
PEER_PEM=organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt
CA_PEM=organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt
# Check file tồn tại trước khi chạy
if [ -f "$PEER_PEM" ]; then
    echo "$(json_ccp ECommercePlatformOrg 7051 7054 $PEER_PEM $CA_PEM ECommercePlatformOrgMSP ecommerce.com)" > organizations/peerOrganizations/ecommerce.com/connection-ecommerce.json
    echo "Đã tạo: connection-ecommerce.json"
else
    echo "Lỗi: Không tìm thấy file $PEER_PEM"
fi

# 2. SELLER (Port 9051)
PEER_PEM=organizations/peerOrganizations/seller.com/peers/peer0.seller.com/tls/ca.crt
CA_PEM=organizations/peerOrganizations/seller.com/peers/peer0.seller.com/tls/ca.crt
if [ -f "$PEER_PEM" ]; then
    echo "$(json_ccp SellerOrg 9051 8054 $PEER_PEM $CA_PEM SellerOrgMSP seller.com)" > organizations/peerOrganizations/seller.com/connection-seller.json
    echo "Đã tạo: connection-seller.json"
else
    echo "Lỗi: Không tìm thấy file $PEER_PEM"
fi

# 3. SHIPPER (Port 11051)
PEER_PEM=organizations/peerOrganizations/shipper.com/peers/peer0.shipper.com/tls/ca.crt
CA_PEM=organizations/peerOrganizations/shipper.com/peers/peer0.shipper.com/tls/ca.crt
if [ -f "$PEER_PEM" ]; then
    echo "$(json_ccp ShipperOrg 11051 11054 $PEER_PEM $CA_PEM ShipperOrgMSP shipper.com)" > organizations/peerOrganizations/shipper.com/connection-shipper.json
    echo "   Đã tạo: connection-shipper.json"
fi

# 4. TAX (Port 13051)
PEER_PEM=organizations/peerOrganizations/tax.com/peers/peer0.tax.com/tls/ca.crt
CA_PEM=organizations/peerOrganizations/tax.com/peers/peer0.tax.com/tls/ca.crt
if [ -f "$PEER_PEM" ]; then
    echo "$(json_ccp TaxOrg 13051 13054 $PEER_PEM $CA_PEM TaxOrgMSP tax.com)" > organizations/peerOrganizations/tax.com/connection-tax.json
    echo "   Đã tạo: connection-tax.json"
else
    echo "   Không tìm thấy chứng chỉ cho TaxOrg tại $PEER_PEM"
fi

