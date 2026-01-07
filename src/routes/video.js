const express = require('express');
const { param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  generateVideoRoom,
  generateAgoraToken,
  startVideoCall,
  endVideoCall,
  getVideoCallDetails,
  getIceServers
} = require('../controllers/videoController');

const router = express.Router();

// All video routes require authentication
router.use(authenticateToken);

// Get ICE servers configuration
router.get('/ice-servers', getIceServers);

// Generate video room for appointment
router.post('/generate-room/:appointmentId', [
  param('appointmentId').isMongoId().withMessage('Valid appointment ID required')
], generateVideoRoom);

// Generate Agora token for video call
router.get('/token/:appointmentId', [
  param('appointmentId').isMongoId().withMessage('Valid appointment ID required')
], generateAgoraToken);

// Start video call
router.post('/start/:appointmentId', [
  param('appointmentId').isMongoId().withMessage('Valid appointment ID required')
], startVideoCall);

// End video call
router.post('/end/:appointmentId', [
  param('appointmentId').isMongoId().withMessage('Valid appointment ID required')
], endVideoCall);

// Get video call details by room ID
router.get('/room/:roomId', [
  param('roomId').isUUID().withMessage('Valid room ID required')
], getVideoCallDetails);

module.exports = router;
