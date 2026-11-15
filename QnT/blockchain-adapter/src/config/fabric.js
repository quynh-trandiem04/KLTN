// blockchain-adapter/src/config/fabric.js
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const { getIdentityFromVault } = require('./vault');

const CHANNEL_NAME = 'orderchannel';
const CHAINCODE_NAME = 'ecommerce';

// 1. Hàm lấy Connection Profile (CCP)
function getCCP(orgName) {
    let ccpFileName;
    switch (orgName) {
        case 'platform':
        ccpFileName = 'organizations/peerOrganizations/ecommerce.com/connection-ecommerce.json';
            break;
        case 'seller':
        ccpFileName = 'organizations/peerOrganizations/seller.com/connection-seller.json';
            break;
        case 'shipper':
        ccpFileName = 'organizations/peerOrganizations/shipper.com/connection-shipper.json';
            break;
        case 'tax':
            ccpFileName = 'organizations/peerOrganizations/tax.com/connection-tax.json';
            break;
        default:
            throw new Error(`Org '${orgName}' không hợp lệ. Chỉ chấp nhận: platform, seller, shipper, tax`);
    }
    
    const ccpPath = path.resolve(process.cwd(), ccpFileName);
    if (!fs.existsSync(ccpPath)) {
        throw new Error(`Không tìm thấy file CCP tại: ${ccpPath}`);
    }
    return JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
}

// 2. Hàm lấy MSP ID chuẩn từ tên ngắn gọn
function getMspId(orgName) {
    switch (orgName) {
        case 'platform': return 'ECommercePlatformOrgMSP';
        case 'seller': return 'SellerOrgMSP';
        case 'shipper': return 'ShipperOrgMSP';
        case 'tax': return 'TaxOrgMSP';
        default: return null;
    }
}

// 3. Hàm kết nối Gateway chính
async function connectToNetwork(orgName, userName) {
    try {
        console.log(`\nĐang kết nối Fabric: Org=${orgName}, User=${userName}`);
        
        // --- A. TẠO VÍ RAM (IN-MEMORY) ---
        // Không lưu file ví ra đĩa để đảm bảo bảo mật tuyệt đối
        const wallet = await Wallets.newInMemoryWallet();

        // --- B. LẤY IDENTITY TỪ VAULT ---
        const vaultData = await getIdentityFromVault(orgName, userName);

        if (vaultData) {
            console.log(`   Tìm thấy Identity trong Vault.`);
            const mspId = getMspId(orgName);

            const x509Identity = {
                credentials: {
                    certificate: vaultData.certificate,
                    privateKey: vaultData.privateKey,
                },
                mspId: mspId,
                type: 'X.509',
            };
            
            // Nạp vào Ví RAM
            await wallet.put(userName, x509Identity);
        } else {
            throw new Error(`Không tìm thấy User '${userName}' của Org '${orgName}' trong Vault.`);
        }

        // --- C. KẾT NỐI GATEWAY ---
        const ccp = getCCP(orgName);
        const gateway = new Gateway();

        await gateway.connect(ccp, {
            wallet,
            identity: userName,
            discovery: { enabled: true, asLocalhost: false }, 
            eventHandlerOptions: {
                commitTimeout: 100,
            }
        });

        // --- D. LẤY NETWORK & CONTRACT ---
        const network = await gateway.getNetwork(CHANNEL_NAME);
        const contract = network.getContract(CHAINCODE_NAME);

        return { gateway, network, contract };

    } catch (error) {
        console.error(`Fabric connection error: ${error}`);
        throw error;
    }
}

module.exports = { connectToNetwork };