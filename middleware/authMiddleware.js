const jwt = require("jsonwebtoken");
const User = require("../models/User");

// @desc    Protect routes — validates the JWT sent in the
//          "Authorization: Bearer <token>" header and attaches
//          the user to req.user
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorized, no token provided" });
    }

    const token = header.split(" ")[1];

    // jwt.verify throws if the token is invalid or expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "The user for this token no longer exists" });
    }

    req.user = user; // makes the user available to the controller
    next();
  } catch (err) {
    let message = "Not authorized, token is invalid";

    if (err.name === "TokenExpiredError") {
      message = "Your session has expired, please log in again";
    } else if (err.name === "JsonWebTokenError") {
      message = "Not authorized, token is invalid";
    }

    return res.status(401).json({ success: false, message });
  }
};

module.exports = { protect };
