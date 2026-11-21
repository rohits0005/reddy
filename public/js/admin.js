// Admin Panel Logic
let adminPassword = localStorage.getItem('vip_admin_pwd') || '';
let socket = null;
let currentSessions = [];
let defaultQrUrl = null;
let selectedSessionForQr = null;

// DOM Elements
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const adminContent = document.getElementById('adminContent');
const btnLogout = document.getElementById('btnLogout');
const btnEnableAudio = document.getElementById('btnEnableAudio');
const statQrRequests = document.getElementById('statQrRequests');
const statPendingPayments = document.getElementById('statPendingPayments');
const statApproved = document.getElementById('statApproved');
const qrRequestsTableBody = document.getElementById('qrRequestsTableBody');
const paymentsTableBody = document.getElementById('paymentsTableBody');
const zoomModal = document.getElementById('zoomModal');
const zoomedImage = document.getElementById('zoomedImage');
const sendQrModal = document.getElementById('sendQrModal');
const sendQrModalClose = document.getElementById('sendQrModalClose');
const modalTargetSession = document.getElementById('modalTargetSession');
const modalSendQrForm = document.getElementById('modalSendQrForm');
const modalQrFile = document.getElementById('modalQrFile');
const defaultQrOptionContainer = document.getElementById('defaultQrOptionContainer');
const chkUseDefaultQr = document.getElementById('chkUseDefaultQr');
const defaultQrForm = document.getElementById('defaultQrForm');
const defaultQrFileInput = document.getElementById('defaultQrFileInput');
const adminDefaultQrPreview = document.getElementById('adminDefaultQrPreview');
const noQrText = document.getElementById('noQrText');

// Web Audio API Sound Synthesizer
let audioCtx = null;
function playAlertSound(type = 'qr') {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'qr') {
      // Gentle double ping
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.45);
    } else {
      // Payment received celebratory chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
      osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.3); // C6
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.7);
    }
  } catch (err) {
    console.error('Audio playback error:', err);
  }
}

// Audio test button
btnEnableAudio.addEventListener('click', () => {
  playAlertSound('payment');
  alert('🔔 Audio Alert working correctly!');
});

// Check existing login
if (adminPassword) {
  verifyLogin(adminPassword);
}

// Handle Login Form
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pwd = adminPasswordInput.value.trim();
  verifyLogin(pwd);
});

// Verify login API
async function verifyLogin(password) {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (data.success) {
      adminPassword = password;
      localStorage.setItem('vip_admin_pwd', password);
      loginModal.classList.remove('active');
      adminContent.style.display = 'block';
      initSocket();
    } else {
      alert('Galat Password! Kripya sahi password dalein.');
    }
  } catch (err) {
    alert('Server se connect nahi ho paya.');
  }
}

// Logout
btnLogout.addEventListener('click', () => {
  localStorage.removeItem('vip_admin_pwd');
  window.location.reload();
});

// Socket Initialization
function initSocket() {
  if (socket) return;
  socket = io();

  socket.emit('admin_join', { password: adminPassword });

  socket.on('initial_admin_data', (data) => {
    currentSessions = data.sessions || [];
    defaultQrUrl = data.defaultQrUrl;
    renderDefaultQr();
    renderTables();
  });

  // Real-time Event: User clicked "View QR"
  socket.on('new_qr_request', (data) => {
    playAlertSound('qr');
    upsertSession(data.session);
    showBrowserNotification('🔔 New QR Requested!', `User #${data.session.id} is waiting for QR code to pay ₹300!`);
  });

  // Real-time Event: User submitted payment screenshot & UTR
  socket.on('new_payment_submitted', (data) => {
    playAlertSound('payment');
    upsertSession(data.session);
    showBrowserNotification('💰 Payment Received!', `UTR: ${data.session.utr} for Session #${data.session.id}`);
  });

  socket.on('session_updated', (session) => {
    upsertSession(session);
  });
}

// Browser desktop notification if permitted
function showBrowserNotification(title, body) {
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/uploads/favicon.png' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }
}

function upsertSession(session) {
  const index = currentSessions.findIndex(s => s.id === session.id);
  if (index >= 0) {
    currentSessions[index] = session;
  } else {
    currentSessions.unshift(session);
  }
  renderTables();
}

