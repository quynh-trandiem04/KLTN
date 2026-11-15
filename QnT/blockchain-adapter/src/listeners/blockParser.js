// blockchain-adapter/src/listeners/blockParser.js
// Block Parser — Extract structured transaction data from Hyperledger Fabric raw blocks
// Đã cập nhật theo cấu trúc thực tế từ fabric-network SDK decoded blocks

/**
 * Extract transactions from a Hyperledger Fabric block
 * Cấu trúc thực tế (fabric-network SDK decoded):
 * {
 *   blockNumber, channelId, timestamp, dataHash, previousHash,
 *   transactionCount,
 *   transactions: [{
 *     txId, channelId, timestamp, type, creator: {mspId},
 *     chaincode, function, args, endorsers, rwSet, validationCode
 *   }]
 * }
 * 
 * @param {Object} blockData - Block data from fabric-network event / MinIO
 * @param {string|number} blockNumber - Block number for logging
 * @returns {Array} Array of structured transaction objects
 */
function extractTransactions(blockData, blockNumber) {
    const transactions = [];

    if (!blockData) {
        console.warn(`[BlockParser] Block #${blockNumber}: blockData is null/undefined`);
        return transactions;
    }

    // ═══════════════════════════════════════════════════════════════
    // FORMAT 1: SDK decoded — blockData.transactions[] (cấu trúc thực tế)
    // ═══════════════════════════════════════════════════════════════
    if (Array.isArray(blockData.transactions)) {
        for (let txIndex = 0; txIndex < blockData.transactions.length; txIndex++) {
            try {
                const tx = blockData.transactions[txIndex];
                const parsed = parseSDKTransaction(tx, blockData, blockNumber, txIndex);
                if (parsed) transactions.push(parsed);
            } catch (err) {
                console.warn(`[BlockParser] Block #${blockNumber} tx[${txIndex}] parse error: ${err.message}`);
            }
        }
        return transactions;
    }

    // ═══════════════════════════════════════════════════════════════
    // FORMAT 2: Raw protobuf decoded — blockData.data.data[] (fallback)
    // ═══════════════════════════════════════════════════════════════
    const envelopes = getNestedValue(blockData, 'data.data') || [];
    if (Array.isArray(envelopes) && envelopes.length > 0) {
        for (let txIndex = 0; txIndex < envelopes.length; txIndex++) {
            try {
                const tx = parseRawEnvelope(envelopes[txIndex], blockNumber, txIndex);
                if (tx) transactions.push(tx);
            } catch (err) {
                console.warn(`[BlockParser] Block #${blockNumber} raw tx[${txIndex}] parse error: ${err.message}`);
            }
        }
        return transactions;
    }

    // Unknown format — log structure for debugging
    logBlockStructure(blockData, blockNumber);
    return transactions;
}

/**
 * Parse 1 transaction từ SDK decoded format (cấu trúc thực tế)
 * Input format:
 * {
 *   txId, channelId, timestamp, type: "ENDORSER_TRANSACTION",
 *   creator: { mspId, commonName },
 *   chaincode: "ecommerce", function: "CreateOrder", args: ["ORD-xxx"],
 *   endorsers: [{ mspId }],
 *   rwSet: { reads: [...], writes: [...] },
 *   validationCode: ""
 * }
 */
function parseSDKTransaction(tx, blockData, blockNumber, txIndex) {
    if (!tx) return null;

    // Chỉ parse ENDORSER_TRANSACTION (chaincode invocations)
    if (tx.type && tx.type !== 'ENDORSER_TRANSACTION') {
        return null;
    }

    // Parse RW set: extract order data từ writes nếu có
    const orderData = extractOrderDataFromWrites(tx.rwSet);
    const privateDataHashes = extractPrivateDataHashes(tx.rwSet);

    return {
        // ── Block context ──
        block_number: parseInt(blockNumber),
        tx_index: txIndex,

        // ── Transaction identifiers ──
        tx_id: tx.txId || '',
        timestamp: normalizeTimestamp(tx.timestamp || blockData.timestamp),
        channel_id: tx.channelId || blockData.channelId || '',

        // ── Chaincode invocation ──
        chaincode_id: tx.chaincode || 'unknown',
        function_name: tx.function || 'unknown',
        args: tx.args || [],

        // ── Actor ──
        creator_msp: tx.creator?.mspId || '',
        creator_cn: tx.creator?.commonName || '',

        // ── Endorsement ──
        endorsers: (tx.endorsers || []).map(e => e.mspId || ''),
        endorser_count: (tx.endorsers || []).length,

        // ── Validation ──
        validation_code: tx.validationCode || '',
        is_valid: !tx.validationCode || tx.validationCode === '' || tx.validationCode === 'VALID',

        // ── Order data (extracted from RW set writes) ──
        order_data: orderData,

        // ── Private data hashes ──
        private_data_hashes: privateDataHashes
    };
}

