# 🛡️ SAFE CLEANUP PROCESS - ZERO-RISK APPROACH

## ⚠️ CRITICAL RULE: **TEST AFTER EVERY CHANGE**

We will NOT delete anything until we verify it's truly unused.

---

## 📋 PHASE 1: DISCOVERY - UNDERSTAND WHAT'S ACTUALLY USED

### Step 1: Analyze server.js imports
Find every file that server.js actually requires/imports

### Step 2: Analyze /lib directory
Find every file that /lib modules import

### Step 3: Analyze /public directory
Find every HTML/JS file that's actually served

### Step 4: Analyze package.json scripts
Find which files are referenced in npm scripts

### Step 5: Create dependency map
Document: "File X is used by Y for purpose Z"

---

## 📋 PHASE 2: SAFE ARCHIVING (NOT DELETION)

### Step 1: Create /archive directory
```bash
mkdir archive
mkdir archive/docs
mkdir archive/old-scripts
mkdir archive/tests
```

### Step 2: Move (NOT delete) non-critical files
- Move old Vapi scripts → `/archive/old-scripts/`
- Move test scripts → `/archive/tests/`
- Move analysis docs → `/archive/docs/`

### Step 3: Test after each move
```bash
# After moving each batch:
npm start                    # Does server start?
curl http://localhost:3000/health  # Is it responding?
```

### Step 4: Keep archive in Git
- Commit the archive
- Nothing is lost, just organized

---

## 📋 PHASE 3: VERIFICATION - PROVE IT STILL WORKS

### Checklist After Each Change:
```
[ ] Server starts without errors
[ ] Database connection works
[ ] /health endpoint responds
[ ] Client dashboard loads
[ ] Lead import works
[ ] Vapi webhooks work
[ ] All /public pages load
```

---

## 🔍 LET'S START WITH DISCOVERY

Before we move/delete ANYTHING, let's understand what's actually in use.

I'll run these checks:
1. What does server.js import?
2. What does /lib/* import?
3. What files are in /public and are they linked?
4. What's in package.json scripts?

Then I'll create a **DEPENDENCY MAP** showing:
```
✅ CRITICAL - Used in production
⚠️  MAYBE - Might be used
❌ SAFE - Not used anywhere
```

Only after we have this map, we move files (to archive, not delete).

---

## 🎯 EXECUTION STRATEGY

### Option A: SUPER SAFE (Recommended)
1. Create archive directory
2. Move 5-10 files at a time
3. Test after each batch
4. Commit after each successful test
5. If something breaks, revert immediately

### Option B: SURGICAL
1. Only move files we're 100% sure are unused
2. Leave everything else alone
3. Test extensively
4. Commit

### Option C: DOCUMENT ONLY
1. Don't move anything
2. Just create a clear README explaining what each file does
3. Add comments/organization without touching files

---

## 🚀 RECOMMENDED FIRST STEP

**Let me analyze the codebase first** and create a dependency map.

Then YOU decide what's safe to move.

Sound good?

