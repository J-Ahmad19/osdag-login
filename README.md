# Secure Authentication & File Access System

This repository implements the requirements for the FOSSEE, IIT Bombay selection task, demonstrating an end-to-end secure authentication and file access system.

It features two implementations:
1. **Custom REST Backend**: Node.js/Express backed by PostgreSQL.
2. **Managed Backend**: Appwrite (using the Appwrite Web SDK via an adapter script).

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- PostgreSQL installed and running
- (Optional) Appwrite instance (Cloud or Self-Hosted)

### Custom Backend Setup

1. **Clone the Repository**:
   ```bash
   git clone <your-repo-url>
   cd login-osdag
   ```

2. **Database Initialization (via pgAdmin or psql)**:
   - Open **pgAdmin** and create a new database (e.g., `osdag_auth_db`).
   - Right-click the new database and select **Query Tool**.
   - Open the `scripts/schema.sql` file, copy its contents into the Query Tool, and click **Execute (F5)** to create the tables.
   - *(Alternatively, via CLI: `psql -U postgres -d osdag_auth_db -f scripts/schema.sql`)*

3. **Backend Configuration**:
   ```bash
   cd custom-backend
   cp .env.example .env
   ```
   Open the newly created `.env` file and **update the `DATABASE_URL`** to match your local PostgreSQL credentials and the database name you just created:
   `DATABASE_URL=postgres://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/osdag_auth_db`

4. **Install Dependencies & Seed Database**:
   From inside the `custom-backend` directory, run:
   ```bash
   npm install
   
   # Run the seed script to populate the 3 test users and their files
   node seed.js
   
   # Start the development server
   npm run dev
   ```

5. **Access the Client**:
   Open `public/index.html` in your web browser. Select "Custom REST backend".
   You can click the "Quick-fill seeded test users" buttons to test the seeded accounts.

### Appwrite Backend Setup

Please see [`appwrite-backend/setup-appwrite.md`](appwrite-backend/setup-appwrite.md) for detailed instructions on configuring the Appwrite Console to mirror the required schemas and security rules. Once configured, open `public/index.html`, select "Appwrite", and enter your configuration details.

---

## Architectural Decisions & Answers

### Reasoning on JWT vs. Session-Based Authentication
The primary requirement stated: *Logout (POST /logout) MUST invalidate the session server-side in the PostgreSQL database, not just clear the client token. Standard stateless JWTs are not acceptable for this requirement.*

Stateless JWTs encode the user's identity and validity within the token itself. Because the server does not track them, a JWT cannot be revoked before its expiration time unless a "deny list" (which is stateful) is introduced. 

To satisfy the strict server-side invalidation requirement, we utilized a **Database-Backed Session** approach. Upon login, a cryptographically secure random token is generated and stored in the PostgreSQL `sessions` table along with an expiration time. The token is passed as a Bearer token. On every protected route, the server queries the database to verify the token exists and is valid.

### How Logout is Implemented Under the Hood
When the user sends a `POST /logout` request with their token, the backend directly deletes the corresponding row from the `sessions` table in PostgreSQL (`DELETE FROM sessions WHERE token = $1`). Because all protected routes require an active session row in this table, the token immediately becomes invalid across all endpoints, providing true server-side invalidation.

### How User Data Isolation is Enforced
Data isolation is enforced at the SQL query level in the controllers.
- `GET /files`: The query `SELECT ... FROM files WHERE owner_id = $1` uses the `userId` extracted from the validated session. It is impossible for a user to fetch the global list of files.
- `GET /files/:id`: The backend queries the file, and then explicitly checks `if (file.owner_id !== req.userId)`. If they do not match, it returns a `403 Forbidden` rather than a `404 Not Found` (to distinguish between a missing file and an unauthorized access attempt).

### What Appwrite Handled Automatically vs. Configured Manually
**Handled Automatically by Appwrite:**
- **Authentication & Security:** Argon2 password hashing, secure session cookie/token management, and server-side session invalidation (`account.deleteSession`).
- **Rate Limiting:** Built-in brute-force protection (lockouts after failed attempts).
- **Data Isolation (RLS):** By enabling Document/File Security, Appwrite automatically filters list queries (`listDocuments`) and enforces read/write restrictions without writing custom query logic.

**Configured Manually:**
- Creating the Project, Database, `files` Collection, and `user-files` Storage Bucket.
- Defining the attribute schema (`ownerId`, `fileName`, `mimeType`, `sizeBytes`) for the Collection.
- Activating Row-Level Security (Document Security) and assigning the explicit permission format `Role.user([USER_ID])` during document creation and file uploading to ensure the isolation rules are applied.

### What I Would Improve Given More Time
1. **True File Uploads:** Currently, the system uses seeded metadata and a mock download endpoint for the custom backend. Given more time, I would integrate `multer` for multipart form-data parsing and upload files directly to an S3-compatible storage (like AWS S3 or MinIO) or the local filesystem, storing the resulting URL/path in the database.
2. **Cookie-Based Sessions:** The current implementation expects the token in the `Authorization: Bearer <token>` header for simplicity in the provided `index.html`. For a more secure web-based implementation, I would configure the backend to set `HttpOnly`, `Secure`, `SameSite=Strict` cookies, preventing XSS attacks from accessing the session token.
3. **Advanced Rate Limiting:** Replace the custom database-backed rate limiting with `redis` and `express-rate-limit` for better performance under high load, as writing every failed attempt to PostgreSQL can become a bottleneck.
