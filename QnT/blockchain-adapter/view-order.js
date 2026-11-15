// blockchain-adapter/view-order.js
// Tiện ích xem Public + Private data của 1 order từ MinIO lakehouse
// Usage: node view-order.js <ORDER_ID>
// Ví dụ: node view-order.js ORD-1775548084107-M7T5O

const Minio = require('minio');
const { MINIO_CONFIG } = require('./src/config/constants');

const minioClient = new Minio.Client({
    endPoint: MINIO_CONFIG.ENDPOINT,
    port: MINIO_CONFIG.PORT,
    useSSL: false,
    accessKey: MINIO_CONFIG.ACCESS_KEY,
    secretKey: MINIO_CONFIG.SECRET_KEY
});

const BUCKET = MINIO_CONFIG.BUCKET_NAME;
const orderId = process.argv[2];

if (!orderId) {
    console.log('Usage: node view-order.js <ORDER_ID>');
    console.log('Ví dụ: node view-order.js ORD-1775548084107-M7T5O');
    process.exit(1);
}

async function readJson(objectName) {
    return new Promise((resolve, reject) => {
        let data = '';
        minioClient.getObject(BUCKET, objectName, (err, stream) => {
            if (err) return reject(err);
            stream.on('data', chunk => data += chunk);
            stream.on('end', () => resolve(JSON.parse(data)));
            stream.on('error', reject);
        });
    });
}

async function listFiles(prefix) {
    return new Promise((resolve) => {
        const files = [];
        const stream = minioClient.listObjects(BUCKET, prefix, true);
        stream.on('data', obj => files.push(obj.name));
        stream.on('end', () => resolve(files));
        stream.on('error', () => resolve(files));
    });
}

function formatVND(amount) {
    if (amount === null || amount === undefined) return 'N/A';
    return Number(amount).toLocaleString('vi-VN') + ' VNĐ';
}

