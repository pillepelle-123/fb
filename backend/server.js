const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./database');
const { generateToken, verifyToken, checkPermission, bcrypt } = require('./auth');
const { processCanvasData, loadCanvasData } = require('./imageHandler');

const app = express();
const server = http.createServer(app);
// CORS configuration for both development and production
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://fb-frontend-791c.onrender.com'
  ],
  credentials: true
};

const io = socketIo(server, {
  cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve images statically
app.use('/api/images', express.static(path.join(__dirname, 'storage')));

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    console.log('Registration attempt:', req.body);
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO public.users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, email, hashedPassword]
    );
    
    const token = generateToken(result.rows[0].id);
    console.log('Registration successful for user:', result.rows[0].id);
    res.json({ token, userId: result.rows[0].id, username });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT id, username, password_hash FROM public.users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user.id);
    res.json({ token, userId: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, created_at FROM public.users WHERE id = $1', [req.userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

// Check if username is available
app.get('/api/users/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const result = await pool.query(
      'SELECT id FROM public.users WHERE username = $1',
      [username]
    );
    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check username availability' });
  }
});

// Update username
app.put('/api/me/username', verifyToken, async (req, res) => {
  try {
    const { username } = req.body;
    
    // Check if username is already taken
    const existingUser = await pool.query(
      'SELECT id FROM public.users WHERE username = $1 AND id != $2',
      [username, req.userId]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    await pool.query(
      'UPDATE public.users SET username = $1 WHERE id = $2',
      [username, req.userId]
    );
    
    res.json({ message: 'Username updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update username' });
  }
});

// Update password
app.put('/api/me/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Verify current password
    const user = await pool.query(
      'SELECT password_hash FROM public.users WHERE id = $1',
      [req.userId]
    );
    
    if (!user.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE public.users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, req.userId]
    );
    
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Book routes
app.get('/api/books', verifyToken, async (req, res) => {
  try {
    const { archived } = req.query;
    const archivedFilter = archived === 'true' ? true : false;

    const result = await pool.query(`
      SELECT b.*, bp.role FROM public.books b
      JOIN public.book_permissions bp ON b.id = bp.book_id
      WHERE bp.user_id = $1 AND b.archived = $2
    `, [req.userId, archivedFilter]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

app.post('/api/books', verifyToken, async (req, res) => {
  try {
    const { title, description, size, orientation, page_size } = req.body;
    const bookResult = await pool.query(
      'INSERT INTO public.books (title, description, owner_id, size, orientation, page_size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, req.userId, size || 'A4', orientation || 'portrait', page_size || 'A4']
    );
    
    await pool.query(
      'INSERT INTO public.book_permissions (book_id, user_id, role) VALUES ($1, $2, $3)',
      [bookResult.rows[0].id, req.userId, 'admin']
    );
    
    res.json(bookResult.rows[0]);
  } catch (err) {
    console.error('Book creation error:', err);
    res.status(500).json({ error: 'Failed to create book: ' + err.message });
  }
});

app.put('/api/books/:bookId', verifyToken, checkPermission('admin'), async (req, res) => {
  try {
    const { archived } = req.body;
    const { bookId } = req.params;

    await pool.query(
      'UPDATE public.books SET archived = $1 WHERE id = $2',
      [archived, bookId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update book:', err);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// Update book settings
app.put('/api/books/:bookId/settings', verifyToken, checkPermission('admin'), async (req, res) => {
  try {
    const { title, description, size, orientation } = req.body;
    const { bookId } = req.params;
    
    await pool.query(
      'UPDATE public.books SET title = $1, description = $2, size = $3, orientation = $4, last_saved_at = NOW() WHERE id = $5',
      [title, description, size, orientation, bookId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update book settings:', err);
    res.status(500).json({ error: 'Failed to update book settings' });
  }
});

// Delete an entire book and all its pages
app.delete('/api/books/:bookId', verifyToken, checkPermission('admin'), async (req, res) => {
  try {
    const { bookId } = req.params;

    // First delete all pages of the book
    await pool.query(
      'DELETE FROM public.pages WHERE book_id = $1',
      [bookId]
    );

    // Then delete all book permissions
    await pool.query(
      'DELETE FROM public.book_permissions WHERE book_id = $1',
      [bookId]
    );

    // Finally delete the book itself
    await pool.query(
      'DELETE FROM public.books WHERE id = $1',
      [bookId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete book:', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

app.delete('/api/books/:bookId/pages/all', verifyToken, checkPermission('editor'), async (req, res) => {
  try {
    const { bookId } = req.params;
    
    await pool.query(
      'DELETE FROM public.pages WHERE book_id = $1',
      [bookId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('All pages deletion error:', err);
    res.status(500).json({ error: 'Failed to delete all pages: ' + err.message });
  }
});

app.delete('/api/books/:bookId/pages/:pageNumber', verifyToken, checkPermission('editor'), async (req, res) => {
  try {
    const { bookId, pageNumber } = req.params;
    
    await pool.query(
      'DELETE FROM public.pages WHERE book_id = $1 AND page_number = $2',
      [bookId, pageNumber]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Page deletion error:', err);
    res.status(500).json({ error: 'Failed to delete page: ' + err.message });
  }
});

// Page routes
app.get('/api/books/:bookId/pages', verifyToken, checkPermission('viewer'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM public.pages WHERE book_id = $1 ORDER BY page_number',
      [req.params.bookId]
    );
    
    // Load images back into canvas data for each page
    const pagesWithImages = await Promise.all(
      result.rows.map(async (page) => ({
        ...page,
        canvas_data: await loadCanvasData(page.canvas_data, req.userId, req.params.bookId)
      }))
    );
    
    res.json(pagesWithImages);
  } catch (err) {
    console.error('Failed to fetch pages:', err);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

app.put('/api/books/:bookId/pages/:pageNumber', verifyToken, checkPermission('editor'), async (req, res) => {
  try {
    const { bookId, pageNumber } = req.params;
    const { canvasData } = req.body;

    // Process canvas data to extract and save images
    const processedCanvasData = await processCanvasData(canvasData, req.userId, bookId);

    // Begin a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update book's last_saved_at timestamp
      await client.query(
        'UPDATE public.books SET last_saved_at = CURRENT_TIMESTAMP WHERE id = $1',
        [bookId]
      );

      // Check if page exists and update or insert
      const existingPage = await client.query(
        'SELECT * FROM public.pages WHERE book_id = $1 AND page_number = $2',
        [bookId, pageNumber]
      );

      if (existingPage.rows.length > 0) {
        await client.query(
          'UPDATE public.pages SET canvas_data = $1 WHERE book_id = $2 AND page_number = $3',
          [processedCanvasData, bookId, pageNumber]
        );
      } else {
        await client.query(
          'INSERT INTO public.pages (book_id, page_number, canvas_data) VALUES ($1, $2, $3)',
          [bookId, pageNumber, processedCanvasData]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Page saved successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Failed to save page:', err);
    res.status(500).json({ error: 'Failed to save page' });
  }
});

// Socket.io for real-time collaboration
io.on('connection', (socket) => {
  socket.on('joinBook', (bookId) => {
    socket.join(`book-${bookId}`);
  });
  
  socket.on('canvasChange', (data) => {
    socket.to(`book-${data.bookId}`).emit('canvasUpdate', data);
  });
});

const PORT = process.env.PORT || 5000;

initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});