const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const STORAGE_DIR = path.join(__dirname, 'storage');

// Ensure storage directory exists
const ensureStorageDir = async (userId, bookId) => {
  const userDir = path.join(STORAGE_DIR, userId.toString());
  const bookDir = path.join(userDir, bookId.toString());
  
  await fs.mkdir(userDir, { recursive: true });
  await fs.mkdir(bookDir, { recursive: true });
  
  return bookDir;
};

// Extract and save images from canvas data
const processCanvasData = async (canvasData, userId, bookId) => {
  if (!canvasData || typeof canvasData !== 'object') return canvasData;
  
  const bookDir = await ensureStorageDir(userId, bookId);
  const processedData = JSON.parse(JSON.stringify(canvasData));
  
  // Process all shapes recursively
  const processShapes = async (obj) => {
    if (Array.isArray(obj)) {
      for (let item of obj) {
        await processShapes(item);
      }
    } else if (obj && typeof obj === 'object') {
      for (let key in obj) {
        if (key === 'src' && typeof obj[key] === 'string' && obj[key].startsWith('data:image/')) {
          // Extract base64 image
          const base64Data = obj[key].split(',')[1];
          const mimeType = obj[key].match(/data:([^;]+);/)[1];
          const extension = mimeType.split('/')[1];
          
          // Create hash of image content for deduplication
          const hash = crypto.createHash('sha256').update(base64Data).digest('hex');
          const filename = `${hash}.${extension}`;
          const filepath = path.join(bookDir, filename);
          
          // Only save if file doesn't exist
          try {
            await fs.access(filepath);
          } catch {
            await fs.writeFile(filepath, base64Data, 'base64');
          }
          
          // Replace with file reference
          obj[key] = `/api/images/${userId}/${bookId}/${filename}`;
        } else {
          await processShapes(obj[key]);
        }
      }
    }
  };
  
  await processShapes(processedData);
  return processedData;
};

// Load images back into canvas data
const loadCanvasData = async (canvasData, userId, bookId) => {
  if (!canvasData || typeof canvasData !== 'object') return canvasData;
  
  const processedData = JSON.parse(JSON.stringify(canvasData));
  
  const loadShapes = async (obj) => {
    if (Array.isArray(obj)) {
      for (let item of obj) {
        await loadShapes(item);
      }
    } else if (obj && typeof obj === 'object') {
      for (let key in obj) {
        if (key === 'src' && typeof obj[key] === 'string' && obj[key].startsWith(`/api/images/${userId}/${bookId}/`)) {
          try {
            const filename = path.basename(obj[key]);
            const filepath = path.join(STORAGE_DIR, userId.toString(), bookId.toString(), filename);
            const imageData = await fs.readFile(filepath);
            const extension = path.extname(filename).slice(1);
            const mimeType = extension === 'jpg' ? 'jpeg' : extension;
            obj[key] = `data:image/${mimeType};base64,${imageData.toString('base64')}`;
          } catch (error) {
            console.error('Failed to load image:', error);
          }
        } else {
          await loadShapes(obj[key]);
        }
      }
    }
  };
  
  await loadShapes(processedData);
  return processedData;
};

module.exports = {
  processCanvasData,
  loadCanvasData,
  ensureStorageDir
};