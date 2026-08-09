# Appwrite Setup Guide

To replicate the backend requirements using Appwrite's managed services, you need to configure an Appwrite Project, a Database, a Collection, and a Storage Bucket. Crucially, you must configure Row-Level Security (RLS) properly to enforce data isolation.

## 1. Project & Account Setup
1. Create a new Appwrite Project.
2. Note your **Project ID**.
3. Under **Auth > Settings**, you can configure basic rate limiting (e.g., maximum requests per IP per minute) natively provided by Appwrite.

## 2. Database & Collection
1. Navigate to **Databases** and create a new Database. Note the **Database ID**.
2. Create a Collection named `files`. Note the **Collection ID**.

### Attributes for `files` Collection:
Add the following attributes to the collection to mirror our custom schema:
- `ownerId` (String, required)
- `fileName` (String, required)
- `mimeType` (String, required)
- `sizeBytes` (Integer, required)

### Row-Level Security (RLS) - Data Isolation:
To ensure a user can only access their own file metadata, go to the **Settings** of the `files` collection:
1. Under **Permissions**, select **Document Security**.
2. When creating a document (a file metadata entry), you must pass `[Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))]`.
3. With Document Security enabled, `databases.listDocuments` will *automatically* filter out any documents the current user doesn't have read access to, satisfying the isolation requirement implicitly.

## 3. Storage Bucket
1. Navigate to **Storage** and create a new Bucket named `user-files`. Note the **Bucket ID**.
2. Under the bucket **Settings > Permissions**, ensure that it is set to use **File Security** (similar to Document Security).
3. When uploading a file, you apply `Role.user(userId)` to the read and write permissions. This enforces that `storage.getFileDownload` returns a 403 Forbidden if another user attempts to download it.

## What Appwrite Handled Automatically
- Password hashing (Argon2 by default)
- Session token management and invalidation
- Native rate limiting (brute-force protection)
- Row-Level Security (Data Isolation) when properly configured

## What Had to be Configured Manually
- Creating the specific schemas and buckets.
- Specifically assigning `Role.user([USER_ID])` permissions on document creation to enforce the RLS.
