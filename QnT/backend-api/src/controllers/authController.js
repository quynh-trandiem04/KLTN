// backend-api/src/controllers/authController.js
const authService = require('../services/auth.service');
const { validateUserRegister, validateLogin } = require('../models/user.models');
const { validateSellerApplication } = require('../models/seller.models');
const pool = require('../config/database');

class AuthController {
    async registerCustomer(req, res) {
        try {
            const { error, value } = validateUserRegister(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const user = await authService.register(value, 'CUSTOMER');
            res.status(201).json(user);
        } catch (error) {
            console.error('Register customer error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    async registerStoreOwner(req, res) {
        try {
            const { error, value } = validateSellerApplication(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }

            // Create user (has its own transaction inside authService)
            const user = await authService.register({
                email: value.email,
                password: value.password,
                full_name: value.full_name,
                phone_number: value.phone_number
            }, 'STORE_OWNER');

            // Create seller application
            const applicationResult = await pool.query(`
                INSERT INTO seller_applications
                (user_id, business_name, business_license, business_address, tax_code, status, submitted_at)
                VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())
                RETURNING id, status, submitted_at
            `, [user.id, value.business_name, value.business_license, value.business_address, value.tax_code]);

            // Store email in seller_applications for future reference if user gets deleted
            const updateEmailResult = await pool.query(`
                UPDATE seller_applications
                SET email = $1
                WHERE id = $2
                RETURNING id
            `, [value.email, applicationResult.rows[0].id]).catch(() => null);

            const application = applicationResult.rows[0];
            res.status(201).json({
                ...user,
                seller_application: {
                    id: application.id,
                    status: application.status,
                    message: 'Đơn đăng ký đang chờ xét duyệt. Bạn sẽ nhận được thông báo qua email khi được duyệt.',
                    submitted_at: application.submitted_at
                }
            });
        } catch (error) {
            console.error('Register store owner error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }



    async registerAdmin(req, res) {
        try {
            const { error, value } = validateUserRegister(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const user = await authService.register(value, 'ADMIN');
            res.status(201).json(user);
        } catch (error) {
            console.error('Register admin error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    async registerShipper(req, res) {
        try {
            const { error, value } = validateUserRegister(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const user = await authService.register(value, 'SHIPPER');
            res.status(201).json(user);
        } catch (error) {
            console.error('Register shipper error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    async login(req, res) {
        try {
            const { error, value } = validateLogin(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const loginResponse = await authService.login(value.email, value.password);
            res.status(200).json(loginResponse);
        } catch (error) {
            // Check if email has rejected seller application with details
            if (error.message.includes('Email hoặc mật khẩu không đúng')) {
                try {
                    const rejectedAppResult = await pool.query(
                        `SELECT id, reject_reason, submitted_at, business_name FROM seller_applications
                         WHERE email = $1 AND status = 'REJECTED'
                         ORDER BY reviewed_at DESC LIMIT 1`,
                        [value.email.toLowerCase().trim()]
                    );

                    if (rejectedAppResult.rows.length > 0) {
                        const app = rejectedAppResult.rows[0];
                        return res.status(403).json({
                            detail: `Tài khoản của bạn bị từ chối. Lý do: ${app.reject_reason}`,
                            status: 'SELLER_REJECTED',
                            reject_reason: app.reject_reason,
                            business_name: app.business_name,
                            application_id: app.id,
                            can_reapply: true
                        });
                    }
                } catch (checkErr) {
                    // Ignore check error, fall through to normal error
                }
            }
            console.error('Login error:', error.message);
            res.status(401).json({ detail: error.message });
        }
    }

    /**
     * Admin login - verify credentials + check ADMIN role
     */
    async adminLogin(req, res) {
        try {
            const { error, value } = validateLogin(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const loginResponse = await authService.login(value.email, value.password);
            
            // Verify user has ADMIN role
            if (!loginResponse.user.roles || !loginResponse.user.roles.includes('ADMIN')) {
                return res.status(403).json({ detail: 'Tài khoản không có quyền Admin' });
            }
            
            res.status(200).json(loginResponse);
        } catch (error) {
            console.error('Admin login error:', error.message);
            res.status(401).json({ detail: error.message });
        }
    }

    /**
     * TaxOrg login - verify credentials + check TAX_ORG role
     */
    async taxOrgLogin(req, res) {
        try {
            const { error, value } = validateLogin(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const loginResponse = await authService.login(value.email, value.password);
            
            if (!loginResponse.user.roles || !loginResponse.user.roles.includes('TAX_ORG')) {
                return res.status(403).json({ detail: 'Tài khoản không có quyền Cơ quan thuế (TAX_ORG)' });
            }
            
            res.status(200).json(loginResponse);
        } catch (error) {
            console.error('TaxOrg login error:', error.message);
            res.status(401).json({ detail: error.message });
        }
    }

    /**
     * Seller login - verify credentials + check STORE_OWNER role
     */
    async sellerLogin(req, res) {
        try {
            const { error, value } = validateLogin(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const loginResponse = await authService.login(value.email, value.password);

            if (!loginResponse.user.roles || !loginResponse.user.roles.includes('STORE_OWNER')) {
                return res.status(403).json({ detail: 'Tài khoản không có quyền Seller (STORE_OWNER)' });
            }

            res.status(200).json(loginResponse);
        } catch (error) {
            // Check if email has rejected seller application
            if (error.message.includes('Email hoặc mật khẩu không đúng')) {
                try {
                    const rejectedAppResult = await pool.query(
                        `SELECT id, reject_reason, submitted_at, business_name FROM seller_applications
                         WHERE email = $1 AND status = 'REJECTED'
                         ORDER BY reviewed_at DESC LIMIT 1`,
                        [value.email.toLowerCase().trim()]
                    );

                    if (rejectedAppResult.rows.length > 0) {
                        const app = rejectedAppResult.rows[0];
                        return res.status(403).json({
                            detail: `Đơn đăng ký bán hàng bị từ chối. Lý do: ${app.reject_reason}`,
                            status: 'SELLER_REJECTED',
                            reject_reason: app.reject_reason,
                            business_name: app.business_name,
                            application_id: app.id,
                            can_reapply: true,
                            reapply_url: '/seller/register'
                        });
                    }
                } catch (checkErr) {
                    // Ignore check error, fall through to normal error
                }
            }
            console.error('Seller login error:', error.message);
            res.status(401).json({ detail: error.message });
        }
    }

    async shipperLogin(req, res) {
        try {
            const { error, value } = validateLogin(req.body);
            if (error) {
                return res.status(400).json({
                    detail: error.details.map(d => d.message).join(', ')
                });
            }
            const loginResponse = await authService.login(value.email, value.password);
            if (!loginResponse.user.roles || !loginResponse.user.roles.includes('SHIPPER')) {
                return res.status(403).json({ detail: 'Tài khoản không có quyền Shipper' });
            }
            res.status(200).json(loginResponse);
        } catch (error) {
            console.error('Shipper login error:', error.message);
            res.status(401).json({ detail: error.message });
        }
    }

    /**
     * Check seller application rejection status
     * GET /api/v1/auth/seller/check-rejection?email=seller@example.com
     * Public endpoint - seller can check if their application was rejected
     */
    async checkSellerRejection(req, res) {
        try {
            const { email } = req.query;
            if (!email || !email.includes('@')) {
                return res.status(400).json({ detail: 'Email is required' });
            }

            const result = await pool.query(
                `SELECT id, reject_reason, submitted_at, reviewed_at, business_name FROM seller_applications
                 WHERE email = $1 AND status = 'REJECTED'
                 ORDER BY reviewed_at DESC LIMIT 1`,
                [email.toLowerCase().trim()]
            );

            if (result.rows.length === 0) {
                return res.status(200).json({
                    found: false,
                    message: 'Không tìm thấy hồ sơ bị từ chối'
                });
            }

            const app = result.rows[0];
            res.status(200).json({
                found: true,
                application_id: app.id,
                business_name: app.business_name,
                reject_reason: app.reject_reason,
                submitted_at: app.submitted_at,
                reviewed_at: app.reviewed_at,
                can_reapply: true,
                message: 'Bạn có thể điều chỉnh hồ sơ và nộp lại bất cứ lúc nào'
            });
        } catch (error) {
            console.error('Check seller rejection error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    async logout(req, res) {
        try {
            const userId = req.body.user_id;
            if (!userId) {
                return res.status(400).json({ detail: 'User ID is required' });
            }
            const result = await authService.logout(userId);
            res.status(200).json(result);
        } catch (error) {
            console.error('Logout error:', error.message);
            res.status(500).json({ detail: error.message });
        }
    }
}

module.exports = new AuthController();
