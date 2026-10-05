const express = require("express");
const { getMe, updateMe } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.route("/profile").get(getMe).put(updateMe);

module.exports = router;
