# Troubleshooting VAPI Structured Outputs

## Issue
Validation error: "missing item type configuration" for `mainCouriers` and `mainCountries` arrays

## Step-by-Step Fix

### 1. Check Array Configuration

For BOTH `mainCouriers` and `mainCountries`:

#### Required Settings:
- **Type**: Array ✓
- **Required**: Unchecked (optional) ✓
- **Extraction Description**: Set ✓

#### Array Constraints:
- **Min Items**: 0
- **Max Items**: 100 (or blank for unlimited)
- **Unique Items**: OFF (toggle OFF)

### 2. Check Nested Item Configuration

Click into each array and verify the nested item (e.g., `courier` or `country`):

#### Required Settings:
- **Property Name**: `courier` (for mainCouriers) or `country` (for mainCountries)
- **Type**: String (green dot)
- **Required**: CHECKED ✓
- **Extraction Description**: Fill in the description

#### String Constraints for Nested Item:
- **Min Length**: 0
- **Max Length**: 100 (or blank)
- **Format**: None
- **Pattern (Regex)**: LEAVE EMPTY (this is important!)
- **Enum Values**: OFF

### 3. Try These Fixes

**Fix A: Re-create the nested items**
1. Expand `mainCouriers`
2. Find the nested `courier` item
3. Delete it (trash icon or X button)
4. Click "+ Add Item"
5. Property name: `courier`
6. Type: String
7. Description: "Name of a courier company"
8. Required: ✓
9. Pattern: Leave EMPTY
10. Save the item

Repeat for `mainCountries` → `country`

**Fix B: Check for hidden fields**
- Make sure there are no extra dropdowns or fields that weren't filled
- Look for any red error indicators next to fields

**Fix C: Check the gear icon**
- If there's a gear icon next to the nested item, click it
- Make sure all advanced settings are configured

### 4. Alternative: Try Simpler Schema

If still failing, try creating a MINIMAL test schema:

1. Delete the current structured output
2. Create new one with just:
   - `businessName` (String, Required)
   - `phone` (String, Required)
   - `email` (String, optional)

3. Save and see if this works
4. If yes, gradually add back the array fields

### 5. Last Resort: Check VAPI Documentation

This might be a VAPI UI bug. Check:
- VAPI dashboard for known issues
- Try a different browser
- Clear cache and try again

## What Should Work

When properly configured:
- Both arrays show as "Array" type
- Each has ONE nested item underneath
- Nested item is "String" type
- No Pattern (Regex) set
- Can save without validation errors


