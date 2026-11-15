// backend-api/src/config/security.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;
const ALGORITHM = process.env.ALGORITHM || 'HS256';
const ACCESS_TOKEN_EXPIRE_MINUTES = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES) || 60;

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
}

/**
 * Create JWT access token
 * @param {object} data - Payload data to encode in token
 * @returns {string} JWT token
 */
function createAccessToken(data) {
    const expiresIn = ACCESS_TOKEN_EXPIRE_MINUTES * 60; // Convert to seconds
    return jwt.sign(data, SECRET_KEY, {
        algorithm: ALGORITHM,
        expiresIn: expiresIn
    });
}

/**
 * Decode and verify JWT token
 * @param {string} token - JWT token to decode
 * @returns {object|null} Decoded payload or null if invalid
 */
function decodeToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY, { algorithms: [ALGORITHM] });
    } catch (error) {
        console.error('Token decode error:', error.message);
        return null;
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    createAccessToken,
    decodeToken,
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES
};
