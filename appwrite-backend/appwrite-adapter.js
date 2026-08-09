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
    
    const result = await account.create(Appwrite.ID.unique(), email, password);
    log('Appwrite: Register', result);
}, originalDoRegister);

window.doLogin = () => checkAppwriteMode(async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const result = await account.createEmailPasswordSession(email, password);
    log('Appwrite: Login', result);
}, originalDoLogin);

window.doLogout = () => checkAppwriteMode(async () => {
    const result = await account.deleteSession('current');
    log('Appwrite: Logout', result || { message: 'Logged out' });
}, originalDoLogout);

window.getMe = () => checkAppwriteMode(async () => {
    const user = await account.get();
    log('Appwrite: Get Me', user);
}, originalGetMe);

window.getFiles = () => checkAppwriteMode(async () => {
    const { databaseId, collectionId } = getDbConfig();
    const result = await databases.listDocuments(databaseId, collectionId);
    log('Appwrite: Get Files', result);
}, originalGetFiles);

window.getFileById = () => checkAppwriteMode(async () => {
    const { databaseId, collectionId } = getDbConfig();
    const id = document.getElementById('fileId').value;
    
    // In Appwrite, you typically don't query a file metadata document from a DB collection
    // unless you stored it there. If you stored it in a collection with RLS:
    const result = await databases.getDocument(databaseId, collectionId, id);
    log('Appwrite: Get File by ID', result);
}, originalGetFileById);

window.downloadFileById = () => checkAppwriteMode(async () => {
    const { bucketId } = getDbConfig();
    const id = document.getElementById('fileId').value;
    
    // Get download URL
    const url = storage.getFileDownload(bucketId, id);
    
    const a = document.createElement('a');
    a.href = url.href;
    a.download = 'file-' + id;
    a.click();
    log('Appwrite: Download File', { url: url.href, note: 'File download triggered.' });
}, originalDownloadFileById);
