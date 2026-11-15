const { decodeToken } = require('../config/security');

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            detail: 'Missing Authorization header. Please provide a valid token.'
        });
    }

    let token = authHeader.startsWith('Bearer ')
        ? authHeader.substring(7).trim()
        : authHeader.trim();

    token = token.replace(/^["']+|["']+$/g, '');

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({
            detail: 'Authentication token is null or undefined.'
        });
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        return res.status(401).json({
            detail: 'Malformed token format.'
        });
    }


    const decoded = decodeToken(token);
    if (!decoded) {
        return res.status(401).json({
            detail: 'Invalid or expired token.'
        });
    }

    req.user = {
        user_id: decoded.user_id,
        email: decoded.sub,
        roles: decoded.roles || []
    };

    next();
}

module.exports = verifyToken;