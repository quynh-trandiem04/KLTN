// blockchain-adapter/src/controllers/orderController.js
const { connectToNetwork } = require('../config/fabric');

async function submitTx(req, res, functionName, ...args) {
    try {
        const { requestorOrg, requestorUser, simulatedTime } = req.body;

        if (!requestorOrg || !requestorUser) {
            return res.status(400).json({ success: false, error: "Thiếu requestorOrg hoặc requestorUser" });
        }

        console.log(`\n[POST] ${functionName} - Caller: ${requestorUser} (${requestorOrg})`);

        const { gateway, contract } = await connectToNetwork(requestorOrg, requestorUser);

        const transaction = contract.createTransaction(functionName);
        
        const txId = transaction.getTransactionId(); 

        const transientData = {};
        if (simulatedTime) {
            transientData.simulated_time = Buffer.from(simulatedTime);
            console.log(`  Simulated Time: ${simulatedTime}`);
        }

        if (Object.keys(transientData).length > 0) {
            transaction.setTransient(transientData);
        }
        
        await transaction.submit(...args);
        
        console.log(`${functionName} committed! TxID: ${txId}`);
        gateway.disconnect();

        res.status(200).json({ 
            success: true, 
            message: `${functionName} thành công`,
            txId: txId
        });

    } catch (error) {
        console.error(`${functionName} Failed: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
    }
}

// =======================================================
// [NHÓM 1] TẠO ĐƠN HÀNG (SÀN TMĐT)
// =======================================================
exports.createOrder = async (req, res) => {
    try {
        const { orderID, sellerData, shipperData, metadata, simulatedTime, requestorOrg, requestorUser } = req.body;
        
        console.log(`\n[POST] CreateOrder: ${orderID}`);

        const org = requestorOrg || 'platform';
        const user = requestorUser || 'admin-ca-platform';

        const { gateway, contract } = await connectToNetwork(org, user);

        
        // 1. Seller Private Data
        const formattedSellerData = {
            orderID: orderID,
            customerID: sellerData.customerID || "Unknown", 
            items: sellerData.items,
            sellerTaxCode: sellerData.taxCode || "",
            FinalPrice: Number(sellerData.FinalPrice || 0),
            TotalAmount: Number(sellerData.TotalAmount || 0),
            vatAmount: Number(sellerData.TaxAmount || 0),
            sellerNetIncome: Number(sellerData.sellerNetIncome || 0),
            platformDiscountAmount: Number(sellerData.platformDiscountAmount || 0),
            shopDiscountAmount: Number(sellerData.shopDiscountAmount || 0)
        };

        // 2. Shipper Private Data
        const formattedShipperData = {
            orderID: orderID,
            shippingAddress: shipperData.shippingAddress,
            phone: shipperData.phone,
            codAmount: metadata.paymentMethod === 'COD' ? Number(metadata.finalPrice || 0) : 0,
            shippingFee: Number(shipperData.shippingFee || 0) 
        };

        // 3. Metadata
        const formattedMetadata = {
            paymentMethod: metadata.paymentMethod || "COD",
            shipperID: "ShipperOrgMSP", 
            shipperCompanyID: shipperData.carrierName || "default_shipper", 
            sellerCompanyID: sellerData.storeName || "unknown_seller" 
        };

        // Tạo Transient Data Map
        const transientData = {
            seller_data: Buffer.from(JSON.stringify(formattedSellerData)),
            shipper_data: Buffer.from(JSON.stringify(formattedShipperData)),
            metadata: Buffer.from(JSON.stringify(formattedMetadata))
        };

        if (simulatedTime) {
            transientData.simulated_time = Buffer.from(simulatedTime);
            console.log(`  Simulated Time: ${simulatedTime}`);
        }

        const transaction = contract.createTransaction('CreateOrder');
        const txId = transaction.getTransactionId();

        await transaction
            .setTransient(transientData)
            .submit(orderID);

        console.log(`CreateOrder committed! TxID: ${txId}`);
        gateway.disconnect();

        res.status(200).json({ 
            success: true, 
            message: "Order created on Blockchain successfully", 
            orderID,
            txId: txId
        });
    } catch (error) {
        console.error(`CreateOrder Failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
};

// =======================================================
// [NHÓM 2] XỬ LÝ THANH TOÁN & TRẠNG THÁI (SÀN)
// =======================================================

// [HÀM 2] ConfirmPayment: Sàn xác nhận thanh toán (Prepaid)
exports.confirmPayment = async (req, res) => submitTx(req, res, 'ConfirmPayment', req.body.orderID);

// [HÀM 3] CancelOrder: Hủy đơn
exports.cancelOrder = async (req, res) => submitTx(req, res, 'CancelOrder', req.body.orderID);

// [HÀM 7] RemitCOD: Sàn xác nhận đã nhận tiền COD từ Shipper
exports.remitCOD = async (req, res) => submitTx(req, res, 'RemitCOD', req.body.orderID);

// [HÀM 8] PayoutToSeller: Đối soát & Thanh toán cho Seller
exports.payoutToSeller = async (req, res) => {
    try {
        const { orderID, taxData, sellerSettlementData, simulatedTime, requestorOrg, requestorUser } = req.body;
        
        console.log(`\n[POST] PayoutToSeller: ${orderID}`);

        const org = requestorOrg || 'platform';
        const user = requestorUser || 'admin-ca-platform';

        const { gateway, contract } = await connectToNetwork(org, user);

        // Map dữ liệu Tax (Khớp struct OrderPrivateTax)
        const formattedTaxData = {
            orderID: orderID,
            sellerID: "SellerOrgMSP",
            sellerCompanyID: taxData.sellerCompanyID,
            sellerTaxCode: taxData.sellerTaxCode || "", 
            taxableRevenue: taxData.taxableRevenue || 0,
            vatAmount: taxData.vatAmount || 0,
            transactionDate: simulatedTime || new Date().toISOString(), 
            note: taxData.note || "Auto-calculated"
        };

        // 2. MAP DỮ LIỆU ĐỐI SOÁT SELLER (Ghi đè OrderPrivateSeller cũ)
        const formattedSellerSettlementData = {
            orderID: orderID,
            customerID: sellerSettlementData.customerID, 
            items: sellerSettlementData.items, 
            sellerTaxCode: sellerSettlementData.sellerTaxCode || "", 
            FinalPrice: Number(sellerSettlementData.FinalPrice || 0),
            TotalAmount: Number(sellerSettlementData.TotalAmount || 0),
            vatAmount: Number(taxData.vatAmount || 0),
            sellerNetIncome: Number(sellerSettlementData.sellerNetIncome || 0),
            platformDiscountAmount: Number(sellerSettlementData.platformDiscountAmount || 0),
            shopDiscountAmount: Number(sellerSettlementData.shopDiscountAmount || 0)
        };

        const transientData = {
            tax_data: Buffer.from(JSON.stringify(formattedTaxData)),
            seller_settlement_data: Buffer.from(JSON.stringify(formattedSellerSettlementData))
        };

        if (simulatedTime) {
            transientData.simulated_time = Buffer.from(simulatedTime);
            console.log(`  Simulated Time: ${simulatedTime}`);
        }

        const transaction = contract.createTransaction('PayoutToSeller');
        const txId = transaction.getTransactionId();

        await transaction
            .setTransient(transientData)
            .submit(orderID);

        console.log(`PayoutToSeller committed! Tax & Settlement Recorded. TxID: ${txId}`);
        gateway.disconnect();

        res.status(200).json({ 
            success: true, 
            message: "Payout & Tax recording successful", 
            orderID,
            txId: txId
        });
    } catch (error) {
        console.error(`PayoutToSeller Failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
};

// =======================================================
// [NHÓM 3] GIAO VẬN (SHIPPER)
// =======================================================

// [HÀM 4] ShipOrder: Shipper lấy hàng
exports.shipOrder = async (req, res) => submitTx(req, res, 'ShipOrder', req.body.orderID);

// [HÀM 5] ConfirmDelivery: Giao thành công (Prepaid)
exports.confirmDelivery = async (req, res) => submitTx(req, res, 'ConfirmDelivery', req.body.orderID);

// [HÀM 6] ConfirmCODDelivery: Giao & Thu tiền (COD)
exports.confirmCODDelivery = async (req, res) => submitTx(req, res, 'ConfirmCODDelivery', req.body.orderID);

// =======================================================
// [NHÓM 4] HOÀN TRẢ HÀNG (RETURN FLOW)
// =======================================================

// [HÀM 9] RequestReturn: Sàn yêu cầu trả hàng
exports.requestReturn = async (req, res) => submitTx(req, res, 'RequestReturn', req.body.orderID);

// [HÀM 10] ShipReturn: Shipper lấy hàng trả
exports.shipReturn = async (req, res) => submitTx(req, res, 'ShipReturn', req.body.orderID);

// [HÀM 11] ConfirmReturnReceived: Seller nhận hàng trả
exports.confirmReturnReceived = async (req, res) => submitTx(req, res, 'ConfirmReturnReceived', req.body.orderID);

// =======================================================
// [NHÓM 5] TRUY VẤN (QUERY)
// =======================================================

// QueryOrder: Lấy chi tiết 1 đơn hàng (Bao gồm check Private Data)
exports.getOrder = async (req, res) => {
    try {
        const { orderID, requestorOrg, requestorUser } = req.query;
        console.log(`\n[GET] QueryOrder: ${orderID} by ${requestorUser}`);

        const { gateway, contract } = await connectToNetwork(requestorOrg, requestorUser);
        
        const resultBuffer = await contract.evaluateTransaction('QueryOrder', orderID);
        const result = JSON.parse(resultBuffer.toString());

        gateway.disconnect();
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error(`QueryOrder Failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
};

// QueryOrdersByString: Truy vấn đơn hàng theo chuỗi query (Rich Query)
// VD Selector: {"selector":{"sellerCompanyID":"user_samsung_1"}}
exports.queryOrders = async (req, res) => {
    try {
        const { queryString, requestorOrg, requestorUser } = req.body;
        console.log(`\n[POST] QueryOrdersByString by ${requestorUser}`);

        const { gateway, contract } = await connectToNetwork(requestorOrg, requestorUser);
        
        const resultBuffer = await contract.evaluateTransaction('QueryOrdersByString', queryString);
        const result = JSON.parse(resultBuffer.toString());

        gateway.disconnect();
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error(`QueryOrders Failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
};