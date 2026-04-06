#!/usr/bin/env node

/**
 * Company Overview Bulk Importer for IMC Pelita Logistik KMS
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.OUTLINE_API_URL || 'http://localhost:3000';
const API_TOKEN = process.env.OUTLINE_API_TOKEN;
const SOURCE_DIR = path.join(__dirname, '..', 'KMS-Demo', '03-Company-Overview');
const COLLECTION_NAME = 'Company Overview';
const COLLECTION_DESCRIPTION = 'About IMC Pelita Logistik - history, leadership, culture, and certifications';
const COLLECTION_COLOR = '#7B1FA2'; // Purple

const API_DELAY = 300;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiCall(endpoint, body) {
    const response = await fetch(`${API_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error ${response.status}: ${text}`);
    }

    return response.json();
}

async function createCollection() {
    console.log(`Creating collection: ${COLLECTION_NAME}...`);

    const result = await apiCall('collections.create', {
        name: COLLECTION_NAME,
        description: COLLECTION_DESCRIPTION,
        color: COLLECTION_COLOR,
        permission: 'read_write',
    });

    console.log(`✅ Collection created: ${result.data.id}`);
    return result.data;
}

async function createDocument(title, text, collectionId, parentDocumentId = null) {
    const result = await apiCall('documents.create', {
        title,
        text,
        collectionId,
        parentDocumentId,
        publish: true,
    });

    return result.data;
}

function extractTitleFromMarkdown(content, filename) {
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
        return match[1].trim();
    }
    return filename
        .replace(/^\d+-/, '')
        .replace(/\.md$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function removeH1FromContent(content) {
    return content.replace(/^#\s+.+\n+/, '');
}

async function main() {
    console.log('='.repeat(60));
    console.log('Company Overview Importer for IMC Pelita Logistik KMS');
    console.log('='.repeat(60));
    console.log();

    if (!API_TOKEN) {
        console.error('❌ Error: OUTLINE_API_TOKEN environment variable is required');
        process.exit(1);
    }

    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`❌ Error: Source directory not found: ${SOURCE_DIR}`);
        process.exit(1);
    }

    console.log(`📂 Source: ${SOURCE_DIR}`);
    console.log(`🌐 API URL: ${API_URL}`);
    console.log();

    try {
        const collection = await createCollection();
        console.log();

        // Get all markdown files in the directory (flat structure)
        const files = fs.readdirSync(SOURCE_DIR)
            .filter(f => f.endsWith('.md'))
            .sort();

        for (const file of files) {
            const filePath = path.join(SOURCE_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const title = extractTitleFromMarkdown(content, file);
            const text = removeH1FromContent(content);

            console.log(`📄 ${title}`);
            const doc = await createDocument(title, text, collection.id, null);
            console.log(`   ✅ ${doc.id}`);
            await sleep(API_DELAY);
        }

        console.log();
        console.log('='.repeat(60));
        console.log('✅ Import completed successfully!');
        console.log('='.repeat(60));
        console.log();
        console.log(`Open your KMS at: ${API_URL}`);
        console.log(`Navigate to the "${COLLECTION_NAME}" collection.`);

    } catch (error) {
        console.error();
        console.error('❌ Error during import:', error.message);
        process.exit(1);
    }
}

main();