function renderTables() {
  const waitingForQr = currentSessions.filter(s => s.status === 'qr_requested');
  const paymentVerifications = currentSessions.filter(s => s.status === 'payment_submitted' || s.status === 'approved' || s.status === 'rejected');
  const approvedList = currentSessions.filter(s => s.status === 'approved');

  // Stats update
  statQrRequests.textContent = waitingForQr.length;
  statPendingPayments.textContent = currentSessions.filter(s => s.status === 'payment_submitted').length;
  statApproved.textContent = approvedList.length;

  // Render QR Requests Table
  if (waitingForQr.length === 0) {
    qrRequestsTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">
          No users waiting for QR right now. When someone clicks "View QR", they appear here instantly!
        </td>
      </tr>
    `;
  } else {
    let rowsHtml = '';
    waitingForQr.forEach(s => {
      const timeStr = new Date(s.updatedAt || s.createdAt).toLocaleTimeString();
      rowsHtml += `
        <tr>
          <td><strong style="color: #fbbf24; font-family: monospace;">#${s.id}</strong></td>
          <td>${timeStr}</td>
          <td><span class="badge badge-waiting">WAITING FOR QR</span></td>
          <td>
            <button class="btn-action btn-send-qr" onclick="openSendQrModal('${s.id}')">
              📤 Send QR Image Now
            </button>
          </td>
        </tr>
      `;
    });
    qrRequestsTableBody.innerHTML = rowsHtml;
  }

  // Render Payment Screenshots Table
  if (paymentVerifications.length === 0) {
    paymentsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
          No payment screenshots received yet.
        </td>
      </tr>
    `;
  } else {
    let rowsHtml = '';
    paymentVerifications.forEach(s => {
      const timeStr = new Date(s.updatedAt || s.createdAt).toLocaleTimeString();
      let statusBadge = '';
      let actionButtons = '';

      if (s.status === 'payment_submitted') {
        statusBadge = '<span class="badge badge-paid">PENDING REVIEW</span>';
        actionButtons = `
          <button class="btn-action btn-approve" onclick="verifyPayment('${s.id}', 'approve')">✔ Approve Access</button>
          <button class="btn-action btn-reject" onclick="verifyPayment('${s.id}', 'reject')">✖ Reject</button>
        `;
      } else if (s.status === 'approved') {
        statusBadge = '<span class="badge badge-approved">APPROVED (UNLOCKED)</span>';
        actionButtons = '<span style="color: #34d399; font-size: 0.82rem; font-weight: 600;">Content Unlocked</span>';
      } else if (s.status === 'rejected') {
        statusBadge = '<span class="badge badge-rejected">REJECTED</span>';
        actionButtons = `
          <button class="btn-action btn-approve" onclick="verifyPayment('${s.id}', 'approve')">Re-Approve</button>
        `;
      }

      rowsHtml += `
        <tr>
          <td><strong style="color: #cbd5e1; font-family: monospace;">#${s.id}</strong></td>
          <td><span style="font-family: monospace; font-size: 1rem; color: #fbbf24; font-weight: 700;">${s.utr || 'N/A'}</span></td>
          <td>
            ${s.screenshotUrl ? `<img src="${s.screenshotUrl}" class="img-thumb" alt="Screenshot" onclick="zoomImage('${s.screenshotUrl}')">` : 'No Image'}
          </td>
          <td>${timeStr}</td>
          <td>${statusBadge}</td>
          <td>${actionButtons}</td>
        </tr>
      `;
    });
    paymentsTableBody.innerHTML = rowsHtml;
  }
}

// Open Send QR Modal
window.openSendQrModal = function(sessionId) {
  selectedSessionForQr = sessionId;
  modalTargetSession.textContent = '#' + sessionId;
  modalQrFile.value = '';

  if (defaultQrUrl) {
    defaultQrOptionContainer.style.display = 'block';
    chkUseDefaultQr.checked = true;
  } else {
    defaultQrOptionContainer.style.display = 'none';
    chkUseDefaultQr.checked = false;
  }

  sendQrModal.classList.add('active');
};

sendQrModalClose.addEventListener('click', () => {
  sendQrModal.classList.remove('active');
});

// Handle Send QR Form Submission
modalSendQrForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedSessionForQr) return;

  const file = modalQrFile.files[0];
  const useDefault = defaultQrOptionContainer.style.display !== 'none' && chkUseDefaultQr.checked;

  if (!file && !useDefault) {
    alert('Kripya QR image upload karein ya Default QR checkbox select karein.');
    return;
  }

  const formData = new FormData();
  formData.append('sessionId', selectedSessionForQr);
  if (file) {
    formData.append('qrImage', file);
  }
  if (useDefault) {
    formData.append('useDefaultQr', 'true');
  }

  try {
    const res = await fetch('/api/admin/send-qr', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminPassword}` },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      alert(`✅ QR Code user #${selectedSessionForQr} ki screen par live bhej diya gaya hai!`);
      sendQrModal.classList.remove('active');
    } else {
      alert(data.error || 'Failed to send QR');
    }
  } catch (err) {
    alert('Error sending QR');
  }
});

// Verify Payment (Approve / Reject)
window.verifyPayment = async function(sessionId, action) {
  let rejectReason = '';
  if (action === 'reject') {
    rejectReason = prompt('Reject reason likhein (User ko screen pe dikhega):', 'Payment amount not received or invalid UTR.');
    if (rejectReason === null) return; // cancelled
  }

  try {
    const res = await fetch('/api/admin/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminPassword}`
      },
      body: JSON.stringify({ sessionId, action, rejectReason })
    });

    const data = await res.json();
    if (data.success) {
      if (action === 'approve') {
        alert(`✅ Session #${sessionId} APPROVED! User ki screen par exclusive content unlock ho gaya.`);
      } else {
        alert(`Session #${sessionId} rejected.`);
      }
    } else {
      alert(data.error || 'Action failed');
    }
  } catch (err) {
    alert('Error connecting to server');
  }
};

// Zoom Image
window.zoomImage = function(src) {
  zoomedImage.src = src;
  zoomModal.classList.add('active');
};

zoomModal.addEventListener('click', () => {
  zoomModal.classList.remove('active');
});

// Default QR Upload
defaultQrForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = defaultQrFileInput.files[0];
  if (!file) {
    alert('Please choose a QR image first');
    return;
  }

  const formData = new FormData();
  formData.append('qrImage', file);

  try {
    const res = await fetch('/api/admin/upload-default-qr', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminPassword}` },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      defaultQrUrl = data.qrUrl;
      renderDefaultQr();
      alert('✅ Default QR code successfully saved! Now you can send it with 1-click.');
    }
  } catch (err) {
    alert('Failed to upload default QR');
  }
});

function renderDefaultQr() {
  if (defaultQrUrl) {
    adminDefaultQrPreview.src = defaultQrUrl;
    adminDefaultQrPreview.style.display = 'block';
    noQrText.style.display = 'none';
  } else {
    adminDefaultQrPreview.style.display = 'none';
    noQrText.style.display = 'block';
  }
}
