# Client Management Scripts

Quick reference guide for managing clients with the new scripts.

## 📋 Available Scripts

### 1. **Create Client** (Enhanced)
```bash
node scripts/create-demo-client.js
```

**New Features:**
- Optional field prompts (phone, hours, timezone, description, tagline)
- Auto-generates missing fields with industry defaults
- Preview mode: `--preview` or `-p` flag
- Integration status shown after creation

**Examples:**
```bash
# Interactive mode
node scripts/create-demo-client.js

# With preview
node scripts/create-demo-client.js --preview

# Command line args
node scripts/create-demo-client.js "Business Name" "fitness" "Service 1, Service 2"
```

---

### 2. **List All Clients**
```bash
node scripts/list-clients.js
```

**Options:**
- `--detailed` or `-d` - Show full details for each client

**Example:**
```bash
node scripts/list-clients.js --detailed
```

**Output:**
- Lists all clients from database and local files
- Shows basic info (name, key, industry, assistant status)
- With `--detailed`: shows full configuration

---

### 3. **Show Client Details**
```bash
node scripts/show-client.js <clientKey>
```

**Example:**
```bash
node scripts/show-client.js stay-focused-fitness-chris
```

**Shows:**
- Basic information (name, industry, services, location)
- Contact & hours (phone, timezone, business hours)
- Branding (logo, colors, font)
- Content (description, tagline)
- Integrations (Vapi, Calendar, Twilio)
- Booking configuration
- Dashboard URL

---

### 4. **Verify Client Setup**
```bash
node scripts/verify-client.js <clientKey>
```

**Example:**
```bash
node scripts/verify-client.js stay-focused-fitness-chris
```

**Checks:**
- ✅ Required fields present
- 📝 Recommended fields status
- 🤖 Vapi assistant exists and is configured
- 🌐 Dashboard is accessible
- 🔌 Integration status (Vapi, Calendar, Twilio)

**Output:**
- Detailed verification report
- Missing field warnings
- Integration status
- Overall readiness score

---

### 5. **Update Client**
```bash
node scripts/update-client.js <clientKey> [options]
```

**Options:**
- `--phone <number>` - Update phone number
- `--hours <hours>` - Update business hours
- `--timezone <tz>` - Update timezone
- `--description <text>` - Update description
- `--tagline <text>` - Update tagline
- `--logo <emoji>` - Update logo (emoji)
- `--color-primary <hex>` - Update primary color
- `--color-secondary <hex>` - Update secondary color
- `--color-accent <hex>` - Update accent color

**Examples:**
```bash
# Update phone and hours
node scripts/update-client.js stay-focused-fitness-chris \
  --phone "+44 7491 683261" \
  --hours "9am-8pm, Mon-Sat"

# Update description
node scripts/update-client.js stay-focused-fitness-chris \
  --description "Your custom description here"

# Update branding
node scripts/update-client.js stay-focused-fitness-chris \
  --logo "💪" \
  --color-primary "#ff0000"
```

**Note:** Updates both database (if connected) and local file.

---

## 🔄 Common Workflows

### **Create a New Client**
```bash
# 1. Create with preview
node scripts/create-demo-client.js --preview

# 2. Verify it was created correctly
node scripts/verify-client.js <clientKey>

# 3. View details
node scripts/show-client.js <clientKey>
```

### **Update Missing Fields**
```bash
# 1. Check what's missing
node scripts/verify-client.js <clientKey>

# 2. Update specific fields
node scripts/update-client.js <clientKey> \
  --phone "+44 7491 683261" \
  --hours "9am-8pm, Mon-Sat"

# 3. Verify again
node scripts/verify-client.js <clientKey>
```

### **List All Your Clients**
```bash
# Quick list
node scripts/list-clients.js

# Detailed list
node scripts/list-clients.js --detailed
```

---

## 📝 Tips

1. **Skip Optional Fields**: You can press Enter to skip optional prompts and add them later with `update-client.js`

2. **Preview Before Creating**: Use `--preview` flag to see what will be generated before committing

3. **Verify After Creation**: Always run `verify-client.js` after creating to ensure everything is set up correctly

4. **Update vs Re-create**: Use `update-client.js` for small changes instead of re-running the full creation script

5. **Local Files**: If database isn't connected, scripts work with local JSON files in `demos/` folder

---

## 🚀 Quick Reference

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `create-demo-client.js` | Create new client | Setting up a new prospect/demo |
| `list-clients.js` | List all clients | See what clients you have |
| `show-client.js` | Show client details | Get full info about a client |
| `verify-client.js` | Verify setup | Check if client is ready to use |
| `update-client.js` | Update fields | Fix missing or incorrect fields |

---

## ❓ Troubleshooting

**Client not found?**
- Check if it exists: `node scripts/list-clients.js`
- Verify the client key is correct
- Check both database and `demos/` folder

**Database not connected?**
- Scripts will use local JSON files in `demos/` folder
- Updates will save to local files only
- Verify script will check local files

**Missing fields?**
- Use `verify-client.js` to see what's missing
- Use `update-client.js` to add missing fields
- Or re-run `create-demo-client.js` with the same business name (it will update)

