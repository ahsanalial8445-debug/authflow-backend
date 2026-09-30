// @desc    Handle requests to routes that do not exist
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// @desc    Central error handler — anything thrown anywhere in the app
//          ends up here and gets a clean JSON response
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error("Unhandled error:", err.message);

  // Mongoose: malformed ObjectId (e.g. /users/abc)
  if (err.name === "CastError") {
    return res
      .status(400)
      .json({ success: false, message: `Invalid ${err.path}: ${err.value}` });
  }

  // Mongoose: schema validation failed (minlength, required, match...)
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
    return res.status(400).json({ success: false, message });
  }

  // MongoDB: duplicate key (unique email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(400).json({
      success: false,
      message: `An account with this ${field} already exists`,
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Server error, please try again later",
  });
};

module.exports = { notFound, errorHandler };
