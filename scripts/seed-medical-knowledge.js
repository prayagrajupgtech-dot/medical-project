/**
 * Medical Knowledge Seed Script
 * Reads seed content files and indexes them into the knowledge base.
 * Run with: node scripts/seed-medical-knowledge.js
 */

const fs = require('fs');
const path = require('path');
const { db } = require('../database/config');
const medicalKnowledgeService = require('../api/medical-knowledge-service');
const embeddingService = require('../api/embedding-service');

const SEED_DIR = path.join(__dirname, 'seed-content');

// Source definitions for each seed file
const SEED_MAP = [
    { file: 'who-emergency-signs.txt', source: 'WHO Emergency Triage Assessment and Treatment', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/publications/i/item/9789241547093' },
    { file: 'common-symptoms-headache.txt', source: 'NCBI Bookshelf - Headache Information', type: 'free', author: 'NCBI / NINDS', publisher: 'National Institutes of Health', year: 2024, license: 'Public Domain', url: 'https://www.ncbi.nlm.nih.gov/books/' },
    { file: 'common-symptoms-fever.txt', source: 'WHO Fever Management Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'common-symptoms-chest-pain.txt', source: 'WHO Chest Pain Assessment Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'common-symptoms-cough.txt', source: 'NCBI Bookshelf - Cough Information', type: 'free', author: 'NCBI', publisher: 'National Institutes of Health', year: 2024, license: 'Public Domain', url: 'https://www.ncbi.nlm.nih.gov/books/' },
    { file: 'common-symptoms-abdominal-pain.txt', source: 'WHO Abdominal Pain Assessment', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'common-symptoms-dizziness.txt', source: 'NCBI Bookshelf - Dizziness and Vertigo', type: 'free', author: 'NCBI', publisher: 'National Institutes of Health', year: 2024, license: 'Public Domain', url: 'https://www.ncbi.nlm.nih.gov/books/' },
    { file: 'common-symptoms-fatigue.txt', source: 'NCBI Bookshelf - Fatigue Information', type: 'free', author: 'NCBI', publisher: 'National Institutes of Health', year: 2024, license: 'Public Domain', url: 'https://www.ncbi.nlm.nih.gov/books/' },
    { file: 'diabetes-management.txt', source: 'WHO Diabetes Management Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/publications/i/item/9789240081864' },
    { file: 'hypertension-management.txt', source: 'WHO Hypertension Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/publications/i/item/9789240073593' },
    { file: 'mental-health-anxiety.txt', source: 'WHO mhGAP - Anxiety Disorders', type: 'guideline', author: 'World Health Organization', publisher: 'WHO mhGAP', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/publications/i/item/9789241548434' },
    { file: 'mental-health-depression.txt', source: 'WHO mhGAP - Depression', type: 'guideline', author: 'World Health Organization', publisher: 'WHO mhGAP', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/publications/i/item/9789241548434' },
    { file: 'lab-test-interpretation.txt', source: 'NCBI Bookshelf - Laboratory Tests', type: 'free', author: 'NCBI / NIDDK', publisher: 'National Institutes of Health', year: 2024, license: 'Public Domain', url: 'https://www.ncbi.nlm.nih.gov/books/' },
    { file: 'medication-safety.txt', source: 'WHO Medication Safety Guidelines', type: 'government', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/health-topics/medication-safety' },
    { file: 'first-aid-basics.txt', source: 'WHO/Red Cross First Aid Guidelines', type: 'guideline', author: 'WHO / International Red Cross', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'nutrition-basics.txt', source: 'WHO Nutrition Guidelines', type: 'government', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/health-topics/nutrition' },
    { file: 'preventive-health.txt', source: 'USPSTF / WHO Preventive Services', type: 'guideline', author: 'US Preventive Services Task Force / WHO', publisher: 'Agency for Healthcare Research and Quality', year: 2024, license: 'Public Domain', url: 'https://www.uspreventiveservicestaskforce.org/' },
    { file: 'respiratory-infections.txt', source: 'WHO Respiratory Infections Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'allergies-overview.txt', source: 'NCBI Bookshelf - Allergy Information', type: 'free', author: 'NCBI / NIAID', publisher: 'National Institutes of Health', year: 2024, license: 'Public Domain', url: 'https://www.ncbi.nlm.nih.gov/books/' },
    { file: 'what-to-avoid-diabetes.txt', source: 'WHO Diabetes Diet Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'what-to-avoid-hypertension.txt', source: 'WHO DASH Diet Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'what-to-avoid-acidity-reflux.txt', source: 'NCBI GERD Management Guidelines', type: 'free', author: 'NCBI', publisher: 'National Institutes of Health', year: 2024, license: 'Public Domain', url: 'https://www.ncbi.nlm.nih.gov/books/' },
    { file: 'womens-health-menstrual.txt', source: 'WHO Women\'s Health Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'pediatrics-common-illnesses.txt', source: 'WHO Child Health Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' },
    { file: 'elderly-health.txt', source: 'WHO Healthy Ageing Guidelines', type: 'guideline', author: 'World Health Organization', publisher: 'WHO', year: 2024, license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/' }
];

async function seedDatabase() {
    console.log('=== Medical Knowledge Base Seeding ===\n');

    let totalSources = 0;
    let totalDocuments = 0;
    let totalChunks = 0;
    let errors = 0;

    for (const item of SEED_MAP) {
        const filePath = path.join(SEED_DIR, item.file);
        if (!fs.existsSync(filePath)) {
            console.log(`  SKIP: ${item.file} not found`);
            continue;
        }

        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) {
            console.log(`  SKIP: ${item.file} is empty`);
            continue;
        }

        try {
            // Check if source already exists
            const existing = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM medical_sources WHERE source_name = ?', [item.source], (err, row) => {
                    err ? reject(err) : resolve(row);
                });
            });

            if (existing) {
                console.log(`  EXISTS: ${item.source} (id:${existing.id})`);
                continue;
            }

            console.log(`  Indexing: ${item.source}...`);

            // Create source first
            const sourceResult = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO medical_sources (source_type, source_name, author, publisher, year, license, url, added_by, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'indexing')`,
                    [item.type, item.source, item.author, item.publisher, item.year, item.license, item.url],
                    function(err) { err ? reject(err) : resolve({ id: this.lastID }); }
                );
            });

            const docResult = await medicalKnowledgeService.ingestDocument(
                sourceResult.id,
                item.file.replace('.txt', '').replace(/-/g, ' '),
                content,
                { chapter: item.source }
            );

            totalSources++;
            totalDocuments++;
            totalChunks += docResult.chunkCount;
            console.log(`    OK: ${docResult.chunkCount} chunks indexed`);
        } catch (err) {
            errors++;
            console.error(`    ERROR: ${err.message}`);
        }
    }

    console.log(`\n=== Seeding Complete ===`);
    console.log(`Sources: ${totalSources}`);
    console.log(`Documents: ${totalDocuments}`);
    console.log(`Chunks: ${totalChunks}`);
    console.log(`Errors: ${errors}`);

    // Print stats
    try {
        const stats = await medicalKnowledgeService.getStats();
        console.log(`\nTotal KB Stats:`);
        console.log(`  Sources: ${stats.total_sources}`);
        console.log(`  Documents: ${stats.total_documents}`);
        console.log(`  Chunks: ${stats.total_chunks}`);
    } catch (e) {}

    process.exit(0);
}

// Wait for DB to be ready
setTimeout(seedDatabase, 1000);
