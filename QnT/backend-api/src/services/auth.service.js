// backend-api/src/services/auth.service.js
const userRepository = require('../repositories/user.repository');
const { hashPassword, verifyPassword, createAccessToken } = require('../config/security');
const { ROLE_MAPPING } = require('../config/constants');

/**
 * Service layer - Business logic for authentication
 */
class AuthService {
    /**
     * Register new user with role assignment
     * For STORE_OWNER, only grants CUSTOMER role initially (requires admin approval)
     */
    async register(userData, userType = 'CUSTOMER') {
        const client = await userRepository.getTransaction();
        
        try {
            // Check if email exists
            const existingUser = await client.query(
                'SELECT id FROM users WHERE email = $1',
                [userData.email]
            );
            
            if (existingUser.rows.length > 0) {
                throw new Error(`Email ${userData.email} đã tồn tại trong hệ thống`);
            }
            
            // Hash password
            const hashedPwd = await hashPassword(userData.password);
            
            // Split full_name and sanitize
            const sanitizedName = userData.full_name.trim().replace(/[<>]/g, '');
            const nameParts = sanitizedName.split(/\s+/);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            // Generate username from email
            const username = userData.email.split('@')[0];
            
            // Determine initial role (STORE_OWNER starts as CUSTOMER until approved)
            const initialRole = userType === 'STORE_OWNER' ? 'CUSTOMER' : userType;
            
            // Determine org_msp based on role
            const orgMspMap = {
                'CUSTOMER': 'Org1MSP',
                'SELLER': 'Org2MSP',
                'SHIPPER': 'Org3MSP',
                'ADMIN': 'Org1MSP'
            };
            const orgMsp = orgMspMap[initialRole] || 'Org1MSP';
            
            // Create user
            const userResult = await client.query(`
                INSERT INTO users (email, password_hash, firstname, lastname, phone, username, role, org_msp, isactive, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                RETURNING id, email, firstname, lastname, phone, avatar, isactive, created_at
            `, [userData.email, hashedPwd, firstName, lastName, userData.phone_number || '', username, initialRole, orgMsp, true]);
            
            const user = userResult.rows[0];
            
            // Determine roles to assign
            // IMPORTANT: STORE_OWNER only gets CUSTOMER role initially (awaiting approval)
            let rolesToAssign;
            if (userType === 'STORE_OWNER') {
                rolesToAssign = ['CUSTOMER']; // No STORE_OWNER role until approved
            } else {
                rolesToAssign = ROLE_MAPPING[userType] || [userType];
            }
            
            const roleNames = [];
            
            for (const roleName of rolesToAssign) {
                const roleResult = await client.query(
                    'SELECT id, name FROM roles WHERE name = $1',
                    [roleName]
                );
                
                if (roleResult.rows.length > 0) {
                    const role = roleResult.rows[0];
                    await client.query(
                        'INSERT INTO userroles (userid, roleid, assignedat) VALUES ($1, $2, NOW())',
                        [user.id, role.id]
                    );
                    roleNames.push(role.name);
                }
            }
            
            await userRepository.commit(client);
            
            return {
                id: user.id,
                email: user.email,
                full_name: `${user.firstname} ${user.lastname}`.trim(),
                phone_number: user.phone,
                profile_picture: user.avatar,
                is_active: user.isactive,
                created_at: user.createat,
                roles: roleNames
            };
            
        } catch (error) {
            await userRepository.rollback(client);
            throw error;
        }
    }

    /**
     * Authenticate user and generate token
     */
    async login(email, password) {
        // Sanitize and normalize email
        const normalizedEmail = email.toLowerCase().trim();
        console.log('Login attempt with email:', normalizedEmail);

        // Find user
        const user = await userRepository.findByEmail(normalizedEmail);
        console.log('👤 User found:', user ? `${user.id} ${user.email}` : 'NOT FOUND');
        if (!user) {
            throw new Error('Email hoặc mật khẩu không đúng');
        }

        // Verify password
        const isValid = await verifyPassword(password, user.password_hash);
        console.log('🔐 Password valid:', isValid);
        if (!isValid) {
            throw new Error('Email hoặc mật khẩu không đúng');
        }

        // Check if active
        if (!user.isactive) {
            throw new Error('Tài khoản đã bị vô hiệu hóa');
        }

        // Get roles
        const roles = await userRepository.getUserRoles(user.id);

        // Create JWT token
        const tokenData = {
            sub: user.email,
            user_id: user.id,
            roles: roles
        };

        const accessToken = createAccessToken(tokenData);

        // Save session
        await userRepository.createSession(user.id, accessToken);
        
        return {
            access_token: accessToken,
            token_type: 'bearer',
            user: {
                id: user.id,
                email: user.email,
                full_name: `${user.firstname} ${user.lastname}`.trim(),
                phone_number: user.phone,
                profile_picture: user.avatar,
                is_active: user.isactive,
                created_at: user.createat,
                roles: roles
            }
        };
    }

    /**
     * Check if can create admin (for first admin bypass)
     */
    async canCreateAdmin() {
        const adminCount = await userRepository.countAdmins();
        const allowFirstAdmin = process.env.ALLOW_FIRST_ADMIN_WITHOUT_SECRET === 'true';
        return adminCount === 0 && allowFirstAdmin;
    }

    /**
     * Logout user - delete session
     */
    async logout(userId) {
        await userRepository.deleteSession(userId);
        return { message: 'Đăng xuất thành công' };
    }
}

module.exports = new AuthService();
