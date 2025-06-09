import jwt from "jsonwebtoken";

// Authentication middleware to verify JWT tokens in the Authorization header
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // Check if the Authorization header exists and starts with 'Bearer '
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
            .status(401)
            .json({ error: "Unauthorized: No token provided" });
    }

    // Extract the token from the Authorization header
    const token = authHeader.split(" ")[1];

    // Check if token is actually present after splitting
    if (!token) {
        return res.status(401).json({ error: "Unauthorized: Token missing" });
    }

    try {
        // Verify the token using the secret from environment variables
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach decoded user information to the request object
        req.user = decoded;

        // Proceed to the next middleware or route handler
        next();
    } catch (err) {
        // Handle invalid or expired token errors
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};
export const adminMiddleware = (req, res, next) => {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
    }
    next();
};
export default authMiddleware;