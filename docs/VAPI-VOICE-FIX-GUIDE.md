# VAPI Voice Quality Fix Guide

## Problem: Voice Slurring & Weird Speech Patterns

If your VAPI assistant is slurring words or having weird speech issues, it's usually caused by incorrect voice settings.

## Solution: Optimize Voice Settings

### Recommended Voice Settings (ElevenLabs)

These settings provide **clear, stable, professional speech**:

```json
{
  "voice": {
    "provider": "11labs",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",  // Or your chosen voice
    "stability": 0.75,        // HIGHER = more stable, clearer speech (0.7-0.8 recommended)
    "clarity": 0.85,          // Higher = clearer pronunciation
    "style": 0.15,            // LOWER = less expressive, more consistent (0.1-0.2 recommended)
    "similarityBoost": 0.75,  // How closely it matches the original voice
    "useSpeakerBoost": true   // Enhances clarity
  }
}
```

### Key Settings Explained

1. **Stability (0.7-0.8)** - **MOST IMPORTANT**
   - Higher = more consistent, clearer speech
   - Lower = more expressive but can slur
   - **Recommended: 0.75** for professional calls

2. **Style (0.1-0.2)** - **SECOND MOST IMPORTANT**
   - Higher = more expressive but can cause weird patterns
   - Lower = more consistent, professional
   - **Recommended: 0.15** to avoid slurring

3. **Clarity (0.8-0.9)**
   - Higher = clearer pronunciation
   - **Recommended: 0.85**

4. **Similarity Boost (0.7-0.8)**
   - How closely it matches the original voice
   - **Recommended: 0.75**

### Model Settings (Also Important)

```json
{
  "model": {
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.3,      // LOWER = more consistent speech patterns (0.2-0.4)
    "maxTokens": 200         // Shorter responses = less chance of issues
  }
}
```

**Temperature**: Lower temperature (0.2-0.4) = more consistent, predictable speech. Higher (0.7+) can cause weird patterns.

## How to Fix in VAPI Dashboard

1. Go to https://dashboard.vapi.ai
2. Navigate to **Assistants**
3. Find your assistant (e.g., "Stay Focused Fitness Assistant")
4. Click **Edit**
5. Scroll to **Voice** section
6. Update these settings:
   - **Stability**: `0.75`
   - **Clarity**: `0.85`
   - **Style**: `0.15`
   - **Similarity Boost**: `0.75`
   - **Use Speaker Boost**: `ON`
7. Scroll to **Model** section
8. Update:
   - **Temperature**: `0.3`
9. Click **Save**

## Quick Test

After updating, make a test call and listen for:
- ✅ Clear, crisp pronunciation
- ✅ No slurring or mumbling
- ✅ Consistent speech rate
- ✅ Natural pauses

If still having issues:
- Increase **Stability** to `0.8`
- Decrease **Style** to `0.1`
- Decrease **Temperature** to `0.2`

## Alternative: Use Different Voice

Some voices are more stable than others. If issues persist:
- Try a different ElevenLabs voice ID
- Consider using **OpenAI TTS** (more stable but less natural)
- Test with **ElevenLabs Turbo** model (faster, sometimes clearer)

## Common Issues & Fixes

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| Slurring words | Low stability, high style | Increase stability to 0.75+, decrease style to 0.15 |
| Weird pauses | High temperature | Decrease temperature to 0.3 |
| Robotic sound | Too high stability | Decrease stability to 0.7 |
| Inconsistent speed | High style | Decrease style to 0.15 |
| Mumbling | Low clarity | Increase clarity to 0.85+ |

## Need Help?

If you're still having issues after these fixes, check:
1. Network connection quality
2. Phone line quality
3. Try a different voice model
4. Contact VAPI support with your assistant ID

