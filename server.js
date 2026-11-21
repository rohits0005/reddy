const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e7 // 10MB
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Graphic@3526';
const DEFAULT_PRICE = process.env.DEFAULT_PRICE || '300';

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure default content folder exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

// In-Memory Data Store
const sessions = new Map(); 
// sessionId => {
//   id,
//   ip,
//   createdAt,
//   status: 'visiting' | 'qr_requested' | 'qr_sent' | 'payment_submitted' | 'approved' | 'rejected',
//   price: 300,
//   qrUrl: null,
//   screenshotUrl: null,
//   utr: null,
//   updatedAt: Date
// }

let defaultQrUrl = null;
let exclusiveContent = {
  title: "🔥 VIP Exclusive 18+ Unlocked Vault 🔥",
  message: "Dhanyawad! Aapka payment verify ho chuka hai. Niche diye gaye links aur content enjoy karein:",
  links: [
    { name: "Private Mega Vault Link 1", url: "https://t.me/example_channel" },
    { name: "VIP Full HD Video Collection", url: "https://drive.google.com" }
  ],
  gallery: [
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop&q=80"
  ]
};

// API: Check Admin Auth
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: 'Authenticated successfully' });
  }
  return res.status(401).json({ success: false, message: 'Invalid password' });
});

// API: Get initial session or register
app.post('/api/session/init', (req, res) => {
  const { sessionId } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }

  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      ip: ip,
      createdAt: new Date(),
      status: 'visiting',
      price: DEFAULT_PRICE,
      qrUrl: null,
      screenshotUrl: null,
      utr: null,
      updatedAt: new Date()
    };
    sessions.set(sessionId, session);
  }

  res.json({ success: true, session });
});

// API: Admin Upload Default QR
app.post('/api/admin/upload-default-qr', upload.single('qrImage'), (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No QR image provided' });
  }

  defaultQrUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, qrUrl: defaultQrUrl });
});

// API: Admin Upload Specific QR for a Session
app.post('/api/admin/send-qr', upload.single('qrImage'), (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.body;
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let qrPath = null;
  if (req.file) {
    qrPath = `/uploads/${req.file.filename}`;
  } else if (req.body.useDefaultQr && defaultQrUrl) {
    qrPath = defaultQrUrl;
  } else {
    return res.status(400).json({ error: 'No QR image uploaded or selected' });
  }

  const session = sessions.get(sessionId);
  session.status = 'qr_sent';
  session.qrUrl = qrPath;
  session.updatedAt = new Date();
  sessions.set(sessionId, session);

  // Notify the user in real-time
  io.to(`session_${sessionId}`).emit('qr_received', {
    sessionId,
    qrUrl: qrPath,
    price: session.price
  });

  // Notify admins
  io.to('admin_room').emit('session_updated', session);

  res.json({ success: true, message: 'QR sent to user successfully!', session });
});

// API: User Upload Payment Screenshot & UTR
app.post('/api/user/submit-payment', upload.single('screenshot'), (req, res) => {
  const { sessionId, utr } = req.body;
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Payment screenshot is required' });
  }

  if (!utr || utr.trim().length < 4) {
    return res.status(400).json({ error: 'Valid UTR / Transaction number is required' });
  }

  const session = sessions.get(sessionId);
  session.status = 'payment_submitted';
  session.screenshotUrl = `/uploads/${req.file.filename}`;
  session.utr = utr.trim();
  session.updatedAt = new Date();
  sessions.set(sessionId, session);

  // Notify Admin Room with sound and data
  io.to('admin_room').emit('new_payment_submitted', {
    session,
    message: `New Payment proof uploaded for Session #${sessionId}! UTR: ${session.utr}`
  });

  // Also confirm to the user
  io.to(`session_${sessionId}`).emit('payment_confirmed', {
    status: 'payment_submitted',
    message: 'Screenshot and UTR received! Verification in progress...'
  });

  res.json({
    success: true,
    message: 'Payment details submitted successfully! Please wait on this page.',
    session
  });
});

// API: Admin Approve or Reject Payment
app.post('/api/admin/verify-payment', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId, action, rejectReason } = req.body; // action: 'approve' | 'reject'
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);

  if (action === 'approve') {
    session.status = 'approved';
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    // Send unlock event to visitor with content
    io.to(`session_${sessionId}`).emit('access_granted', {
      exclusiveContent
    });

    io.to('admin_room').emit('session_updated', session);
    return res.json({ success: true, message: 'Payment Approved and Content Unlocked for User!', session });
  } else if (action === 'reject') {
    session.status = 'rejected';
    session.rejectReason = rejectReason || 'Payment could not be verified. Please check UTR or upload clear screenshot.';
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    // Notify user to re-submit
    io.to(`session_${sessionId}`).emit('access_rejected', {
      reason: session.rejectReason
    });

    io.to('admin_room').emit('session_updated', session);
    return res.json({ success: true, message: 'Payment marked as Rejected.', session });
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
});

// API: Get Exclusive Content (protected check)
app.get('/api/exclusive-content/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (session && session.status === 'approved') {
    return res.json({ success: true, content: exclusiveContent });
  }

  return res.status(403).json({ error: 'Access denied. Payment verification pending or required.' });
});

// API: Update Exclusive Content (Admin only)
app.post('/api/admin/update-content', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, message, links } = req.body;
  if (title) exclusiveContent.title = title;
  if (message) exclusiveContent.message = message;
  if (links && Array.isArray(links)) exclusiveContent.links = links;

  res.json({ success: true, content: exclusiveContent });
});

// Socket.IO Real-time Connection
io.on('connection', (socket) => {
  // Visitor joins their personal session room
  socket.on('join_session', ({ sessionId }) => {
    if (sessionId) {
      socket.join(`session_${sessionId}`);
      socket.sessionId = sessionId;
      const session = sessions.get(sessionId);
      if (session) {
        socket.emit('session_state', session);
      }
    }
  });

  // Admin joins the admin control room
  socket.on('admin_join', ({ password }) => {
    if (password === ADMIN_PASSWORD) {
      socket.join('admin_room');
      socket.isAdmin = true;
      // Send all current sessions list to admin
      const sessionsList = Array.from(sessions.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      socket.emit('initial_admin_data', {
        sessions: sessionsList,
        defaultQrUrl: defaultQrUrl,
        exclusiveContent: exclusiveContent
      });
    } else {
      socket.emit('auth_error', { message: 'Incorrect admin password' });
    }
  });

  // Visitor clicks "View QR"
  socket.on('request_qr', ({ sessionId }) => {
    if (!sessionId) return;
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        ip: socket.handshake.address,
        createdAt: new Date(),
        status: 'visiting',
        price: DEFAULT_PRICE,
        qrUrl: null,
        screenshotUrl: null,
        utr: null,
        updatedAt: new Date()
      };
    }

    session.status = 'qr_requested';
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    // Notify all online Admins in real-time!
    io.to('admin_room').emit('new_qr_request', {
      session,
      message: `🔔 User #${sessionId} clicked "View QR"! Waiting for you to send QR code.`
    });

    // Notify user that request has been dispatched to admin
    socket.emit('qr_request_dispatched', {
      message: 'Admin ko notification bhej diya gaya hai! QR aane tak kripya yahi wait karein.'
    });
  });

  socket.on('disconnect', () => {
    // Clean disconnection
  });
});

// Fallback routing
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`👤 Visitor Link: http://localhost:${PORT}`);
  console.log(`🔐 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`🔑 Admin Auth: Protected`);
  console.log(`=======================================================`);
});
