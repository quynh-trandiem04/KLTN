// backend-api/src/middlewares/checkRole.js

/**
 * Middleware: Check if user has required role
 * Usage: checkRole(['ADMIN', 'STORE_OWNER'])
 */
function checkRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                detail: 'Authentication required. Please login first.'
            });
        }
        
        const userRoles = req.user.roles || [];
        const hasRole = allowedRoles.some(role => userRoles.includes(role));
        
        if (!hasRole) {
            return res.status(403).json({
                detail: `Access denied. Required roles: ${allowedRoles.join(' or ')}. Your roles: ${userRoles.join(', ')}`
            });
        }
        
        next();
    };
}

module.exports = checkRole;
