const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // Get token from header
    const token = req.header('Authorization');

    // Check if no token
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        // Verify token
        const strippedToken = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;
        const decoded = jwt.verify(strippedToken, process.env.JWT_SECRET);

        // Attach user to request
        req.user = decoded;

        // Verify role
        if (req.user.role !== 'hotel') {
            return res.status(403).json({ msg: 'Access denied: Requires hotel role' });
        }

        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
