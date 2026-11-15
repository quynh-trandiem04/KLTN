// backend-api/src/controllers/supersetController.js
const axios = require('axios');

const SUPERSET_URL        = process.env.SUPERSET_URL        || 'http://192.168.147.11:8088';
const SUPERSET_ADMIN_USER = process.env.SUPERSET_ADMIN_USER || 'admin';
const SUPERSET_ADMIN_PASS = process.env.SUPERSET_ADMIN_PASSWORD || 'admin';
const DASHBOARD_ID        = process.env.SUPERSET_DASHBOARD_ID     || 'd1922d3e-6045-45af-985a-dc79ecd05efb';
const TAX_DASHBOARD_ID              = process.env.SUPERSET_TAX_DASHBOARD_ID              || '9412d4f7-b66c-4885-959e-a82cad3839e0';
const CUSTOMER_BEHAVIOR_DASHBOARD_ID = process.env.SUPERSET_CUSTOMER_BEHAVIOR_DASHBOARD_ID || 'a22b0ab2-5d6b-41f7-a330-71286743eec0';

/**
 * GET /api/v1/superset/guest-token
 * Returns a short-lived Superset guest token for embedding the dashboard.
 * Requires: verifyToken + checkRole(['ADMIN'])
 */
async function getGuestToken(req, res) {
    try {
        // 1. Login to Superset as admin → get access token
        const loginRes = await axios.post(
            `${SUPERSET_URL}/api/v1/security/login`,
            {
                username: SUPERSET_ADMIN_USER,
                password: SUPERSET_ADMIN_PASS,
                provider: 'db',
                refresh: false,
            },
            { timeout: 10000 }
        );

        const accessToken = loginRes.data?.access_token;
        if (!accessToken) {
            return res.status(502).json({ detail: 'Không lấy được access token từ Superset' });
        }

        // 2. Get guest token for the embedded dashboard
        const guestRes = await axios.post(
            `${SUPERSET_URL}/api/v1/security/guest_token/`,
            {
                resources: [{ type: 'dashboard', id: DASHBOARD_ID }],
                rls: [],
                user: {
                    username: req.user?.email || 'admin',
                    first_name: req.user?.full_name?.split(' ')[0] || 'Admin',
                    last_name:  req.user?.full_name?.split(' ').slice(1).join(' ') || '',
                },
            },
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10000,
            }
        );

        const guestToken = guestRes.data?.token;
        if (!guestToken) {
            return res.status(502).json({ detail: 'Không lấy được guest token từ Superset' });
        }

        res.json({
            token: guestToken,
            dashboard_id: DASHBOARD_ID,
            superset_url: SUPERSET_URL,
        });
    } catch (error) {
        console.error('[Superset] getGuestToken error:', error?.response?.data || error.message);
        const status = error?.response?.status || 502;
        res.status(status).json({
            detail: error?.response?.data?.message || `Lỗi kết nối Superset: ${error.message}`,
        });
    }
}

module.exports = { getGuestToken, getGuestTokenForTax, getGuestTokenForCustomerBehavior };

/**
 * GET /api/v1/tax/superset/guest-token
 * Returns a short-lived Superset guest token for embedding the TAX dashboard.
 * Requires: verifyToken + checkRole(['TAX_ORG', 'ADMIN'])
 */
async function getGuestTokenForTax(req, res) {
    try {
        // 1. Login to Superset as admin → get access token
        const loginRes = await axios.post(
            `${SUPERSET_URL}/api/v1/security/login`,
            {
                username: SUPERSET_ADMIN_USER,
                password: SUPERSET_ADMIN_PASS,
                provider: 'db',
                refresh: false,
            },
            { timeout: 10000 }
        );

        const accessToken = loginRes.data?.access_token;
        if (!accessToken) {
            return res.status(502).json({ detail: 'Không lấy được access token từ Superset' });
        }

        // 2. Get guest token for the embedded TAX dashboard
        const guestRes = await axios.post(
            `${SUPERSET_URL}/api/v1/security/guest_token/`,
            {
                resources: [{ type: 'dashboard', id: TAX_DASHBOARD_ID }],
                rls: [],
                user: {
                    username: req.user?.email || 'tax_admin',
                    first_name: req.user?.full_name?.split(' ')[0] || 'Tax',
                    last_name:  req.user?.full_name?.split(' ').slice(1).join(' ') || 'Admin',
                },
            },
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10000,
            }
        );

        const guestToken = guestRes.data?.token;
        if (!guestToken) {
            return res.status(502).json({ detail: 'Không lấy được guest token từ Superset' });
        }

        res.json({
            token: guestToken,
            dashboard_id: TAX_DASHBOARD_ID,
            superset_url: SUPERSET_URL,
        });
    } catch (error) {
        console.error('[Superset] getGuestTokenForTax error:', error?.response?.data || error.message);
        const status = error?.response?.status || 502;
        res.status(status).json({
            detail: error?.response?.data?.message || `Lỗi kết nối Superset: ${error.message}`,
        });
    }
}

/**
 * GET /api/v1/admin/superset/customer-behavior-token
 * Returns a short-lived Superset guest token for the Customer Behavior dashboard.
 * Requires: verifyToken + checkRole(['ADMIN'])
 */
async function getGuestTokenForCustomerBehavior(req, res) {
    try {
        const loginRes = await axios.post(
            `${SUPERSET_URL}/api/v1/security/login`,
            {
                username: SUPERSET_ADMIN_USER,
                password: SUPERSET_ADMIN_PASS,
                provider: 'db',
                refresh: false,
            },
            { timeout: 10000 }
        );

        const accessToken = loginRes.data?.access_token;
        if (!accessToken) {
            return res.status(502).json({ detail: 'Không lấy được access token từ Superset' });
        }

        const guestRes = await axios.post(
            `${SUPERSET_URL}/api/v1/security/guest_token/`,
            {
                resources: [{ type: 'dashboard', id: CUSTOMER_BEHAVIOR_DASHBOARD_ID }],
                rls: [],
                user: {
                    username: req.user?.email || 'admin',
                    first_name: req.user?.full_name?.split(' ')[0] || 'Admin',
                    last_name:  req.user?.full_name?.split(' ').slice(1).join(' ') || '',
                },
            },
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10000,
            }
        );

        const guestToken = guestRes.data?.token;
        if (!guestToken) {
            return res.status(502).json({ detail: 'Không lấy được guest token từ Superset' });
        }

        res.json({
            token: guestToken,
            dashboard_id: CUSTOMER_BEHAVIOR_DASHBOARD_ID,
            superset_url: SUPERSET_URL,
        });
    } catch (error) {
        console.error('[Superset] getGuestTokenForCustomerBehavior error:', error?.response?.data || error.message);
        const status = error?.response?.status || 502;
        res.status(status).json({
            detail: error?.response?.data?.message || `Lỗi kết nối Superset: ${error.message}`,
        });
    }
}
