# 3D Printer Session Booking & Job Request System

A digital replacement for the paper **3D Printer Session Booking & Job Request Form**, split into two separate web applications backed by **Google Sheets** (database) and **Google Drive** (STL/3MF file storage) via **Google Apps Script**.

## Project Structure

```text
3d-print-booking/
├── client/                 # Student Client Portal (HTML + CSS + JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── admin/                  # Lab Admin Console (HTML + CSS + JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── apps-script/
│   └── Code.gs             # Google Apps Script backend (Sheets + Drive)
└── README.md
```

## Features

- **Student Client Portal (`client/`)**
  - **Single-Name Account Rule**: Students register and sign in with **one First Name only** (no commas or spaces) and their **Last Name as password**.
  - **Digital Booking Form**: Captures all sections from the physical form — Student & Contact Info, 5-item Design & Model Pre-Check Checklist (`Yes/No`), Print Job & Material Details (Printer, Filament Type/Color, Weight in grams, Duration, Support Structure, Purpose), and Lab Rules & Digital Signature.
  - **STL / 3MF Upload**: Drag-and-drop `.STL` or `.3MF` upload saved directly to Google Drive.
  - **My Bookings & Fees**: Students can view their job status, admin notes, payment status (`Unpaid` / `Paid`), and the exact **Amount to Pay (`₱`)** set by the admin.

- **Lab Admin Console (`admin/`)**
  - Passcode-protected admin workspace (default: `admin1234`).
  - Live queue metrics, search, and filtering by job status or payment status.
  - **Download STL/3MF** directly from Google Drive for slicing in Bambulab Studio.
  - **Set Amount to Pay (`₱`)**, update payment status (`Paid`/`Unpaid`), update job status (`Pending Review`, `Approved`, `Printing`, `Ready for Pickup`, `Completed`, `Rejected`), and send notes to the student.

---

## Setup Guide: Google Sheets + Google Drive (Apps Script)

1. **Create a Google Sheet**:
   - Go to [sheets.new](https://sheets.new) and name it `3D Print Lab Database`.
2. **Open Apps Script**:
   - In the sheet menu, click **Extensions → Apps Script**.
   - Delete any existing code in `Code.gs` and paste the entire contents of `apps-script/Code.gs`.
   - Click **Save** (`Ctrl+S` / `Cmd+S`).
3. **(Optional) Change the Admin Passcode**:
   - In Apps Script, go to **Project Settings** (gear icon) → **Script Properties** → **Add script property**:
     - Property: `ADMIN_PASSCODE`
     - Value: your preferred passcode (defaults to `admin1234` if not set).
4. **Deploy as Web App**:
   - Click **Deploy → New deployment**.
   - Click the gear icon next to *Select type* and choose **Web app**.
   - Set **Execute as**: `Me`
   - Set **Who has access**: `Anyone`
   - Click **Deploy**, authorize Google Sheets & Drive permissions when prompted, and copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).
5. **Connect Client & Admin Apps**:
   - Open `client/index.html` and `admin/index.html` in your browser (or host them on any static host like GitHub Pages, Netlify, or Vercel).
   - Click the **Local Preview** button in the top-right corner of both apps, paste your **Web App URL**, and click **Save Connection**.
   - The `Students` and `Bookings` tabs in your Google Sheet and the `3D_Print_STL_Uploads` folder in your Google Drive will be created automatically on the first request.

> **Testing without Google Apps Script:** If no Web App URL is configured, both apps run in **Local Preview Mode** using browser `localStorage` on the same origin so you can test the full workflow immediately.

---

## Hosting on GitHub Pages

1. **Pre-fill your Apps Script URL (Recommended)**:
   - Open `client/app.js` and `admin/app.js` and paste your Google Apps Script Web App URL into `DEFAULT_GAS_URL = 'https://script.google.com/macros/s/.../exec';` at the top of both files.
   - That way, every student and admin who opens your GitHub Pages link is automatically connected to your Google Sheet and Google Drive without any manual setup.
2. **Push to GitHub**:
   - Create a new GitHub repository and push the contents of `3d-print-booking/` to the `main` branch.
3. **Enable GitHub Pages**:
   - In your GitHub repository, go to **Settings → Pages**.
   - Under **Build and deployment → Source**, select **Deploy from a branch**.
   - Select branch `main` and folder `/ (root)`, then click **Save**.
4. **Access Your Live Apps**:
   - Portal Hub: `https://<your-username>.github.io/<repo-name>/`
   - Student Portal (installable PWA + Push Notifications): `https://<your-username>.github.io/<repo-name>/client/`
   - Admin Console (installable PWA): `https://<your-username>.github.io/<repo-name>/admin/`
