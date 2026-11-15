/**
 * 3D Printer Session Booking & Job Request System
 * Google Apps Script Backend (Google Sheets Database + Google Drive File Storage)
 *
 * SETUP:
 * 1. Create a new Google Sheet (or open an existing one).
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this entire file into Code.gs and save.
 * 4. (Optional) Change ADMIN_PASSCODE below or set Script Property "ADMIN_PASSCODE".
 * 5. Click Deploy > New deployment > Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the Web App URL and paste it into the Client & Admin apps' "Backend Settings".
 */

const CONFIG = {
  DRIVE_FOLDER_NAME: '3D_Print_STL_Uploads',
  STUDENTS_SHEET: 'Students',
  BOOKINGS_SHEET: 'Bookings',
  DEFAULT_ADMIN_PASSCODE: 'admin1234'
};

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getAdminPasscode() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('ADMIN_PASSCODE') || CONFIG.DEFAULT_ADMIN_PASSCODE;
}

function ensureSheets() {
  const ss = getSpreadsheet();

  let studentsSheet = ss.getSheetByName(CONFIG.STUDENTS_SHEET);
  if (!studentsSheet) {
    studentsSheet = ss.insertSheet(CONFIG.STUDENTS_SHEET);
    studentsSheet.appendRow([
      'StudentID',
      'FirstName',
      'LastName',
      'FullName',
      'GradeSection',
      'Phone',
      'RegisteredAt'
    ]);
    studentsSheet.setFrozenRows(1);
  }

  let bookingsSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  if (!bookingsSheet) {
    bookingsSheet = ss.insertSheet(CONFIG.BOOKINGS_SHEET);
    bookingsSheet.appendRow([
      'BookingID',
      'CreatedAt',
      'StudentID',
      'FirstName',
      'LastName',
      'FullName',
      'GradeSection',
      'Phone',
      'BookingDate',
      'Check_Format',
      'Check_BedVolume',
      'Check_Orientation',
      'Check_Slicer',
      'Check_BedClean',
      'PrinterAssigned',
      'FilamentType',
      'FilamentColor',
      'EstimatedWeightGrams',
      'EstimatedHours',
      'EstimatedMinutes',
      'SupportRequired',
      'Purpose',
      'SignatureName',
      'SignatureDate',
      'FileName',
      'DriveFileId',
      'DownloadUrl',
      'FileSizeBytes',
      'JobStatus',
      'PriceToPay',
      'PaymentStatus',
      'AdminNotes',
      'UpdatedAt'
    ]);
    bookingsSheet.setFrozenRows(1);
  }

  return { studentsSheet, bookingsSheet };
}

function getOrCreateDriveFolder() {
  const folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateSingleName(name, label) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return { valid: false, error: label + ' is required.' };
  }
  if (trimmed.indexOf(',') !== -1) {
    return { valid: false, error: label + ' must be one name only (no commas allowed).' };
  }
  if (/\s/.test(trimmed)) {
    return { valid: false, error: label + ' must be a single name with no spaces.' };
  }
  return { valid: true, value: trimmed };
}

