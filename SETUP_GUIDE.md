# Meryl Shoes Enterprise System - Setup Guide

## Overview
This document covers the improvements made to the system and how to complete the setup.

## ✅ Completed Improvements

### 1. **Modern UI Design** (COMPLETED)
The login page and entire application UI has been redesigned with a modern, professional dark theme:
- **Color Scheme**: Changed from harsh red/yellow to elegant dark blue with red accents
  - Primary: `#1a1a2e` (Dark navy)
  - Accent: `#e94560` (Modern red)
  - Secondary: `#0f3460` (Deep blue)
- **Style Updates**: 
  - Smooth gradients and shadows
  - Modern rounded corners (12-16px)
  - Better contrast and readability
  - Improved form inputs and buttons
  - Professional login card design

### 2. **OTP Email Configuration Support** (COMPLETED)
The application now properly supports Gmail SMTP for sending OTP codes:
- Added `python-dotenv` package for environment configuration
- Created `.env` and `.env.example` files with clear documentation
- Updated `app.py` to load environment variables at startup

## 🔧 Setup Instructions

### Step 1: Install Dependencies
Flask and python-dotenv are already installed. If needed, run:
```bash
cd c:\Users\ACER\Documents\school\meryl-system
.\.venv\Scripts\pip install -r requirements.txt
```

### Step 2: Configure Gmail SMTP (REQUIRED for OTP emails)

#### 2a. Enable 2-Factor Authentication
1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Click "Security" in the left menu
3. Scroll down to "2-Step Verification"
4. Click "Get started" and follow the prompts

#### 2b. Generate App-Specific Password
1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Select **Mail** from the first dropdown
3. Select your device type from the second dropdown
4. Google will generate a **16-character password** (example: `xxxx xxxx xxxx xxxx`)
5. Copy this password

#### 2c. Update `.env` File
Open `.env` in the project root and fill in:
```env
GMAIL_APP_EMAIL=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

Example:
```env
GMAIL_APP_EMAIL=john.doe@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

### Step 3: Run the Application
```bash
cd c:\Users\ACER\Documents\school\meryl-system
.\.venv\Scripts\python.exe app.py
```

The application should start on `http://localhost:5000`

## 📝 Demo Credentials

### Administrator Access
- **Username**: `admin`
- **Password**: `admin123`

### Sales Staff (Pre-configured)
- **Username**: `salesstaff`
- **Password**: `staff123`

### Create New Account (with OTP)
1. Click "Create Account" on login page
2. Fill in name, username, and Gmail address
3. Enter your Gmail address (must be Gmail)
4. Click "Send OTP"
5. OTP will be sent to your Gmail inbox
6. Enter the 6-digit code to complete registration

## 🔐 Important Security Notes

- **Never commit `.env` to version control** - it contains sensitive credentials
- The `.env.example` file shows the required variables without actual values
- App-specific passwords are different from your Gmail password
- Each app-specific password can only be used for one application

## 📧 Gmail SMTP Settings (If Customization Needed)

Default configuration in `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

These use TLS encryption and are recommended for Gmail.

## 🆘 Troubleshooting

### "Email OTP is not configured" Error
- Ensure `.env` file exists in project root
- Verify `GMAIL_APP_EMAIL` and `GMAIL_APP_PASSWORD` are set
- Check that you're using an app-specific password, NOT your regular Gmail password

### OTP Not Received
- Check spam/junk folder in Gmail
- Verify the email address you entered matches your Gmail
- Ensure Gmail SMTP is not blocked by firewall

### Module Import Errors
Run:
```bash
.\.venv\Scripts\pip install -r requirements.txt
```

## 📂 File Structure
```
meryl-system/
├── app.py                 # Main Flask application
├── .env                   # Environment variables (YOUR CONFIG - not in git)
├── .env.example          # Template for .env file
├── requirements.txt      # Python dependencies
├── templates/            # HTML templates
├── static/
│   └── style.css         # Updated with modern design
└── ... other files
```

## 🎨 UI Changes Summary

### Login Page
- Centered login card with modern styling
- Gradient background (dark blue theme)
- Smooth password toggle animation
- Professional brand logo area
- Clear OTP verification section

### Application Interface
- Dark theme with red accent color
- Improved readability with better contrast
- Modern buttons with hover effects
- Smooth transitions and animations

## ✨ Next Steps

1. ✅ Design improvements - DONE
2. ✅ Dotenv configuration - DONE
3. **↓ Configure Gmail SMTP** (User action required)
4. **↓ Test account creation with OTP**
5. **↓ Deploy to production** (if applicable)

---
**Version**: 1.0  
**Last Updated**: 2026-04-17
