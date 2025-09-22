import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import BoundedCanvas from '../components/BoundedCanvas';
import io from 'socket.io-client';
import axios from 'axios';
import { API_URL, getPageDimensions } from '../config';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Box,
  Chip,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import AppBarComponent from '../components/AppBarComponent';
import { useSnackbar } from '../components/SnackbarProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import PDFQualityDialog from '../components/PDFQualityDialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const BookEditor = ({ token, setToken }) => {
  const { showSnackbar } = useSnackbar();
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState([]);
  const [editor, setEditor] = useState(null);
  const [tempPages, setTempPages] = useState([]);
  const [deletedPages, setDeletedPages] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, onConfirm: null });
  const [bookTitle, setBookTitle] = useState('');
  const [pageMenuAnchor, setPageMenuAnchor] = useState(null);
  const [bookPageSize, setBookPageSize] = useState('A4');
  const [bookOrientation, setBookOrientation] = useState('portrait');
  const [bookDataLoaded, setBookDataLoaded] = useState(false);
  const [pdfQualityDialog, setPdfQualityDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);


  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);
    
    newSocket.emit('joinBook', bookId);
    
    fetchPages();

    // Suppress ResizeObserver errors
    const resizeObserverErrorHandler = (e) => {
      if (e.message === 'ResizeObserver loop completed with undelivered notifications.') {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('error', resizeObserverErrorHandler);

    return () => {
      newSocket.close();
      window.removeEventListener('error', resizeObserverErrorHandler);
    };
  }, [bookId, currentPage]);



  useEffect(() => {
    if (editor && !isSaving) {
      // First check temp pages for any changes
      const tempPageData = tempPages.find(p => p.page_number === currentPage);
      
      if (tempPageData && tempPageData.canvas_data && typeof tempPageData.canvas_data === 'object' && tempPageData.canvas_data.schema) {
        editor.store.loadSnapshot(tempPageData.canvas_data);
      } else {
        // Then check saved pages
        const savedPageData = pages.find(p => p.page_number === currentPage);
        if (savedPageData && savedPageData.canvas_data && typeof savedPageData.canvas_data === 'object' && savedPageData.canvas_data.schema) {
          editor.store.loadSnapshot(savedPageData.canvas_data);
        }
      }
    }
  }, [editor, currentPage, pages, tempPages, isSaving]);



  const fetchPages = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/books/${bookId}/pages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPages(response.data);
      

    } catch (error) {
      console.error('Failed to fetch pages:', error);
    }
  };

  // Fetch book title
  useEffect(() => {
    const fetchBookTitle = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/books`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const book = response.data.find(b => b.id === parseInt(bookId));
        if (book) {
          setBookTitle(book.title);
          setBookPageSize(book.page_size || 'A4');
          setBookOrientation(book.orientation || 'portrait');
          setBookDataLoaded(true);
        }
      } catch (error) {
        console.error('Failed to fetch book title:', error);
      }
    };
    fetchBookTitle();
  }, [bookId, token]);

  const savePage = async () => {
    if (!editor) {
      showSnackbar('Editor nicht bereit', 'warning');
      return;
    }
    
    try {
      setIsSaving(true);
      // Save current page canvas data first
      const canvasData = editor.store.getSnapshot();
      
      // Collect all pages with their data
      const allPagesToSave = [];
      
      // Add existing pages (excluding deleted ones)
      for (const page of pages) {
        if (!deletedPages.includes(page.page_number)) {
          const tempPageData = tempPages.find(p => p.page_number === page.page_number);
          const pageData = page.page_number === currentPage ? canvasData : 
                          (tempPageData?.canvas_data || page.canvas_data);
          allPagesToSave.push({ original_number: page.page_number, canvas_data: pageData });
        }
      }
      
      // Add temp pages (new pages)
      for (const tempPage of tempPages) {
        if (!pages.find(p => p.page_number === tempPage.page_number)) {
          const pageData = tempPage.page_number === currentPage ? canvasData : 
                          (tempPage.canvas_data || {});
          allPagesToSave.push({ original_number: tempPage.page_number, canvas_data: pageData });
        }
      }
      
      // Sort by original page number
      allPagesToSave.sort((a, b) => a.original_number - b.original_number);
      
      // Delete all existing pages
      await axios.delete(
        `${API_URL}/api/books/${bookId}/pages/all`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Save pages with sequential numbering (1, 2, 3...)
      for (let i = 0; i < allPagesToSave.length; i++) {
        await axios.put(
          `${API_URL}/api/books/${bookId}/pages/${i + 1}`,
          { canvasData: allPagesToSave[i].canvas_data },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      // Refresh pages from server to reflect saved state, then clear local buffers
      await fetchPages();
      setTempPages([]);
      setDeletedPages([]);
      
      showSnackbar('Freundschaftsbuch erfolgreich gespeichert!', 'success');
    } catch (error) {
      showSnackbar('Fehler beim Speichern: ' + (error.response?.data?.error || error.message), 'error');
    }
    finally {
      setIsSaving(false);
    }
  };

  const changePage = (newPage) => {
    // Check if target page is deleted
    if (deletedPages.includes(newPage)) {
      return; // Don't navigate to deleted pages
    }
    
    // Save current page content before switching
    if (editor) {
      const canvasData = editor.store.getSnapshot();
      
      // Update temp page if it exists, or update saved page data
      const tempPageIndex = tempPages.findIndex(p => p.page_number === currentPage);
      if (tempPageIndex !== -1) {
        setTempPages(prev => prev.map(p => 
          p.page_number === currentPage 
            ? { ...p, canvas_data: canvasData }
            : p
        ));
      } else {
        // For saved pages, we need to track changes too
        setTempPages(prev => {
          const existingTemp = prev.find(p => p.page_number === currentPage);
          if (existingTemp) {
            return prev.map(p => 
              p.page_number === currentPage 
                ? { ...p, canvas_data: canvasData }
                : p
            );
          } else {
            return [...prev, { page_number: currentPage, canvas_data: canvasData }];
          }
        });
      }
    }
    
    setCurrentPage(newPage);
    
    // Zoom to content after page switch
    if (editor) {
      
      setTimeout(() => {
        const shapes = editor.getCurrentPageShapes();
        if (shapes.length > 0) {
          editor.zoomToFit();
        }
      }, 1000);
    }
  };

  const addNewPage = () => {
    const allPages = [...pages, ...tempPages].filter(p => !deletedPages.includes(p.page_number));
    const maxPage = allPages.length > 0 ? Math.max(...allPages.map(p => p.page_number)) : 0;
    const newPageNumber = maxPage + 1;
    
    // For new books with no pages, start with page 1
    const pageNumber = allPages.length === 0 ? 1 : newPageNumber;
    
    // Add to temporary pages
    setTempPages(prev => [...prev, { page_number: pageNumber, canvas_data: null }]);
    setCurrentPage(pageNumber);
    
    // Clear canvas for new page
    if (editor) {
      setTimeout(() => {
        editor.selectAll();
        editor.deleteShapes(editor.getSelectedShapeIds());
      }, 100);
    }
  };

  const deletePage = () => {
    setConfirmDialog({
      open: true,
      onConfirm: () => {
        // Add to deleted pages if it's a saved page
        if (pages.find(p => p.page_number === currentPage)) {
          setDeletedPages(prev => [...prev, currentPage]);
        }
        
        // Remove from temp pages if it's a temp page
        setTempPages(prev => prev.filter(p => p.page_number !== currentPage));
        
        // Always go to previous page
        const newPage = Math.max(1, currentPage - 1);
        setCurrentPage(newPage);
        
        // Zoom to fit after page deletion
        if (editor) {
          setTimeout(() => {
            editor.zoomToFit();
          }, 200);
        }
        
        setConfirmDialog({ open: false, onConfirm: null });
      }
    });
  };

  const getTotalPages = () => {
    const allPages = [...pages, ...tempPages].filter(p => !deletedPages.includes(p.page_number));
    return allPages.length;
  };

  const getMaxPage = () => {
    const allPages = [...pages, ...tempPages].filter(p => !deletedPages.includes(p.page_number));
    return allPages.length > 0 ? Math.max(...allPages.map(p => p.page_number)) : 1;
  };

  const exportToPDF = async (qualityOption = { quality: 0.7, format: 'jpeg' }) => {
    if (!editor) {
      showSnackbar('Editor nicht bereit', 'warning');
      return;
    }

    try {
      showSnackbar('PDF wird erstellt...', 'info');
      
      // Get unique pages only
      const uniquePages = new Map();
      [...pages, ...tempPages]
        .filter(p => !deletedPages.includes(p.page_number))
        .forEach(p => uniquePages.set(p.page_number, p));
      
      const allPages = Array.from(uniquePages.values())
        .sort((a, b) => a.page_number - b.page_number);

      if (allPages.length === 0) {
        showSnackbar('Keine Seiten zum Drucken vorhanden', 'warning');
        return;
      }

      const pdf = new jsPDF({
        orientation: bookOrientation,
        unit: 'mm',
        format: bookPageSize.toLowerCase()
      });

      const currentPageData = editor.store.getSnapshot();
      
      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i];
        
        // Load page data
        const tempPageData = tempPages.find(p => p.page_number === page.page_number);
        const pageData = page.page_number === currentPage ? currentPageData :
                        (tempPageData?.canvas_data || page.canvas_data);
        
        if (pageData && typeof pageData === 'object' && pageData.schema) {
          editor.store.loadSnapshot(pageData);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (i > 0) pdf.addPage();
        
        const { pageWidth, pageHeight } = getPageDimensions(bookPageSize, bookOrientation);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = pageWidth;
        canvas.height = pageHeight;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Collect all shapes and exclude boundary helpers
        const allShapes = editor.getCurrentPageShapes();
        const shapesToExport = allShapes.filter(shape => !shape.id.includes('boundary'));

        // Generate SVG for selected shapes (no background)
        const svg = await editor.getSvg(shapesToExport, { scale: 1, background: false });

        if (svg) {
          // Map page rectangle from editor coords into the SVG's viewBox coords
          const viewBoxAttr = svg.getAttribute('viewBox');
          let minX = 0;
          let minY = 0;
          let vbW = 0;
          let vbH = 0;
          if (viewBoxAttr) {
            const parts = viewBoxAttr.split(/\s+/).map(Number);
            if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
              [minX, minY, vbW, vbH] = parts;
            }
          } else {
            // Fallback: if no viewBox, assume 0,0,width,height
            vbW = Number(svg.getAttribute('width')) || pageWidth;
            vbH = Number(svg.getAttribute('height')) || pageHeight;
          }

          const svgData = new XMLSerializer().serializeToString(svg);
          const img = new Image();

          await new Promise((resolve) => {
            img.onload = () => {
              // Compute pixel mapping from SVG units to image pixels
              const scaleX = vbW ? img.width / vbW : 1;
              const scaleY = vbH ? img.height / vbH : 1;

              // Page rectangle in SVG local coordinates (viewBox space)
              const pageXInSvg = -pageWidth / 2 - minX;
              const pageYInSvg = -pageHeight / 2 - minY;
              const pageWInSvg = pageWidth;
              const pageHInSvg = pageHeight;

              // Convert to source pixels for drawImage
              const sx = pageXInSvg * scaleX;
              const sy = pageYInSvg * scaleY;
              const sw = pageWInSvg * scaleX;
              const sh = pageHInSvg * scaleY;

              // Ensure white background and draw only the cropped page area
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, 0, pageWidth, pageHeight);
              ctx.clip();
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, pageWidth, pageHeight);
              ctx.restore();
              resolve();
            };
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
          });
        }
        
        const imgData = canvas.toDataURL(`image/${qualityOption.format}`, qualityOption.quality);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      
      // Restore current page
      if (currentPageData) {
        editor.store.loadSnapshot(currentPageData);
        
        // Zoom to fit after restoring current page
        setTimeout(() => {
          const shapes = editor.getCurrentPageShapes();
          if (shapes.length > 0) {
            editor.zoomToFit();
          }
        }, 500);
      }
      
      pdf.save(`${bookTitle || 'Freundschaftsbuch'}.pdf`);
      showSnackbar('PDF erfolgreich erstellt!', 'success');
      
    } catch (error) {
      console.error('PDF export error:', error);
      showSnackbar('Fehler beim Erstellen der PDF', 'error');
    }
  };

  // Auto-create first page if book has no pages - use same flow as manual "Neue Seite"
  useEffect(() => {
    if (editor && bookDataLoaded) {
      const noPersistentPages = pages.length === 0;
      const noTempPages = tempPages.length === 0;
      if (noPersistentPages && noTempPages) {
        addNewPage();
      }
    }
  }, [pages.length, tempPages.length, editor, bookDataLoaded]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBarComponent setToken={setToken} />
      
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense" sx={{ minHeight: 48 }}>
          <IconButton
            edge="start"
            onClick={() => navigate('/book/my')}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              onClick={() => {
                const allPages = [...pages, ...tempPages]
                  .filter(p => !deletedPages.includes(p.page_number))
                  .map(p => p.page_number)
                  .sort((a, b) => a - b);
                const prevPage = allPages.reverse().find(p => p < currentPage);
                if (prevPage) changePage(prevPage);
              }}
              disabled={(() => {
                const allPages = [...pages, ...tempPages]
                  .filter(p => !deletedPages.includes(p.page_number))
                  .map(p => p.page_number)
                  .sort((a, b) => a - b);
                return !allPages.find(p => p < currentPage);
              })()}
              size="small"
            >
              <NavigateBeforeIcon />
            </IconButton>
            
            <Chip 
              label={`Seite ${currentPage}`} 
              variant="outlined" 
              size="small"
              onClick={(e) => setPageMenuAnchor(e.currentTarget)}
              sx={{ mx: 1, cursor: 'pointer' }}
            />
            
            <IconButton
              onClick={() => {
                const allPages = [...pages, ...tempPages]
                  .filter(p => !deletedPages.includes(p.page_number))
                  .map(p => p.page_number)
                  .sort((a, b) => a - b);
                const nextPage = allPages.find(p => p > currentPage);
                if (nextPage) changePage(nextPage);
              }}
              disabled={(() => {
                const allPages = [...pages, ...tempPages]
                  .filter(p => !deletedPages.includes(p.page_number))
                  .map(p => p.page_number)
                  .sort((a, b) => a - b);
                return !allPages.find(p => p > currentPage);
              })()}
              size="small"
            >
              <NavigateNextIcon />
            </IconButton>
          </Box>
          
          <Typography variant="h6" sx={{ flexGrow: 1, textAlign: 'center' }}>
            {bookTitle}
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              startIcon={<PrintIcon />}
              onClick={() => setPdfQualityDialog(true)}
              size="small"
              variant="outlined"
            >
              Drucken
            </Button>
            <Button
              startIcon={<AddIcon />}
              onClick={addNewPage}
              size="small"
              variant="outlined"
            >
              Neue Seite
            </Button>
            <Button
              startIcon={<DeleteIcon />}
              onClick={deletePage}
              disabled={getTotalPages() <= 1}
              size="small"
              variant="outlined"
              color="error"
            >
              Seite löschen
            </Button>
            <Button
              startIcon={<SaveIcon />}
              onClick={savePage}
              size="small"
              variant="contained"
            >
              Buch Speichern
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      
      <Box className="tldraw-container" sx={{ 
        flex: 1, 
        minHeight: 0
      }}>
        {bookDataLoaded && (
          <BoundedCanvas 
            onMount={(editor) => {
              setEditor(editor);
            }}
            pageSize={bookPageSize}
            orientation={bookOrientation}
          />
        )}
      </Box>
      
      <Menu
        anchorEl={pageMenuAnchor}
        open={Boolean(pageMenuAnchor)}
        onClose={() => setPageMenuAnchor(null)}
      >
        {[...pages, ...tempPages]
          .filter(p => !deletedPages.includes(p.page_number))
          .sort((a, b) => a.page_number - b.page_number)
          .map(page => (
            <MenuItem
              key={page.page_number}
              onClick={() => {
                changePage(page.page_number);
                setPageMenuAnchor(null);
              }}
              selected={page.page_number === currentPage}
            >
              Seite {page.page_number}
            </MenuItem>
          ))
        }
      </Menu>
      
      <ConfirmDialog
        open={confirmDialog.open}
        title="Seite löschen"
        message="Möchten Sie diese Seite wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false, onConfirm: null })}
      />
      
      <PDFQualityDialog
        open={pdfQualityDialog}
        onClose={() => setPdfQualityDialog(false)}
        onConfirm={(qualityOption) => {
          setPdfQualityDialog(false);
          exportToPDF(qualityOption);
        }}
      />
    </Box>
  );
};

export default BookEditor;