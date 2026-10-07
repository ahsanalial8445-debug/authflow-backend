const mongoose = require("mongoose");
const Notification = require("../models/Notification");

const getNotifications = async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);

  res.status(200).json({
    success: true,
    notifications,
    unreadCount,
  });
};

const getUnreadCount = async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    read: false,
  });
  res.status(200).json({ success: true, unreadCount });
};

const markNotificationRead = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid notification ID" });
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { read: true } },
    { returnDocument: "after", runValidators: true }
  );
  if (!notification) {
    return res.status(404).json({ success: false, message: "Notification not found" });
  }

  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    read: false,
  });
  res.status(200).json({ success: true, notification, unreadCount });
};

const markAllNotificationsRead = async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, read: false },
    { $set: { read: true } }
  );
  res.status(200).json({
    success: true,
    modifiedCount: result.modifiedCount,
    unreadCount: 0,
  });
};

const deleteNotification = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid notification ID" });
  }

  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!notification) {
    return res.status(404).json({ success: false, message: "Notification not found" });
  }

  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    read: false,
  });
  res.status(200).json({ success: true, unreadCount });
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
};
