import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Pipeline from './pages/Pipeline';
import DealDetail from './pages/DealDetail';
import Contacts from './pages/Contacts';
import Companies from './pages/Companies';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    setUser(data.user);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Pipeline />} />
            <Route path="deals/:id" element={<DealDetail />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="companies" element={<Companies />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
