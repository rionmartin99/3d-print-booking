(() => {
  'use strict';

  // Embedded Google Apps Script Web App URL
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwaKbZsuZ9SNSsOmf0OeorMIRRlUh5poooa0vR8bt0MRegumU9BFReXwhGV88ak6D7G/exec';

  const STORAGE_KEYS = {
    GAS_URL: 'printlab_gas_url',
    ADMIN_SESSION: 'printlab_admin_passcode',
    LOCAL_BOOKINGS: 'printlab_local_bookings'
  };

  let adminPasscode = '';
  let deferredInstallPrompt = null;
  let allBookings = [];
  let activeBookingId = null;

  const el = {
    connDot: document.getElementById('conn-dot'),
    connLabel: document.getElementById('conn-label'),
    btnInstallApp: document.getElementById('btn-install-app'),
    btnBackendSettings: document.getElementById('btn-backend-settings'),
    btnLogout: document.getElementById('btn-logout'),

    authSection: document.getElementById('admin-auth-section'),
    workspace: document.getElementById('admin-workspace'),
    authAlert: document.getElementById('admin-auth-alert'),
    loginForm: document.getElementById('admin-login-form'),
    passcodeInput: document.getElementById('admin-passcode'),
    btnTogglePasscode: document.getElementById('btn-toggle-passcode'),

    btnRefresh: document.getElementById('btn-refresh-queue'),
    statTotal: document.getElementById('stat-total'),
    statPending: document.getElementById('stat-pending'),
    statActive: document.getElementById('stat-active'),
    statUnpaid: document.getElementById('stat-unpaid'),

    statusChips: document.getElementById('status-chips'),
    filterSearch: document.getElementById('filter-search'),
    filterStatus: document.getElementById('filter-status'),
    filterPayment: document.getElementById('filter-payment'),
    queueLoading: document.getElementById('queue-loading'),
    queueTbody: document.getElementById('queue-tbody'),
    queueCards: document.getElementById('queue-cards'),

    inspectorModal: document.getElementById('inspector-modal'),
    btnCloseInspector: document.getElementById('btn-close-inspector'),
    btnInspDownload: document.getElementById('btn-insp-download'),
    inspectorForm: document.getElementById('inspector-form'),
    inspAlert: document.getElementById('insp-alert'),

    settingsModal: document.getElementById('settings-modal'),
    inputGasUrl: document.getElementById('input-gas-url'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnSaveGas: document.getElementById('btn-save-gas'),
    btnClearGas: document.getElementById('btn-clear-gas'),

    toastContainer: document.getElementById('toast-container')
  };

  function getGasUrl() {
    const stored = localStorage.getItem(STORAGE_KEYS.GAS_URL);
    return (stored !== null ? stored : DEFAULT_GAS_URL || '').trim();
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

  function showAlert(target, msg, type = 'error') {
    if (!target) return;
    target.textContent = msg;
    target.className = `alert alert-${type}`;
    target.classList.remove('hidden');
  }

  function hideAlert(target) {
    if (!target) return;
    target.classList.add('hidden');
  }

  function showToast(message, type = 'info') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3600);
  }

  function formatCurrency(val) {
    return '₱ ' + Number(val).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- API Adapter ---
  async function apiCall(action, payload = {}) {
    const gasUrl = getGasUrl();
    if (gasUrl) {
      const res = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, passcode: adminPasscode, ...payload })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Apps Script returned an unexpected response. Ensure Code.gs is deployed with "Who has access: Anyone".');
      }
    }
    return localApiHandler(action, payload);
  }

  function localApiHandler(action, payload) {
    const bookings = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_BOOKINGS) || '[]');

    if (action === 'adminLogin') {
      if ((payload.passcode || '').trim() !== 'admin1234') {
        return { ok: false, error: 'Incorrect admin passcode.' };
      }
      return { ok: true };
    }

    if (action === 'adminGetBookings') {
      return { ok: true, bookings };
    }

    if (action === 'adminUpdateBooking') {
      const idx = bookings.findIndex(b => b.bookingId === payload.bookingId);
      if (idx === -1) return { ok: false, error: 'Booking not found.' };

      const target = bookings[idx];
      if (payload.printerAssigned !== undefined) target.printerAssigned = payload.printerAssigned;
      if (payload.estimatedWeightGrams !== undefined) {
        target.estimatedWeightGrams = payload.estimatedWeightGrams === '' || payload.estimatedWeightGrams === null ? '' : Number(payload.estimatedWeightGrams);
      }
      if (payload.estimatedHours !== undefined) {
        target.estimatedHours = payload.estimatedHours === '' || payload.estimatedHours === null ? '' : Number(payload.estimatedHours);
      }
      if (payload.estimatedMinutes !== undefined) {
        target.estimatedMinutes = payload.estimatedMinutes === '' || payload.estimatedMinutes === null ? '' : Number(payload.estimatedMinutes);
      }
      if (payload.supportRequired !== undefined) target.supportRequired = payload.supportRequired;
      if (payload.jobStatus !== undefined) target.jobStatus = payload.jobStatus;
      if (payload.priceToPay !== undefined) {
        target.priceToPay = payload.priceToPay === '' || payload.priceToPay === null ? null : Number(payload.priceToPay);
      }
      if (payload.paymentStatus !== undefined) target.paymentStatus = payload.paymentStatus;
      if (payload.adminNotes !== undefined) target.adminNotes = payload.adminNotes;
      target.updatedAt = new Date().toISOString();

      localStorage.setItem(STORAGE_KEYS.LOCAL_BOOKINGS, JSON.stringify(bookings));
      return { ok: true, booking: target };
    }

    return { ok: false, error: 'Unsupported action' };
  }

  // --- Auth ---
  if (el.btnTogglePasscode && el.passcodeInput) {
    el.btnTogglePasscode.addEventListener('click', () => {
      const isHidden = el.passcodeInput.type === 'password';
      el.passcodeInput.type = isHidden ? 'text' : 'password';
      el.btnTogglePasscode.textContent = isHidden ? 'Hide' : 'Show';
      el.btnTogglePasscode.setAttribute('aria-pressed', String(isHidden));
      el.btnTogglePasscode.setAttribute('aria-label', isHidden ? 'Hide passcode' : 'Show passcode');
    });
  }

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(el.authAlert);
    const code = el.passcodeInput.value.trim();
    if (!code) {
      showAlert(el.authAlert, 'Please enter the admin passcode.');
      return;
    }

    const btn = document.getElementById('btn-admin-login');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    try {
      adminPasscode = code;
      const res = await apiCall('adminLogin', { passcode: code });
      if (!res.ok) {
        adminPasscode = '';
        showAlert(el.authAlert, res.error || 'Access denied.');
      } else {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, code);
        enterWorkspace();
      }
    } catch (err) {
      showAlert(el.authAlert, err.message || 'Connection error.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Unlock Admin Console';
    }
  });

  el.btnLogout.addEventListener('click', () => {
    adminPasscode = '';
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
    el.workspace.classList.add('hidden');
    el.btnLogout.classList.add('hidden');
    el.authSection.classList.remove('hidden');
    el.loginForm.reset();
    if (el.passcodeInput && el.btnTogglePasscode) {
      el.passcodeInput.type = 'password';
      el.btnTogglePasscode.textContent = 'Show';
      el.btnTogglePasscode.setAttribute('aria-pressed', 'false');
    }
  });

  function enterWorkspace() {
    el.authSection.classList.add('hidden');
    el.workspace.classList.remove('hidden');
    el.btnLogout.classList.remove('hidden');
    loadQueue();
  }

  // --- Queue & Metrics ---
  function setQueueLoading(isLoading) {
    if (el.queueLoading) {
      el.queueLoading.classList.toggle('hidden', !isLoading);
    }
    if (el.btnRefresh) {
      el.btnRefresh.disabled = isLoading;
      el.btnRefresh.textContent = isLoading ? 'Refreshing...' : 'Refresh Queue';
    }
    if (el.queueTbody && isLoading && !allBookings.length) {
      el.queueTbody.innerHTML = '';
    }
    if (el.queueCards && isLoading && !allBookings.length) {
      el.queueCards.innerHTML = '';
    }
  }

  async function loadQueue() {
    setQueueLoading(true);
    try {
      const res = await apiCall('adminGetBookings');
      if (!res.ok) {
        showToast(res.error || 'Failed to load print queue.', 'error');
        return;
      }
      allBookings = res.bookings || [];
      updateMetrics();
      renderStatusChips();
      renderTable();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to load print queue.', 'error');
    } finally {
      setQueueLoading(false);
    }
  }

  function updateMetrics() {
    el.statTotal.textContent = allBookings.length;
    el.statPending.textContent = allBookings.filter(b => b.jobStatus === 'Pending Review').length;
    el.statActive.textContent = allBookings.filter(b => ['Approved', 'Printing', 'Ready for Pickup'].includes(b.jobStatus)).length;

    const unpaidSum = allBookings
      .filter(b => b.paymentStatus !== 'Paid' && b.priceToPay !== null && !isNaN(b.priceToPay))
      .reduce((acc, b) => acc + Number(b.priceToPay), 0);
    el.statUnpaid.textContent = formatCurrency(unpaidSum);
  }

  function renderStatusChips() {
    if (!el.statusChips) return;
    const statusVal = el.filterStatus.value;
    const payVal = el.filterPayment.value;

    const chips = [
      { label: 'All', type: 'all', value: 'ALL', count: allBookings.length },
      { label: 'Pending Review', type: 'status', value: 'Pending Review', count: allBookings.filter(b => b.jobStatus === 'Pending Review').length },
      { label: 'Approved', type: 'status', value: 'Approved', count: allBookings.filter(b => b.jobStatus === 'Approved').length },
      { label: 'Printing', type: 'status', value: 'Printing', count: allBookings.filter(b => b.jobStatus === 'Printing').length },
      { label: 'Ready for Pickup', type: 'status', value: 'Ready for Pickup', count: allBookings.filter(b => b.jobStatus === 'Ready for Pickup').length },
      { label: 'Unpaid', type: 'payment', value: 'Unpaid', count: allBookings.filter(b => b.paymentStatus !== 'Paid').length },
      { label: 'Completed', type: 'status', value: 'Completed', count: allBookings.filter(b => b.jobStatus === 'Completed').length }
    ];

    el.statusChips.innerHTML = chips.map(chip => {
      let isActive = false;
      if (chip.type === 'all') {
        isActive = statusVal === 'ALL' && payVal === 'ALL';
      } else if (chip.type === 'payment') {
        isActive = payVal === chip.value && statusVal === 'ALL';
      } else {
        isActive = statusVal === chip.value && payVal === 'ALL';
      }
      return `
        <button
          type="button"
          class="status-chip${isActive ? ' active' : ''}"
          role="tab"
          aria-selected="${isActive}"
          data-chip-type="${chip.type}"
          data-chip-value="${escapeHtml(chip.value)}"
        >
          <span>${escapeHtml(chip.label)}</span>
          <span class="chip-count">${chip.count}</span>
        </button>
      `;
    }).join('');
  }

  if (el.statusChips) {
    el.statusChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-chip');
      if (!btn) return;
      const type = btn.dataset.chipType;
      const val = btn.dataset.chipValue;
      if (type === 'all') {
        el.filterStatus.value = 'ALL';
        el.filterPayment.value = 'ALL';
      } else if (type === 'payment') {
        el.filterStatus.value = 'ALL';
        el.filterPayment.value = val;
      } else {
        el.filterStatus.value = val;
        el.filterPayment.value = 'ALL';
      }
      renderStatusChips();
      renderTable();
    });
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

  function getFilteredBookings() {
    const q = el.filterSearch.value.trim().toLowerCase();
    const st = el.filterStatus.value;
    const pay = el.filterPayment.value;

    return allBookings.filter(b => {
      if (st !== 'ALL' && b.jobStatus !== st) return false;
      if (pay !== 'ALL' && b.paymentStatus !== pay) return false;
      if (q) {
        const hay = `${b.bookingId} ${b.fullName} ${b.gradeSection} ${b.fileName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const rows = getFilteredBookings();
    if (!rows.length) {
      el.queueTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 36px; color: var(--ink-muted);">
            No matching print bookings found.
          </td>
        </tr>
      `;
      if (el.queueCards) {
        el.queueCards.innerHTML = `
          <div class="empty-state">No matching print bookings found.</div>
        `;
      }
      return;
    }

    el.queueTbody.innerHTML = rows.map(b => {
      const hasPrice = b.priceToPay !== null && b.priceToPay !== '' && !isNaN(b.priceToPay);
      const priceText = hasPrice ? formatCurrency(b.priceToPay) : 'Not Set';
      const payBadge = b.paymentStatus === 'Paid'
        ? '<span class="badge badge-paid">Paid</span>'
        : '<span class="badge badge-unpaid">Unpaid</span>';

      const weightText = (b.estimatedWeightGrams === '' || b.estimatedWeightGrams == null)
        ? '—'
        : `${escapeHtml(b.estimatedWeightGrams)}g`;

      return `
        <tr>
          <td>
            <div class="cell-main mono">${escapeHtml(b.bookingId)}</div>
            <div class="cell-sub">${escapeHtml(b.bookingDate)}</div>
          </td>
          <td>
            <div class="cell-main">${escapeHtml(b.fullName)}</div>
            <div class="cell-sub">${escapeHtml(b.gradeSection || '—')} · ${escapeHtml(b.phone || '—')}</div>
          </td>
          <td>
            <div class="cell-main">${escapeHtml(b.fileName)}</div>
            <div class="cell-sub mono">${formatBytes(b.fileSizeBytes)}</div>
          </td>
          <td>
            <div class="cell-main">${escapeHtml(b.printerAssigned)}</div>
            <div class="cell-sub">${escapeHtml(b.filamentType)} (${escapeHtml(b.filamentColor)}) · ${weightText}</div>
          </td>
          <td>
            <span class="badge ${statusBadgeClass(b.jobStatus)}">${escapeHtml(b.jobStatus)}</span>
          </td>
          <td>
            <div class="cell-main mono">${priceText}</div>
            <div>${payBadge}</div>
          </td>
          <td class="text-right">
            <div class="action-row">
              <button type="button" class="btn btn-secondary btn-sm btn-dl" data-id="${escapeHtml(b.bookingId)}">Download</button>
              <button type="button" class="btn btn-primary btn-sm btn-manage" data-id="${escapeHtml(b.bookingId)}">Manage</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (el.queueCards) {
      el.queueCards.innerHTML = rows.map(b => {
        const hasPrice = b.priceToPay !== null && b.priceToPay !== '' && !isNaN(b.priceToPay);
        const priceText = hasPrice ? formatCurrency(b.priceToPay) : 'Not Set';
        const payBadge = b.paymentStatus === 'Paid'
          ? '<span class="badge badge-paid">Paid</span>'
          : '<span class="badge badge-unpaid">Unpaid</span>';

        const weightText = (b.estimatedWeightGrams === '' || b.estimatedWeightGrams == null)
          ? '—'
          : `${escapeHtml(b.estimatedWeightGrams)}g`;

        return `
          <article class="queue-card">
            <div class="qc-head">
              <div>
                <div class="qc-id mono">${escapeHtml(b.bookingId)}</div>
                <div class="qc-date">${escapeHtml(b.bookingDate)}</div>
              </div>
              <span class="badge ${statusBadgeClass(b.jobStatus)}">${escapeHtml(b.jobStatus)}</span>
            </div>
            <div class="qc-body">
              <div class="qc-student">${escapeHtml(b.fullName)}</div>
              <div class="qc-meta">${escapeHtml(b.gradeSection || '—')} · ${escapeHtml(b.phone || '—')}</div>
              <div class="qc-meta">${escapeHtml(b.printerAssigned)} · ${escapeHtml(b.filamentType)} (${escapeHtml(b.filamentColor)}) · ${weightText}</div>
              <div class="qc-file mono">${escapeHtml(b.fileName)} (${formatBytes(b.fileSizeBytes)})</div>
            </div>
            <div class="qc-foot">
              <div class="qc-price mono">${priceText} ${payBadge}</div>
            </div>
            <div class="qc-actions">
              <button type="button" class="btn btn-secondary btn-sm btn-dl" data-id="${escapeHtml(b.bookingId)}">Download</button>
              <button type="button" class="btn btn-primary btn-sm btn-manage" data-id="${escapeHtml(b.bookingId)}">Manage</button>
            </div>
          </article>
        `;
      }).join('');
    }
  }

  function handleQueueActionClick(e) {
    const dlBtn = e.target.closest('.btn-dl');
    const mgBtn = e.target.closest('.btn-manage');
    if (dlBtn) {
      downloadBookingFile(dlBtn.dataset.id, dlBtn);
    } else if (mgBtn) {
      openInspector(mgBtn.dataset.id);
    }
  }

  el.filterSearch.addEventListener('input', renderTable);
  el.filterStatus.addEventListener('change', () => {
    renderStatusChips();
    renderTable();
  });
  el.filterPayment.addEventListener('change', () => {
    renderStatusChips();
    renderTable();
  });
  el.btnRefresh.addEventListener('click', loadQueue);

  el.queueTbody.addEventListener('click', handleQueueActionClick);
  if (el.queueCards) {
    el.queueCards.addEventListener('click', handleQueueActionClick);
  }

  // --- STL File Download ---
  function triggerBase64Download(base64, fileName) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadBookingFile(bookingId, triggerBtn) {
    const b = allBookings.find(item => item.bookingId === bookingId);
    if (!b) return;

    const originalLabel = triggerBtn ? triggerBtn.textContent : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'Downloading...';
    }

    try {
      if (b.localFileBase64) {
        const name = b.fileName || `${b.bookingId}.stl`;
        triggerBase64Download(b.localFileBase64, name);
        showToast(`Downloading ${name}...`, 'success');
        return;
      }

      if (b.driveFileId && getGasUrl()) {
        try {
          const res = await apiCall('adminDownloadFile', { fileId: b.driveFileId });
          if (res.ok && res.base64) {
            const name = b.fileName || res.fileName || `${b.bookingId}.stl`;
            triggerBase64Download(res.base64, name);
            showToast(`Downloading ${name}...`, 'success');
            return;
          }
        } catch (err) {
          console.error(err);
        }
      }

      if (b.downloadUrl) {
        window.open(b.downloadUrl, '_blank', 'noopener');
        showToast('Opened file download link.', 'info');
        return;
      }

      showToast('No downloadable file found for this booking.', 'error');
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = originalLabel;
      }
    }
  }

  // --- Job Inspector Modal ---
  function openInspector(bookingId) {
    const b = allBookings.find(item => item.bookingId === bookingId);
    if (!b) return;
    activeBookingId = bookingId;
    hideAlert(el.inspAlert);

    document.getElementById('insp-booking-id').textContent = b.bookingId;
    document.getElementById('insp-file-name').textContent = b.fileName;
    document.getElementById('insp-file-size').textContent = formatBytes(b.fileSizeBytes);
    document.getElementById('insp-student-name').textContent = b.fullName;
    document.getElementById('insp-grade').textContent = b.gradeSection || '—';
    document.getElementById('insp-phone').textContent = b.phone || '—';
    document.getElementById('insp-date').textContent = b.bookingDate || '—';
    document.getElementById('insp-filament').textContent = `${b.filamentType} (${b.filamentColor})`;
    document.getElementById('insp-weight').textContent = `${b.estimatedWeightGrams} g`;
    document.getElementById('insp-duration').textContent = `${b.estimatedHours}h ${b.estimatedMinutes}m`;
    document.getElementById('insp-supports').textContent = b.supportRequired || 'No';
    document.getElementById('insp-purpose').textContent = b.purpose || '—';
    document.getElementById('insp-signature').textContent = b.signatureName || '—';
    document.getElementById('insp-sig-date').textContent = b.signatureDate || '—';

    const chk = b.checklist || {};
    const chkItems = [
      ['Saved as .STL or .3MF', chk.format],
      ['Fits 256×256×256mm bed', chk.bedVolume],
      ['Orientation optimized', chk.orientation],
      ['Bambulab Studio settings', chk.slicer],
      ['Print bed clean & clear', chk.bedClean]
    ];
    document.getElementById('insp-checklist').innerHTML = chkItems.map(([label, ok]) => `
      <li>
        <span>${label}</span>
        <strong style="color:${ok ? 'var(--success)' : 'var(--danger)'}">${ok ? 'Yes' : 'No'}</strong>
      </li>
    `).join('');

    document.getElementById('edit-weight').value =
      b.estimatedWeightGrams !== null && b.estimatedWeightGrams !== undefined && b.estimatedWeightGrams !== '' ? b.estimatedWeightGrams : '';
    document.getElementById('edit-hours').value =
      b.estimatedHours !== null && b.estimatedHours !== undefined && b.estimatedHours !== '' ? b.estimatedHours : '';
    document.getElementById('edit-minutes').value =
      b.estimatedMinutes !== null && b.estimatedMinutes !== undefined && b.estimatedMinutes !== '' ? b.estimatedMinutes : '';
    document.getElementById('edit-supports').value = b.supportRequired || '';

    const tierSelect = document.getElementById('admin-est-tier');
    if (tierSelect) {
      const fType = String(b.filamentType || '').toUpperCase();
      tierSelect.value = fType === 'PLA' ? 'student_pla' : 'student_spec';
    }
    updateAdminEstimate();

    document.getElementById('edit-price').value =
      b.priceToPay !== null && b.priceToPay !== '' ? b.priceToPay : '';
    document.getElementById('edit-payment-status').value = b.paymentStatus || 'Unpaid';
    document.getElementById('edit-job-status').value = b.jobStatus || 'Pending Review';
    document.getElementById('edit-printer').value = b.printerAssigned || 'Bambulab A1';
    document.getElementById('edit-notes').value = b.adminNotes || '';

    el.inspectorModal.classList.remove('hidden');
  }

  function closeInspector() {
    el.inspectorModal.classList.add('hidden');
    activeBookingId = null;
  }

  function closeSettings() {
    el.settingsModal.classList.add('hidden');
  }

  function computeAdminEstimate() {
    const weight = parseFloat(document.getElementById('edit-weight')?.value) || 0;
    const tier = document.getElementById('admin-est-tier')?.value || 'student_pla';
    const rate = tier === 'student_pla' ? 1.0 : 2.5;
    return Math.round(Math.max(50, weight * rate));
  }

  function updateAdminEstimate() {
    const previewEl = document.getElementById('admin-est-preview');
    if (!previewEl) return;
    const total = computeAdminEstimate();
    previewEl.textContent = `₱${total.toLocaleString('en-PH')}`;
  }

  ['edit-weight', 'admin-est-tier'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) {
      node.addEventListener('input', updateAdminEstimate);
      node.addEventListener('change', updateAdminEstimate);
    }
  });

  const btnApplyEst = document.getElementById('btn-apply-est-price');
  if (btnApplyEst) {
    btnApplyEst.addEventListener('click', () => {
      const total = computeAdminEstimate();
      document.getElementById('edit-price').value = total;
      showToast(`Applied ₱${total.toLocaleString('en-PH')} to Amount to Pay.`, 'info');
    });
  }

  el.btnCloseInspector.addEventListener('click', closeInspector);
  el.inspectorModal.addEventListener('click', (e) => {
    if (e.target === el.inspectorModal) closeInspector();
  });

  el.btnInspDownload.addEventListener('click', () => {
    if (activeBookingId) downloadBookingFile(activeBookingId, el.btnInspDownload);
  });

  el.inspectorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeBookingId) return;
    hideAlert(el.inspAlert);

    const priceRaw = document.getElementById('edit-price').value.trim();
    const weightRaw = document.getElementById('edit-weight').value.trim();
    const hoursRaw = document.getElementById('edit-hours').value.trim();
    const minsRaw = document.getElementById('edit-minutes').value.trim();

    const payload = {
      bookingId: activeBookingId,
      estimatedWeightGrams: weightRaw === '' ? '' : Number(weightRaw),
      estimatedHours: hoursRaw === '' ? '' : Number(hoursRaw),
      estimatedMinutes: minsRaw === '' ? '' : Number(minsRaw),
      supportRequired: document.getElementById('edit-supports').value,
      priceToPay: priceRaw === '' ? '' : Number(priceRaw),
      paymentStatus: document.getElementById('edit-payment-status').value,
      jobStatus: document.getElementById('edit-job-status').value,
      printerAssigned: document.getElementById('edit-printer').value,
      adminNotes: document.getElementById('edit-notes').value.trim()
    };

    const btn = document.getElementById('btn-save-job');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const res = await apiCall('adminUpdateBooking', payload);
      if (!res.ok) {
        showAlert(el.inspAlert, res.error || 'Failed to save changes.');
      } else {
        const msg = 'Saved! Student portal will now show the updated fee and status.';
        showAlert(el.inspAlert, msg, 'success');
        showToast(msg, 'success');
        await loadQueue();
      }
    } catch (err) {
      showAlert(el.inspAlert, err.message || 'Network error.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Pricing & Status';
    }
  });

  // --- Settings Modal ---
  el.btnBackendSettings.addEventListener('click', () => {
    el.inputGasUrl.value = getGasUrl();
    el.settingsModal.classList.remove('hidden');
  });

  el.btnCloseSettings.addEventListener('click', closeSettings);
  el.settingsModal.addEventListener('click', (e) => {
    if (e.target === el.settingsModal) closeSettings();
  });

  el.inputGasUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.btnSaveGas.click();
    }
  });

  el.btnSaveGas.addEventListener('click', () => {
    const val = el.inputGasUrl.value.trim();
    localStorage.setItem(STORAGE_KEYS.GAS_URL, val);
    updateConnectionUI();
    closeSettings();
    showToast(val ? 'Google Apps Script URL saved.' : 'Switched to Local Preview Mode.', 'success');
    if (adminPasscode) loadQueue();
  });

  el.btnClearGas.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, '');
    el.inputGasUrl.value = '';
    updateConnectionUI();
    closeSettings();
    showToast('Switched to Local Preview Mode.', 'info');
    if (adminPasscode) loadQueue();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.inspectorModal.classList.contains('hidden')) {
      closeInspector();
    } else if (!el.settingsModal.classList.contains('hidden')) {
      closeSettings();
    }
  });

  // --- PWA Registration & Install ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const INSTALL_DISMISS_KEY = '3dp_admin_install_dismissed';
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
      if (el.btnInstallApp) el.btnInstallApp.classList.add('hidden');
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
    if (el.btnInstallApp) {
      el.btnInstallApp.classList.remove('hidden');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (el.btnInstallApp) el.btnInstallApp.classList.add('hidden');
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    if (installBanner) installBanner.classList.add('hidden');
  });

  if (el.btnInstallApp) el.btnInstallApp.addEventListener('click', triggerInstallFlow);
  if (btnBannerInstall) btnBannerInstall.addEventListener('click', triggerInstallFlow);
  if (btnBannerDismiss) {
    btnBannerDismiss.addEventListener('click', () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
      if (installBanner) installBanner.classList.add('hidden');
    });
  }

  showInstallBannerIfFirstTime();

  // --- Init ---
  updateConnectionUI();
  const savedPass = sessionStorage.getItem(STORAGE_KEYS.ADMIN_SESSION);
  if (savedPass) {
    adminPasscode = savedPass;
    enterWorkspace();
  }
})();