/**
 * Extract order data từ RW set writes
 * Khi chaincode ghi PutState, value chứa toàn bộ Order struct
 */
function extractOrderDataFromWrites(rwSet) {
    if (!rwSet?.writes) return null;

    for (const write of rwSet.writes) {
        // Skip private data hash entries
        if (write.type === 'PRIVATE_DATA_HASH') continue;
        // Skip non-ecommerce namespaces (lifecycle, lscc, etc.)
        if (write.namespace && write.namespace !== 'ecommerce') continue;

        // value từ Fabric block thường là Buffer, Uint8Array hoặc chuỗi JSON
        if (write.value) {
            let valueObj = null;
            try {
                // Decode value thành chuỗi (dùng hàm decodeArg có sẵn)
                const valueStr = decodeArg(write.value);
                valueObj = JSON.parse(valueStr);
            } catch (err) {
                // Không phải JSON hợp lệ, bỏ qua
                continue;
            }

            if (valueObj && valueObj.docType === 'Order') {
                return {
                    order_id: valueObj.orderID || '',
                    status: valueObj.status || '',
                    payment_method: valueObj.paymentMethod || '',
                    cod_status: valueObj.codStatus || '',
                    seller_company_id: valueObj.sellerCompanyID || '',
                    shipper_company_id: valueObj.shipperCompanyID || '',
                    vat_rate: valueObj.vatRate || 0,
                    created_at: valueObj.createdAt || '',
                    updated_at: valueObj.updatedAt || '',
                    delivery_timestamp: normalizeZeroTime(valueObj.deliveryTimestamp),
                    paid_at: normalizeZeroTime(valueObj.paidAt),
                    shipped_at: normalizeZeroTime(valueObj.shippedAt),
                    settled_at: normalizeZeroTime(valueObj.settledAt),
                    cancelled_at: normalizeZeroTime(valueObj.cancelledAt),
                    return_requested_at: normalizeZeroTime(valueObj.returnRequestedAt),
                    return_completed_at: normalizeZeroTime(valueObj.returnCompletedAt),
                    history_count: (valueObj.history || []).length,
                    last_action: valueObj.history?.length > 0
                        ? valueObj.history[valueObj.history.length - 1].action
                        : ''
                };
            }
        }
    }
    return null;
}

/**
 * Extract private data hash info từ RW set
 */
function extractPrivateDataHashes(rwSet) {
    if (!rwSet?.writes) return [];

    return rwSet.writes
        .filter(w => w.type === 'PRIVATE_DATA_HASH')
        .map(w => ({
            namespace: w.namespace || '',
            collection: w.collection || '',
            hash_count: w.hashCount || 0
        }));
}

/**
 * Normalize Go zero time "0001-01-01T00:00:00Z" → null
 */
function normalizeZeroTime(ts) {
    if (!ts || ts === '0001-01-01T00:00:00Z' || ts === '') return null;
    return ts;
}

// ═══════════════════════════════════════════════════════════════════
// FALLBACK: Raw protobuf decoded format (nếu SDK format không match)
// ═══════════════════════════════════════════════════════════════════

function parseRawEnvelope(envelope, blockNumber, txIndex) {
    if (!envelope) return null;

    const payload = getNestedValue(envelope, 'payload');
    if (!payload) return null;

    const header = getNestedValue(payload, 'header');
    const channelHeader = getNestedValue(header, 'channel_header');
    if (!channelHeader) return null;

    const txType = channelHeader.type || channelHeader.typeString;
    if (txType !== 3 && txType !== 'ENDORSER_TRANSACTION') return null;

    const txId = channelHeader.tx_id || channelHeader.txId || '';
    const timestamp = channelHeader.timestamp || '';
    const channelId = channelHeader.channel_id || channelHeader.channelId || '';
    const creatorMsp = getNestedValue(header, 'signature_header.creator.mspid')
                    || getNestedValue(header, 'signature_header.creator.Mspid') || '';

    // Extract chaincode info from actions
    const data = getNestedValue(payload, 'data');
    const actions = getNestedValue(data, 'actions') || [];

    let chaincodeId = 'unknown';
    let functionName = 'unknown';
    let args = [];

    for (const action of actions) {
        const input = getNestedValue(action, 'payload.chaincode_proposal_payload.input.chaincode_spec.input')
                   || getNestedValue(action, 'payload.chaincodeProposalPayload.input.chaincodeSpec.input');

        chaincodeId = getNestedValue(action, 'payload.action.proposal_response_payload.extension.chaincode_id.name')
                   || getNestedValue(action, 'payload.action.proposalResponsePayload.extension.chaincodeId.name')
                   || '';

        const rawArgs = getNestedValue(input, 'args') || [];
        args = rawArgs.map(decodeArg);
        if (args.length > 0) {
            functionName = args[0];
            args = args.slice(1);
        }
        break; // Chỉ lấy action đầu tiên
    }

    return {
        block_number: parseInt(blockNumber),
        tx_index: txIndex,
        tx_id: txId,
        timestamp: normalizeTimestamp(timestamp),
        channel_id: channelId,
        chaincode_id: chaincodeId || 'unknown',
        function_name: functionName,
        args: args,
        creator_msp: creatorMsp,
        creator_cn: '',
        endorsers: [],
        endorser_count: 0,
        validation_code: envelope.validationCode || '',
        is_valid: !envelope.validationCode || envelope.validationCode === 0,
        order_data: null,
        private_data_hashes: []
    };
}

