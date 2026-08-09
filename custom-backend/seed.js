const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function seedDatabase() {
  const seedDataPath = path.join(__dirname, '../public/seed-data.json');
  const seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // Clear existing data (cascade will handle child tables)
    await client.query('TRUNCATE TABLE users CASCADE');
    console.log('Cleared existing data.');

    for (const user of seedData.users) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      
      // Insert user
      await client.query(
        'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
        [user.id, user.email, passwordHash]
      );
      console.log(`Inserted user: ${user.email}`);

      // Insert profile
      await client.query(
        `INSERT INTO profiles (user_id, full_name, display_name, bio, role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.profile.fullName, user.profile.displayName, user.profile.bio, user.profile.role, user.profile.createdAt]
      );

      // Insert files
      for (const file of user.files) {
        await client.query(
          `INSERT INTO files (id, owner_id, file_name, mime_type, size_bytes, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [file.id, file.ownerId, file.fileName, file.mimeType, file.sizeBytes, file.uploadedAt]
        );
      }
    }

    console.log('Seeding complete!');
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    await client.end();
  }
}

seedDatabase();
