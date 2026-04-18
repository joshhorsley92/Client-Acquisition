import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Scripts from './pages/Scripts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Calls from './pages/Calls';
import CallDetail from './pages/CallDetail';

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
    if (data.mfa_required) return data;
    setUser(data.user);
    return data;
  };

  const verifyTotp = async (email, password, token) => {
    const data = await api.verifyTotp({ email, password, token });
    setUser(data.user);
    return data;
  };

  const refreshUser = async () => {
    try {
      const data = await api.me();
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyTotp, refreshUser, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="calls" element={<Calls />} />
            <Route path="calls/:id" element={<CallDetail />} />
            <Route path="scripts" element={<Scripts />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            {/* Legacy v1 URLs — bounce to the new equivalents. */}
            <Route path="pipeline" element={<Navigate to="/clients" replace />} />
            <Route path="companies" element={<Navigate to="/clients" replace />} />
            <Route path="contacts" element={<Navigate to="/clients" replace />} />
            <Route path="tasks" element={<Navigate to="/" replace />} />
            <Route path="import" element={<Navigate to="/clients" replace />} />
            <Route path="deals/:id" element={<Navigate to="/clients" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
