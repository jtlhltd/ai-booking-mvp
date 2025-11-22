# Quick Fix: VAPI Voice Slurring

## The Problem
Your VAPI assistant sometimes slurs words or has weird speech patterns.

## The Solution (2 Options)

### Option 1: Use the Script (Easiest) ⚡

**PowerShell (Windows):**
```powershell
# Set your VAPI key (one time)
$env:VAPI_PRIVATE_KEY = "your-vapi-private-key"

# Run the fix script
.\scripts\fix-vapi-voice-settings.ps1 -AssistantId "your-assistant-id"
```

**Node.js:**
```bash
# Set your VAPI key (one time)
export VAPI_PRIVATE_KEY="your-vapi-private-key"

# Run the fix script
node scripts/fix-vapi-voice-settings.js "your-assistant-id"
```

### Option 2: Manual Fix in VAPI Dashboard 🖱️

1. Go to https://dashboard.vapi.ai
2. Navigate to **Assistants** → Find your assistant
3. Click **Edit**
4. Update **Voice** settings:
   - **Stability**: `0.75` (increase from default)
   - **Clarity**: `0.85` (increase)
   - **Style**: `0.15` (decrease from default)
   - **Similarity Boost**: `0.75`
   - **Use Speaker Boost**: `ON`
5. Update **Model** settings:
   - **Temperature**: `0.3` (decrease from default 0.7)
6. Click **Save**

## What These Settings Do

- **Stability (0.75)**: Higher = clearer, more consistent speech
- **Style (0.15)**: Lower = less expressive but more stable (prevents slurring)
- **Clarity (0.85)**: Higher = clearer pronunciation
- **Temperature (0.3)**: Lower = more consistent speech patterns

## Finding Your Assistant ID

1. Go to VAPI Dashboard → Assistants
2. Click on your assistant
3. The ID is in the URL or at the top of the page
4. Or check your client config in the database

## Test After Fixing

Make a test call and verify:
- ✅ No slurring or mumbling
- ✅ Clear, crisp pronunciation
- ✅ Consistent speech rate
- ✅ Natural pauses

## Still Having Issues?

If problems persist:
1. Increase **Stability** to `0.8`
2. Decrease **Style** to `0.1`
3. Decrease **Temperature** to `0.2`
4. Try a different voice model
5. Check network/phone line quality

See `docs/VAPI-VOICE-FIX-GUIDE.md` for detailed troubleshooting.

