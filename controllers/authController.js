const User = require("../models/User");
const generateToken = require("../utils/generateToken");

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const safeErrorMessage = (error) => {
  let message = String(error.message || "Unexpected registration error");
  const secrets = [process.env.MONGO_URI, process.env.JWT_SECRET].filter(Boolean);

  for (const secret of secrets) {
    message = message.replaceAll(secret, "[redacted]");
  }

  return message.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, "$1[redacted]@");
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    // ---- Validation ----
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all fields (name, email, password)",
      });
    }

    if (!EMAIL_REGEX.test(String(email))) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide a valid email address" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // ---- Duplicate email check ----
    const existingUser = await User.findOne({ email: String(email).toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // ---- Create user (password is hashed by the pre-save hook in the model) ----
    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);

    // Frontend expects { token, user }
    res.status(201).json({ success: true, token, user });
  } catch (err) {
    // Race condition: two registrations with the same email at the same time
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists",
      });
    }
    const message = safeErrorMessage(err);
    console.error("Registration error:", {
      name: err.name,
      message,
      code: err.code,
      stack:
        process.env.NODE_ENV === "production"
          ? undefined
          : safeErrorMessage({ message: err.stack }),
    });
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Server error, please try again later"
          : message,
    });
  }
};

// @desc    Login an existing user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide email and password" });
    }

    // select("+password") because the model hides it by default
    const user = await User.findOne({
      email: String(email).toLowerCase(),
    }).select("+password");

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = generateToken(user._id);

    // Frontend expects { token, user }
    res.status(200).json({ success: true, token, user });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ success: false, message: "Server error, please try again later" });
  }
};

// @desc    Get the currently logged-in user (profile)
// @route   GET /api/auth/me
// @access  Private (JWT required)
const getMe = async (req, res) => {
  // req.user is set by the "protect" middleware — no password is attached to it
  res.status(200).json({ success: true, user: req.user });
};

// @desc    Logout
// @route   POST /api/auth/logout
// @access  Public
const logout = async (req, res) => {
  // This frontend keeps the JWT in localStorage (sent as a Bearer header),
  // so there is no auth cookie to clear. The frontend removes the token
  // from localStorage itself; this endpoint confirms the logout and exists
  // so the API stays complete.
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

module.exports = { register, login, getMe, logout };
