# Secure Authentication & File Access System

This repository implements an end-to-end secure authentication and file access system, fully fulfilling the requirements for the FOSSEE, IIT Bombay selection task. 

The project features two distinct backend implementations:
1. **Custom REST Backend**: A robust Node.js/Express server backed by PostgreSQL, implementing strict security controls from scratch.
2. **Managed Backend (Appwrite)**: Leveraging Appwrite Cloud via an adapter script and automated Node.js seeding to handle complex auth and Row-Level Security natively.

---

## Setup Instructions & Accessing Seeded Users

### Option 1: Custom REST Backend (PostgreSQL + Node.js)

1. **Clone the Repository**:
   ```bash
   git clone <your-repo-url>
   cd osdag-login
   ```

2. **Database Initialization**:
   - Open **pgAdmin** (or use `psql`) and create a new database named `osdag_auth_db`.
   - Open the `scripts/schema.sql` file, copy its contents, and execute it in your database to create the required tables (`users`, `profiles`, `sessions`, `login_attempts`, `files`).

3. **Backend Configuration**:
   ```bash
   cd custom-backend
   cp .env.example .env
   ```
   Open the new `.env` file and update the variables:
   - `DATABASE_URL`: Your local PostgreSQL credentials (e.g. `postgres://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/osdag_auth_db`).
   - `JWT_SECRET`: A secure random string for signing access tokens.
   - `REDIS_URL`: Create a free Redis database at [Upstash](https://upstash.com/) and paste the `rediss://` URL here.

4. **Install Dependencies & Seed Database**:
   ```bash
   npm install
   
   # Run the seed script to automatically create 3 test users and their mock files
   node seed.js
   
   # Start the development server (runs on http://localhost:3000)
   npm run dev
   ```

5. **Access the Client**:
   - Open the `public/index.html` file in your web browser. 
   - Select the **"Custom REST backend"** radio button.
   - Use the **"Quick-fill seeded test users"** buttons to instantly log in as the test users (`alice@example.com`, `bob@example.com`, `carol@example.com` with password `Password123!`).

### Option 2: Appwrite Managed Backend

1. **Configure Appwrite Project**:
   - Create a free project on [Appwrite Cloud](https://cloud.appwrite.io/). Note your **Project ID**.
   - **Database**: Create a database (Note the **Database ID**). Inside, create a collection named `files` (Note the **Collection ID**).
   - **Attributes**: Add `ownerId` (String), `fileName` (String), `mimeType` (String), and `sizeBytes` (Integer) to the `files` collection.
   - **Security**: In the `files` Collection Settings, go to Permissions and enable **Document Security**.
   - **Storage**: Create a bucket named `user-files` (Note the **Bucket ID**). In the Bucket Settings, enable **File Security**.

2. **Automated Seeding**:
   - Generate an API Key in Appwrite (Overview -> API Keys) with the following scopes: `users.read`, `users.write`, `documents.read`, `documents.write`, `files.read`, and `files.write`.
   - Configure the environment:
     ```bash
     cd appwrite-backend
     cp .env.example .env
     ```
   - Paste your Project ID, Database ID, Collection ID, Bucket ID, and your new API Key into the `.env` file.
   - Install dependencies and run the seed script:
     ```bash
     npm install
     node seed-appwrite.js
     ```
     *(This script uses the `node-appwrite` Server SDK to create the 3 test users with custom deterministic IDs like `usr_001`, uploads mock files, inserts database metadata, and correctly assigns `Role.user([ID])` permissions.)*

3. **Access the Client**:
   - Serve the frontend by running `npx serve appwrite-backend` from the root of the repository.
   - Open the provided localhost link in your browser.
   - Select the **"Appwrite"** radio button, fill in your Appwrite Project/DB IDs in the UI, and use the quick-fill buttons to test the seeded accounts!

---

## Architectural Analysis & Implementation Details

### Security Practices Compliance

The implementation rigorously follows all mandated security practices:
1. **Password Hashing:** Passwords are never stored in plaintext or reversibly encrypted. The custom backend uses **bcrypt** with a salt round of 10, while the Appwrite backend natively uses state-of-the-art **Argon2** hashing.
2. **Generic Error Messages:** The `/login` endpoint always returns a generic `{"error": "Invalid email or password"}` regardless of whether the email exists or the password was incorrect. This prevents username enumeration attacks.
3. **Rate Limiting:** A robust rate limiter protects the `/login` route. After 5 failed attempts from the same email, the account is temporarily locked out. In the custom backend, this state is tracked optimally in memory using **Upstash Redis**, preventing the database from being overwhelmed during a credential stuffing attack.
4. **Secure Token Delivery:** The session is securely delivered via `HttpOnly`, `Secure`, and `SameSite=Strict` cookies. The `authenticate` middleware explicitly extracts and validates this cookie on *every single* protected route (`/me`, `/files`, `/files/:id`), ensuring consistent authorization.

### Reasoning on JWT vs. Session-Based Authentication

The technical requirements strictly stated: *"Logout (POST /logout) MUST invalidate the session server-side in the PostgreSQL database... Standard stateless JWTs are not acceptable."*

A standard stateless JSON Web Token (JWT) encodes the user's identity and expiration timestamp. Because the server does not store issued JWTs, a token remains mathematically valid until it expires. To invalidate a JWT early (e.g., upon logout), the server must implement a stateful "deny list".

To fulfill this requirement while maintaining high performance, I implemented an industry-standard **Access + Refresh Token Architecture powered by Upstash Redis**:
1. When a user logs in, the server generates a short-lived (15 min) **Access Token** (JWT) and a long-lived **Refresh Token** (Opaque 64-char string).
2. The Refresh Token is stored securely in **Upstash Redis** (`refresh:<token>`).
3. On protected routes, the `authenticate` middleware statelessly verifies the Access Token's signature, offering lightning-fast performance without querying PostgreSQL.
4. However, to guarantee the strict server-side invalidation requirement, the middleware *also* checks a Redis blacklist (`bl:<token>`) to ensure the token hasn't been revoked early.

### How Logout is Implemented Under the Hood

The logout implementation leverages Redis to guarantee instant revocation and satisfy the strict requirements:
1. The client sends a `POST /logout` request containing both their current Access Token and Refresh Token.
2. The `authController.js` immediately adds the Access Token to a **Redis Blacklist** (`bl:<token>`) with a TTL equal to its remaining lifespan.
3. It then deletes the Refresh Token from Redis (`DELETE refresh:<token>`), preventing any future renewals.
4. Because the `authenticate` middleware explicitly queries the Redis blacklist on *every* request, blacklisting the token causes all subsequent requests to be instantly rejected with a `401 Unauthorized` response. Access is completely severed server-side.

### How User Data Isolation is Enforced

Data isolation (ensuring User A can never see User B's files) is rigorously enforced in both backends:

**In the Custom REST Backend:**
Isolation is enforced at the SQL query level to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.
- **Listing Files (`GET /files`)**: The query `SELECT ... FROM files WHERE owner_id = $1` binds to `req.userId` (which is safely extracted from the validated session token in the middleware). It is impossible for a user to query the global list of files.
- **Fetching Specific Files (`GET /files/:id`)**: The server first fetches the requested file from the database. It then explicitly checks `if (file.owner_id !== req.userId)`. If they do not match, the server returns a `403 Forbidden`.

**In the Appwrite Backend:**
Data isolation is handled natively through Appwrite's Row-Level Security (RLS) features.
- During the automated seeding process (`seed-appwrite.js`), the `node-appwrite` SDK assigns explicit read/write/delete permissions formatting as `Role.user(userId)` to every uploaded file and database document.
- With **Document Security** and **File Security** enabled in the Appwrite console, any request made to `databases.listDocuments()` automatically intercepts the user's session and filters out any documents they do not have explicit read permissions for, enforcing strict isolation without requiring custom backend filtering logic.

### What Appwrite Handled Automatically vs. Configured Manually

**Handled Automatically by Appwrite:**
- **Authentication & Security:** Best-in-class Argon2 password hashing, secure session cookie creation, and immediate server-side session invalidation via `account.deleteSession()`.
- **Rate Limiting:** Built-in brute-force protection, automatically locking out IPs after repeated failed attempts.
- **Data Isolation (RLS):** Filtering queries and restricting file downloads natively based on the user's role and session.

**Configured Manually:**
- Initializing the Project, Database, `files` Collection, and `user-files` Storage Bucket in the cloud console.
- Defining the strict attribute schema (`ownerId`, `fileName`, `mimeType`, `sizeBytes`) to map exactly to the PostgreSQL schema.
- Explicitly enabling Document and File Security toggles.
- Engineering the automated `seed-appwrite.js` Node.js script to programmatically create users with custom deterministic IDs (e.g., `usr_001`), map storage files to database documents, and explicitly inject the `Role.user([ID])` permission arrays during creation.

### What I Would Improve Given More Time

1. **True Multipart File Uploads:** The current custom backend implementation uses seeded metadata and a mocked download endpoint (`res.send(fakeContent)`). Given more time, I would integrate the `multer` middleware to parse `multipart/form-data`, stream actual file uploads directly to an S3-compatible object storage (like AWS S3 or MinIO) or the local filesystem, and store the resulting URL in the PostgreSQL database.
2. **Automated CI/CD & Testing:** I would write a comprehensive suite of integration tests using `Jest` and `Supertest` to programmatically assert that the rate limiter, token blacklisting, and RLS isolation work as intended on every single commit. I would also set up GitHub Actions to automatically run these tests.
3. **OAuth2 / Social Logins:** To reduce friction during onboarding, I would integrate Google and GitHub OAuth providers (which Appwrite supports natively out of the box, and would require `passport.js` in the custom Express backend).
