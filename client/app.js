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

  const INSTALL_DISMISS_KEY = '3dp_client_install_dismissed';
  const installBanner = document.getElementById('install-banner');
  const btnBannerInstall = document.getElementById('btn-banner-install');
  const btnBannerDismiss = document.getElementById('btn-banner-dismiss');
  const installManualGuide = document.getElementById('install-manual-guide');

  function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function showInstallBannerIfFirstTime() {
    if (!installBanner) return;
    if (isAppInstalled() || localStorage.getItem(INSTALL_DISMISS_KEY) === '1') {
      installBanner.classList.add('hidden');
      return;
    }
    installBanner.classList.remove('hidden');
  }

  async function triggerInstallFlow() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      el.btnInstallApp.classList.add('hidden');
      if (choice && choice.outcome === 'accepted') {
        localStorage.setItem(INSTALL_DISMISS_KEY, '1');
        if (installBanner) installBanner.classList.add('hidden');
      }
    } else if (installManualGuide) {
      installManualGuide.classList.toggle('hidden');
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    el.btnInstallApp.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    el.btnInstallApp.classList.add('hidden');
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    if (installBanner) installBanner.classList.add('hidden');
  });

  el.btnInstallApp.addEventListener('click', triggerInstallFlow);
  if (btnBannerInstall) btnBannerInstall.addEventListener('click', triggerInstallFlow);
  if (btnBannerDismiss) {
    btnBannerDismiss.addEventListener('click', () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
      if (installBanner) installBanner.classList.add('hidden');
    });
  }

  showInstallBannerIfFirstTime();

  // --- Helpers ---
  function getGasUrl() {
    const stored = localStorage.getItem(STORAGE_KEYS.GAS_URL);
    if (stored === '__LOCAL__') return '';
    return (stored || DEFAULT_GAS_URL || '').trim();
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
    return String(str ?? '')
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
    document.getElementById('f-sig-date').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('f-printer').value = 'Bambulab A1';
    document.getElementById('f-filament-type').value = 'PETG';
    if (!document.getElementById('f-filament-color').value.trim()) {
      document.getElementById('f-filament-color').value = 'Any';
    }
    ['chk_format', 'chk_bedVolume', 'chk_orientation', 'chk_slicer', 'chk_bedClean'].forEach((name) => {
      const yesRadio = el.bookingForm.querySelector(`input[name="${name}"][value="Yes"]`);
      if (yesRadio) yesRadio.checked = true;
    });
    updateStepProgress();
  }

  // --- Portal Navigation ---
  function switchPortalView(view) {
    const isBooking = view === 'booking';
    el.navNewBooking.classList.toggle('active', isBooking);
    el.navMyBookings.classList.toggle('active', !isBooking);
    el.viewBooking.classList.toggle('hidden', !isBooking);
    el.viewHistory.classList.toggle('hidden', isBooking);

    if (isBooking) {
      el.portalTitle.textContent = 'New Print Job Request';
      el.portalSubtitle.textContent = 'Complete all sections below and attach your STL or 3MF model.';
    } else {
      el.portalTitle.textContent = 'My Bookings & Material Fees';
      el.portalSubtitle.textContent = 'Check your print specs, job status, and GCash payment details.';
      loadMyBookings();
    }
  }

  el.navNewBooking.addEventListener('click', () => switchPortalView('booking'));
  el.navMyBookings.addEventListener('click', () => switchPortalView('history'));

  // --- File Dropzone ---
  function handleFileSelection(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['stl', '3mf'].includes(ext)) {
      showAlert(el.bookingAlert, 'Invalid file type. Only .STL or .3MF files are allowed.');
      return;
    }
    if (file.size === 0) {
      showAlert(el.bookingAlert, 'Selected file is empty (0 bytes). Please choose a valid .STL or .3MF file.');
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

      const inlineCard = document.getElementById('stl-inline-estimator');
      const note3mf = document.getElementById('inline-3mf-note');
      if (ext === 'stl' && typeof analyzeInlineSTLFile === 'function') {
        if (note3mf) note3mf.classList.add('hidden');
        analyzeInlineSTLFile(file);
      } else {
        if (inlineCard) inlineCard.classList.add('hidden');
        if (note3mf) note3mf.classList.toggle('hidden', ext !== '3mf');
      }
      updateStepProgress();
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
    const note3mf = document.getElementById('inline-3mf-note');
    if (inlineCard) inlineCard.classList.add('hidden');
    if (note3mf) note3mf.classList.add('hidden');
    updateStepProgress();
  }

  el.dropzone.addEventListener('click', (e) => {
    if (e.target === el.btnRemoveFile || e.target.closest('button')) return;
    el.fileInput.click();
  });

  el.dropzone.addEventListener('keydown', (e) => {
    if (e.target === el.btnRemoveFile || e.target.closest('button')) return;
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

  function clearFieldErrors() {
    el.bookingForm.querySelectorAll('.field-error').forEach((node) => node.classList.remove('field-error'));
  }

  function focusMissedField(targetEl, msg) {
    clearFieldErrors();
    showAlert(el.bookingAlert, msg, 'error');
    if (targetEl) {
      targetEl.classList.add('field-error');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof targetEl.focus === 'function') {
        setTimeout(() => targetEl.focus({ preventScroll: true }), 250);
      }
    } else {
      el.bookingAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('Missing Field', msg);
  }

  function handleFieldClear(e) {
    if (e.target && e.target.classList) e.target.classList.remove('field-error');
    const parentErr = e.target?.closest('.field-error');
    if (parentErr) parentErr.classList.remove('field-error');
    updateStepProgress();
  }

  el.bookingForm.addEventListener('input', handleFieldClear);
  el.bookingForm.addEventListener('change', handleFieldClear);

  // --- Booking Submission ---
  el.bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(el.bookingAlert);
    clearFieldErrors();

    const gradeEl = document.getElementById('f-grade-section');
    if (!gradeEl.value.trim()) {
      focusMissedField(gradeEl, 'Please enter your Grade and Section.');
      return;
    }

    const phoneEl = document.getElementById('f-phone');
    if (!phoneEl.value.trim()) {
      focusMissedField(phoneEl, 'Please enter your Contact Phone Number.');
      return;
    }

    const dateEl = document.getElementById('f-booking-date');
    if (!dateEl.value) {
      focusMissedField(dateEl, 'Please select your Booking Date.');
      return;
    }

    if (!selectedFile) {
      focusMissedField(el.dropzone, 'Please upload your .STL or .3MF 3D model file.');
      return;
    }

    const chkNames = ['chk_format', 'chk_bedVolume', 'chk_orientation', 'chk_slicer', 'chk_bedClean'];
    for (const name of chkNames) {
      if (!el.bookingForm.querySelector(`input[name="${name}"]:checked`)) {
        const row = el.bookingForm.querySelector(`input[name="${name}"]`)?.closest('.checklist-row');
        focusMissedField(row, 'Please answer all 5 items in the Design & Model Pre-Check Checklist.');
        return;
      }
    }

    const colorEl = document.getElementById('f-filament-color');
    if (!colorEl.value.trim()) {
      focusMissedField(colorEl, 'Please specify your preferred Filament Color (or type "Any").');
      return;
    }

    const purposeEl = document.getElementById('f-purpose');
    if (!purposeEl.value.trim()) {
      focusMissedField(purposeEl, 'Please describe the Purpose of the 3D Printed Object.');
      return;
    }

    const agreeEl = document.getElementById('f-agree-rules');
    if (!agreeEl.checked) {
      focusMissedField(agreeEl.closest('.agree-check') || agreeEl, 'Please check the box to agree to the 5 Lab Rules & Student Acknowledgment.');
      return;
    }

    const sigNameEl = document.getElementById('f-sig-name');
    if (!sigNameEl.value.trim()) {
      focusMissedField(sigNameEl, 'Please type your Full Name in Digital Signature.');
      return;
    }

    const sigDateEl = document.getElementById('f-sig-date');
    if (!sigDateEl.value.trim()) {
      focusMissedField(sigDateEl, 'Please enter the Signature Date.');
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
        focusMissedField(null, res.error || 'Submission failed.');
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
      focusMissedField(null, err.message || 'Network error while submitting.');
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
      const hasDur = (b.estimatedHours !== '' && b.estimatedHours !== null && b.estimatedHours !== undefined) || (b.estimatedMinutes !== '' && b.estimatedMinutes !== null && b.estimatedMinutes !== undefined);
      const weightStr = hasWeight ? `${escapeHtml(b.estimatedWeightGrams)}g` : '—g';
      const durStr = hasDur ? `${escapeHtml(b.estimatedHours === '' || b.estimatedHours == null ? 0 : b.estimatedHours)}h ${escapeHtml(b.estimatedMinutes === '' || b.estimatedMinutes == null ? 0 : b.estimatedMinutes)}m` : '—';
      const supStr = b.supportRequired ? escapeHtml(b.supportRequired) : '—';
      const specsText = hasWeight || hasDur || b.supportRequired
        ? `${weightStr} · ${durStr} · Supports: ${supStr}`
        : 'Weight, duration &amp; supports: Pending Admin Review';

      const notesHtml = b.adminNotes
        ? `<div class="bk-notes"><strong>Admin Note:</strong> ${escapeHtml(b.adminNotes)}</div>`
        : '';

      const gcashHint = (hasPrice && b.paymentStatus !== 'Paid')
        ? `<div class="bk-gcash-hint"><div>GCash: <strong>09158589344</strong><br/>Philip Marion Martin</div><button type="button" class="btn-copy-gcash" data-gcash="09158589344">Copy GCash</button></div>`
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
            ${gcashHint}
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
      localStorage.setItem(STORAGE_KEYS.GAS_URL, '__LOCAL__');
    }
    updateConnectionUI();
    el.settingsModal.classList.add('hidden');
  });

  el.btnClearGas.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, '__LOCAL__');
    el.inputGasUrl.value = '';
    updateConnectionUI();
    el.settingsModal.classList.add('hidden');
    showToast('Local Preview Mode', 'Switched to browser Local Preview storage.');
  });

  el.btnCloseSuccess.addEventListener('click', () => el.successModal.classList.add('hidden'));
  el.btnViewMyBookings.addEventListener('click', () => {
    el.successModal.classList.add('hidden');
    switchPortalView('history');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.settingsModal.classList.contains('hidden')) {
      el.settingsModal.classList.add('hidden');
    } else if (!el.successModal.classList.contains('hidden')) {
      el.successModal.classList.add('hidden');
    } else if (!el.notifDropdown.classList.contains('hidden')) {
      el.notifDropdown.classList.add('hidden');
    }
  });

  // --- Client-side STL Parser (Binary & ASCII) & Integrated Print Cost ---
  let inlineParsedSTL = null;

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
    return 1.24; // PLA
  }

  function analyzeInlineSTLFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseSTLBuffer(ev.target.result);
      const inlineCard = document.getElementById('stl-inline-estimator');
      if (!parsed || parsed.volumeCm3 <= 0) {
        inlineParsedSTL = null;
        if (inlineCard) inlineCard.classList.add('hidden');
        showAlert(el.bookingAlert, 'Could not parse STL geometry (corrupt or empty mesh). Please verify or re-export your .STL file.');
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

    const mat = filamentEl ? filamentEl.value.toLowerCase() : 'petg';
    const printer = printerEl ? printerEl.value : 'Bambulab A1';
    const infill = infillEl ? (parseFloat(infillEl.value) || 0.15) : 0.15;

    const density = getMaterialDensity(mat);
    const effectiveFill = Math.min(1.0, 0.22 + (infill * 0.78));
    // 25% support & purge allowance is always included automatically
    const gramsWithBuffer = Math.max(1, Math.round(inlineParsedSTL.volumeCm3 * effectiveFill * density * 1.25));

    // Student rate only: ₱1.00/g for PLA, ₱2.50/g for PETG/ABS/TPU/Other, ₱50 minimum
    const rate = (mat === 'pla') ? 1.0 : 2.5;
    const printCost = Math.max(50, gramsWithBuffer * rate);

    const d = inlineParsedSTL.dims;
    document.getElementById('inline-stl-meta').textContent = `Dimensions: ${d.x} × ${d.y} × ${d.z} mm`;
    document.getElementById('inline-stl-price').textContent = fmtPeso(printCost);

    const warnEl = document.getElementById('inline-stl-bed-warn');
    if (warnEl) {
      const limit = printer.includes('mini') ? 180 : 256;
      const oversized = d.x > limit || d.y > limit || d.z > limit;
      warnEl.classList.remove('hidden', 'ok');
      if (oversized) {
        warnEl.textContent = `⚠ Model (${d.x}×${d.y}×${d.z} mm) exceeds ${printer} bed (${limit}×${limit}×${limit} mm).`;
      } else {
        warnEl.classList.add('ok');
        warnEl.textContent = `✓ Fits within ${printer} bed (${limit}×${limit}×${limit} mm).`;
      }
    }
  }

  ['inline-stl-infill', 'f-filament-type', 'f-printer'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('change', updateInlineSTLEstimate);
  });

  // --- One-Tap Copy GCash ---
  async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fallback below
      }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.btn-copy-gcash');
    if (!copyBtn) return;
    const gcashNum = copyBtn.dataset.gcash || '09158589344';
    await copyTextToClipboard(gcashNum);
    showToast('GCash Copied', `${gcashNum} (Philip Marion Martin) copied to clipboard.`);
  });

  // --- 5-Step Progress Indicator ---
  function updateStepProgress() {
    const nav = document.getElementById('step-progress');
    if (!nav) return;

    const sec1Done = Boolean(
      document.getElementById('f-grade-section')?.value.trim() &&
      document.getElementById('f-phone')?.value.trim() &&
      document.getElementById('f-booking-date')?.value
    );
    const sec2Done = Boolean(selectedFile);
    const sec3Done = ['chk_format', 'chk_bedVolume', 'chk_orientation', 'chk_slicer', 'chk_bedClean']
      .every((name) => Boolean(el.bookingForm?.querySelector(`input[name="${name}"]:checked`)));
    const sec4Done = Boolean(
      document.getElementById('f-filament-color')?.value.trim() &&
      document.getElementById('f-purpose')?.value.trim()
    );
    const sec5Done = Boolean(
      document.getElementById('f-agree-rules')?.checked &&
      document.getElementById('f-sig-name')?.value.trim() &&
      document.getElementById('f-sig-date')?.value
    );

    const doneMap = { 1: sec1Done, 2: sec2Done, 3: sec3Done, 4: sec4Done, 5: sec5Done };
    nav.querySelectorAll('.step-pill').forEach((pill) => {
      const step = Number(pill.dataset.step);
      pill.classList.toggle('done', Boolean(doneMap[step]));
    });
  }

  const stepProgressEl = document.getElementById('step-progress');
  if (stepProgressEl) {
    stepProgressEl.addEventListener('click', (e) => {
      const pill = e.target.closest('.step-pill');
      if (!pill) return;
      stepProgressEl.querySelectorAll('.step-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const target = document.getElementById(pill.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // --- Init ---
  updateConnectionUI();
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
