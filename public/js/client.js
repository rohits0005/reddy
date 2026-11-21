// Initialize or retrieve unique Session ID for the visitor
let sessionId = sessionStorage.getItem('vip_session_id');
if (!sessionId) {
  sessionId = 'user_' + Math.random().toString(36).substring(2, 8) + Date.now().toString().slice(-4);
  sessionStorage.setItem('vip_session_id', sessionId);
}

// Elements
const modal = document.getElementById('paymentModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const btnSeeExclusive = document.getElementById('btnSeeExclusive');
const btnViewQr = document.getElementById('btnViewQr');
const stepPayPrompt = document.getElementById('stepPayPrompt');
const stepWaitingQr = document.getElementById('stepWaitingQr');
const stepQrForm = document.getElementById('stepQrForm');
const stepVerificationPending = document.getElementById('stepVerificationPending');
const stepRejected = document.getElementById('stepRejected');
const qrImageElement = document.getElementById('qrImageElement');
const paymentProofForm = document.getElementById('paymentProofForm');
const utrInput = document.getElementById('utrInput');
const screenshotInput = document.getElementById('screenshotInput');
const previewImage = document.getElementById('previewImage');
const uploadPromptText = document.getElementById('uploadPromptText');
const displaySessionIdWait = document.getElementById('displaySessionIdWait');
const displaySubmittedUtr = document.getElementById('displaySubmittedUtr');
const rejectReasonText = document.getElementById('rejectReasonText');
const btnRetryPayment = document.getElementById('btnRetryPayment');
const unlockedVaultSection = document.getElementById('unlockedVaultSection');
const vaultLinksContainer = document.getElementById('vaultLinksContainer');
const unlockedTitle = document.getElementById('unlockedTitle');
const unlockedMessage = document.getElementById('unlockedMessage');

if (displaySessionIdWait) {
  displaySessionIdWait.textContent = sessionId;
}

// Connect to Socket.IO
const socket = io();

// Join visitor session room
socket.emit('join_session', { sessionId });

// Register session on backend
fetch('/api/session/init', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId })
}).then(res => res.json()).then(data => {
  if (data.session) {
    handleSessionState(data.session);
  }
}).catch(err => console.error('Session init error:', err));

// State handler
function handleSessionState(session) {
  if (session.status === 'approved') {
    renderUnlockedVault();
  } else if (session.status === 'payment_submitted') {
    modal.classList.add('active');
    showStep('pending');
    if (session.utr) displaySubmittedUtr.textContent = session.utr;
  } else if (session.status === 'qr_sent' && session.qrUrl) {
    modal.classList.add('active');
    qrImageElement.src = session.qrUrl;
    showStep('qr_form');
  } else if (session.status === 'qr_requested') {
    modal.classList.add('active');
    showStep('waiting_qr');
  }
}

// Step switcher
function showStep(stepName) {
  stepPayPrompt.style.display = 'none';
  stepWaitingQr.style.display = 'none';
  stepQrForm.style.display = 'none';
  stepVerificationPending.style.display = 'none';
  stepRejected.style.display = 'none';

  if (stepName === 'pay_prompt') {
    stepPayPrompt.style.display = 'block';
  } else if (stepName === 'waiting_qr') {
    stepWaitingQr.style.display = 'block';
  } else if (stepName === 'qr_form') {
    stepQrForm.style.display = 'block';
  } else if (stepName === 'pending') {
    stepVerificationPending.style.display = 'block';
  } else if (stepName === 'rejected') {
    stepRejected.style.display = 'block';
  }
}

// Event: Click "See Exclusive Content 18+"
btnSeeExclusive.addEventListener('click', () => {
  modal.classList.add('active');
  showStep('pay_prompt');
});

// Close Modal
modalCloseBtn.addEventListener('click', () => {
  modal.classList.remove('active');
});

// Event: Click "View QR Code"
btnViewQr.addEventListener('click', () => {
  showStep('waiting_qr');
  // Notify backend and admin
  socket.emit('request_qr', { sessionId });
});

// Socket Event: Admin sent QR code
socket.on('qr_received', (data) => {
  if (data.qrUrl) {
    qrImageElement.src = data.qrUrl;
    showStep('qr_form');
  }
});

// File upload preview
screenshotInput.addEventListener('change', function() {
  const file = this.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImage.src = e.target.result;
      previewImage.style.display = 'block';
      uploadPromptText.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
});

// Event: Submit Payment Form
paymentProofForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const utr = utrInput.value.trim();
  const file = screenshotInput.files[0];

  if (!utr) {
    alert('Kripya 12-digit UTR ya Transaction Number dalein.');
    return;
  }

  if (!file) {
    alert('Kripya payment ka screenshot upload karein.');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitPayment');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading Proof... Please wait';

  try {
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('utr', utr);
    formData.append('screenshot', file);

    const res = await fetch('/api/user/submit-payment', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      displaySubmittedUtr.textContent = utr;
      showStep('pending');
    } else {
      alert(data.error || 'Upload failed. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Submit Payment Verification';
    }
  } catch (err) {
    console.error('Error submitting payment:', err);
    alert('Connection error. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = '🚀 Submit Payment Verification';
  }
});

// Socket Event: Admin Approved Payment
socket.on('access_granted', (data) => {
  modal.classList.remove('active');
  renderUnlockedVault(data.exclusiveContent);
});

// Socket Event: Admin Rejected Payment
socket.on('access_rejected', (data) => {
  rejectReasonText.textContent = data.reason || 'Payment could not be verified.';
  showStep('rejected');
});

// Retry Button
btnRetryPayment.addEventListener('click', () => {
  utrInput.value = '';
  screenshotInput.value = '';
  previewImage.style.display = 'none';
  uploadPromptText.style.display = 'block';
  document.getElementById('btnSubmitPayment').disabled = false;
  document.getElementById('btnSubmitPayment').textContent = '🚀 Submit Payment Verification';
  showStep('qr_form');
});

// Render Unlocked Vault
function renderUnlockedVault(content) {
  fetch(`/api/exclusive-content/${sessionId}`)
    .then(r => r.json())
    .then(data => {
      if (data.success && data.content) {
        unlockedTitle.textContent = data.content.title || '🔥 VIP Exclusive 18+ Unlocked Vault 🔥';
        unlockedMessage.textContent = data.content.message || 'Payment Verified! Here is your exclusive access:';
        
        let linksHtml = '';
        if (data.content.links && data.content.links.length > 0) {
          data.content.links.forEach(item => {
            linksHtml += `
              <a href="${item.url}" target="_blank" class="vault-link-item">
                <span style="font-weight: 600;">💎 ${item.name}</span>
                <span style="color: var(--accent-red); font-weight: 700;">Open &rarr;</span>
              </a>
            `;
          });
        }
        vaultLinksContainer.innerHTML = linksHtml;
        unlockedVaultSection.style.display = 'block';

        // Scroll to vault smoothly
        unlockedVaultSection.scrollIntoView({ behavior: 'smooth' });
      }
    })
    .catch(err => console.error(err));
}
