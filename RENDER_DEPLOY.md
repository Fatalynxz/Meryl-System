# Render Deployment Guide - Meryl Shoes System

## Prerequisites
- GitHub account with the repository pushed (✅ Already done)
- Render account (free at https://render.com)
- Supabase project with database schema set up
- Gmail app-specific password for OTP emails

## Step-by-Step Deployment

### 1. Create a Render Account & Connect GitHub
- Go to https://render.com and sign up
- Click "New +" → "Web Service"
- Select "Build and deploy from a Git repository"
- Click "Connect" next to your GitHub account
- Authorize Render to access your repositories

### 2. Select Your Repository
- Search for "meryl-system" in the repository list
- Click "Connect" next to it

### 3. Configure the Web Service
Fill in the following details:

**Name:** `meryl-system`

**Environment:** `Python 3`

**Build Command:**
```
pip install -r requirements.txt
```

**Start Command:**
```
gunicorn app:app --bind 0.0.0.0:$PORT
```

**Plan:** Free (recommended for testing)

### 4. Add Environment Variables
Click "Advanced" → "Add Environment Variable" for each:

| Key | Value |
|-----|-------|
| `FLASK_ENV` | `production` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Your Supabase public API key |
| `GMAIL_APP_EMAIL` | Your Gmail address |
| `GMAIL_APP_PASSWORD` | Your Gmail app-specific password |

**How to get Supabase credentials:**
1. Go to https://supabase.com
2. Open your project
3. Click "Settings" → "API"
4. Copy "Project URL" and "public" key

**How to get Gmail app password:**
1. Enable 2FA on your Gmail account
2. Go to https://myaccount.google.com/apppasswords
3. Select Mail → Windows Computer
4. Copy the 16-character password

### 5. Deploy
Click "Create Web Service"

Render will start building and deploying automatically. The build takes 2-5 minutes.

### 6. Monitor Your Deployment
- Go to your service dashboard on Render
- Check "Logs" tab to see if the app started successfully
- Copy your service URL (e.g., `https://meryl-system.onrender.com`)

## Testing Your Deployment

Once deployed, test these endpoints:

```bash
# Test login endpoint
curl -X POST https://meryl-system.onrender.com/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Test dashboard
curl https://meryl-system.onrender.com/dashboard
```

## What Happens Now

- **Auto-Deploy Active:** Every time you push to GitHub, Render automatically rebuilds and deploys
- **Free Tier Limits:**
  - App spins down after 15 minutes of inactivity (slow cold start)
  - Limited resources (shared CPU/RAM)
  - Perfect for testing, not production

## Troubleshooting

**Build fails?**
- Check the Logs tab for errors
- Ensure all requirements in `requirements.txt` are compatible
- Verify environment variables are set

**App crashes after deploy?**
- Check Logs for runtime errors
- Verify SUPABASE_URL and SUPABASE_KEY are correct
- Make sure Supabase database is accessible

**Can't connect to Supabase?**
- Verify your Supabase project is running
- Check if the database schema is deployed
- Confirm SUPABASE_URL doesn't have trailing slashes

## Next Steps

1. ✅ Git sync set up (auto-push enabled)
2. ✅ Render deployment configured
3. **Coming next:** Test the deployment and monitor logs

Push your changes to trigger the first deployment:
```bash
git status
```

The `render.yaml` and updated `requirements.txt` will auto-push, and Render will start building immediately!

## Switching from Free to Paid (if needed)

When ready for production:
- Go to your Render dashboard
- Click service → Settings → Instance Type
- Choose a paid plan for always-on hosting without cold starts
