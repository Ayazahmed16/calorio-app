import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, clearToken, getToken, setToken } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    api.get('/auth/me/')
      .then((d) => { if (!cancelled) setUser(d.user); })
      .catch((e) => { if (!cancelled && e.status === 401) setUser(null); })
      .finally(() => { if (!cancelled) setBooting(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => { setUser(null); queryClient.clear(); };
    window.addEventListener('calorio:unauthorized', onUnauthorized);
    return () => window.removeEventListener('calorio:unauthorized', onUnauthorized);
  }, [queryClient]);

  const finish = useCallback((data) => { setToken(data.token); setUser(data.user); queryClient.clear(); }, [queryClient]);
  const login = useCallback(async (username, password) => finish(await api.post('/auth/login/', { username, password })), [finish]);
  const signup = useCallback(async (payload) => finish(await api.post('/auth/signup/', payload)), [finish]);
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout/'); } catch { /* token already invalid: nothing to revoke */ }
    clearToken();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => ({ user, booting, login, signup, logout }), [user, booting, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
