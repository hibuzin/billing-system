const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
    try {
        const authHeader = req.header("Authorization");

        if (!authHeader) {
            return res.status(401).json({
                message: "No token provided"
            });
        }

        const token = authHeader.replace("Bearer ", "");

        const decoded = jwt.verify(token, "SECRET_KEY");

        req.user = decoded;

        next();

    } catch (err) {
        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};

module.exports = auth;