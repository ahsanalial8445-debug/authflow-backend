require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

// ---- CORS ----
// In development the Vite dev server runs on http://localhost:5173, but Vite
// automatically moves to 5174, 5175... when a port is already in use.
// So any http(s)://localhost:<any-port> origin is allowed for development,
// plus every extra origin listed in CLIENT_URL (comma separated) for production.
const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin(origin, callback) {
      // !origin covers same-origin requests and tools like Postman/curl
      if (!origin || LOCALHOST_PATTERN.test(origin) || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  })
);

// ---- Body parser ----
app.use(express.json());

// ---- Routes ----
app.get("/", (req, res) => {
  res.json({ success: true, message: "AuthFlow API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);

// ---- 404 + central error handler (must stay last) ----
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB();

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;