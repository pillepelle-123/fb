import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { lightTheme, darkTheme } from './theme';
import { SnackbarProvider } from './components/SnackbarProvider';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BookMy from './pages/BookMy';
import BookCreate from './pages/BookCreate';
import BookSettings from './pages/BookSettings';
import BookEditor from './pages/BookEditor';
import BookArchive from './pages/BookArchive';
import UserProfile from './pages/UserProfile';
import UserSettings from './pages/UserSettings';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState(localStorage.getItem('username'));
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      setUsername(null);
    }
  }, [token]);

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <CssBaseline />
      <SnackbarProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="App">
          <Routes>
          <Route 
            path="/login" 
            element={!token ? <Login setToken={setToken} setUsername={setUsername} /> : <Navigate to="/dashboard" />} 
          />
          <Route 
            path="/dashboard" 
            element={token ? <Dashboard token={token} setToken={setToken} username={username} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/book/my" 
            element={token ? <BookMy token={token} setToken={setToken} username={username} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/book/archive" 
            element={token ? <BookArchive token={token} setToken={setToken} username={username} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/book/create" 
            element={token ? <BookCreate token={token} setToken={setToken} username={username} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/book/:bookId/settings" 
            element={token ? <BookSettings token={token} setToken={setToken} username={username} /> : <Navigate to="/login" />} 
          />
                    <Route 
            path="/book/:bookId" 
            element={<BookEditor token={token} setToken={setToken} username={username} />} 
          />
          <Route 
            path="/user/profile" 
            element={<UserProfile token={token} setToken={setToken} username={username} />} 
          />
          <Route 
            path="/user/settings" 
            element={<UserSettings token={token} setToken={setToken} username={username} />} 
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </div>
        </Router>
      </SnackbarProvider>
    </ThemeProvider>
  );
}

export default App;