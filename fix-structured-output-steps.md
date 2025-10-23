# Fix Steps for VAPI Structured Outputs

## The Issue
"missing item type configuration" error for arrays

## Try This First - Check Min Items

**For both `mainCouriers` and `mainCountries`:**

1. Expand the array
2. Look at **Array Constraints** section
3. Find **"Min Items"** field
4. **Set it to 0** (not 1!)
5. Click Save on the item

## Why This Matters

VAPI validation is checking if arrays with `minItems > 0` have properly configured items. Setting Min Items to 0 tells VAPI "this array can be empty" which might bypass the validation check.

## Alternative Fix - Check Array-level Required

1. Expand `mainCouriers`
2. Find the **"Required"** checkbox at the ARRAY level (not the item level)
3. Make sure it's **UNCHECKED**
4. The nested item (`courier`) should have Required CHECKED
5. But the ARRAY itself should be optional

Repeat for `mainCountries`

## Step-by-Step Rebuild

If still failing, delete and rebuild:

### For `mainCouriers`:
1. Delete all nested items
2. Click "+ Add Item"
3. **Property name**: `item` (try simpler name)
4. **Type**: String
5. **Description**: "Courier name"
6. **Required**: ✓
7. **Pattern**: Leave empty
8. **Array Constraints → Min Items**: 0
9. Save

### For `mainCountries`:
1. Delete all nested items  
2. Click "+ Add Item"
3. **Property name**: `item` (try simpler name)
4. **Type**: String
5. **Description**: "Country name"
6. **Required**: ✓
7. **Pattern**: Leave empty
8. **Array Constraints → Min Items**: 0
9. Save

## Key Points

- **Array Required**: Unchecked
- **Item Required**: Checked
- **Array Min Items**: 0
- **Item Pattern**: Empty
- **Property Name**: Try `item` instead of `courier`/`country`

