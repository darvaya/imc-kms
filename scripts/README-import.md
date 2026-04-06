# HSSE Import Script

Bulk import script for importing HSSE markdown documents into the IMC Pelita Logistik KMS.

## Prerequisites

1. The KMS application must be running
2. You need an API token from Outline

## Getting Your API Token

1. Log into your Outline KMS instance
2. Go to **Settings** → **API Tokens**
3. Click **Create Token**
4. Give it a name (e.g., "Import Script")
5. Copy the generated token

## Usage

### 1. Set Environment Variables

```bash
export OUTLINE_API_URL="http://localhost:3000"  # or your production URL
export OUTLINE_API_TOKEN="your-api-token-here"
```

### 2. Run the Import

```bash
cd /Users/rihanrauf/Documents/00.\ Professional/IMC-Pelita-Logistik/KMS
node scripts/import-hsse.js
```

## What It Does

1. Creates a new "HSSE" collection
2. Imports all 51 markdown documents from `KMS-Demo/01-HSSE/`
3. Preserves the folder structure as nested documents
4. Publishes all documents immediately

## Output

The script will show progress as it imports:

```
============================================================
HSSE Bulk Importer for IMC Pelita Logistik KMS
============================================================

📂 Source: /path/to/KMS-Demo/01-HSSE
🌐 API URL: http://localhost:3000

Creating collection: HSSE...
✅ Collection created: abc123

📄 Creating root document: HSSE Overview
   ✅ Created: doc123
📁 Creating section: Safety Management System
   ✅ Created: doc456
  📄 Creating document: ISM Code Compliance
     ✅ Created: doc789
...

============================================================
✅ Import completed successfully!
============================================================
```

## Troubleshooting

### "401 Unauthorized"
- Check that your API token is correct
- Ensure the token has not expired

### "Rate limit exceeded"
- The script includes delays between API calls
- If you still hit limits, increase `API_DELAY` in the script

### "Collection already exists"
- Delete the existing HSSE collection first, or
- Modify `COLLECTION_NAME` in the script to use a different name
