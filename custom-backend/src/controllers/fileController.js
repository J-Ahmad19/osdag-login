const db = require('../config/db');

async function getFiles(req, res) {
  try {
    const result = await db.query(
      'SELECT id, owner_id, file_name, mime_type, size_bytes, uploaded_at FROM files WHERE owner_id = $1',
      [req.userId]
    );
    
    const files = result.rows.map(f => ({
      id: f.id,
      ownerId: f.owner_id,
      fileName: f.file_name,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      uploadedAt: f.uploaded_at
    }));

    res.status(200).json({ files });
  } catch (err) {
    console.error('Get files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getFileById(req, res) {
  const fileId = req.params.id;
  try {
    const result = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = result.rows[0];
    if (file.owner_id !== req.userId) {
      return res.status(403).json({ error: 'You do not have access to this file' });
    }

    res.status(200).json({
      file: {
        id: file.id,
        ownerId: file.owner_id,
        fileName: file.file_name,
        mimeType: file.mime_type,
        sizeBytes: parseInt(file.size_bytes, 10),
        uploadedAt: file.uploaded_at
      }
    });
  } catch (err) {
    console.error('Get file error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function downloadFileById(req, res) {
  const fileId = req.params.id;
  try {
    const result = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) {
      return res.status(404).send('File not found');
    }
    
    const file = result.rows[0];
    if (file.owner_id !== req.userId) {
      return res.status(403).send('Forbidden');
    }

    const fakeContent = `This is a mock stand-in for "${file.file_name}" (${file.mime_type}, ${file.size_bytes} bytes).\nIn the real backend this endpoint would stream the actual file bytes.`;
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fakeContent);
  } catch (err) {
    console.error('Download file error:', err);
    res.status(500).send('Internal server error');
  }
}

module.exports = { getFiles, getFileById, downloadFileById };
