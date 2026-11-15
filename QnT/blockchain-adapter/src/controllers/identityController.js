// blockchain-adapter/src/controllers/identityController.js

const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { getIdentityFromVault, saveIdentityToVault } = require('../config/vault');
const { VM_IP, ORG_CONSTANTS } = require('../config/constants');

exports.registerUser = async (req, res) => {
    const { username, role, storeName } = req.body; 

    try {
        if (!username || !role) {
            return res.status(400).json({ success: false, message: 'Thiếu username hoặc role' });
        }

        const config = ORG_CONSTANTS[role];
        if (!config) {
            return res.status(400).json({ success: false, message: `Role '${role}' không hợp lệ` });
        }

        console.log(`\n[Identity] Bắt đầu đăng ký: ${username} (Role: ${role})...`);

        const existingIdentity = await getIdentityFromVault(config.VAULT_ORG, username);
        if (existingIdentity) {
            return res.status(200).json({ 
                success: true, 
                message: 'User đã tồn tại trong Vault', 
                mspId: config.MSP_ID 
            });
        }

        const caUrl = `https://${VM_IP}:${config.CA_PORT}`;
        const ca = new FabricCAServices(caUrl, { trustedRoots: [], verify: false }, config.CA_NAME);

        const wallet = await Wallets.newInMemoryWallet();
        const adminData = await getIdentityFromVault(config.VAULT_ORG, config.ADMIN_NAME);
        
        if (!adminData) {
            throw new Error(`Không tìm thấy CA Admin '${config.ADMIN_NAME}' trong Vault.`);
        }

        const adminIdentity = {
            credentials: {
                certificate: adminData.certificate,
                privateKey: adminData.privateKey,
            },
            mspId: config.MSP_ID,
            type: 'X.509',
        };

        await wallet.put('admin', adminIdentity);
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        const companyCodeAttr = storeName || username; 
        const secret = await ca.register({
            affiliation: '',
            enrollmentID: username,
            role: 'client',
            attrs: [{ name: 'companyCode', value: companyCodeAttr, ecert: true }]
        }, adminUser);

        const enrollment = await ca.enroll({
            enrollmentID: username,
            enrollmentSecret: secret
        });

        await saveIdentityToVault(config.VAULT_ORG, username, enrollment.key.toBytes(), enrollment.certificate);
        
        console.log(`THÀNH CÔNG: ${username} đã được lưu vào Vault!`);

        res.json({ 
            success: true, 
            username, 
            mspId: config.MSP_ID, 
            org: config.VAULT_ORG 
        });

    } catch (error) {
        if (error.toString().includes('already registered')) {
            return res.json({ success: true, message: 'User đã tồn tại trên CA', mspId: config.MSP_ID });
        }
        console.error(`Lỗi đăng ký ${username}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
};