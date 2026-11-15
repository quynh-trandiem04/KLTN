// blockchain-adapter/src/config/vault.js

const { VAULT_CONFIG } = require('./constants');

const vault = require('node-vault')({
    apiVersion: 'v1',
    endpoint: VAULT_CONFIG.ENDPOINT,
    token: VAULT_CONFIG.TOKEN
});

async function getIdentityFromVault(org, user) {
    const secretPath = `fabric/${org}/${user}`;
    try {
        const result = await vault.read(`secret/data/${secretPath}`);
        if (!result.data.data) return null;
        return result.data.data;
    } catch (error) {
        if (error.response && error.response.statusCode === 404) {
        return null;
        }
        console.error(`Lỗi đọc Vault (${secretPath}): ${error.message}`);
        throw error;
    }
}

async function saveIdentityToVault(org, user, privateKey, certificate) {
    const secretPath = `fabric/${org}/${user}`;
    try {
        await vault.write(`secret/data/${secretPath}`, {
            data: { 
                privateKey: privateKey.toString(), 
                certificate: certificate.toString() 
            }
        });
        console.log(`[Vault] Đã lưu: ${secretPath}`);
    } catch (error) {
        console.error(`Lỗi ghi Vault: ${error.message}`);
        throw error;
    }
}

module.exports = { getIdentityFromVault, saveIdentityToVault };