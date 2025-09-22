import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';
import {
  Container,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Box,
  Fade,
  Checkbox,
  Fab,
} from '@mui/material';
import { Add as AddIcon, Settings as SettingsIcon, Archive as ArchiveIcon, CheckBoxOutlineBlank as SelectIcon, Close as CloseIcon, SelectAll as SelectAllIcon } from '@mui/icons-material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import AppBarComponent from '../components/AppBarComponent';
import ConfirmDialog from '../components/ConfirmDialog';

const BookMy = ({ token, setToken }) => {
  const [books, setBooks] = useState([]);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState([]);

  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/books`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { archived: false }
      });
      const sortedBooks = response.data.sort((a, b) => {
        const dateA = new Date(a.last_saved_at || a.created_at);
        const dateB = new Date(b.last_saved_at || b.created_at);
        return dateB - dateA;
      });
      setBooks(sortedBooks);
    } catch (error) {
      console.error('Failed to fetch books');
    }
  };

  const handleArchive = async (book) => {
    try {
      await axios.put(`${API_URL}/api/books/${book.id}`, 
        { archived: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchBooks();
      setArchiveDialogOpen(false);
      setSelectedBook(null);
    } catch (error) {
      console.error('Failed to archive book');
    }
  };

  const handleMultiArchive = async () => {
    try {
      await Promise.all(
        selectedBooks.map(bookId => 
          axios.put(`${API_URL}/api/books/${bookId}`, 
            { archived: true },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      fetchBooks();
      setMultiSelectMode(false);
      setSelectedBooks([]);
      setArchiveDialogOpen(false);
    } catch (error) {
      console.error('Failed to archive books');
    }
  };

  const toggleBookSelection = (bookId) => {
    setSelectedBooks(prev => 
      prev.includes(bookId) 
        ? prev.filter(id => id !== bookId)
        : [...prev, bookId]
    );
  };

  const exitMultiSelectMode = () => {
    setMultiSelectMode(false);
    setSelectedBooks([]);
  };

  const toggleSelectAll = () => {
    if (selectedBooks.length === books.length) {
      setSelectedBooks([]);
    } else {
      setSelectedBooks(books.map(book => book.id));
    }
  };

  const allSelected = selectedBooks.length === books.length && books.length > 0;

  return (
    <>
      <AppBarComponent setToken={setToken} />
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Deine Freunschaftsbücher
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-start', mb: 3 }}>
            {!multiSelectMode ? (
              <>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => navigate('/book/create')}
                  sx={{ mb: 0 }}
                >
                  {!isMobile && 'Neues Buch erstellen'}
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<ArchiveIcon />}
                  onClick={() => navigate('/book/archive')}
                  sx={{ mb: 0 }}
                >
                  {!isMobile && 'Zum Archiv'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SelectIcon />}
                  onClick={() => setMultiSelectMode(true)}
                  sx={{ mb: 0 }}
                >
                  {!isMobile && 'Auswählen'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<ArchiveIcon />}
                  onClick={() => {
                    if (selectedBooks.length > 0) {
                      setArchiveDialogOpen(true);
                    }
                  }}
                  disabled={selectedBooks.length === 0}
                  sx={{ mb: 0 }}
                >
                  Archivieren ({selectedBooks.length})
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SelectAllIcon />}
                  onClick={toggleSelectAll}
                  sx={{ mb: 0 }}
                >
                  {allSelected ? 'Alle abwählen' : 'Alle auswählen'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<CloseIcon />}
                  onClick={exitMultiSelectMode}
                  sx={{ mb: 0 }}
                >
                  Abbrechen
                </Button>
              </>
            )}
          </Box>
        </Box>

        <Grid container spacing={3}>
          {books.map((book, index) => (
            <Grid item xs={12} sm={6} md={4} key={book.id}>
              <Fade in timeout={300 + index * 100}>
                <Card
                  elevation={2}
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    border: multiSelectMode && selectedBooks.includes(book.id) ? '2px solid' : 'none',
                    borderColor: 'primary.main',
                    '&:hover': {
                      elevation: 8,
                      transform: 'translateY(-4px)',
                    },
                  }}
                  onClick={() => multiSelectMode ? toggleBookSelection(book.id) : navigate(`/book/${book.id}`)}
                >
                  {multiSelectMode && (
                    <Checkbox
                      checked={selectedBooks.includes(book.id)}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 1,
                        bgcolor: 'background.paper',
                        borderRadius: '50%',
                      }}
                    />
                  )}
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" component="h2" gutterBottom>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {book.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      Zuletzt gespeichert: {(() => {
                        const date = new Date(book.last_saved_at || book.created_at);
                        const today = new Date();
                        const isToday = date.toDateString() === today.toDateString();
                        return isToday ? date.toLocaleTimeString('de-DE') : date.toLocaleString('de-DE');
                      })()}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip label={book.role} size="small" color="primary" />
                      <Chip label={book.size || 'A4'} size="small" variant="outlined" />
                      <Chip 
                        label={book.orientation === 'landscape' ? 'Querformat' : 'Hochformat'} 
                        size="small" 
                        variant="outlined" 
                      />
                    </Box>
                  </CardContent>
                  {!multiSelectMode && (
                    <CardActions>
                      <Button
                        size="small"
                        startIcon={<SettingsIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/book/${book.id}/settings`);
                        }}
                      >
                        Einstellungen
                      </Button>
                      <Button
                        size="small"
                        startIcon={<ArchiveIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBook(book);
                          setArchiveDialogOpen(true);
                        }}
                      >
                        Archivieren
                      </Button>
                    </CardActions>
                  )}
                </Card>
              </Fade>
            </Grid>
          ))}
        </Grid>
        

      </Container>
      <ConfirmDialog
        open={archiveDialogOpen}
        title={selectedBooks.length > 0 ? `${selectedBooks.length} Bücher archivieren` : "Buch archivieren"}
        content={selectedBooks.length > 0 ? `Möchten Sie ${selectedBooks.length} Bücher wirklich archivieren?` : "Möchten Sie dieses Buch wirklich archivieren?"}
        onConfirm={selectedBooks.length > 0 ? handleMultiArchive : () => handleArchive(selectedBook)}
        onCancel={() => {
          setArchiveDialogOpen(false);
          setSelectedBook(null);
        }}
      />
    </>
  );
};

export default BookMy;