function sanitizeCell(value) {
  const str = String(value == null ? '' : value).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function verifyStudent(studentId, firstName, lastName) {
  const id = String(studentId || '').trim();
  const fn = String(firstName || '').trim().toLowerCase();
  const ln = String(lastName || '').trim().toLowerCase();
  if (!id || !fn || !ln) {
    return false;
  }

  const { studentsSheet } = ensureSheets();
  const rows = studentsSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const rowId = String(rows[i][0] || '').trim();
    const rowFirst = String(rows[i][1] || '').trim().toLowerCase();
    const rowLast = String(rows[i][2] || '').trim().toLowerCase();
    if (rowId === id && rowFirst === fn && rowLast === ln) {
      return true;
    }
  }
  return false;
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
    if (action === 'ping') {
      ensureSheets();
      return jsonResponse({ ok: true, message: '3D Print Booking API is online.' });
    }
    if (action === 'downloadFile' && e.parameter.fileId) {
      const file = DriveApp.getFileById(e.parameter.fileId);
      const bytes = file.getBlob().getBytes();
      return jsonResponse({
        ok: true,
        fileName: file.getName(),
        mimeType: file.getMimeType(),
        base64: Utilities.base64Encode(bytes)
      });
    }
    return jsonResponse({ ok: false, error: 'Unknown GET action.' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'Empty request body.' });
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    ensureSheets();

    switch (action) {
      case 'register':
        return handleRegister(data);
      case 'login':
        return handleLogin(data);
      case 'createBooking':
        return handleCreateBooking(data);
      case 'getMyBookings':
        return handleGetMyBookings(data);
      case 'adminLogin':
        return handleAdminLogin(data);
      case 'adminGetBookings':
        return handleAdminGetBookings(data);
      case 'adminUpdateBooking':
        return handleAdminUpdateBooking(data);
      case 'adminDownloadFile':
        return handleAdminDownloadFile(data);
      default:
        return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || 'Server error.' });
  }
}

function handleRegister(data) {
  const fnCheck = validateSingleName(data.firstName, 'First Name');
  if (!fnCheck.valid) return jsonResponse({ ok: false, error: fnCheck.error });

  const lnCheck = validateSingleName(data.lastName, 'Last Name (Password)');
  if (!lnCheck.valid) return jsonResponse({ ok: false, error: lnCheck.error });

  const firstName = fnCheck.value;
  const lastName = lnCheck.value;
  const { studentsSheet } = ensureSheets();
  const rows = studentsSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const existingFirst = String(rows[i][1] || '').trim().toLowerCase();
    if (existingFirst === firstName.toLowerCase()) {
      return jsonResponse({
        ok: false,
        error: 'An account with this First Name already exists. Please sign in instead.'
      });
    }
  }

  const studentId = 'STU-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const fullName = firstName + ' ' + lastName;
  const gradeSection = String(data.gradeSection || '').trim();
  const phone = String(data.phone || '').trim();
  const now = new Date().toISOString();

  studentsSheet.appendRow([
    studentId,
    firstName,
    lastName,
    fullName,
    gradeSection,
    phone,
    now
  ]);

  return jsonResponse({
    ok: true,
    student: {
      studentId,
      firstName,
      lastName,
      fullName,
      gradeSection,
      phone
    }
  });
}

function handleLogin(data) {
  const fnCheck = validateSingleName(data.firstName, 'First Name');
  if (!fnCheck.valid) return jsonResponse({ ok: false, error: fnCheck.error });

  const lnCheck = validateSingleName(data.lastName, 'Last Name (Password)');
  if (!lnCheck.valid) return jsonResponse({ ok: false, error: lnCheck.error });

  const firstName = fnCheck.value.toLowerCase();
  const lastName = lnCheck.value.toLowerCase();
  const { studentsSheet } = ensureSheets();
  const rows = studentsSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const rowFirst = String(rows[i][1] || '').trim().toLowerCase();
    const rowLast = String(rows[i][2] || '').trim().toLowerCase();
    if (rowFirst === firstName && rowLast === lastName) {
      return jsonResponse({
        ok: true,
        student: {
          studentId: rows[i][0],
          firstName: rows[i][1],
          lastName: rows[i][2],
          fullName: rows[i][3],
          gradeSection: rows[i][4],
          phone: rows[i][5]
        }
      });
    }
  }

  return jsonResponse({
    ok: false,
    error: 'Invalid First Name or Last Name password. Please register if you are a new student.'
  });
}

