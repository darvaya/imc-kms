#!/usr/bin/env node

/**
 * HSSE Bulk Importer for IMC Pelita Logistik KMS (Fixed Version)
 * 
 * This script imports markdown documents into Outline KMS via the API,
 * preserving the folder structure as nested documents.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = process.env.OUTLINE_API_URL || 'http://localhost:3000';
const API_TOKEN = process.env.OUTLINE_API_TOKEN;
const SOURCE_DIR = path.join(__dirname, '..', 'KMS-Demo', '01-HSSE');
const COLLECTION_NAME = 'HSSE v2';
const COLLECTION_DESCRIPTION = 'Health, Safety, Security, Environment documentation for IMC Pelita Logistik';
const COLLECTION_COLOR = '#E53935';

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

// Get the display name for a directory
function getDirDisplayName(dirName) {
    return dirName
        .replace(/^\d+-/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

async function importDirectory(dirPath, collectionId, parentDocumentId, depth = 0) {
    const indent = '  '.repeat(depth);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Separate files and directories
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
    const dirs = entries.filter(e => e.isDirectory());

    // Sort files: index first, then by name
    files.sort((a, b) => {
        if (a.name.startsWith('00-')) return -1;
        if (b.name.startsWith('00-')) return 1;
        return a.name.localeCompare(b.name);
    });

    // Sort directories by name
    dirs.sort((a, b) => a.name.localeCompare(b.name));

    // First, create all file documents at this level
    for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        const content = fs.readFileSync(filePath, 'utf8');
        const title = extractTitleFromMarkdown(content, file.name);
        const text = removeH1FromContent(content);

        console.log(`${indent}📄 ${title}`);
        const doc = await createDocument(title, text, collectionId, parentDocumentId);
        console.log(`${indent}   ✅ ${doc.id}`);
        await sleep(API_DELAY);
    }

    // Then, process subdirectories
    for (const dir of dirs) {
        const subDirPath = path.join(dirPath, dir.name);
        const indexPath = path.join(subDirPath, '00-index.md');

        let sectionDoc;
        let sectionTitle;

        if (fs.existsSync(indexPath)) {
            // Use the index file as the section document
            const content = fs.readFileSync(indexPath, 'utf8');
            sectionTitle = extractTitleFromMarkdown(content, dir.name);
            const text = removeH1FromContent(content);

            console.log(`${indent}📁 ${sectionTitle}`);
            sectionDoc = await createDocument(sectionTitle, text, collectionId, parentDocumentId);
        } else {
            // Create a section document from directory name
            sectionTitle = getDirDisplayName(dir.name);

            console.log(`${indent}📁 ${sectionTitle}`);
            sectionDoc = await createDocument(sectionTitle, `# ${sectionTitle}\n\nSection overview.`, collectionId, parentDocumentId);
        }

        console.log(`${indent}   ✅ ${sectionDoc.id}`);
        await sleep(API_DELAY);

        // Get all content files in this subdirectory (excluding index)
        const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
        const subFiles = subEntries
            .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('00-'))
            .sort((a, b) => a.name.localeCompare(b.name));
        const subDirs = subEntries
            .filter(e => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name));

        // Create child documents under this section
        for (const subFile of subFiles) {
            const filePath = path.join(subDirPath, subFile.name);
            const content = fs.readFileSync(filePath, 'utf8');
            const title = extractTitleFromMarkdown(content, subFile.name);
            const text = removeH1FromContent(content);

            console.log(`${indent}  📄 ${title}`);
            const doc = await createDocument(title, text, collectionId, sectionDoc.id);
            console.log(`${indent}     ✅ ${doc.id}`);
            await sleep(API_DELAY);
        }

        // Recursively process nested directories
        for (const subDir of subDirs) {
            await importDirectory(path.join(subDirPath, subDir.name), collectionId, sectionDoc.id, depth + 1);
        }
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('HSSE Bulk Importer for IMC Pelita Logistik KMS');
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
        // Step 1: Create the collection
        const collection = await createCollection();
        console.log();

        // Step 2: Import starting from the root HSSE directory
        await importDirectory(SOURCE_DIR, collection.id, null, 0);

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