async function main() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  📦 ORDER: ${orderId}`);
    console.log(`${'═'.repeat(60)}\n`);

    // 1. Current state (public + private)
    let hasState = false;
    try {
        const state = await readJson(`private/${orderId}/current_state.json`);
        hasState = true;

        if (state.public_data) {
            const pub = state.public_data;
            console.log('┌─── 📋 PUBLIC DATA (Ledger chung) ───────────────────────');
            console.log(`│  Order ID:    ${pub.orderID}`);
            console.log(`│  Status:      ${pub.status}`);
            console.log(`│  Payment:     ${pub.paymentMethod}`);
            console.log(`│  COD Status:  ${pub.codStatus || 'N/A'}`);
            console.log(`│  Seller:      ${pub.sellerCompanyID} (${pub.sellerID})`);
            console.log(`│  Shipper:     ${pub.shipperCompanyID} (${pub.shipperID})`);
            console.log(`│  VAT Rate:    ${pub.vatRate}%`);
            console.log(`│  Created:     ${pub.createdAt}`);
            console.log(`│  Updated:     ${pub.updatedAt}`);
            if (pub.paidAt && pub.paidAt !== '0001-01-01T00:00:00Z')
                console.log(`│  Paid At:     ${pub.paidAt}`);
            if (pub.shippedAt && pub.shippedAt !== '0001-01-01T00:00:00Z')
                console.log(`│  Shipped At:  ${pub.shippedAt}`);
            if (pub.deliveryTimestamp && pub.deliveryTimestamp !== '0001-01-01T00:00:00Z')
                console.log(`│  Delivered:   ${pub.deliveryTimestamp}`);
            if (pub.settledAt && pub.settledAt !== '0001-01-01T00:00:00Z')
                console.log(`│  Settled At:  ${pub.settledAt}`);
            if (pub.cancelledAt && pub.cancelledAt !== '0001-01-01T00:00:00Z')
                console.log(`│  Cancelled:   ${pub.cancelledAt}`);
            
            if (pub.history && pub.history.length > 0) {
                console.log(`│`);
                console.log(`│  📜 History (${pub.history.length} entries):`);
                for (const h of pub.history) {
                    console.log(`│    ${h.action} by ${h.actorOrg} @ ${h.timestamp}`);
                    console.log(`│      TxID: ${h.txID.substring(0, 16)}...`);
                }
            }
            console.log(`└${'─'.repeat(58)}`);
        }

        if (state.seller_data) {
            const seller = state.seller_data;
            console.log(`\n┌─── 🏪 SELLER DATA (Private - collectionSellerMarketplace) ─`);
            console.log(`│  Customer ID:       ${seller.customerID}`);
            console.log(`│  Seller Tax Code:   ${seller.sellerTaxCode || 'N/A'}`);
            console.log(`│  Final Price:       ${formatVND(seller.FinalPrice)}`);
            console.log(`│  Total Amount:      ${formatVND(seller.TotalAmount)}`);
            console.log(`│  VAT Amount:        ${formatVND(seller.vatAmount)}`);
            console.log(`│  Seller Net Income: ${formatVND(seller.sellerNetIncome)}`);
            console.log(`│  Platform Discount: ${formatVND(seller.platformDiscountAmount)}`);
            console.log(`│  Shop Discount:     ${formatVND(seller.shopDiscountAmount)}`);
            if (seller.items && seller.items.length > 0) {
                console.log(`│`);
                console.log(`│  🛒 Items (${seller.items.length}):`);
                for (const item of seller.items) {
                    console.log(`│    ├── ${item.productName}`);
                    console.log(`│    │   ID: ${item.productID}${item.variantID ? ` / Variant: ${item.variantID}` : ''}`);
                    console.log(`│    │   ${formatVND(item.unitPrice)} × ${item.quantity} = ${formatVND(item.unitPrice * item.quantity)}`);
                }
            }
            console.log(`└${'─'.repeat(58)}`);
        } else {
            console.log(`\n  🏪 SELLER DATA: ❌ Không có (org chưa ủy quyền hoặc chưa sync)`);
        }

        if (state.shipper_data) {
            const shipper = state.shipper_data;
            console.log(`\n┌─── 🚚 SHIPPER DATA (Private - collectionShipperMarketplace)`);
            console.log(`│  Shipping Address:  ${shipper.shippingAddress}`);
            console.log(`│  Phone:             ${shipper.phone}`);
            console.log(`│  COD Amount:        ${formatVND(shipper.codAmount)}`);
            console.log(`│  Shipping Fee:      ${formatVND(shipper.shippingFee)}`);
            console.log(`└${'─'.repeat(58)}`);
        } else {
            console.log(`\n  🚚 SHIPPER DATA: ❌ Không có`);
        }

        if (state.tax_data) {
            const tax = state.tax_data;
            console.log(`\n┌─── 🧾 TAX DATA (Private - collectionTaxMarketplace) ────`);
            console.log(`│  Seller Tax Code:   ${tax.sellerTaxCode}`);
            console.log(`│  Seller Company:    ${tax.sellerCompanyID}`);
            console.log(`│  Taxable Revenue:   ${formatVND(tax.taxableRevenue)}`);
            console.log(`│  VAT Amount:        ${formatVND(tax.vatAmount)}`);
            console.log(`│  Transaction Date:  ${tax.transactionDate}`);
            console.log(`│  Note:              ${tax.note || 'N/A'}`);
            console.log(`└${'─'.repeat(58)}`);
        } else {
            console.log(`\n  🧾 TAX DATA: ❌ Không có (chỉ xuất hiện sau PayoutToSeller)`);
        }

        console.log(`\n  🔒 Data Verified: ${state.data_verified ? '✅ Yes' : '❌ No'}`);
        console.log(`  📸 Snapshot At:   ${state.snapshot_at}`);

    } catch (err) {
        console.log(`⚠️ Chưa có current_state cho ${orderId}`);
        console.log(`   Chạy: node src/listeners/backfillBlocks.js --with-private\n`);
    }

    // 2. Transaction history files
    const files = await listFiles(`private/${orderId}/`);
    const txFiles = files.filter(f => !f.endsWith('current_state.json'));

    if (txFiles.length > 0) {
        console.log(`\n┌─── 📜 LIFECYCLE (${txFiles.length} snapshots) ─────────────────`);
        for (const file of txFiles) {
            try {
                const tx = await readJson(file);
                console.log(`│  Block #${tx.block_number}: ${tx.function_name} @ ${tx.timestamp}`);
            } catch {}
        }
        console.log(`└${'─'.repeat(58)}`);
    }

    console.log('');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