function handleCreateBooking(data) {
  const student = data.student || {};
  if (!verifyStudent(student.studentId, student.firstName, student.lastName)) {
    return jsonResponse({ ok: false, error: 'Student authentication failed.' });
  }

  const fileData = data.file || {};
  if (!fileData.base64 || !fileData.name) {
    return jsonResponse({ ok: false, error: 'Please upload an STL or 3MF file.' });
  }

  const ext = String(fileData.name).split('.').pop().toLowerCase();
  if (ext !== 'stl' && ext !== '3mf') {
    return jsonResponse({ ok: false, error: 'Only .STL or .3MF files are allowed.' });
  }

  const decoded = Utilities.base64Decode(fileData.base64);
  if (decoded.length > 20 * 1024 * 1024) {
    return jsonResponse({ ok: false, error: 'File exceeds the 20 MB limit.' });
  }

  const bookingId = '3DP-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();

  // Save STL/3MF file privately to Google Drive (admin downloads via passcode-protected endpoint)
  const folder = getOrCreateDriveFolder();
  const safeName = bookingId + '_' + String(fileData.name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = Utilities.newBlob(decoded, fileData.mimeType || 'application/octet-stream', safeName);
  const driveFile = folder.createFile(blob);

  const driveFileId = driveFile.getId();
  const downloadUrl = '';

  const { bookingsSheet } = ensureSheets();
  const checklist = data.checklist || {};

  bookingsSheet.appendRow([
    bookingId,
    now,
    student.studentId,
    sanitizeCell(student.firstName),
    sanitizeCell(student.lastName),
    sanitizeCell(data.fullName || student.fullName),
    sanitizeCell(data.gradeSection || ''),
    sanitizeCell(data.phone || ''),
    sanitizeCell(data.bookingDate || ''),
    checklist.format ? 'Yes' : 'No',
    checklist.bedVolume ? 'Yes' : 'No',
    checklist.orientation ? 'Yes' : 'No',
    checklist.slicer ? 'Yes' : 'No',
    checklist.bedClean ? 'Yes' : 'No',
    sanitizeCell(data.printerAssigned || 'Bambulab A1'),
    sanitizeCell(data.filamentType || 'PETG'),
    sanitizeCell(data.filamentColor || 'Any'),
    '',
    '',
    '',
    '',
    sanitizeCell(data.purpose || ''),
    data.signatureName || '',
    data.signatureDate || '',
    fileData.name,
    driveFileId,
    downloadUrl,
    fileData.size || decoded.length,
    'Pending Review',
    '',
    'Unpaid',
    '',
    now
  ]);

  return jsonResponse({
    ok: true,
    bookingId: bookingId,
    downloadUrl: downloadUrl
  });
}

function rowToBooking(row) {
  return {
    bookingId: row[0],
    createdAt: row[1],
    studentId: row[2],
    firstName: row[3],
    lastName: row[4],
    fullName: row[5],
    gradeSection: row[6],
    phone: row[7],
    bookingDate: row[8],
    checklist: {
      format: row[9] === 'Yes',
      bedVolume: row[10] === 'Yes',
      orientation: row[11] === 'Yes',
      slicer: row[12] === 'Yes',
      bedClean: row[13] === 'Yes'
    },
    printerAssigned: row[14],
    filamentType: row[15],
    filamentColor: row[16],
    estimatedWeightGrams: row[17],
    estimatedHours: row[18],
    estimatedMinutes: row[19],
    supportRequired: row[20],
    purpose: row[21],
    signatureName: row[22],
    signatureDate: row[23],
    fileName: row[24],
    driveFileId: row[25],
    downloadUrl: row[26],
    fileSizeBytes: row[27],
    jobStatus: row[28] || 'Pending Review',
    priceToPay: row[29] === '' ? null : Number(row[29]),
    paymentStatus: row[30] || 'Unpaid',
    adminNotes: row[31] || '',
    updatedAt: row[32] || row[1]
  };
}

function handleGetMyBookings(data) {
  const studentId = String(data.studentId || '').trim();
  if (!studentId) {
    return jsonResponse({ ok: false, error: 'Student ID is required.' });
  }

  const { bookingsSheet } = ensureSheets();
  const rows = bookingsSheet.getDataRange().getValues();
  const bookings = [];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]) === studentId) {
      bookings.push(rowToBooking(rows[i]));
    }
  }

  bookings.reverse();
  return jsonResponse({ ok: true, bookings: bookings });
}

