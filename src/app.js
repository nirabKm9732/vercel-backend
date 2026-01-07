const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/database');

const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet());

// General rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth
  message: 'Too many authentication attempts. Please try again later.',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      // In development, allow all origins for network access
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const appointmentRoutes = require('./routes/appointments');
const prescriptionRoutes = require('./routes/prescriptions');
const prescriptionTemplateRoutes = require('./routes/prescriptionTemplates');
const medicineRoutes = require('./routes/medicines');
const testRoutes = require('./routes/tests');
const insuranceRoutes = require('./routes/insurance');
const blogRoutes = require('./routes/blogs');
const hospitalRoutes = require('./routes/hospitals');
const paymentRoutes = require('./routes/payments');
const doctorEarningsRoutes = require('./routes/doctorEarnings');
const healthRecordRoutes = require('./routes/healthRecords');
const familyMemberRoutes = require('./routes/familyMembers');
const fileRoutes = require('./routes/files');
const videoRoutes = require('./routes/video');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Healthcare Platform API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/prescription-templates', prescriptionTemplateRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/doctor/earnings', doctorEarningsRoutes);
app.use('/api/health-records', healthRecordRoutes);
app.use('/api/family-members', familyMemberRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/video', videoRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all network interfaces

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (HOST === '0.0.0.0') {
    console.log(`Accessible from network devices at: http://<your-ip>:${PORT}`);
  }
});

module.exports = app;
