# VIP 18+ Exclusive Content Paywall & Live QR Verification System

Ek complete, real-time website jisme user jab exclusive 18+ content dekhne ke liye click karega, tab live QR aur payment verification ka flow start hota hai.

---

## 🚀 Kaam Kaise Karta Hai (User & Admin Flow):

1. **User Website Kholta Hai:**
   - User ko premium dark-themed 18+ VIP vault dikhta hai.
   - User **"See Exclusive Content 18+"** button par click karta hai.

2. **Pay ₹300 Prompt:**
   - Screen par ₹300 ka VIP membership pass aayega.
   - User ko **"View QR Code to Pay"** ka option dikhega.

3. **Admin Ko Live Notification:**
   - Jaise hi user "View QR" par click karta hai, Admin Panel (`/admin`) par instant sound alert (chime) bajti hai aur real-time me request aa jati hai ki: *"User #XYZ is waiting for QR code!"*

4. **Admin Yaha Se QR Send Karta Hai:**
   - Admin apne dashboard se user ke liye QR code upload karke bhej sakta hai (ya 1-click Default QR bhej sakta hai).
   - User ke samne turant QR code screen par live pop-up ho jata hai bina reload kiye!

5. **User Payment Screenshot & UTR Bhejta Hai:**
   - User ₹300 kisi bhi UPI app (PhonePe / GPay / Paytm) se pay karta hai.
   - User apna 12-digit UTR number dalta hai aur payment screenshot upload karke **"Submit Payment Verification"** par click karta hai.

6. **User Ussi Page Par Rahta Hai:**
   - User usi page par rahta hai aur usko "Verification in Progress... Admin is verifying your payment" ka status dikhta hai.

7. **Admin Ke Paas Screenshot Aata Hai & Content Unlock:**
   - Admin ke panel par screenshot aur UTR number live alert ke sath aa jata hai.
   - Admin screenshot zoom karke dekhta hai aur **"Approve Access"** dabata hai.
   - User ki screen par turant exclusive 18+ content vault unlock ho jata hai!

---

## 💻 Kaise Run Karein (How to Start):

### 1. Terminal Me Run Karein:
```powershell
npm start
```
ya
```powershell
node server.js
```

### 2. Website Links:
- **User Link (Public):** [http://localhost:3000](http://localhost:3000)
- **Admin Control Panel:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Default Admin Password:** `admin123` (ise `.env` file me change kar sakte hain)

---

## ⚙️ Configuration (`.env`):
- `PORT`: 3000 (ya hosting port)
- `ADMIN_PASSWORD`: admin123
- `DEFAULT_PRICE`: 300

---

## 🌐 Online Deploy Kaise Karein (Live Hosting):
Ise aap Render.com, Railway.app, VPS, ya kisi bhi Node.js host par 1-click me deploy kar sakte hain.
WebSockets (Socket.io) enable hone ki wajah se sari cheezein bina page reload kiye instant real-time chalti hain!
