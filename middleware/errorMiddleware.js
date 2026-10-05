// @desc    Handle requests to routes that do not exist
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
};

// @desc    Central error handler — anything thrown anywhere in the app
//          ends up here and gets a clean JSON response
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error("Unhandled error:", err.message);

  // Mongoose: malformed ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: "Invalid ID" });
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

  const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 500
    ? err.statusCode
    : 500;
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Server error, please try again later" : err.message,
  });
};

module.exports = { notFound, errorHandler };
