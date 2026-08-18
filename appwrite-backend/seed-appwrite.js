require('dotenv').config();
const fs = require('fs');
const { Client, Users, Databases, Storage, ID, Permission, Role } = require('node-appwrite');
const { InputFile } = require('node-appwrite/file');

// Read from environment variables
const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID;
const COL_ID = process.env.APPWRITE_COLLECTION_ID;
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID;

if (!PROJECT_ID || !API_KEY || !DB_ID || !COL_ID || !BUCKET_ID) {
    console.error("Missing required environment variables. Please check your .env file.");
    process.exit(1);
}

// Initialize the Appwrite Server SDK
const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const users = new Users(client);
const databases = new Databases(client);
const storage = new Storage(client);

async function seedAppwrite() {
    try {
        console.log('Loading seed-data.json...');
        const seedData = JSON.parse(fs.readFileSync('seed-data.json', 'utf8'));
        
        console.log('Starting seed process...\n');

        for (const userData of seedData.users) {
            console.log(`👤 Creating user: ${userData.email}`);
            let userId;
            try {
                // Use the custom ID from JSON (e.g., 'usr_001')
                const user = await users.create(
                    userData.id || ID.unique(),
                    userData.email,
                    null, // phone
                    userData.password,
                    userData.profile.fullName
                );
                userId = user.$id;
                console.log(`   ✅ User created with ID: ${userId}`);
            } catch (err) {
                // If user exists, we might want to skip or fetch the user. For simplicity, we just skip.
                console.error(`   ❌ Error creating user ${userData.email}:`, err.message);
                continue;
            }

            if (!userData.files || userData.files.length === 0) continue;

            console.log(`   📁 Creating files for ${userData.email}...`);
            // Iterate over user files and upload them
            for (const fileMeta of userData.files) {
                // 1. Create a mock file buffer with the desired size
                const mockBuffer = Buffer.from('Mock file content for ' + fileMeta.fileName + '. This is a generated seed file.');
                const inputFile = InputFile.fromBuffer(mockBuffer, fileMeta.fileName);
                
                let storageFileId;
                try {
                    // 2. Upload to Storage Bucket (applying File Security)
                    const uploadedFile = await storage.createFile(
                        BUCKET_ID,
                        fileMeta.id || ID.unique(), // Use the custom ID from JSON (e.g., 'file_001')
                        inputFile,
                        [
                            Permission.read(Role.user(userId)),
                            Permission.update(Role.user(userId)),
                            Permission.delete(Role.user(userId))
                        ]
                    );
                    storageFileId = uploadedFile.$id;
                    console.log(`      ✅ File uploaded to Storage. ID: ${storageFileId}`);
                } catch (err) {
                    console.error(`      ❌ Error uploading to Storage:`, err.message);
                    continue; // Skip creating DB metadata entry if storage upload fails
                }

                // 3. Create Database Metadata Document (applying Document Security)
                try {
                    await databases.createDocument(
                        DB_ID,
                        COL_ID,
                        storageFileId, // Using the same ID as the storage file connects them nicely
                        {
                            ownerId: userId,
                            fileName: fileMeta.fileName,
                            mimeType: fileMeta.mimeType,
                            sizeBytes: mockBuffer.length
                        },
                        [
                            Permission.read(Role.user(userId)),
                            Permission.update(Role.user(userId)),
                            Permission.delete(Role.user(userId))
                        ]
                    );
                    console.log(`      ✅ Metadata document created in Database.`);
                } catch (err) {
                    console.error(`      ❌ Error creating Database metadata:`, err.message);
                }
            }
            console.log(); // blank line for spacing
        }
        
        console.log('🎉 Seeding complete!');
    } catch (err) {
        console.error('Fatal Error during seeding:', err);
    }
}

seedAppwrite();
