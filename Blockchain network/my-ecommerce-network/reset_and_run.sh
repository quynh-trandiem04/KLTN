# my-ecommerce-network\reset_and_run.sh

#!/bin/bash

# Stop on error
set -e

echo "STARTING 4-ORG NETWORK RESET (Ecommerce, Seller, Shipper, Tax)..."

# ====================================================
# STEP 0: CLEANUP
# ====================================================
echo "Rx KILLING PROCESSES..."
sudo fuser -k 7051/tcp || true
sudo fuser -k 9051/tcp || true
sudo fuser -k 11051/tcp || true
sudo fuser -k 13051/tcp || true
sudo fuser -k 8200/tcp || true
sudo fuser -k 8200/tcp || true
sudo fuser -k 8080/tcp || true

echo "Stopping containers..."
export COMPOSE_HTTP_TIMEOUT=300
docker compose -f compose/compose-test-net.yaml -f compose/compose-couch.yaml -f compose/compose-ca.yaml -f compose/compose-support.yaml down --volumes --remove-orphans || true

echo "Pruning Docker..."
docker volume prune -f
docker network prune -f

# [FIX] Xóa các image chaincode cũ để tránh cache
echo "Removing old chaincode images..."
docker rmi $(docker images dev-peer* -q) 2>/dev/null || true

