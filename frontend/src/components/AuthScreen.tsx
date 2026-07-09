import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/auth.css';

export function AuthScreen() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');

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
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <motion.div
          className="auth-logo"
          initial={{ rotate: -10 }}
          animate={{ rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        >
          ♟
        </motion.div>
        <h1 className="auth-title">Chess</h1>

        <div className="auth-tabs">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              className={`auth-tab ${tab === t ? 'active' : ''}`}
              onClick={() => { setTab(t); setError(''); }}
              type="button"
            >
              {t === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'login' ? (
            <motion.form
              key="login"
              className="auth-form"
              onSubmit={handleLogin}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
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
              <motion.button
                className="btn btn-primary"
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </motion.button>
            </motion.form>
          ) : (
            <motion.form
              key="register"
              className="auth-form"
              onSubmit={handleRegister}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
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
              <motion.button
                className="btn btn-primary"
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.p
              className="auth-error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}