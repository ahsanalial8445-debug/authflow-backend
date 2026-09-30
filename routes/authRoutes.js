const express = require("express");
const router = express.Router();

const {
  register,
  login,
  logout,
  getMe,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Protected route (JWT required)
router.get("/me", protect, getMe);

module.exports = router;