/**
 * Decode argument — có thể là Buffer, Uint8Array, hoặc string
 */
function decodeArg(arg) {
    if (arg === null || arg === undefined) return '';
    if (typeof arg === 'string') return arg;
    if (Buffer.isBuffer(arg)) return arg.toString('utf8');
    if (arg instanceof Uint8Array) return Buffer.from(arg).toString('utf8');
    if (typeof arg === 'object' && arg.type === 'Buffer' && Array.isArray(arg.data)) {
        return Buffer.from(arg.data).toString('utf8');
    }
    return String(arg);
}

/**
 * Normalize timestamp to ISO 8601
 */
function normalizeTimestamp(ts) {
    if (!ts) return new Date().toISOString();
    if (typeof ts === 'string') {
        const parsed = new Date(ts);
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    if (typeof ts === 'object' && (ts.seconds || ts.Seconds)) {
        const seconds = Number(ts.seconds || ts.Seconds || 0);
        const nanos = Number(ts.nanos || ts.Nanos || 0);
        return new Date(seconds * 1000 + nanos / 1e6).toISOString();
    }
    return new Date().toISOString();
}

/**
 * Safely traverse nested object with dot notation
 */
function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((current, key) => {
        if (current === null || current === undefined) return undefined;
        return current[key];
    }, obj);
}

/**
 * Log block structure for debugging (first 3 blocks)
 */
const loggedBlocks = new Set();
function logBlockStructure(blockData, blockNumber) {
    if (loggedBlocks.size >= 3) return;
    loggedBlocks.add(blockNumber);
    console.log(`\n[BlockParser] 🔍 Block #${blockNumber} — unknown structure:`);
    console.log(`  Top-level keys: ${Object.keys(blockData || {}).join(', ')}`);
    if (blockData?.transactions) console.log(`  transactions: Array[${blockData.transactions.length}]`);
    if (blockData?.data?.data) console.log(`  data.data: Array[${blockData.data.data.length}]`);
    console.log('[BlockParser] ─── End discovery ───\n');
}

/**
 * Build block metadata summary
 */
function buildBlockMetadata(blockData, blockNumber, transactions) {
    return {
        block_number: parseInt(blockNumber),
        channel_id: blockData.channelId || '',
        tx_count: transactions.length,
        valid_tx_count: transactions.filter(t => t.is_valid).length,
        timestamp: blockData.timestamp
            || (transactions.length > 0 ? transactions[0].timestamp : new Date().toISOString()),
        data_hash: blockData.dataHash || blockData.header?.data_hash || '',
        previous_hash: blockData.previousHash || blockData.header?.previous_hash || '',
        // Phân tích nhanh: mỗi function gọi bao nhiêu lần
        function_summary: summarizeByFunction(transactions),
        // Danh sách order IDs liên quan
        order_ids: extractOrderIds(transactions)
    };
}

/**
 * Summarize transactions by chaincode function
 */
function summarizeByFunction(transactions) {
    const summary = {};
    for (const tx of transactions) {
        const key = `${tx.chaincode_id}:${tx.function_name}`;
        summary[key] = (summary[key] || 0) + 1;
    }
    return summary;
}

/**
 * Extract order IDs from transactions
 */
function extractOrderIds(transactions) {
    const orderIds = new Set();
    for (const tx of transactions) {
        // Order ID từ args (argument đầu tiên của hầu hết functions)
        if (tx.args && tx.args.length > 0 && tx.args[0].startsWith('ORD-')) {
            orderIds.add(tx.args[0]);
        }
        // Order ID từ order_data nếu có
        if (tx.order_data?.order_id) {
            orderIds.add(tx.order_data.order_id);
        }
    }
    return [...orderIds];
}

module.exports = {
    extractTransactions,
    buildBlockMetadata,
    // Export for testing
    parseSDKTransaction,
    extractOrderDataFromWrites,
    normalizeZeroTime,
    decodeArg,
    normalizeTimestamp,
    getNestedValue
};
