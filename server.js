require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const hotelRoutes = require('./routes/hotel');
const menuRoutes = require('./routes/menu');
const pushRoutes = require('./routes/push');
const adminRoutes = require('./routes/admin');
const app = express();

// Security Middlewares
app.use(helmet()); // Hides Express server details and protects against XSS

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Limit each IP to 150 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { success: false, message: "Too many requests from this IP, please try again after 15 minutes." }
});

// Apply the rate limiting middleware strictly to all API calls
app.use('/api/', apiLimiter);

// Standard Middleware
app.use(compression());
app.use(cors({
  // origin: 'https://khichdi-admin.com', // Uncomment and add your real web admin domain when ready
  origin: '*'
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/hotel', hotelRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/admin', adminRoutes);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    // Start background cron jobs once DB is connected
    const scheduleCronJobs = require('./cron');
    scheduleCronJobs();
  })
  .catch((err) => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