echo "Deleting old artifacts..."
sudo rm -rf organizations/peerOrganizations
sudo rm -rf organizations/ordererOrganizations
sudo rm -rf channel-artifacts/*
sudo rm -rf system-genesis-block/*
sudo rm -rf ecommerce.tar.gz

# ====================================================
# VAULT CONFIGURATION
# ====================================================
echo "Recreating Vault config..."
sudo rm -rf vault
mkdir -p vault/data
mkdir -p vault/config

cat <<EOF > vault/config/vault-config.hcl
storage "file" {
  path = "/vault/file"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}
ui = true
api_addr = "http://127.0.0.1:8200"
disable_mlock = true
disable_clustering = true
EOF

sudo chmod -R 777 vault

# ====================================================
# STEP 3: GENERATE CRYPTO MATERIAL
# ====================================================
echo "Generating crypto material..."
export PATH=$PATH:${PWD}/../bin
export FABRIC_CFG_PATH=${PWD}/configtx

cryptogen generate --config=./organizations/cryptogen/crypto-config-orderer.yaml --output="organizations"
cryptogen generate --config=./organizations/cryptogen/crypto-config-org1.yaml --output="organizations"
cryptogen generate --config=./organizations/cryptogen/crypto-config-org2.yaml --output="organizations"
cryptogen generate --config=./organizations/cryptogen/crypto-config-shipper.yaml --output="organizations"
cryptogen generate --config=./organizations/cryptogen/crypto-config-tax.yaml --output="organizations"

# ====================================================
# STEP 4: GENESIS BLOCK & CHANNEL TX
# ====================================================
echo "bm Creating Genesis Block & Channel Tx..."

# Genesis Block using FourOrgs profile
configtxgen -profile FourOrgsOrdererGenesis -channelID system-channel -outputBlock ./channel-artifacts/genesis.block

# Channel Tx
configtxgen -profile FourOrgsChannel -outputCreateChannelTx ./channel-artifacts/orderchannel.tx -channelID orderchannel

# Anchor Peers for ALL 4 Orgs
echo "   - Ecommerce Anchor..."
configtxgen -profile FourOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/ECommercePlatformOrgMSPAnchors.tx -channelID orderchannel -asOrg ECommercePlatformOrgMSP
echo "   - Seller Anchor..."
configtxgen -profile FourOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/SellerOrgMSPAnchors.tx -channelID orderchannel -asOrg SellerOrgMSP
echo "   - Shipper Anchor..."
configtxgen -profile FourOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/ShipperOrgMSPAnchors.tx -channelID orderchannel -asOrg ShipperOrgMSP
echo "   - Tax Anchor..."
configtxgen -profile FourOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/TaxOrgMSPAnchors.tx -channelID orderchannel -asOrg TaxOrgMSP

# ====================================================
# STEP 5: START NETWORK
# ====================================================
echo "Starting Docker Containers (with retry for timeout)..."
export COMPOSE_HTTP_TIMEOUT=600
until docker compose -f compose/compose-test-net.yaml -f compose/compose-couch.yaml -f compose/compose-ca.yaml -f compose/compose-support.yaml up -d; do
    echo "   [!] Quá trình bật container bị timeout do máy quá tải. Đang thử lại phần còn lại..."
    sleep 5
done

echo "Waiting 15s for nodes to start..."
sleep 15

# Init Vault
echo "Initializing Vault..."
chmod +x ./init_vault_persistent.sh
export VAULT_ADDR='http://127.0.0.1:8200'
./init_vault_persistent.sh

# ====================================================
# STEP 6: ENVIRONMENT SETUP
# ====================================================
export FABRIC_CFG_PATH=$PWD/../config
export ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/tlscacerts/tlsca.example.com-cert.pem

# ====================================================
# STEP 7: CREATE & JOIN CHANNEL
# ====================================================
echo "Creating channel 'orderchannel'..."
# Use Ecommerce Admin to create channel
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="ECommercePlatformOrgMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp
export CORE_PEER_ADDRESS=peer0.ecommerce.com:7051
export CORE_PEER_TLS_SERVERHOSTOVERRIDE=peer0.ecommerce.com

# Function to join channel
MAX_RETRY=10
RETRY_COUNT=0
echo "Creating channel 'orderchannel' (with retry)..."
until peer channel create -o localhost:7050 -c orderchannel -f ./channel-artifacts/orderchannel.tx --outputBlock ./channel-artifacts/orderchannel.block --tls --cafile $ORDERER_CA; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRY ]; then
        echo "Lỗi: Không thể kết nối tới Orderer sau nhiều lần thử!"
        exit 1
    fi
    echo "Orderer chưa sẵn sàng. Đang thử lại ($RETRY_COUNT/$MAX_RETRY) sau 10 giây..."
    sleep 10
done
joinChannel() {
    ORG=$1
    PEER_ADDR=$2
    TLS_ROOT=$3
    MSP_ID=$4
    MSP_PATH=$5
    
    export CORE_PEER_LOCALMSPID=$MSP_ID
    export CORE_PEER_TLS_ROOTCERT_FILE=$TLS_ROOT
    export CORE_PEER_MSPCONFIGPATH=$MSP_PATH
    export CORE_PEER_ADDRESS=$PEER_ADDR
    export CORE_PEER_TLS_SERVERHOSTOVERRIDE=$(echo $PEER_ADDR | cut -d: -f1)
    
    echo "[$ORG] Joining channel at $PEER_ADDR..."
peer channel join -b ./channel-artifacts/orderchannel.block
}

# Join All Peers
joinChannel "Ecommerce" "peer0.ecommerce.com:7051" "${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt" "ECommercePlatformOrgMSP" "${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp"
joinChannel "Ecommerce" "peer1.ecommerce.com:7061" "${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer1.ecommerce.com/tls/ca.crt" "ECommercePlatformOrgMSP" "${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp"

joinChannel "Seller" "peer0.seller.com:9051" "${PWD}/organizations/peerOrganizations/seller.com/peers/peer0.seller.com/tls/ca.crt" "SellerOrgMSP" "${PWD}/organizations/peerOrganizations/seller.com/users/Admin@seller.com/msp"
joinChannel "Seller" "peer1.seller.com:9061" "${PWD}/organizations/peerOrganizations/seller.com/peers/peer1.seller.com/tls/ca.crt" "SellerOrgMSP" "${PWD}/organizations/peerOrganizations/seller.com/users/Admin@seller.com/msp"

joinChannel "Shipper" "peer0.shipper.com:11051" "${PWD}/organizations/peerOrganizations/shipper.com/peers/peer0.shipper.com/tls/ca.crt" "ShipperOrgMSP" "${PWD}/organizations/peerOrganizations/shipper.com/users/Admin@shipper.com/msp"
joinChannel "Shipper" "peer1.shipper.com:11061" "${PWD}/organizations/peerOrganizations/shipper.com/peers/peer1.shipper.com/tls/ca.crt" "ShipperOrgMSP" "${PWD}/organizations/peerOrganizations/shipper.com/users/Admin@shipper.com/msp"

joinChannel "Tax" "peer0.tax.com:13051" "${PWD}/organizations/peerOrganizations/tax.com/peers/peer0.tax.com/tls/ca.crt" "TaxOrgMSP" "${PWD}/organizations/peerOrganizations/tax.com/users/Admin@tax.com/msp"
joinChannel "Tax" "peer1.tax.com:13061" "${PWD}/organizations/peerOrganizations/tax.com/peers/peer1.tax.com/tls/ca.crt" "TaxOrgMSP" "${PWD}/organizations/peerOrganizations/tax.com/users/Admin@tax.com/msp"

# ====================================================
# STEP 8: UPDATE ANCHOR PEERS
# ====================================================
echo "Updating Anchor Peers..."

updateAnchor() {
    ORG=$1
    PEER_ADDR=$2
    TLS_ROOT=$3
    MSP_ID=$4
    MSP_PATH=$5
    ANCHOR_TX=$6
    
    export CORE_PEER_LOCALMSPID=$MSP_ID
    export CORE_PEER_TLS_ROOTCERT_FILE=$TLS_ROOT
    export CORE_PEER_MSPCONFIGPATH=$MSP_PATH
    export CORE_PEER_ADDRESS=$PEER_ADDR
    export CORE_PEER_TLS_SERVERHOSTOVERRIDE=$(echo $PEER_ADDR | cut -d: -f1)
    
    echo "   - Updating anchor for $ORG..."
    peer channel update -o orderer0.example.com:7050 -c orderchannel -f $ANCHOR_TX --tls --cafile $ORDERER_CA
}

updateAnchor "Ecommerce" "peer0.ecommerce.com:7051" "${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt" "ECommercePlatformOrgMSP" "${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp" "./channel-artifacts/ECommercePlatformOrgMSPAnchors.tx"
updateAnchor "Seller" "peer0.seller.com:9051" "${PWD}/organizations/peerOrganizations/seller.com/peers/peer0.seller.com/tls/ca.crt" "SellerOrgMSP" "${PWD}/organizations/peerOrganizations/seller.com/users/Admin@seller.com/msp" "./channel-artifacts/SellerOrgMSPAnchors.tx"
updateAnchor "Shipper" "peer0.shipper.com:11051" "${PWD}/organizations/peerOrganizations/shipper.com/peers/peer0.shipper.com/tls/ca.crt" "ShipperOrgMSP" "${PWD}/organizations/peerOrganizations/shipper.com/users/Admin@shipper.com/msp" "./channel-artifacts/ShipperOrgMSPAnchors.tx"
updateAnchor "Tax" "peer0.tax.com:13051" "${PWD}/organizations/peerOrganizations/tax.com/peers/peer0.tax.com/tls/ca.crt" "TaxOrgMSP" "${PWD}/organizations/peerOrganizations/tax.com/users/Admin@tax.com/msp" "./channel-artifacts/TaxOrgMSPAnchors.tx"

# ====================================================
# STEP 9: DEPLOY CHAINCODE
# ====================================================
echo "Đóng gói Chaincode..."
CC_SRC_PATH="../my-ecommerce-chaincode"
CC_NAME="ecommerce"
CC_VERSION="1.0"
CC_SEQUENCE="1"

peer lifecycle chaincode package ecommerce.tar.gz --path $CC_SRC_PATH --lang golang --label ${CC_NAME}_${CC_VERSION}
export PACKAGE_ID=$(peer lifecycle chaincode calculatepackageid ecommerce.tar.gz)
echo "Package ID: $PACKAGE_ID"

# ----------------- INSTALL -----------------
echo "Installing Chaincode..."

installCC() {
    ORG=$1
    PEER_ADDR=$2
    TLS_ROOT=$3
    MSP_ID=$4
    MSP_PATH=$5
    
    export CORE_PEER_LOCALMSPID=$MSP_ID
    export CORE_PEER_TLS_ROOTCERT_FILE=$TLS_ROOT
    export CORE_PEER_MSPCONFIGPATH=$MSP_PATH
    export CORE_PEER_ADDRESS=$PEER_ADDR
    export CORE_PEER_TLS_SERVERHOSTOVERRIDE=$(echo $PEER_ADDR | cut -d: -f1)
    
    echo "   + Installing on $ORG ($PEER_ADDR)..."
    peer lifecycle chaincode install ecommerce.tar.gz
    sleep 2
}

installCC "Ecommerce" "peer0.ecommerce.com:7051" "${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt" "ECommercePlatformOrgMSP" "${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp"
installCC "Ecommerce" "peer1.ecommerce.com:7061" "${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer1.ecommerce.com/tls/ca.crt" "ECommercePlatformOrgMSP" "${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp"

installCC "Seller" "peer0.seller.com:9051" "${PWD}/organizations/peerOrganizations/seller.com/peers/peer0.seller.com/tls/ca.crt" "SellerOrgMSP" "${PWD}/organizations/peerOrganizations/seller.com/users/Admin@seller.com/msp"
installCC "Seller" "peer1.seller.com:9061" "${PWD}/organizations/peerOrganizations/seller.com/peers/peer1.seller.com/tls/ca.crt" "SellerOrgMSP" "${PWD}/organizations/peerOrganizations/seller.com/users/Admin@seller.com/msp"

installCC "Shipper" "peer0.shipper.com:11051" "${PWD}/organizations/peerOrganizations/shipper.com/peers/peer0.shipper.com/tls/ca.crt" "ShipperOrgMSP" "${PWD}/organizations/peerOrganizations/shipper.com/users/Admin@shipper.com/msp"
installCC "Shipper" "peer1.shipper.com:11061" "${PWD}/organizations/peerOrganizations/shipper.com/peers/peer1.shipper.com/tls/ca.crt" "ShipperOrgMSP" "${PWD}/organizations/peerOrganizations/shipper.com/users/Admin@shipper.com/msp"

installCC "Tax" "peer0.tax.com:13051" "${PWD}/organizations/peerOrganizations/tax.com/peers/peer0.tax.com/tls/ca.crt" "TaxOrgMSP" "${PWD}/organizations/peerOrganizations/tax.com/users/Admin@tax.com/msp"
installCC "Tax" "peer1.tax.com:13061" "${PWD}/organizations/peerOrganizations/tax.com/peers/peer1.tax.com/tls/ca.crt" "TaxOrgMSP" "${PWD}/organizations/peerOrganizations/tax.com/users/Admin@tax.com/msp"

# ----------------- APPROVE -----------------
echo "Approving Chaincode..."

approveCC() {
    ORG=$1
    PEER_ADDR=$2
    TLS_ROOT=$3
    MSP_ID=$4
    MSP_PATH=$5
    
    export CORE_PEER_LOCALMSPID=$MSP_ID
    export CORE_PEER_TLS_ROOTCERT_FILE=$TLS_ROOT
    export CORE_PEER_MSPCONFIGPATH=$MSP_PATH
    export CORE_PEER_ADDRESS=$PEER_ADDR
    export CORE_PEER_TLS_SERVERHOSTOVERRIDE=$(echo $PEER_ADDR | cut -d: -f1)

    echo "   + Approving for $ORG..."
    peer lifecycle chaincode approveformyorg -o orderer0.example.com:7050 \
        --ordererTLSHostnameOverride orderer0.example.com \
        --channelID orderchannel \
        --name $CC_NAME \
        --version $CC_VERSION \
        --package-id $PACKAGE_ID \
        --sequence $CC_SEQUENCE \
        --tls \
        --cafile $ORDERER_CA \
        --collections-config $CC_SRC_PATH/chaincode/collections_config.json
    sleep 2
}

approveCC "Ecommerce" "peer0.ecommerce.com:7051" "${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt" "ECommercePlatformOrgMSP" "${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp"
approveCC "Seller" "peer0.seller.com:9051" "${PWD}/organizations/peerOrganizations/seller.com/peers/peer0.seller.com/tls/ca.crt" "SellerOrgMSP" "${PWD}/organizations/peerOrganizations/seller.com/users/Admin@seller.com/msp"
approveCC "Shipper" "peer0.shipper.com:11051" "${PWD}/organizations/peerOrganizations/shipper.com/peers/peer0.shipper.com/tls/ca.crt" "ShipperOrgMSP" "${PWD}/organizations/peerOrganizations/shipper.com/users/Admin@shipper.com/msp"
approveCC "Tax" "peer0.tax.com:13051" "${PWD}/organizations/peerOrganizations/tax.com/peers/peer0.tax.com/tls/ca.crt" "TaxOrgMSP" "${PWD}/organizations/peerOrganizations/tax.com/users/Admin@tax.com/msp"

# ----------------- COMMIT -----------------
echo "Committing Chaincode..."

# Using Ecommerce Admin to commit
export CORE_PEER_LOCALMSPID="ECommercePlatformOrgMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/ecommerce.com/users/Admin@ecommerce.com/msp
export CORE_PEER_ADDRESS=peer0.ecommerce.com:7051
unset CORE_PEER_TLS_SERVERHOSTOVERRIDE

peer lifecycle chaincode commit -o orderer0.example.com:7050 \
    --ordererTLSHostnameOverride orderer0.example.com \
    --channelID orderchannel \
    --name $CC_NAME \
    --version $CC_VERSION \
    --sequence $CC_SEQUENCE \
    --tls \
    --cafile $ORDERER_CA \
--peerAddresses peer0.ecommerce.com:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/ecommerce.com/peers/peer0.ecommerce.com/tls/ca.crt \
--peerAddresses peer0.seller.com:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/seller.com/peers/peer0.seller.com/tls/ca.crt \
--peerAddresses peer0.shipper.com:11051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/shipper.com/peers/peer0.shipper.com/tls/ca.crt \
--peerAddresses peer0.tax.com:13051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/tax.com/peers/peer0.tax.com/tls/ca.crt \
--collections-config $CC_SRC_PATH/chaincode/collections_config.json

# ====================================================
# STEP 10: VAULT SETUP & FINALIZATION
# ====================================================
echo "Generating Connection Profiles..."
./ccp-generate.sh

echo "Waiting 5s for Vault..."
sleep 5

echo "Setting up Vault keys..."
chmod +x ./setup_vault.sh
sed -i 's/127.0.0.1:8200/127.0.0.1:8200/g' setup_vault.sh
export VAULT_ADDR='http://127.0.0.1:8200'
./setup_vault.sh

echo "Restarting Hyperledger Explorer..."
docker start explorer || true
sleep 5

echo "NETWORK RESET COMPLETE (4 ORGS)!"
echo "TOKEN: $(cat vault/root_token.txt)"




