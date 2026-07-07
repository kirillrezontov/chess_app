import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/auth.css';

export function AuthScreen() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Register fields
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginUser.trim(), loginPass);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(regUser.trim(), regEmail.trim(), regPass);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">♟</div>
        <h1 className="auth-title">Chess</h1>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >
            Sign Up
          </button>
        </div>

        {tab === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="login-user">Username</label>
              <input
                id="login-user"
                type="text"
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                minLength={3}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="login-pass">Password</label>
              <input
                id="login-pass"
                type="password"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="field">
              <label htmlFor="reg-user">Username</label>
              <input
                id="reg-user"
                type="text"
                value={regUser}
                onChange={e => setRegUser(e.target.value)}
                minLength={3}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="reg-pass">Password</label>
              <input
                id="reg-pass"
                type="password"
                value={regPass}
                onChange={e => setRegPass(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  );
}