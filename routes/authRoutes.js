const express = require("express");
const router = express.Router();

const {
  register,
  login,
  logout,
  getMe,
  updateMe,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Protected route (JWT required)
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);

module.exports = router;
