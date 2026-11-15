// backend-api/src/repositories/user.repository.js
const pool = require('../config/database');

/**
 * Repository layer - Handle all database queries for users
 */
class UserRepository {
    /**
     * Find user by email
     */
    async findByEmail(email) {
        const result = await pool.query(
            'SELECT id, email, password_hash, firstname, lastname, phone, avatar, isactive, created_at, role, org_msp FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );
        return result.rows[0] || null;
    }

    /**
     * Find user by ID
     */
    async findById(userId) {
        const result = await pool.query(
            'SELECT id, email, firstname, lastname, phone, avatar, isactive, created_at, role, org_msp FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0] || null;
    }

    /**
     * Create new user
     */
    async create(userData) {
        const { email, hashedPassword, firstName, lastName, phone, role = 'CUSTOMER' } = userData;
        
        // Generate username from email
        const username = email.split('@')[0];
        
        // Determine org_msp based on role
        const orgMspMap = {
            'CUSTOMER': 'Org1MSP',
            'SELLER': 'Org2MSP',
            'SHIPPER': 'Org3MSP',
            'ADMIN': 'Org1MSP'
        };
        const orgMsp = orgMspMap[role] || 'Org1MSP';
        
        const result = await pool.query(`
            INSERT INTO users (email, password_hash, firstname, lastname, phone, username, role, org_msp, isactive, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING id, email, firstname, lastname, phone, avatar, isactive, created_at
        `, [email, hashedPassword, firstName, lastName, phone || '', username, role, orgMsp, true]);
        
        return result.rows[0];
    }

    /**
     * Get user roles
     */
    async getUserRoles(userId) {
        const result = await pool.query(`
            SELECT r.name
            FROM userroles ur
            JOIN roles r ON ur.roleid = r.id
            WHERE ur.userid = $1
        `, [userId]);
        
        return result.rows.map(r => r.name);
    }

    /**
     * Assign role to user
     */
    async assignRole(userId, roleId) {
        await pool.query(
            'INSERT INTO userroles (userid, roleid, assignedat) VALUES ($1, $2, NOW())',
            [userId, roleId]
        );
    }

    /**
     * Get role by name
     */
    async getRoleByName(roleName) {
        const result = await pool.query(
            'SELECT id, name FROM roles WHERE name = $1',
            [roleName]
        );
        return result.rows[0] || null;
    }

    /**
     * Create user session
     */
    async createSession(userId, token) {
        // Delete old sessions for this user first
        await pool.query('DELETE FROM usersession WHERE userid = $1', [userId]);
        
        // Store only first 200 chars of token as identifier (full token stored client-side)
        const tokenId = token.substring(0, 200);
        await pool.query(`
            INSERT INTO usersession (userid, token, createat, expiresat)
            VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 minutes')
        `, [userId, tokenId]);
    }

    /**
     * Delete user session (logout)
     */
    async deleteSession(userId) {
        await pool.query('DELETE FROM usersession WHERE userid = $1', [userId]);
    }

    /**
     * Count admins
     */
    async countAdmins() {
        const result = await pool.query(`
            SELECT COUNT(DISTINCT ur.userid) as count
            FROM userroles ur
            JOIN roles r ON ur.roleid = r.id
            WHERE r.name = 'ADMIN'
        `);
        return parseInt(result.rows[0].count);
    }

    /**
     * Begin transaction
     */
    async getTransaction() {
        const client = await pool.connect();
        await client.query('BEGIN');
        return client;
    }

    /**
     * Commit transaction
     */
    async commit(client) {
        await client.query('COMMIT');
        client.release();
    }

    /**
     * Rollback transaction
     */
    async rollback(client) {
        await client.query('ROLLBACK');
        client.release();
    }
}

module.exports = new UserRepository();