function handleAdminLogin(data) {
  const passcode = String(data.passcode || '').trim();
  if (passcode !== getAdminPasscode()) {
    return jsonResponse({ ok: false, error: 'Incorrect admin passcode.' });
  }
  return jsonResponse({ ok: true });
}

function handleAdminGetBookings(data) {
  const passcode = String(data.passcode || '').trim();
  if (passcode !== getAdminPasscode()) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const { bookingsSheet } = ensureSheets();
  const rows = bookingsSheet.getDataRange().getValues();
  const bookings = [];

  for (let i = 1; i < rows.length; i++) {
    bookings.push(rowToBooking(rows[i]));
  }

  bookings.reverse();
  return jsonResponse({ ok: true, bookings: bookings });
}

function handleAdminUpdateBooking(data) {
  const passcode = String(data.passcode || '').trim();
  if (passcode !== getAdminPasscode()) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const bookingId = String(data.bookingId || '').trim();
  if (!bookingId) {
    return jsonResponse({ ok: false, error: 'Booking ID is required.' });
  }

  const { bookingsSheet } = ensureSheets();
  const rows = bookingsSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === bookingId) {
      const rowNum = i + 1;
      if (data.printerAssigned !== undefined) {
        bookingsSheet.getRange(rowNum, 15).setValue(data.printerAssigned);
      }
      if (data.estimatedWeightGrams !== undefined) {
        const w = data.estimatedWeightGrams === '' || data.estimatedWeightGrams === null ? '' : Number(data.estimatedWeightGrams);
        bookingsSheet.getRange(rowNum, 18).setValue(w);
      }
      if (data.estimatedHours !== undefined) {
        const h = data.estimatedHours === '' || data.estimatedHours === null ? '' : Number(data.estimatedHours);
        bookingsSheet.getRange(rowNum, 19).setValue(h);
      }
      if (data.estimatedMinutes !== undefined) {
        const m = data.estimatedMinutes === '' || data.estimatedMinutes === null ? '' : Number(data.estimatedMinutes);
        bookingsSheet.getRange(rowNum, 20).setValue(m);
      }
      if (data.supportRequired !== undefined) {
        bookingsSheet.getRange(rowNum, 21).setValue(data.supportRequired);
      }
      if (data.jobStatus !== undefined) {
        bookingsSheet.getRange(rowNum, 29).setValue(data.jobStatus);
      }
      if (data.priceToPay !== undefined) {
        const val = data.priceToPay === '' || data.priceToPay === null ? '' : Number(data.priceToPay);
        bookingsSheet.getRange(rowNum, 30).setValue(val);
      }
      if (data.paymentStatus !== undefined) {
        bookingsSheet.getRange(rowNum, 31).setValue(data.paymentStatus);
      }
      if (data.adminNotes !== undefined) {
        bookingsSheet.getRange(rowNum, 32).setValue(data.adminNotes);
      }
      bookingsSheet.getRange(rowNum, 33).setValue(new Date().toISOString());

      const updatedRow = bookingsSheet.getRange(rowNum, 1, 1, 33).getValues()[0];
      return jsonResponse({ ok: true, booking: rowToBooking(updatedRow) });
    }
  }

  return jsonResponse({ ok: false, error: 'Booking not found.' });
}

function handleAdminDownloadFile(data) {
  const passcode = String(data.passcode || '').trim();
  if (passcode !== getAdminPasscode()) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const fileId = String(data.fileId || '').trim();
  if (!fileId) {
    return jsonResponse({ ok: false, error: 'File ID is required.' });
  }

  const file = DriveApp.getFileById(fileId);
  const bytes = file.getBlob().getBytes();
  return jsonResponse({
    ok: true,
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    base64: Utilities.base64Encode(bytes)
  });
}
