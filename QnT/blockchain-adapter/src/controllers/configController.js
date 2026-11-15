// controllers/configController.js

const { connectToNetwork } = require('../config/fabric');

exports.getConfig = async (req, res) => {
    try {
        const { type } = req.params; // 'tax' hoặc 'business'
        const { requestorOrg = 'platform', requestorUser = 'admin-ca-platform' } = req.query;
        
        const { gateway, contract } = await connectToNetwork(requestorOrg, requestorUser);
        
        const functionName = type === 'tax' ? 'GetTaxConfig' : 'GetBusinessConfig';
        const resultBuffer = await contract.evaluateTransaction(functionName);
        
        gateway.disconnect();
        res.status(200).json({ success: true, data: JSON.parse(resultBuffer.toString()) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.setConfig = async (req, res) => {
    try {
        const { type } = req.params; 
        const { configData, requestorOrg = 'platform', requestorUser = 'admin-ca-platform' } = req.body;
        
        const { gateway, contract } = await connectToNetwork(requestorOrg, requestorUser);
        
        const functionName = type === 'tax' ? 'SetTaxConfig' : 'SetBusinessConfig';
        const result = await contract.submitTransaction(functionName, JSON.stringify(configData));
        
        gateway.disconnect();
        res.status(200).json({ success: true, message: `Updated ${type} config`, txId: result.toString() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};