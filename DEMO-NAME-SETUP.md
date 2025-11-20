# Setting Your Name for Demo Calls

## Quick Setup

Add your name to your `.env` file:

```bash
DEMO_USER_NAME=Jonah
```

Or:

```bash
YOUR_NAME=Jonah
```

## What This Does

When you create a demo and the VAPI assistant calls you:
- ✅ It will say **"Hi Jonah!"** (your name)
- ❌ Instead of **"Hi Name!"** (placeholder)
- ❌ Instead of the prospect's name

## Why?

During demos, **you** are the person being called (the lead). The assistant should use **your name**, not the prospect's name (who you're doing the demo for).

## Example

1. You're doing a demo for "Chris" (the prospect)
2. You set `DEMO_USER_NAME=Jonah` in `.env`
3. When the assistant calls you during the demo, it says: **"Hi Jonah! This is Stay Focused Fitness calling..."**
4. Perfect! ✅

## Without Setting It

If you don't set `DEMO_USER_NAME`, the assistant will say:
- "Hi there!" (generic fallback)

This works but isn't as personal.

