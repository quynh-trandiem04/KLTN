// backend-api/src/controllers/taxController.js
const pool = require('../config/database');
const path = require('path');
const fs = require('fs');
const { minioClient, isAvailable: isMinioAvailable } = require('../config/minio');

// Ensure local upload dir exists as fallback
const UPLOAD_DIR = path.join(__dirname, '../../uploads/tax-licenses');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}



class TaxController {
    /**
     * Shop submits a tax registration application (public endpoint)
     * POST /api/v1/tax/register  (multipart/form-data)
     */
    async submitTaxRegistration(req, res) {
        try {
            const {
                tax_code, business_name, business_name_en, business_address,
                legal_representative, phone, email, business_type,
                business_registration_number, license_issue_date, licensing_authority
            } = req.body;

            // Validate required fields
            if (!tax_code || !business_name || !business_address || !legal_representative) {
                return res.status(400).json({
                    detail: 'Các trường bắt buộc: tax_code, business_name, business_address, legal_representative'
                });
            }

            if (!/^[0-9]{10,13}$/.test(tax_code)) {
                return res.status(400).json({ detail: 'Mã số thuế phải là 10-13 chữ số' });
            }

            // Check if already registered in tax_registry
            const existing = await pool.query(
                'SELECT tax_code FROM tax_registry WHERE tax_code = $1',
                [tax_code]
            );
            if (existing.rows.length > 0) {
                return res.status(409).json({ detail: 'Mã số thuế đã tồn tại trong hệ thống đăng ký thuế' });
            }

            // Check if already has a pending application
            const pendingApp = await pool.query(
                "SELECT id FROM tax_registration_applications WHERE tax_code = $1 AND status = 'PENDING'",
                [tax_code]
            );
            if (pendingApp.rows.length > 0) {
                return res.status(409).json({ detail: 'Mã số thuế này đã có hồ sơ đang chờ duyệt' });
            }

            // Delete old rejected application if exists (allow resubmission)
            await pool.query(
                "DELETE FROM tax_registration_applications WHERE tax_code = $1 AND status = 'REJECTED'",
                [tax_code]
            );

            // Handle file upload
            let businessLicenseFile = null;
            if (req.file) {
                const fileName = `tax-license-${tax_code}-${Date.now()}${path.extname(req.file.originalname)}`;
                if (isMinioAvailable()) {
                    const bucket = process.env.MINIO_BUCKET || 'ecommerce-lakehouse';
                    await minioClient.putObject(bucket, `tax-licenses/${fileName}`, req.file.buffer, req.file.size, {
                        'Content-Type': req.file.mimetype
                    });
                    businessLicenseFile = `tax-licenses/${fileName}`;
                } else {
                    const filePath = path.join(UPLOAD_DIR, fileName);
                    fs.writeFileSync(filePath, req.file.buffer);
                    businessLicenseFile = `/uploads/tax-licenses/${fileName}`;
                }
            }

            const result = await pool.query(`
                INSERT INTO tax_registration_applications 
                (tax_code, business_name, business_name_en, business_address, legal_representative, 
                 phone, email, business_type, business_registration_number, license_issue_date, 
                 licensing_authority, business_license_file, status, submitted_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', NOW())
                RETURNING id, tax_code, business_name, status, submitted_at
            `, [
                tax_code, business_name.trim(), business_name_en?.trim() || null, business_address.trim(),
                legal_representative.trim(), phone?.trim() || null, email?.trim() || null,
                business_type || 'COMPANY', business_registration_number?.trim() || null,
                license_issue_date || null, licensing_authority?.trim() || null, businessLicenseFile
            ]);

            const app = result.rows[0];
            res.status(201).json({
                message: 'Hồ sơ đăng ký mã số thuế đã được nộp thành công. Vui lòng chờ cơ quan thuế xét duyệt.',
                application: app
            });
        } catch (error) {
            console.error('Submit tax registration error:', error.message);
            if (error.code === '23505') {
                return res.status(409).json({ detail: 'Mã số thuế đã tồn tại trong hệ thống' });
            }
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * TaxOrg: Get all pending tax registration applications  
     * GET /api/v1/tax/registrations?status=PENDING
     */
    async getTaxRegistrations(req, res) {
        try {
            const { status } = req.query;

            let query = `
                SELECT id, tax_code, business_name, business_name_en, business_address, 
                       legal_representative, phone, email, business_type, status,
                       business_registration_number, license_issue_date, licensing_authority,
                       business_license_file, submitted_at, reviewed_at, reviewed_by, reject_reason
                FROM tax_registration_applications
            `;
            const params = [];
            if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
                query += ' WHERE status = $1';
                params.push(status);
            }
            query += ' ORDER BY submitted_at DESC';

            const result = await pool.query(query, params);

            res.status(200).json({
                total: result.rows.length,
                applications: result.rows
            });
        } catch (error) {
            console.error('Get tax registrations error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * TaxOrg: Get single tax registration application
     * GET /api/v1/tax/registrations/:id
     */
    async getRegistration(req, res) {
        try {
            const { id } = req.params;
            const result = await pool.query(`
                SELECT id, tax_code, business_name, business_name_en, business_address, 
                       legal_representative, phone, email, business_type, status,
                       business_registration_number, license_issue_date, licensing_authority,
                       business_license_file, submitted_at, reviewed_at, reviewed_by, reject_reason
                FROM tax_registration_applications
                WHERE id = $1
            `, [parseInt(id)]);

            if (result.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy hồ sơ' });
            }

            res.status(200).json({ application: result.rows[0] });
        } catch (error) {
            console.error('Get registration error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * TaxOrg: Approve tax registration → Insert into tax_registry
     * POST /api/v1/tax/registrations/approve/:id
     */
    async approveTaxRegistration(req, res) {
        const client = await pool.connect();
        try {
            const applicationId = parseInt(req.params.id);
            const verifierEmail = req.user.email;

            await client.query('BEGIN');

            const appResult = await client.query(
                'SELECT * FROM tax_registration_applications WHERE id = $1',
                [applicationId]
            );

            if (appResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy hồ sơ đăng ký' });
            }

            const app = appResult.rows[0];

            if (app.status !== 'PENDING') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Chỉ có thể duyệt hồ sơ ở trạng thái PENDING. Hiện tại: ${app.status}` });
            }

            // Check if already in tax_registry
            const existingRegistry = await client.query(
                'SELECT tax_code FROM tax_registry WHERE tax_code = $1',
                [app.tax_code]
            );
            if (existingRegistry.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: 'Mã số thuế đã tồn tại trong sổ đăng ký thuế' });
            }

            // Insert into tax_registry
            await client.query(`
                INSERT INTO tax_registry 
                (tax_code, business_name, business_name_en, business_address, legal_representative, phone, registration_date, business_type, status)
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, 'ACTIVE')
            `, [app.tax_code, app.business_name, app.business_name_en, app.business_address, app.legal_representative, app.phone, app.business_type]);

            // Update application status
            await client.query(
                `UPDATE tax_registration_applications 
                 SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = $1
                 WHERE id = $2`,
                [verifierEmail, applicationId]
            );

            await client.query('COMMIT');

            res.status(200).json({
                message: 'Đã duyệt hồ sơ đăng ký MST. Doanh nghiệp đã được thêm vào sổ đăng ký thuế.',
                application_id: applicationId,
                tax_code: app.tax_code,
                business_name: app.business_name,
                status: 'APPROVED'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Approve tax registration error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        } finally {
            client.release();
        }
    }

    /**
     * TaxOrg: Reject tax registration
     * POST /api/v1/tax/registrations/reject/:id
     * Body: { reason: string }
     *
     * Note: Hồ sơ REJECTED được giữ lại để audit trail.
     * Khi seller nộp lại, hệ thống sẽ tự động xóa hồ sơ REJECTED cũ (xem submitTaxRegistration)
     */
    async rejectTaxRegistration(req, res) {
        const client = await pool.connect();
        try {
            const applicationId = parseInt(req.params.id);
            const verifierEmail = req.user.email;
            const { reason } = req.body;

            if (!reason || reason.trim().length < 5) {
                return res.status(400).json({ detail: 'Lý do từ chối phải có ít nhất 5 ký tự' });
            }

            await client.query('BEGIN');

            const appResult = await client.query(
                'SELECT * FROM tax_registration_applications WHERE id = $1',
                [applicationId]
            );

            if (appResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy hồ sơ đăng ký' });
            }

            if (appResult.rows[0].status !== 'PENDING') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Chỉ có thể từ chối hồ sơ ở trạng thái PENDING. Hiện tại: ${appResult.rows[0].status}` });
            }

            await client.query(
                `UPDATE tax_registration_applications
                 SET status = 'REJECTED', reviewed_at = NOW(), reviewed_by = $1, reject_reason = $2
                 WHERE id = $3`,
                [verifierEmail, reason.trim(), applicationId]
            );

            await client.query('COMMIT');

            res.status(200).json({
                message: 'Đã từ chối hồ sơ đăng ký MST. Seller có thể nộp lại hồ sơ với điều chỉnh.',
                application_id: applicationId,
                tax_code: appResult.rows[0].tax_code,
                status: 'REJECTED',
                reason: reason.trim()
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Reject tax registration error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        } finally {
            client.release();
        }
    }

    /**
     * Public: Lookup tax registration application status
     * GET /api/v1/tax/lookup?tax_code=xxx&business_name=xxx
     */
    async lookupRegistration(req, res) {
        try {
            const { tax_code, business_name } = req.query;

            if (!tax_code && !business_name) {
                return res.status(400).json({ detail: 'Vui lòng nhập mã số thuế hoặc tên doanh nghiệp để tra cứu' });
            }

            let query = `
                SELECT id, tax_code, business_name, business_name_en, business_address,
                       legal_representative, phone, email, business_type, status,
                       business_registration_number, license_issue_date, licensing_authority,
                       submitted_at, reviewed_at, reject_reason
                FROM tax_registration_applications
                WHERE 1=1
            `;
            const params = [];
            let idx = 1;

            if (tax_code && tax_code.trim()) {
                query += ` AND tax_code = $${idx++}`;
                params.push(tax_code.trim());
            }
            if (business_name && business_name.trim()) {
                query += ` AND LOWER(business_name) LIKE LOWER($${idx++})`;
                params.push(`%${business_name.trim()}%`);
            }

            query += ' ORDER BY submitted_at DESC LIMIT 10';

            const result = await pool.query(query, params);

            res.status(200).json({
                total: result.rows.length,
                applications: result.rows
            });
        } catch (error) {
            console.error('Lookup registration error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * Public: Check if a tax code exists in tax_registry
     * GET /api/v1/tax/check?tax_code=0309532909
     */
    async checkTaxCode(req, res) {
        try {
            const { tax_code } = req.query;
            if (!tax_code || !/^[0-9]{10,13}$/.test(tax_code)) {
                return res.status(400).json({ detail: 'Mã số thuế phải là 10-13 chữ số' });
            }

            const result = await pool.query(
                "SELECT tax_code, business_name, business_address, status FROM tax_registry WHERE tax_code = $1",
                [tax_code]
            );

            if (result.rows.length === 0) {
                return res.status(200).json({ found: false });
            }

            res.status(200).json({
                found: true,
                business: result.rows[0]
            });
        } catch (error) {
            console.error('Check tax code error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    // ─── TAX DECLARATIONS ─────────────────────────────────────────────────────

    /**
     * Seller: Submit tax declaration for a month
     * POST /api/v1/tax/declarations
     * Body: { seller_tax_code, period_month, declared_revenue, declared_tax_amount, note }
     * Mỗi MST chỉ được khai 1 lần/tháng
     */
    async submitDeclaration(req, res) {
        try {
            const { seller_tax_code, period_month, declared_revenue, declared_tax_amount, note } = req.body;

            if (!seller_tax_code || !period_month || declared_revenue === undefined || declared_tax_amount === undefined) {
                return res.status(400).json({ detail: 'Thiếu thông tin bắt buộc: seller_tax_code, period_month, declared_revenue, declared_tax_amount' });
            }

            // Validate period_month format: YYYY-MM
            if (!/^\d{4}-\d{2}$/.test(period_month)) {
                return res.status(400).json({ detail: 'Định dạng kỳ khai báo phải là YYYY-MM (ví dụ: 2026-05)' });
            }

            // Validate seller_tax_code exists in tax_registry
            const registryCheck = await pool.query(
                "SELECT tax_code, business_name FROM tax_registry WHERE tax_code = $1 AND status = 'ACTIVE'",
                [seller_tax_code]
            );
            if (registryCheck.rows.length === 0) {
                return res.status(404).json({ detail: 'Mã số thuế không tồn tại hoặc chưa được kích hoạt trong hệ thống' });
            }

            // Check duplicate: 1 lần khai/tháng
            const dupCheck = await pool.query(
                "SELECT id FROM tax_declarations WHERE seller_tax_code = $1 AND period_month = $2",
                [seller_tax_code, period_month]
            );
            if (dupCheck.rows.length > 0) {
                return res.status(409).json({ detail: `Kỳ khai báo ${period_month} đã được nộp. Mỗi tháng chỉ được khai báo một lần.` });
            }

            const revenue = parseFloat(declared_revenue);
            const taxAmount = parseFloat(declared_tax_amount);

            if (isNaN(revenue) || revenue < 0) {
                return res.status(400).json({ detail: 'Doanh thu khai báo không hợp lệ' });
            }
            if (isNaN(taxAmount) || taxAmount < 0) {
                return res.status(400).json({ detail: 'Số thuế phải nộp không hợp lệ' });
            }

            const result = await pool.query(`
                INSERT INTO tax_declarations (seller_tax_code, period_month, declared_revenue, declared_tax_amount, status, note, submitted_at)
                VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, NOW())
                RETURNING *
            `, [seller_tax_code, period_month, revenue, taxAmount, note?.trim() || null]);

            const decl = result.rows[0];
            res.status(201).json({
                message: `Khai báo thuế kỳ ${period_month} đã được nộp thành công.`,
                declaration: decl,
                business_name: registryCheck.rows[0].business_name
            });
        } catch (error) {
            console.error('Submit declaration error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * Seller: Get their own declarations (by tax_code query param)
     * GET /api/v1/tax/declarations/my?tax_code=xxx
     */
    async getMyDeclarations(req, res) {
        try {
            const { tax_code } = req.query;
            if (!tax_code) {
                return res.status(400).json({ detail: 'Vui lòng cung cấp mã số thuế' });
            }

            const result = await pool.query(`
                SELECT d.*, r.business_name
                FROM tax_declarations d
                LEFT JOIN tax_registry r ON r.tax_code = d.seller_tax_code
                WHERE d.seller_tax_code = $1
                ORDER BY d.period_month DESC
            `, [tax_code]);

            // Get payment info for each declaration
            const payments = await pool.query(`
                SELECT * FROM tax_payments WHERE seller_tax_code = $1 ORDER BY payment_date DESC
            `, [tax_code]);

            res.status(200).json({
                total: result.rows.length,
                declarations: result.rows,
                payments: payments.rows
            });
        } catch (error) {
            console.error('Get my declarations error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * TaxOrg: Get all declarations (with filters)
     * GET /api/v1/tax/declarations?status=SUBMITTED&period_month=2026-05
     */
    async getAllDeclarations(req, res) {
        try {
            const { status, period_month, tax_code, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const params = [];
            let where = 'WHERE 1=1';
            let idx = 1;

            if (status && ['SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING_PAYMENT', 'PAID'].includes(status)) {
                where += ` AND a.status = $${idx++}`;
                params.push(status);
            }
            if (period_month) {
                where += ` AND a.period_month = $${idx++}`;
                params.push(period_month);
            }
            if (tax_code) {
                where += ` AND a.seller_tax_code ILIKE $${idx++}`;
                params.push(`%${tax_code}%`);
            }

            const countRes = await pool.query(
                `SELECT COUNT(*) FROM tax_declaration_audit_view a ${where}`,
                params
            );

            params.push(parseInt(limit));
            params.push(offset);
            const result = await pool.query(`
                SELECT a.*, a.declaration_id as id, r.business_name, r.legal_representative, r.phone
                FROM tax_declaration_audit_view a
                LEFT JOIN tax_registry r ON r.tax_code = a.seller_tax_code
                ${where}
                ORDER BY a.submitted_at DESC
                LIMIT $${idx++} OFFSET $${idx++}
            `, params);

            res.status(200).json({
                total: parseInt(countRes.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                declarations: result.rows
            });
        } catch (error) {
            console.error('Get all declarations error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * TaxOrg: Review declaration (auto-logic based on audit view)
     * POST /api/v1/tax/declarations/:id/review
     * Body: { note: string (optional manual note) }
     */
    async reviewDeclaration(req, res) {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const { note: manualNote } = req.body;
            const reviewerEmail = req.user.email;

            await client.query('BEGIN');

            // Lấy dữ liệu audit từ view để tự tính status và note
            const auditRes = await client.query(`
                SELECT
                    v.*,
                    d.status AS current_status,
                    d.seller_tax_code,
                    d.period_month
                FROM tax_declaration_audit_view v
                JOIN tax_declarations d ON d.id = v.declaration_id
                WHERE v.declaration_id = $1
            `, [parseInt(id)]);

            if (auditRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy tờ khai thuế' });
            }

            const audit = auditRes.rows[0];

            if (audit.current_status !== 'SUBMITTED') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    detail: `Chỉ có thể xét duyệt tờ khai ở trạng thái SUBMITTED. Hiện tại: ${audit.current_status}`
                });
            }

            // Tự tính status và note theo logic audit
            let newStatus, autoNote;

            if (audit.invoice_count === 0 || parseInt(audit.invoice_count) === 0) {
                newStatus = 'REJECTED';
                autoNote = 'Từ chối: không tìm thấy dữ liệu hóa đơn trong kỳ khai báo';
            } else if (Math.abs(parseFloat(audit.revenue_gap)) <= 1 && Math.abs(parseFloat(audit.tax_gap)) <= 1) {
                newStatus = 'APPROVED';
                autoNote = 'Đã duyệt: tờ khai khớp với dữ liệu hóa đơn';
            } else {
                newStatus = 'REJECTED';
                autoNote = 'Từ chối: số liệu khai báo không khớp với dữ liệu hóa đơn';
            }

            // Ghi chú thủ công từ cán bộ (nếu có) sẽ nối thêm sau ghi chú tự động
            const finalNote = manualNote?.trim()
                ? `${autoNote} — Ghi chú: ${manualNote.trim()}`
                : autoNote;

            await client.query(
                `UPDATE tax_declarations
                 SET status = $1, reviewed_by = $2, reviewed_at = NOW(), note = $3
                 WHERE id = $4`,
                [newStatus, reviewerEmail, finalNote, parseInt(id)]
            );

            await client.query('COMMIT');

            res.status(200).json({
                message: newStatus === 'APPROVED'
                    ? `Đã phê duyệt tờ khai thuế kỳ ${audit.period_month} của MST ${audit.seller_tax_code}.`
                    : `Đã từ chối tờ khai thuế kỳ ${audit.period_month} của MST ${audit.seller_tax_code}.`,
                declaration_id: parseInt(id),
                status: newStatus,
                note: finalNote,
                audit_summary: {
                    invoice_count: audit.invoice_count,
                    revenue_gap: audit.revenue_gap,
                    tax_gap: audit.tax_gap,
                    declaration_check: audit.declaration_check
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Review declaration error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        } finally {
            client.release();
        }
    }

    /**
     * TaxOrg: Auto-review all SUBMITTED declarations based on audit view
     * POST /api/v1/tax/declarations/auto-review
     * Body (optional): { period_month: '2026-05' }
     *
     * Logic:
     *   - invoice_count = 0  → REJECTED + ghi chú không có hóa đơn
     *   - revenue_gap ≤ 1 AND tax_gap ≤ 1 → APPROVED
     *   - else → REJECTED + ghi chú không khớp
     */
    async autoReviewDeclarations(req, res) {
        const client = await pool.connect();
        try {
            const { period_month } = req.body;
            const reviewerEmail = req.user.email;

            let periodFilter = '';
            const params = [reviewerEmail];
            if (period_month) {
                periodFilter = `AND d.period_month = $2`;
                params.push(period_month);
            }

            await client.query('BEGIN');

            const updateRes = await client.query(`
                UPDATE tax_declarations d
                SET
                    status = CASE
                        WHEN v.invoice_count = 0 THEN 'REJECTED'
                        WHEN ABS(v.revenue_gap) <= 1
                         AND ABS(v.tax_gap) <= 1
                        THEN 'APPROVED'
                        ELSE 'REJECTED'
                    END,
                    note = CASE
                        WHEN v.invoice_count = 0 THEN
                            'Từ chối: không tìm thấy dữ liệu hóa đơn trong kỳ khai báo'
                        WHEN ABS(v.revenue_gap) <= 1
                         AND ABS(v.tax_gap) <= 1
                        THEN
                            'Đã duyệt: tờ khai khớp với dữ liệu hóa đơn'
                        ELSE
                            'Từ chối: số liệu khai báo không khớp với dữ liệu hóa đơn'
                    END,
                    reviewed_by = $1,
                    reviewed_at = NOW()
                FROM tax_declaration_audit_view v
                WHERE d.id = v.declaration_id
                  AND d.status = 'SUBMITTED'
                  ${periodFilter}
                RETURNING d.id, d.seller_tax_code, d.period_month, d.status, d.note
            `, params);

            await client.query('COMMIT');

            const approved = updateRes.rows.filter(r => r.status === 'APPROVED').length;
            const rejected = updateRes.rows.filter(r => r.status === 'REJECTED').length;

            res.status(200).json({
                message: `Tự động xét duyệt hoàn tất: ${approved} tờ khai được duyệt, ${rejected} tờ khai bị từ chối.`,
                total_processed: updateRes.rows.length,
                approved,
                rejected,
                details: updateRes.rows
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Auto-review declarations error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        } finally {
            client.release();
        }
    }

    /**
     * TaxOrg: Get declaration statistics by period
     * GET /api/v1/tax/declarations/stats?period_month=2026-05
     */
    async getDeclarationStats(req, res) {
        try {
            const { period_month } = req.query;
            let where = '';
            const params = [];
            if (period_month) {
                where = 'WHERE period_month = $1';
                params.push(period_month);
            }

            const result = await pool.query(`
                SELECT 
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status = 'SUBMITTED') AS submitted,
                    COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
                    COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
                    COALESCE(SUM(declared_revenue), 0) AS total_revenue,
                    COALESCE(SUM(declared_tax_amount), 0) AS total_tax
                FROM tax_declarations
                ${where}
            `, params);

            // Stats by period (last 6 months)
            const trendResult = await pool.query(`
                SELECT 
                    period_month,
                    COUNT(*) AS total,
                    COALESCE(SUM(declared_revenue), 0) AS revenue,
                    COALESCE(SUM(declared_tax_amount), 0) AS tax_amount
                FROM tax_declarations
                WHERE period_month >= TO_CHAR(NOW() - INTERVAL '5 months', 'YYYY-MM')
                GROUP BY period_month
                ORDER BY period_month DESC
            `);

            res.status(200).json({
                stats: result.rows[0],
                trend: trendResult.rows
            });
        } catch (error) {
            console.error('Get declaration stats error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * TaxOrg: Get under-declared declarations (khai thiếu so với hóa đơn thật)
     * GET /api/v1/tax/declarations/under-declared?period_month=2026-05
     */
    async getUnderDeclaredDeclarations(req, res) {
        try {
            const { period_month, status, page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const params = [];
            let where = 'WHERE invoice_count > 0 AND (declared_revenue < system_revenue OR declared_tax_amount < system_tax_amount)';
            let idx = 1;

            if (period_month) {
                where += ` AND period_month = $${idx++}`;
                params.push(period_month);
            }
            if (status && ['SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING_PAYMENT', 'PAID'].includes(status)) {
                where += ` AND status = $${idx++}`;
                params.push(status);
            }

            const countRes = await pool.query(
                `SELECT COUNT(*) FROM tax_declaration_audit_view ${where}`,
                params
            );

            params.push(parseInt(limit));
            params.push(offset);
            const result = await pool.query(`
                SELECT
                    a.declaration_id,
                    a.seller_tax_code,
                    a.period_month,

                    a.declared_revenue,
                    a.system_revenue,
                    a.revenue_gap,

                    a.declared_tax_amount,
                    a.system_tax_amount,
                    a.tax_gap,

                    ROUND((a.declared_revenue / NULLIF(a.system_revenue, 0)) * 100, 2) AS declared_revenue_percent,
                    ROUND((a.declared_tax_amount / NULLIF(a.system_tax_amount, 0)) * 100, 2) AS declared_tax_percent,

                    a.invoice_count,
                    a.status,
                    a.declaration_check,
                    a.review_message,

                    r.business_name,
                    r.legal_representative,
                    r.phone
                FROM tax_declaration_audit_view a
                LEFT JOIN tax_registry r ON r.tax_code = a.seller_tax_code
                ${where}
                ORDER BY a.tax_gap DESC, a.revenue_gap DESC
                LIMIT $${idx++} OFFSET $${idx++}
            `, params);

            res.status(200).json({
                total: parseInt(countRes.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                declarations: result.rows
            });
        } catch (error) {
            console.error('Get under-declared declarations error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * Seller/TaxOrg: Get single declaration detail
     * GET /api/v1/tax/declarations/:id
     */
    async getDeclaration(req, res) {
        try {
            const { id } = req.params;
            const result = await pool.query(`
                SELECT a.*, a.declaration_id as id, r.business_name, r.legal_representative, r.phone, r.business_address
                FROM tax_declaration_audit_view a
                LEFT JOIN tax_registry r ON r.tax_code = a.seller_tax_code
                WHERE a.declaration_id = $1
            `, [parseInt(id)]);

            if (result.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy tờ khai thuế' });
            }

            // Get payments for this tax code + period
            const payments = await pool.query(`
                SELECT * FROM tax_payments
                WHERE seller_tax_code = $1 AND period_month = $2
                ORDER BY payment_date DESC
            `, [result.rows[0].seller_tax_code, result.rows[0].period_month]);

            res.status(200).json({
                declaration: result.rows[0],
                payments: payments.rows
            });
        } catch (error) {
            console.error('Get declaration error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    // ─── TAX PAYMENTS ─────────────────────────────────────────────────────────

    /**
     * TaxOrg: Record a tax payment for an approved declaration
     * POST /api/v1/tax/payments
     * Body: { seller_tax_code, period_month, amount_paid, payment_method, payment_reference }
     */
    async recordPayment(req, res) {
        const client = await pool.connect();
        try {
            const { seller_tax_code, period_month, amount_paid, payment_method, payment_reference } = req.body;
            const recordedBy = req.user.email;

            if (!seller_tax_code || !period_month || amount_paid === undefined) {
                return res.status(400).json({ detail: 'Thiếu thông tin bắt buộc: seller_tax_code, period_month, amount_paid' });
            }

            const amount = parseFloat(amount_paid);
            if (isNaN(amount) || amount <= 0) {
                return res.status(400).json({ detail: 'Số tiền nộp thuế không hợp lệ' });
            }

            await client.query('BEGIN');

            // Find the approved declaration
            const declRes = await client.query(
                `SELECT id, status, declared_tax_amount FROM tax_declarations 
                 WHERE seller_tax_code = $1 AND period_month = $2`,
                [seller_tax_code, period_month]
            );

            if (declRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: `Không tìm thấy tờ khai thuế cho MST ${seller_tax_code} kỳ ${period_month}` });
            }

            const decl = declRes.rows[0];
            if (!['APPROVED', 'PENDING_PAYMENT'].includes(decl.status)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Chỉ có thể ghi nhận thanh toán cho tờ khai đã duyệt. Trạng thái hiện tại: ${decl.status}` });
            }

            // Insert payment record
            const payRes = await client.query(`
                INSERT INTO tax_payments 
                (seller_tax_code, period_month, amount_paid, payment_method, payment_reference, payment_date, recorded_by)
                VALUES ($1, $2, $3, $4, $5, NOW(), $6)
                RETURNING *
            `, [seller_tax_code, period_month, amount, payment_method || 'BANK_TRANSFER', payment_reference || null, recordedBy]);

            // Update declaration status to PAID
            await client.query(
                `UPDATE tax_declarations SET status = 'PAID' WHERE id = $1`,
                [decl.id]
            );

            await client.query('COMMIT');

            res.status(201).json({
                message: `Đã ghi nhận nộp thuế kỳ ${period_month} cho MST ${seller_tax_code}.`,
                payment: payRes.rows[0],
                declaration_id: decl.id
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Record payment error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        } finally {
            client.release();
        }
    }

    /**
     * TaxOrg: Get all tax payments (with filters)
     * GET /api/v1/tax/payments?seller_tax_code=xxx&period_month=2026-05
     */
    async getAllPayments(req, res) {
        try {
            const { seller_tax_code, period_month, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const params = [];
            let where = 'WHERE 1=1';
            let idx = 1;

            if (seller_tax_code) {
                where += ` AND p.seller_tax_code ILIKE $${idx++}`;
                params.push(`%${seller_tax_code}%`);
            }
            if (period_month) {
                where += ` AND p.period_month = $${idx++}`;
                params.push(period_month);
            }

            const countRes = await pool.query(
                `SELECT COUNT(*) FROM tax_payments p ${where}`,
                params
            );

            params.push(parseInt(limit));
            params.push(offset);
            const result = await pool.query(`
                SELECT p.*, r.business_name, r.legal_representative
                FROM tax_payments p
                LEFT JOIN tax_registry r ON r.tax_code = p.seller_tax_code
                ${where}
                ORDER BY p.payment_date DESC
                LIMIT $${idx++} OFFSET $${idx++}
            `, params);

            res.status(200).json({
                total: parseInt(countRes.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                payments: result.rows
            });
        } catch (error) {
            console.error('Get all payments error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    // ─── TAX REGISTRY ─────────────────────────────────────────────────────────

    /**
     * TaxOrg: Get all tax registry entries
     * GET /api/v1/tax/registry?status=ACTIVE&business_name=xxx
     */
    async getTaxRegistry(req, res) {
        try {
            const { status, business_name, tax_code, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const params = [];
            let where = 'WHERE 1=1';
            let idx = 1;

            if (status && ['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
                where += ` AND status = $${idx++}`;
                params.push(status);
            }
            if (business_name) {
                where += ` AND LOWER(business_name) LIKE LOWER($${idx++})`;
                params.push(`%${business_name}%`);
            }
            if (tax_code) {
                where += ` AND tax_code ILIKE $${idx++}`;
                params.push(`%${tax_code}%`);
            }

            const countRes = await pool.query(
                `SELECT COUNT(*) FROM tax_registry ${where}`,
                params
            );

            params.push(parseInt(limit));
            params.push(offset);
            const result = await pool.query(`
                SELECT * FROM tax_registry
                ${where}
                ORDER BY registration_date DESC
                LIMIT $${idx++} OFFSET $${idx++}
            `, params);

            res.status(200).json({
                total: parseInt(countRes.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                registry: result.rows
            });
        } catch (error) {
            console.error('Get tax registry error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * TaxOrg: Update tax registry entry status (activate/suspend)
     * PATCH /api/v1/tax/registry/:tax_code
     * Body: { status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }
     */
    async updateRegistryStatus(req, res) {
        try {
            const { tax_code } = req.params;
            const { status } = req.body;
            const updatedBy = req.user.email;

            if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
                return res.status(400).json({ detail: 'Trạng thái không hợp lệ. Cho phép: ACTIVE, INACTIVE, SUSPENDED' });
            }

            const result = await pool.query(
                `UPDATE tax_registry SET status = $1 WHERE tax_code = $2
                 RETURNING tax_code, business_name, status`,
                [status, tax_code]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy mã số thuế trong sổ đăng ký' });
            }

            res.status(200).json({
                message: `Đã cập nhật trạng thái MST ${tax_code} thành ${status}.`,
                registry: result.rows[0],
                updated_by: updatedBy
            });
        } catch (error) {
            console.error('Update registry status error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }
}

module.exports = new TaxController();
