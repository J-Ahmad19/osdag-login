/**
 * Appwrite Web SDK Adapter
 * Replaces custom fetch calls with Appwrite Web SDK calls.
 * To use this, include the Appwrite Web SDK in index.html and this file,
 * and select the "Appwrite" backend mode.
 */

const client = new Appwrite.Client();

// Configure the client
client
    .setEndpoint(document.getElementById('awEndpoint').value)
    .setProject(document.getElementById('awProjectId').value);

const account = new Appwrite.Account(client);
const databases = new Appwrite.Databases(client);
const storage = new Appwrite.Storage(client);

// Note: To dynamically get DB ID and Collection ID, we fetch them from the UI inputs
function getDbConfig() {
    return {
        databaseId: document.getElementById('awDatabaseId').value,
        collectionId: document.getElementById('awFilesCollectionId').value,
        bucketId: document.getElementById('awBucketId').value
    };
}

// Override the request function or specific functions to use Appwrite instead
const originalDoRegister = window.doRegister;
const originalDoLogin = window.doLogin;
const originalDoLogout = window.doLogout;
const originalGetMe = window.getMe;
const originalGetFiles = window.getFiles;
const originalGetFileById = window.getFileById;
const originalDownloadFileById = window.downloadFileById;

async function checkAppwriteMode(func, fallback) {
    const isAppwrite = document.querySelector('input[name="backendMode"]:checked').value === 'appwrite';
    if (isAppwrite) {
        // Ensure endpoint and project ID are up to date
        client.setEndpoint(document.getElementById('awEndpoint').value)
              .setProject(document.getElementById('awProjectId').value);
        try {
            await func();
        } catch (error) {
            log('Appwrite Error', error);
        }
    } else {
        fallback();
    }
}

window.doRegister = () => checkAppwriteMode(async () => {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    
    let name = email.split('@')[0]; // fallback
    let userId = Appwrite.ID.unique(); // fallback
    try {
        const seedRes = await fetch('seed-data.json');
        const seedData = await seedRes.json();
        const seedUser = seedData.users.find(u => u.email === email);
        if (seedUser && seedUser.profile && seedUser.profile.fullName) {
            name = seedUser.profile.fullName;
        }
        if (seedUser && seedUser.id) {
            userId = seedUser.id;
        }
    } catch (err) {
        console.warn('Could not load seed-data.json for name extraction', err);
    }
    
    const result = await account.create(userId, email, password, name);
    log('Appwrite: Register', result);
}, originalDoRegister);

window.doLogin = () => checkAppwriteMode(async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const result = await account.createEmailPasswordSession(email, password);
    log('Appwrite: Login', result);
}, originalDoLogin);

window.doLogout = () => checkAppwriteMode(async () => {
    await account.deleteSession('current');
    log('Appwrite: Logout', { message: 'Successfully logged out of Appwrite session' });
}, originalDoLogout);

window.getMe = () => checkAppwriteMode(async () => {
    const user = await account.get();
    log('Appwrite: Get Me', user);
}, originalGetMe);

window.getFiles = () => checkAppwriteMode(async () => {
    const user = await account.get(); // ensure authenticated
    const { databaseId, collectionId } = getDbConfig();
    
    // Filter documents to only those belonging to the logged-in user
    const result = await databases.listDocuments(databaseId, collectionId, [
        Appwrite.Query.equal('ownerId', user.$id)
    ]);
    log('Appwrite: Get Files', result);
}, originalGetFiles);

window.getFileById = () => checkAppwriteMode(async () => {
    const user = await account.get(); // ensure authenticated
    const { databaseId, collectionId } = getDbConfig();
    const id = document.getElementById('fileId').value;
    
    const result = await databases.getDocument(databaseId, collectionId, id);
    
    // Security check: must correctly reject a request for a file belonging to a different user
    if (result.ownerId !== user.$id) {
        throw new Error('Access denied: File belongs to a different user');
    }
    
    log('Appwrite: Get File by ID', result);
}, originalGetFileById);

window.downloadFileById = () => checkAppwriteMode(async () => {
    const user = await account.get(); // ensure authenticated
    const { databaseId, collectionId, bucketId } = getDbConfig();
    const id = document.getElementById('fileId').value;
    
    // Security check: confirm file belongs to user before allowing download
    const fileMeta = await databases.getDocument(databaseId, collectionId, id);
    if (fileMeta.ownerId !== user.$id) {
        throw new Error('Access denied: File belongs to a different user');
    }
    
    // Get download URL
    const url = storage.getFileDownload(bucketId, id);
    
    const a = document.createElement('a');
    a.href = url.href;
    a.download = 'file-' + id;
    a.click();
    log('Appwrite: Download File', { url: url.href, note: 'File download triggered.' });
}, originalDownloadFileById);
