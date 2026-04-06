#!/usr/bin/env node

/**
 * IT Bulk Importer for IMC Pelita Logistik KMS
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.OUTLINE_API_URL || 'http://localhost:3000';
const API_TOKEN = process.env.OUTLINE_API_TOKEN;
const SOURCE_DIR = path.join(__dirname, '..', 'KMS-Demo', '07-IT');
const COLLECTION_NAME = 'IT';
const COLLECTION_DESCRIPTION = 'Information Technology - systems, policies, and support';
const COLLECTION_COLOR = '#5E35B1'; // Deep Purple

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

function getDirDisplayName(dirName) {
    return dirName
        .replace(/^\d+-/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

async function importDirectory(dirPath, collectionId, parentDocumentId, depth = 0) {
    const indent = '  '.repeat(depth);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    const files = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
    const dirs = entries.filter(e => e.isDirectory());

    files.sort((a, b) => {
        if (a.name.startsWith('00-')) return -1;
        if (b.name.startsWith('00-')) return 1;
        return a.name.localeCompare(b.name);
    });

    dirs.sort((a, b) => a.name.localeCompare(b.name));

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

    for (const dir of dirs) {
        const subDirPath = path.join(dirPath, dir.name);
        const indexPath = path.join(subDirPath, '00-index.md');

        let sectionDoc;
        let sectionTitle;

        if (fs.existsSync(indexPath)) {
            const content = fs.readFileSync(indexPath, 'utf8');
            sectionTitle = extractTitleFromMarkdown(content, dir.name);
            const text = removeH1FromContent(content);

            console.log(`${indent}📁 ${sectionTitle}`);
            sectionDoc = await createDocument(sectionTitle, text, collectionId, parentDocumentId);
        } else {
            sectionTitle = getDirDisplayName(dir.name);

            console.log(`${indent}📁 ${sectionTitle}`);
            sectionDoc = await createDocument(sectionTitle, `# ${sectionTitle}\n\nSection overview.`, collectionId, parentDocumentId);
        }

        console.log(`${indent}   ✅ ${sectionDoc.id}`);
        await sleep(API_DELAY);

        const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
        const subFiles = subEntries
            .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('00-'))
            .sort((a, b) => a.name.localeCompare(b.name));
        const subDirs = subEntries
            .filter(e => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name));

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

        for (const subDir of subDirs) {
            await importDirectory(path.join(subDirPath, subDir.name), collectionId, sectionDoc.id, depth + 1);
        }
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('IT Importer for IMC Pelita Logistik KMS');
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
