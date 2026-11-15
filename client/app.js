(() => {
  'use strict';

  // Embedded Google Apps Script Web App URL
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwaKbZsuZ9SNSsOmf0OeorMIRRlUh5poooa0vR8bt0MRegumU9BFReXwhGV88ak6D7G/exec';

  const STORAGE_KEYS = {
    GAS_URL: 'printlab_gas_url',
    SESSION: 'printlab_client_session',
    LOCAL_STUDENTS: 'printlab_local_students',
    LOCAL_BOOKINGS: 'printlab_local_bookings'
  };

  let currentStudent = null;
  let selectedFile = null;
  let deferredInstallPrompt = null;
  let swRegistration = null;
  let pollTimer = null;

  // DOM Elements
  const el = {
    btnInstallApp: document.getElementById('btn-install-app'),
    connDot: document.getElementById('conn-dot'),
    connLabel: document.getElementById('conn-label'),
    btnBackendSettings: document.getElementById('btn-backend-settings'),
    userControls: document.getElementById('user-controls'),
    userAvatar: document.getElementById('user-avatar'),
    userDisplayName: document.getElementById('user-display-name'),
    btnLogout: document.getElementById('btn-logout'),

    btnNotifications: document.getElementById('btn-notifications'),
    notifBadge: document.getElementById('notif-badge'),
    notifDropdown: document.getElementById('notif-dropdown'),
    notifList: document.getElementById('notif-list'),
    btnEnablePush: document.getElementById('btn-enable-push'),
    btnMarkRead: document.getElementById('btn-mark-read'),

    authSection: document.getElementById('auth-section'),
    portalSection: document.getElementById('portal-section'),
    authAlert: document.getElementById('auth-alert'),
    tabLogin: document.getElementById('tab-login'),
    tabRegister: document.getElementById('tab-register'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),

    navNewBooking: document.getElementById('nav-new-booking'),
    navMyBookings: document.getElementById('nav-my-bookings'),
    bookingsCountBadge: document.getElementById('bookings-count-badge'),
    portalTitle: document.getElementById('portal-title'),
    portalSubtitle: document.getElementById('portal-subtitle'),
    viewBooking: document.getElementById('view-booking'),
    viewHistory: document.getElementById('view-history'),

    bookingAlert: document.getElementById('booking-alert'),
    bookingForm: document.getElementById('booking-form'),
    btnSubmitBooking: document.getElementById('btn-submit-booking'),
    btnRefreshBookings: document.getElementById('btn-refresh-bookings'),
    bookingsList: document.getElementById('bookings-list'),

    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('f-stl-file'),
    dropzoneEmpty: document.getElementById('dropzone-empty'),
    dropzoneFilled: document.getElementById('dropzone-filled'),
    fileExtBadge: document.getElementById('file-ext-badge'),
    fileNameDisplay: document.getElementById('file-name-display'),
    fileSizeDisplay: document.getElementById('file-size-display'),
    btnRemoveFile: document.getElementById('btn-remove-file'),

    settingsModal: document.getElementById('settings-modal'),
    inputGasUrl: document.getElementById('input-gas-url'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnSaveGas: document.getElementById('btn-save-gas'),
    btnClearGas: document.getElementById('btn-clear-gas'),

    successModal: document.getElementById('success-modal'),
    successBookingId: document.getElementById('success-booking-id'),
    btnCloseSuccess: document.getElementById('btn-close-success'),
    btnViewMyBookings: document.getElementById('btn-view-my-bookings')
  };

  // --- PWA Registration & Install ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      swRegistration = reg;
    }).catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    el.btnInstallApp.classList.remove('hidden');
  });

  el.btnInstallApp.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el.btnInstallApp.classList.add('hidden');
  });

  // --- Helpers ---
  function getGasUrl() {
    return (localStorage.getItem(STORAGE_KEYS.GAS_URL) || DEFAULT_GAS_URL || '').trim();
  }

  function updateConnectionUI() {
    const url = getGasUrl();
    if (url) {
      el.connDot.classList.add('live');
      el.connLabel.textContent = 'Google Sheets Connected';
    } else {
      el.connDot.classList.remove('live');
      el.connLabel.textContent = 'Local Preview';
    }
  }

  function validateSingleName(value, label) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return { valid: false, error: `${label} is required.` };
    if (trimmed.includes(',')) {
      return { valid: false, error: `${label} must be one name only (no commas allowed).` };
    }
    if (/\s/.test(trimmed)) {
      return { valid: false, error: `${label} must be a single name with no spaces.` };
    }
    return { valid: true, value: trimmed };
  }

  function showAlert(targetEl, msg, type = 'error') {
    targetEl.textContent = msg;
    targetEl.className = `alert alert-${type}`;
    targetEl.classList.remove('hidden');
  }

  function hideAlert(targetEl) {
    targetEl.classList.add('hidden');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  }

  function formatCurrency(val) {
    return '₱ ' + Number(val).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Push & In-App Notifications ---
  function getNotifKey() {
    return currentStudent ? `printlab_notifs_${currentStudent.studentId}` : null;
  }

  function getSnapshotKey() {
    return currentStudent ? `printlab_snap_${currentStudent.studentId}` : null;
  }

  function loadNotifications() {
    const key = getNotifKey();
    if (!key) return [];
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  function saveNotifications(list) {
    const key = getNotifKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
    renderNotifications();
  }

  function renderNotifications() {
    const list = loadNotifications();
    const unreadCount = list.filter(n => !n.read).length;
    el.notifBadge.textContent = unreadCount;
    el.notifBadge.classList.toggle('hidden', unreadCount === 0);

    if (!list.length) {
      el.notifList.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
      return;
    }

    el.notifList.innerHTML = list.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        <div class="notif-item-body">${escapeHtml(n.body)}</div>
        <div class="notif-item-time">${new Date(n.time).toLocaleString()}</div>
      </div>
    `).join('');
  }

  function showToast(title, body) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 6500);
  }

  async function firePushNotification(title, body) {
    const list = loadNotifications();
    list.unshift({
      id: Date.now() + Math.random(),
      title,
      body,
      time: new Date().toISOString(),
      read: false
    });
    saveNotifications(list);
    showToast(title, body);

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if (swRegistration && swRegistration.showNotification) {
          await swRegistration.showNotification(title, {
            body,
            icon: './icon.svg',
            badge: './icon.svg',
            tag: 'printlab-update'
          });
        } else {
          new Notification(title, { body, icon: './icon.svg' });
        }
      } catch {
        // Fallback already handled by in-app toast
      }
    }
  }

  function updatePushButtonUI() {
    if (!('Notification' in window)) {
      el.btnEnablePush.classList.add('hidden');
      return;
    }
    if (Notification.permission === 'granted') {
      el.btnEnablePush.textContent = 'Push Enabled';
      el.btnEnablePush.disabled = true;
    } else if (Notification.permission === 'denied') {
      el.btnEnablePush.textContent = 'Push Blocked';
      el.btnEnablePush.disabled = true;
    } else {
      el.btnEnablePush.textContent = 'Enable Push';
      el.btnEnablePush.disabled = false;
    }
  }

  el.btnEnablePush.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    updatePushButtonUI();
    if (perm === 'granted') {
      firePushNotification('Push Notifications Active', 'You will be notified when the admin updates your print specs or payment.');
    }
  });

  el.btnNotifications.addEventListener('click', (e) => {
    e.stopPropagation();
    el.notifDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!el.notifDropdown.classList.contains('hidden') && !e.target.closest('.notif-wrap')) {
      el.notifDropdown.classList.add('hidden');
    }
  });

  el.btnMarkRead.addEventListener('click', () => {
    const list = loadNotifications().map(n => ({ ...n, read: true }));
    saveNotifications(list);
  });

  function checkForAdminUpdates(bookings) {
    const snapKey = getSnapshotKey();
    if (!snapKey) return;

    let prevMap = {};
    try {
      prevMap = JSON.parse(localStorage.getItem(snapKey) || '{}');
    } catch {
      prevMap = {};
    }

    const nextMap = {};
    const isFirstSync = Object.keys(prevMap).length === 0;

    for (const b of bookings) {
      const curr = {
        estimatedWeightGrams: b.estimatedWeightGrams ?? '',
        estimatedHours: b.estimatedHours ?? '',
        estimatedMinutes: b.estimatedMinutes ?? '',
        supportRequired: b.supportRequired ?? '',
        jobStatus: b.jobStatus ?? '',
        priceToPay: b.priceToPay ?? '',
        paymentStatus: b.paymentStatus ?? '',
        adminNotes: b.adminNotes ?? ''
      };
      nextMap[b.bookingId] = curr;

      const prev = prevMap[b.bookingId];
      if (!prev && isFirstSync) continue;

      if (prev) {
        const specsChanged =
          prev.estimatedWeightGrams !== curr.estimatedWeightGrams ||
          prev.estimatedHours !== curr.estimatedHours ||
          prev.estimatedMinutes !== curr.estimatedMinutes ||
          prev.supportRequired !== curr.supportRequired ||
          prev.jobStatus !== curr.jobStatus ||
          prev.adminNotes !== curr.adminNotes;

        if (specsChanged) {
          const parts = [];
          if (curr.estimatedWeightGrams !== '') parts.push(`Weight: ${curr.estimatedWeightGrams}g`);
          if (curr.estimatedHours !== '' || curr.estimatedMinutes !== '') {
            parts.push(`Duration: ${curr.estimatedHours || 0}h ${curr.estimatedMinutes || 0}m`);
          }
          if (curr.supportRequired) parts.push(`Supports: ${curr.supportRequired}`);
          parts.push(`Status: ${curr.jobStatus}`);
          if (curr.adminNotes) parts.push(`Note: ${curr.adminNotes}`);

          firePushNotification(
            `Admin Update (${b.bookingId})`,
            parts.join(' · ')
          );
        }

        const priceChanged = prev.priceToPay !== curr.priceToPay && curr.priceToPay !== '' && curr.priceToPay !== null;
        const payStatusChanged = prev.paymentStatus !== curr.paymentStatus;

        if (priceChanged || payStatusChanged) {
          const amountText = curr.priceToPay !== '' && curr.priceToPay !== null
            ? formatCurrency(curr.priceToPay)
            : 'Pending';
          firePushNotification(
            `Payment Update (${b.bookingId})`,
            `Amount to pay: ${amountText} · Status: ${curr.paymentStatus}`
          );
        }
      }
    }

    localStorage.setItem(snapKey, JSON.stringify(nextMap));
  }

  // --- API Adapter ---
  async function apiCall(action, payload = {}) {
    const gasUrl = getGasUrl();
    if (gasUrl) {
      const res = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Apps Script returned an unexpected response. Ensure Code.gs is deployed as a Web App with "Who has access: Anyone".');
      }
    }
    return localApiHandler(action, payload);
  }

  function localApiHandler(action, payload) {
    const students = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_STUDENTS) || '[]');
    const bookings = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_BOOKINGS) || '[]');

    if (action === 'register') {
      const fn = validateSingleName(payload.firstName, 'First Name');
      if (!fn.valid) return { ok: false, error: fn.error };
      const ln = validateSingleName(payload.lastName, 'Last Name (Password)');
      if (!ln.valid) return { ok: false, error: ln.error };

      if (students.some(s => s.firstName.toLowerCase() === fn.value.toLowerCase())) {
        return { ok: false, error: 'An account with this First Name already exists. Please sign in.' };
      }

      const student = {
        studentId: 'STU-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
        firstName: fn.value,
        lastName: ln.value,
        fullName: `${fn.value} ${ln.value}`,
        gradeSection: String(payload.gradeSection || '').trim(),
        phone: String(payload.phone || '').trim()
      };
      students.push(student);
      localStorage.setItem(STORAGE_KEYS.LOCAL_STUDENTS, JSON.stringify(students));
      return { ok: true, student };
    }

    if (action === 'login') {
      const fn = validateSingleName(payload.firstName, 'First Name');
      if (!fn.valid) return { ok: false, error: fn.error };
      const ln = validateSingleName(payload.lastName, 'Last Name (Password)');
      if (!ln.valid) return { ok: false, error: ln.error };

      const found = students.find(
        s => s.firstName.toLowerCase() === fn.value.toLowerCase() &&
             s.lastName.toLowerCase() === ln.value.toLowerCase()
      );
      if (!found) {
        return { ok: false, error: 'Invalid First Name or Last Name password. Please register first.' };
      }
      return { ok: true, student: found };
    }

    if (action === 'createBooking') {
      const bookingId = '3DP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const now = new Date().toISOString();
      const record = {
        bookingId,
        createdAt: now,
        studentId: payload.student.studentId,
        firstName: payload.student.firstName,
        lastName: payload.student.lastName,
        fullName: payload.fullName,
        gradeSection: payload.gradeSection,
        phone: payload.phone,
        bookingDate: payload.bookingDate,
        checklist: payload.checklist,
        printerAssigned: payload.printerAssigned || 'Bambulab A1',
        filamentType: payload.filamentType || 'PETG',
        filamentColor: payload.filamentColor || 'Any',
        estimatedWeightGrams: '',
        estimatedHours: '',
        estimatedMinutes: '',
        supportRequired: '',
        purpose: payload.purpose,
        signatureName: payload.signatureName,
        signatureDate: payload.signatureDate,
        fileName: payload.file.name,
        fileSizeBytes: payload.file.size,
        localFileBase64: payload.file.base64,
        downloadUrl: '',
        jobStatus: 'Pending Review',
        priceToPay: null,
        paymentStatus: 'Unpaid',
        adminNotes: '',
        updatedAt: now
      };
      bookings.unshift(record);
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_BOOKINGS, JSON.stringify(bookings));
      } catch {
        return { ok: false, error: 'File too large for Local Preview storage. Connect Google Apps Script for large STL files.' };
      }
      return { ok: true, bookingId };
    }

    if (action === 'getMyBookings') {
      const mine = bookings.filter(b => b.studentId === payload.studentId);
      return { ok: true, bookings: mine };
    }

    return { ok: false, error: 'Unsupported action' };
  }

  // --- Auth Flow ---
  function switchAuthTab(mode) {
    hideAlert(el.authAlert);
    const isLogin = mode === 'login';
    el.tabLogin.classList.toggle('active', isLogin);
    el.tabRegister.classList.toggle('active', !isLogin);
    el.tabLogin.setAttribute('aria-selected', isLogin);
    el.tabRegister.setAttribute('aria-selected', !isLogin);
    el.loginForm.classList.toggle('hidden', !isLogin);
    el.registerForm.classList.toggle('hidden', isLogin);
  }

  el.tabLogin.addEventListener('click', () => switchAuthTab('login'));
  el.tabRegister.addEventListener('click', () => switchAuthTab('register'));

  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const isPw = target.type === 'password';
      target.type = isPw ? 'text' : 'password';
      btn.textContent = isPw ? 'Hide' : 'Show';
    });
  });

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(el.authAlert);
    const firstName = document.getElementById('login-first-name').value;
    const lastName = document.getElementById('login-last-name').value;

    const btn = document.getElementById('btn-login-submit');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const res = await apiCall('login', { firstName, lastName });
      if (!res.ok) {
        showAlert(el.authAlert, res.error);
      } else {
        setSession(res.student);
      }
    } catch (err) {
      showAlert(el.authAlert, err.message || 'Connection error.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In to Portal';
    }
  });

  el.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(el.authAlert);
    const firstName = document.getElementById('reg-first-name').value;
    const lastName = document.getElementById('reg-last-name').value;
    const gradeSection = document.getElementById('reg-grade').value;
    const phone = document.getElementById('reg-phone').value;

    const btn = document.getElementById('btn-register-submit');
    btn.disabled = true;
    btn.textContent = 'Creating Account...';
    try {
      const res = await apiCall('register', { firstName, lastName, gradeSection, phone });
      if (!res.ok) {
        showAlert(el.authAlert, res.error);
      } else {
        setSession(res.student);
      }
    } catch (err) {
      showAlert(el.authAlert, err.message || 'Connection error.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Student Account';
    }
  });

  function setSession(student) {
    currentStudent = student;
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(student));
    enterPortal();
  }

  function logout() {
    currentStudent = null;
    if (pollTimer) clearInterval(pollTimer);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    el.portalSection.classList.add('hidden');
    el.userControls.classList.add('hidden');
    el.authSection.classList.remove('hidden');
    el.loginForm.reset();
    el.registerForm.reset();
    hideAlert(el.authAlert);
  }

  el.btnLogout.addEventListener('click', logout);

  function enterPortal() {
    el.authSection.classList.add('hidden');
    el.portalSection.classList.remove('hidden');
    el.userControls.classList.remove('hidden');

    el.userDisplayName.textContent = currentStudent.fullName;
    el.userAvatar.textContent = currentStudent.firstName.charAt(0).toUpperCase();

    document.getElementById('f-full-name').value = currentStudent.fullName;
    if (currentStudent.gradeSection) {
      document.getElementById('f-grade-section').value = currentStudent.gradeSection;
    }
    if (currentStudent.phone) {
      document.getElementById('f-phone').value = currentStudent.phone;
    }
    setFormDefaults();
    updatePushButtonUI();
    renderNotifications();
    switchPortalView('booking');
    loadMyBookings();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(loadMyBookings, 15000);
  }

  window.addEventListener('focus', () => {
    if (currentStudent) loadMyBookings();
  });

  window.addEventListener('storage', (e) => {
    if (currentStudent && e.key === STORAGE_KEYS.LOCAL_BOOKINGS) {
      loadMyBookings();
    }
  });

  function setFormDefaults() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    document.getElementById('f-booking-date').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('f-sig-date').value = `${mm}/${dd}/${yyyy}`;
    document.getElementById('f-printer').value = 'Bambulab A1';
    document.getElementById('f-filament-type').value = 'PETG';
    if (!document.getElementById('f-filament-color').value.trim()) {
      document.getElementById('f-filament-color').value = 'Any';
    }
  }

  // --- Portal Navigation ---
  function switchPortalView(view) {
    const isBooking = view === 'booking';
    const isEstimator = view === 'estimator';
    const isHistory = view === 'history';

    const navEstimator = document.getElementById('nav-estimator');
    const viewEstimator = document.getElementById('view-estimator');

    el.navNewBooking.classList.toggle('active', isBooking);
    if (navEstimator) navEstimator.classList.toggle('active', isEstimator);
    el.navMyBookings.classList.toggle('active', isHistory);

    el.viewBooking.classList.toggle('hidden', !isBooking);
    if (viewEstimator) viewEstimator.classList.toggle('hidden', !isEstimator);
    el.viewHistory.classList.toggle('hidden', !isHistory);

    if (isBooking) {
      el.portalTitle.textContent = 'New Print Job Request';
      el.portalSubtitle.textContent = 'Complete all sections below and attach your STL or 3MF model.';
    } else if (isEstimator) {
      el.portalTitle.textContent = '3D Print Cost Estimator';
      el.portalSubtitle.textContent = 'Upload an STL or configure your project for an instant estimate in Philippine Pesos (₱).';
      if (typeof calculateEstimator === 'function') calculateEstimator();
    } else {
      el.portalTitle.textContent = 'My Bookings & Material Fees';
      el.portalSubtitle.textContent = 'Check your admin-assessed print specs, job status, and amount to pay.';
      loadMyBookings();
    }
  }

  el.navNewBooking.addEventListener('click', () => switchPortalView('booking'));
  const navEstBtn = document.getElementById('nav-estimator');
  if (navEstBtn) navEstBtn.addEventListener('click', () => switchPortalView('estimator'));
  el.navMyBookings.addEventListener('click', () => switchPortalView('history'));

  // --- File Dropzone ---
  function handleFileSelection(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['stl', '3mf'].includes(ext)) {
      showAlert(el.bookingAlert, 'Invalid file type. Only .STL or .3MF files are allowed.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showAlert(el.bookingAlert, 'File exceeds the 20 MB limit.');
      return;
    }
    hideAlert(el.bookingAlert);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      selectedFile = {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        base64
      };
      el.fileExtBadge.textContent = ext.toUpperCase();
      el.fileNameDisplay.textContent = file.name;
      el.fileSizeDisplay.textContent = formatBytes(file.size);
      el.dropzoneEmpty.classList.add('hidden');
      el.dropzoneFilled.classList.remove('hidden');

      if (ext === 'stl' && typeof analyzeInlineSTLFile === 'function') {
        analyzeInlineSTLFile(file);
      } else {
        const inlineCard = document.getElementById('stl-inline-estimator');
        if (inlineCard) inlineCard.classList.add('hidden');
      }
    };
    reader.readAsDataURL(file);
  }

  function clearSelectedFile() {
    selectedFile = null;
    inlineParsedSTL = null;
    el.fileInput.value = '';
    el.dropzoneEmpty.classList.remove('hidden');
    el.dropzoneFilled.classList.add('hidden');
    const inlineCard = document.getElementById('stl-inline-estimator');
    if (inlineCard) inlineCard.classList.add('hidden');
  }

  el.dropzone.addEventListener('click', (e) => {
    if (e.target === el.btnRemoveFile) return;
    el.fileInput.click();
  });

  el.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.fileInput.click();
    }
  });

  el.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropzone.classList.add('dragover');
  });

  el.dropzone.addEventListener('dragleave', () => {
    el.dropzone.classList.remove('dragover');
  });

  el.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  el.fileInput.addEventListener('change', () => {
    if (el.fileInput.files.length) {
      handleFileSelection(el.fileInput.files[0]);
    }
  });

  el.btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  function showBookingError(msg) {
    showAlert(el.bookingAlert, msg, 'error');
    el.bookingAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Submission Notice', msg);
  }

  // --- Booking Submission ---
  el.bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(el.bookingAlert);

    if (!selectedFile) {
      showBookingError('Please upload your .STL or .3MF file before submitting.');
      return;
    }

    const chkNames = ['chk_format', 'chk_bedVolume', 'chk_orientation', 'chk_slicer', 'chk_bedClean'];
    for (const name of chkNames) {
      if (!el.bookingForm.querySelector(`input[name="${name}"]:checked`)) {
        showBookingError('Please complete all 5 items in the Design & Model Pre-Check Checklist.');
        return;
      }
    }

    if (!el.bookingForm.checkValidity()) {
      el.bookingForm.reportValidity();
      showBookingError('Please fill in all required fields and check the Lab Rules agreement.');
      return;
    }

    const payload = {
      student: currentStudent,
      fullName: document.getElementById('f-full-name').value.trim(),
      gradeSection: document.getElementById('f-grade-section').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      bookingDate: document.getElementById('f-booking-date').value,
      checklist: {
        format: el.bookingForm.querySelector('input[name="chk_format"]:checked').value === 'Yes',
        bedVolume: el.bookingForm.querySelector('input[name="chk_bedVolume"]:checked').value === 'Yes',
        orientation: el.bookingForm.querySelector('input[name="chk_orientation"]:checked').value === 'Yes',
        slicer: el.bookingForm.querySelector('input[name="chk_slicer"]:checked').value === 'Yes',
        bedClean: el.bookingForm.querySelector('input[name="chk_bedClean"]:checked').value === 'Yes'
      },
      printerAssigned: document.getElementById('f-printer').value,
      filamentType: document.getElementById('f-filament-type').value,
      filamentColor: document.getElementById('f-filament-color').value.trim() || 'Any',
      purpose: document.getElementById('f-purpose').value.trim(),
      signatureName: document.getElementById('f-sig-name').value.trim(),
      signatureDate: document.getElementById('f-sig-date').value.trim(),
      file: selectedFile
    };

    el.btnSubmitBooking.disabled = true;
    el.btnSubmitBooking.textContent = 'Uploading & Submitting...';

    try {
      const res = await apiCall('createBooking', payload);
      if (!res.ok) {
        if (String(res.error || '').toLowerCase().includes('authentication')) {
          logout();
          showAlert(el.authAlert, 'Your session was not found on the server. Please sign in or register again.');
          return;
        }
        showBookingError(res.error || 'Submission failed.');
      } else {
        el.successBookingId.textContent = res.bookingId;
        el.successModal.classList.remove('hidden');
        showToast('Booking Submitted', `Reference ${res.bookingId} uploaded successfully.`);
        el.bookingForm.reset();
        clearSelectedFile();
        document.getElementById('f-full-name').value = currentStudent.fullName;
        document.getElementById('f-filament-color').value = 'Any';
        setFormDefaults();
        loadMyBookings();
      }
    } catch (err) {
      showBookingError(err.message || 'Network error while submitting.');
    } finally {
      el.btnSubmitBooking.disabled = false;
      el.btnSubmitBooking.textContent = 'Submit Booking & Upload STL';
    }
  });

  // --- My Bookings & Fees ---
  async function loadMyBookings() {
    if (!currentStudent) return;
    try {
      const res = await apiCall('getMyBookings', {
        studentId: currentStudent.studentId,
        firstName: currentStudent.firstName,
        lastName: currentStudent.lastName
      });
      if (!res.ok) {
        if (String(res.error || '').toLowerCase().includes('unauthorized')) {
          logout();
          showAlert(el.authAlert, 'Session expired or invalid. Please sign in or register again.');
        }
        return;
      }
      const list = res.bookings || [];
      el.bookingsCountBadge.textContent = list.length;
      el.bookingsCountBadge.classList.toggle('hidden', list.length === 0);
      checkForAdminUpdates(list);
      renderBookings(list);
    } catch (err) {
      console.error(err);
    }
  }

  function statusBadgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('pending')) return 'badge-pending';
    if (s.includes('approved')) return 'badge-approved';
    if (s.includes('printing')) return 'badge-printing';
    if (s.includes('ready')) return 'badge-ready';
    if (s.includes('completed')) return 'badge-completed';
    if (s.includes('rejected')) return 'badge-rejected';
    return 'badge-pending';
  }

  function renderBookings(bookings) {
    if (!bookings.length) {
      el.bookingsList.innerHTML = `
        <div class="empty-state">
          <p><strong>No print bookings yet.</strong></p>
          <p class="muted">Submit your first 3D print job request in the New Booking tab.</p>
        </div>
      `;
      return;
    }

    el.bookingsList.innerHTML = bookings.map(b => {
      const hasPrice = b.priceToPay !== null && b.priceToPay !== '' && !isNaN(b.priceToPay);
      const priceHtml = hasPrice
        ? `<div class="bk-price-val">${formatCurrency(b.priceToPay)}</div>`
        : `<div class="bk-price-val pending">Awaiting Quote</div>`;

      const payBadge = b.paymentStatus === 'Paid'
        ? `<span class="badge badge-paid">Paid</span>`
        : `<span class="badge badge-unpaid">Unpaid</span>`;

      const hasWeight = b.estimatedWeightGrams !== '' && b.estimatedWeightGrams !== null && b.estimatedWeightGrams !== undefined;
      const hasDur = (b.estimatedHours !== '' && b.estimatedHours !== undefined) || (b.estimatedMinutes !== '' && b.estimatedMinutes !== undefined);
      const specsText = hasWeight || hasDur || b.supportRequired
        ? `${hasWeight ? b.estimatedWeightGrams + 'g' : '—g'} · ${hasDur ? (b.estimatedHours || 0) + 'h ' + (b.estimatedMinutes || 0) + 'm' : '—'} · Supports: ${b.supportRequired || '—'}`
        : 'Weight, duration &amp; supports: Pending Admin Review';

      const notesHtml = b.adminNotes
        ? `<div class="bk-notes"><strong>Admin Note:</strong> ${escapeHtml(b.adminNotes)}</div>`
        : '';

      return `
        <article class="booking-card">
          <div>
            <div class="bk-top">
              <span class="bk-id">${escapeHtml(b.bookingId)}</span>
              <span class="badge ${statusBadgeClass(b.jobStatus)}">${escapeHtml(b.jobStatus)}</span>
              <span class="mono-note">${escapeHtml(b.bookingDate)}</span>
            </div>
            <h3 class="bk-title">${escapeHtml(b.fileName)}</h3>
            <div class="bk-meta">
              <span>${escapeHtml(b.printerAssigned)}</span>
              <span>${escapeHtml(b.filamentType)} (${escapeHtml(b.filamentColor)})</span>
              <span class="mono">${specsText}</span>
            </div>
            ${notesHtml}
          </div>
          <div class="bk-price-box">
            <div class="bk-price-label">Amount to Pay</div>
            ${priceHtml}
            ${payBadge}
          </div>
        </article>
      `;
    }).join('');
  }

  el.btnRefreshBookings.addEventListener('click', loadMyBookings);

  // --- Modals ---
  el.btnBackendSettings.addEventListener('click', () => {
    el.inputGasUrl.value = getGasUrl();
    el.settingsModal.classList.remove('hidden');
  });

  el.btnCloseSettings.addEventListener('click', () => el.settingsModal.classList.add('hidden'));

  el.btnSaveGas.addEventListener('click', () => {
    const val = el.inputGasUrl.value.trim();
    if (val) {
      if (!val.startsWith('https://script.google.com/macros/s/')) {
        alert('Please enter a valid Google Apps Script Web App URL (https://script.google.com/macros/s/...).');
        return;
      }
      localStorage.setItem(STORAGE_KEYS.GAS_URL, val);
    } else {
      localStorage.removeItem(STORAGE_KEYS.GAS_URL);
    }
    updateConnectionUI();
    el.settingsModal.classList.add('hidden');
  });

  el.btnClearGas.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.GAS_URL);
    el.inputGasUrl.value = '';
    updateConnectionUI();
    el.settingsModal.classList.add('hidden');
  });

  el.btnCloseSuccess.addEventListener('click', () => el.successModal.classList.add('hidden'));
  el.btnViewMyBookings.addEventListener('click', () => {
    el.successModal.classList.add('hidden');
    switchPortalView('history');
  });

  // --- Client-side STL Parser (Binary & ASCII) & Cost Estimators ---
  let inlineParsedSTL = null;
  let estUploadedSTL = null;
  let estPendingFile = null;
  let estCurrentTab = 'stl';
  let estLastQuoteText = '';

  function parseSTLBuffer(buffer) {
    const view = new DataView(buffer);
    let isBinary = false;
    if (buffer.byteLength >= 84) {
      const triCount = view.getUint32(80, true);
      if (84 + triCount * 50 === buffer.byteLength) isBinary = true;
    }

    let vol = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    function updateBounds(x, y, z) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    function signedTriVol(p1, p2, p3) {
      return (p1.x * (p2.y * p3.z - p3.y * p2.z)
            - p2.x * (p1.y * p3.z - p3.y * p1.z)
            + p3.x * (p1.y * p2.z - p2.y * p1.z)) / 6.0;
    }

    if (isBinary) {
      const triCount = view.getUint32(80, true);
      let offset = 84;
      for (let i = 0; i < triCount; i++) {
        const p1 = { x: view.getFloat32(offset + 12, true), y: view.getFloat32(offset + 16, true), z: view.getFloat32(offset + 20, true) };
        const p2 = { x: view.getFloat32(offset + 24, true), y: view.getFloat32(offset + 28, true), z: view.getFloat32(offset + 32, true) };
        const p3 = { x: view.getFloat32(offset + 36, true), y: view.getFloat32(offset + 40, true), z: view.getFloat32(offset + 44, true) };
        updateBounds(p1.x, p1.y, p1.z);
        updateBounds(p2.x, p2.y, p2.z);
        updateBounds(p3.x, p3.y, p3.z);
        vol += signedTriVol(p1, p2, p3);
        offset += 50;
      }
    } else {
      const text = new TextDecoder().decode(buffer);
      const regex = /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
      const verts = [];
      let m;
      while ((m = regex.exec(text)) !== null) {
        const p = { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
        updateBounds(p.x, p.y, p.z);
        verts.push(p);
        if (verts.length === 3) {
          vol += signedTriVol(verts[0], verts[1], verts[2]);
          verts.length = 0;
        }
      }
    }

    if (!isFinite(minX)) return null;
    return {
      volumeCm3: Math.abs(vol) / 1000.0,
      dims: {
        x: Math.round(maxX - minX),
        y: Math.round(maxY - minY),
        z: Math.round(maxZ - minZ)
      }
    };
  }

  function fmtPeso(n) {
    return '₱' + Math.round(n).toLocaleString('en-PH');
  }

  function getMaterialDensity(mat) {
    const key = String(mat || '').toLowerCase();
    if (key === 'petg') return 1.27;
    if (key === 'abs') return 1.04;
    if (key === 'tpu') return 1.21;
    return 1.24; // PLA / Silk
  }

  function analyzeInlineSTLFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseSTLBuffer(ev.target.result);
      const inlineCard = document.getElementById('stl-inline-estimator');
      if (!parsed || parsed.volumeCm3 <= 0) {
        inlineParsedSTL = null;
        if (inlineCard) inlineCard.classList.add('hidden');
        return;
      }
      inlineParsedSTL = { name: file.name, volumeCm3: parsed.volumeCm3, dims: parsed.dims };
      if (inlineCard) inlineCard.classList.remove('hidden');
      updateInlineSTLEstimate();
    };
    reader.readAsArrayBuffer(file);
  }

  function updateInlineSTLEstimate() {
    if (!inlineParsedSTL) return;
    const filamentEl = document.getElementById('f-filament-type');
    const printerEl = document.getElementById('f-printer');
    const infillEl = document.getElementById('inline-stl-infill');
    const qualityEl = document.getElementById('inline-stl-quality');
    const supportEl = document.getElementById('inline-stl-support');

    const mat = filamentEl ? filamentEl.value.toLowerCase() : 'petg';
    const printer = printerEl ? printerEl.value : 'Bambulab A1';
    const infill = infillEl ? (parseFloat(infillEl.value) || 0.15) : 0.15;
    const qual = qualityEl ? (parseFloat(qualityEl.value) || 0) : 0;
    const addSupport = supportEl ? supportEl.checked : true;

    const density = getMaterialDensity(mat);
    const effectiveFill = Math.min(1.0, 0.22 + (infill * 0.78));
    let estGrams = inlineParsedSTL.volumeCm3 * effectiveFill * density;
    if (addSupport) estGrams *= 1.25;
    estGrams = Math.max(1, Math.round(estGrams));

    // Student rate: ₱1.00/g for PLA, ₱2.50/g for PETG/ABS/TPU/Other, ₱50 min order
    const baseRate = (mat === 'pla') ? 1.0 : 2.5;
    const rate = baseRate + qual;
    const rawCost = estGrams * rate;
    const estCost = Math.max(50, rawCost);
    const minApplied = rawCost < 50;

    const d = inlineParsedSTL.dims;
    document.getElementById('inline-stl-meta').textContent =
      `${d.x} × ${d.y} × ${d.z} mm · Volume: ${inlineParsedSTL.volumeCm3.toFixed(1)} cm³`;
    document.getElementById('inline-stl-price').textContent = fmtPeso(estCost);
    document.getElementById('inline-stl-dp').textContent = `50% DP: ${fmtPeso(estCost * 0.5)}`;
    document.getElementById('inline-stl-breakdown').textContent =
      `Est. weight: ${estGrams} g (${mat.toUpperCase()} @ ₱${rate.toFixed(2)}/g${minApplied ? ', ₱50 min. order' : ''}). Final fee confirmed by Lab Admin after slicing.`;

    const warnEl = document.getElementById('inline-stl-bed-warn');
    if (warnEl) {
      const limit = printer.includes('mini') ? 180 : 256;
      const oversized = d.x > limit || d.y > limit || d.z > limit;
      warnEl.classList.remove('hidden', 'ok');
      if (oversized) {
        warnEl.textContent = `⚠ Model (${d.x}×${d.y}×${d.z} mm) exceeds ${printer} bed (${limit}×${limit}×${limit} mm) — may need scaling or splitting.`;
      } else {
        warnEl.classList.add('ok');
        warnEl.textContent = `✓ Fits within ${printer} build volume (${limit}×${limit}×${limit} mm).`;
      }
    }
  }

  ['inline-stl-infill', 'inline-stl-quality', 'inline-stl-support', 'f-filament-type', 'f-printer'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('change', updateInlineSTLEstimate);
  });

  // --- Full Interactive Cost Estimator Tab ---
  function syncEstRange(prefix, val) {
    const num = Math.max(1, parseInt(val, 10) || 1);
    const rangeEl = document.getElementById(prefix + '-range');
    const numEl = document.getElementById(prefix);
    if (rangeEl) rangeEl.value = Math.min(num, parseInt(rangeEl.max, 10) || 1000);
    if (numEl) numEl.value = num;
    calculateEstimator();
  }

  function recalcEstimatorFromSTL() {
    if (!estUploadedSTL) return;
    const mat = document.getElementById('est-stl-material').value;
    const infill = parseFloat(document.getElementById('est-stl-infill').value) || 0.15;
    const addSupport = document.getElementById('est-stl-support').checked;

    const density = getMaterialDensity(mat);
    const effectiveFill = Math.min(1.0, 0.22 + (infill * 0.78));
    let estGrams = estUploadedSTL.volumeCm3 * effectiveFill * density;
    if (addSupport) estGrams *= 1.25;
    estGrams = Math.max(1, Math.round(estGrams));

    document.getElementById('est-stl-weight-range').value = Math.min(estGrams, 1000);
    document.getElementById('est-stl-weight').value = estGrams;

    const d = estUploadedSTL.dims;
    const oversized = d.x > 180 || d.y > 180 || d.z > 180;
    const statsEl = document.getElementById('est-stl-stats');
    statsEl.classList.add('visible');
    statsEl.innerHTML =
      `<strong>✓ Loaded:</strong> ${escapeHtml(estUploadedSTL.name)}<br>` +
      `<strong>Dimensions:</strong> ${d.x} × ${d.y} × ${d.z} mm | <strong>Mesh Volume:</strong> ${estUploadedSTL.volumeCm3.toFixed(1)} cm³<br>` +
      `<strong>Estimated Weight:</strong> ${estGrams} g ${addSupport ? '(includes +25% support buffer)' : '(no support buffer)'}` +
      (oversized ? `<span class="warn-size">⚠ Exceeds 180×180×180 mm A1 mini bed — use Bambulab A1 (256mm) or scale.</span>` : '');
  }

  function calculateEstimator() {
    const linesEl = document.getElementById('est-quote-lines');
    if (!linesEl) return;

    let lines = [];
    let total = 0;

    if (estCurrentTab === 'stl') {
      const cust = document.getElementById('est-stl-customer').value;
      const mat = document.getElementById('est-stl-material').value;
      const weight = parseFloat(document.getElementById('est-stl-weight').value) || 0;
      const qual = parseFloat(document.getElementById('est-stl-quality').value) || 0;
      const rush = document.getElementById('est-stl-rush').checked;

      let rate = 5.0;
      if (cust === 'student') rate = (mat === 'pla') ? 1.0 : 2.5;
      else if (cust === 'b2b') rate = (mat === 'pla') ? 4.0 : 5.5;
      else rate = (mat === 'pla') ? 5.0 : 6.5;
      rate += qual;

      let printCost = weight * rate;
      const minOrder = (cust === 'student') ? 50 : 150;
      let minApplied = false;
      if (printCost < minOrder) {
        printCost = minOrder;
        minApplied = true;
      }

      lines.push(['Mode', 'STL-Ready Print']);
      lines.push(['Rate (' + mat.toUpperCase() + ')', fmtPeso(rate) + ' / g']);
      lines.push(['Weight', weight + ' g']);
      lines.push(['Print Subtotal' + (minApplied ? ' (Min. Order)' : ''), fmtPeso(printCost)]);

      total = printCost;
      if (rush) {
        const rushFee = total * 0.30;
        lines.push(['Rush Priority (+30%)', fmtPeso(rushFee)]);
        total += rushFee;
      }
    } else if (estCurrentTab === 'nocad') {
      const type = document.getElementById('est-nocad-type').value;
      const cust = document.getElementById('est-nocad-customer').value;
      const weight = parseFloat(document.getElementById('est-nocad-weight').value) || 0;
      const mat = document.getElementById('est-nocad-material').value;

      const cadMap = {
        proto_simple: { name: 'Simple Prototype CAD', fee: 400 },
        proto_mod: { name: 'Moderate Prototype CAD', fee: 1000 },
        proto_comp: { name: 'Complex Prototype CAD', fee: 2500 },
        part_simple: { name: 'Simple Part CAD', fee: 300 },
        part_mech: { name: 'Precision Part CAD (+Test Fits)', fee: 800 },
        sculpt_custom: { name: 'Custom 3D Sculpting', fee: 2200 }
      };

      let cadFee = cadMap[type].fee;
      if (cust === 'student') cadFee *= 0.75;
      const rate = (cust === 'student') ? (mat === 'pla' ? 1.0 : 2.5) : (mat === 'pla' ? 5.0 : 6.5);
      const printCost = Math.max(weight * rate, cust === 'student' ? 50 : 150);

      lines.push(['Service', cadMap[type].name]);
      lines.push(['Design / CAD Fee' + (cust === 'student' ? ' (25% Stu Off)' : ''), fmtPeso(cadFee)]);
      lines.push(['Print Cost (' + weight + 'g @ ₱' + rate.toFixed(2) + '/g)', fmtPeso(printCost)]);
      total = cadFee + printCost;
    } else {
      const tier = document.getElementById('est-fig-tier').value;
      const qty = parseInt(document.getElementById('est-fig-qty').value, 10) || 1;
      const finish = parseFloat(document.getElementById('est-fig-finish').value) || 0;
      const club = document.getElementById('est-fig-club').checked;

      const figMap = {
        giveaway: { name: 'Event Giveaway / Flexi', price: 140 },
        chibi: { name: '10cm Chibi Figure', price: 390 },
        display: { name: '15cm Display Figure', price: 850 },
        bust: { name: '22cm Collector Bust', price: 1750 }
      };

      const unitBase = figMap[tier].price + finish;
      let subtotal = unitBase * qty;
      let bulkDisc = 0;
      if (tier === 'giveaway' && qty >= 50) bulkDisc = 0.15;
      else if (tier === 'giveaway' && qty >= 20) bulkDisc = 0.10;

      lines.push(['Item', figMap[tier].name + ' × ' + qty]);
      lines.push(['Unit Price' + (finish > 0 ? ' (Painted)' : ' (Unpainted)'), fmtPeso(unitBase)]);
      if (bulkDisc > 0) {
        const dAmt = subtotal * bulkDisc;
        lines.push(['Bulk Discount (-' + (bulkDisc * 100) + '%)', '-' + fmtPeso(dAmt)]);
        subtotal -= dAmt;
      }
      if (club) {
        const cAmt = subtotal * 0.15;
        lines.push(["Collector's Club (-15%)", '-' + fmtPeso(cAmt)]);
        subtotal -= cAmt;
      }
      total = subtotal;
    }

    const dp = total * 0.5;
    linesEl.innerHTML = lines.map(
      ([k, v]) => `<div class="quote-line"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`
    ).join('');
    document.getElementById('est-quote-total').textContent = fmtPeso(total);
    document.getElementById('est-quote-dp').innerHTML = `50% GCash Downpayment to start: <strong>${fmtPeso(dp)}</strong>`;

    estLastQuoteText = `Hi Rion Martin 3D Printing! Here is my estimate:\n` +
      lines.map(([k, v]) => `• ${k}: ${v}`).join('\n') +
      `\nEstimated Total: ${fmtPeso(total)} (50% DP: ${fmtPeso(dp)})`;
  }

  function handleEstimatorSTLFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.stl')) {
      showToast('Invalid File', 'Please upload a valid .stl file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseSTLBuffer(ev.target.result);
      if (!parsed || parsed.volumeCm3 <= 0) {
        showToast('STL Parse Notice', 'Could not parse STL volume. Enter weight manually.');
        return;
      }
      estPendingFile = file;
      estUploadedSTL = { name: file.name, volumeCm3: parsed.volumeCm3, dims: parsed.dims };
      recalcEstimatorFromSTL();
      calculateEstimator();
    };
    reader.readAsArrayBuffer(file);
  }

  document.querySelectorAll('.est-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      estCurrentTab = btn.dataset.estTab;
      document.querySelectorAll('.est-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.est-panel').forEach((p) => p.classList.add('hidden'));
      const panel = document.getElementById('est-panel-' + estCurrentTab);
      if (panel) panel.classList.remove('hidden');
      calculateEstimator();
    });
  });

  const estDrop = document.getElementById('est-stl-dropzone');
  const estFileIn = document.getElementById('est-stl-input');
  if (estDrop && estFileIn) {
    estDrop.addEventListener('click', () => estFileIn.click());
    estDrop.addEventListener('dragover', (e) => { e.preventDefault(); estDrop.classList.add('dragover'); });
    estDrop.addEventListener('dragleave', () => estDrop.classList.remove('dragover'));
    estDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      estDrop.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleEstimatorSTLFile(e.dataTransfer.files[0]);
    });
    estFileIn.addEventListener('change', () => {
      if (estFileIn.files.length) handleEstimatorSTLFile(estFileIn.files[0]);
    });
  }

  ['est-stl-customer', 'est-stl-quality', 'est-stl-rush', 'est-nocad-type', 'est-nocad-customer', 'est-nocad-material', 'est-fig-tier', 'est-fig-finish', 'est-fig-club'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('change', calculateEstimator);
  });
  ['est-stl-material', 'est-stl-infill', 'est-stl-support'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('change', () => { recalcEstimatorFromSTL(); calculateEstimator(); });
  });

  const estWtRange = document.getElementById('est-stl-weight-range');
  const estWtNum = document.getElementById('est-stl-weight');
  if (estWtRange) estWtRange.addEventListener('input', (e) => syncEstRange('est-stl-weight', e.target.value));
  if (estWtNum) estWtNum.addEventListener('input', (e) => syncEstRange('est-stl-weight', e.target.value));

  const estNcRange = document.getElementById('est-nocad-weight-range');
  const estNcNum = document.getElementById('est-nocad-weight');
  if (estNcRange) estNcRange.addEventListener('input', (e) => syncEstRange('est-nocad-weight', e.target.value));
  if (estNcNum) estNcNum.addEventListener('input', (e) => syncEstRange('est-nocad-weight', e.target.value));

  const estQtyRange = document.getElementById('est-fig-qty-range');
  const estQtyNum = document.getElementById('est-fig-qty');
  if (estQtyRange) estQtyRange.addEventListener('input', (e) => syncEstRange('est-fig-qty', e.target.value));
  if (estQtyNum) estQtyNum.addEventListener('input', (e) => syncEstRange('est-fig-qty', e.target.value));

  const btnCopyQuote = document.getElementById('btn-copy-quote');
  if (btnCopyQuote) {
    btnCopyQuote.addEventListener('click', () => {
      if (navigator.clipboard && estLastQuoteText) {
        navigator.clipboard.writeText(estLastQuoteText).then(() => {
          const fb = document.getElementById('est-copy-feedback');
          if (fb) {
            fb.textContent = '✓ Quote copied! Paste it in FB Messenger to Rion Martin.';
            setTimeout(() => { fb.textContent = ''; }, 3500);
          }
        });
      }
    });
  }

  const btnUseInBooking = document.getElementById('btn-use-in-booking');
  if (btnUseInBooking) {
    btnUseInBooking.addEventListener('click', () => {
      const mat = document.getElementById('est-stl-material').value;
      const filamentSelect = document.getElementById('f-filament-type');
      if (filamentSelect) {
        if (mat === 'pla' || mat === 'silk') filamentSelect.value = 'PLA';
        else if (mat === 'petg') filamentSelect.value = 'PETG';
        else if (mat === 'abs') filamentSelect.value = 'ABS';
      }
      if (estPendingFile) {
        handleFileSelection(estPendingFile);
      }
      switchPortalView('booking');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- Init ---
  updateConnectionUI();
  calculateEstimator();
  const savedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
  if (savedSession) {
    try {
      currentStudent = JSON.parse(savedSession);
      if (currentStudent && currentStudent.studentId) {
        enterPortal();
      }
    } catch {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
  }
})();
