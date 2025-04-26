import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const LoginPage: React.FC = () => {
  const { signInWithMagicLink, signInWithOAuth, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleMagicLinkSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) {
      alert('Please enter your email.');
      return;
    }
    setMagicLinkSent(false);
    await signInWithMagicLink(email);
    setMagicLinkSent(true);
  };

  const handleOAuthSignIn = (provider: 'google' | 'twitter') => {
    signInWithOAuth(provider);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Login to Pod<span style={{color: 'var(--accent)'}}>Pace</span></h2>

      <form onSubmit={handleMagicLinkSubmit} style={styles.form}>
        <label htmlFor="email" style={styles.label}>Login with Email Magic Link:</label>
        <input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={styles.input}
          disabled={loading}
        />
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Sending...' : 'Send Magic Link'}
        </button>
      </form>

      {magicLinkSent && (
          <p style={styles.confirmationMessage}>
              Check your email for the magic link!
          </p>
      )}

      <div style={styles.divider}>OR</div>

      <div style={styles.socialContainer}>
        <button
          onClick={() => handleOAuthSignIn('google')}
          style={{...styles.button, ...styles.socialButton}}
          disabled={loading}
        >
          {loading ? '...' : 'Login with Google'}
        </button>
        <button
          onClick={() => handleOAuthSignIn('twitter')}
          style={{...styles.button, ...styles.socialButton}}
          disabled={loading}
        >
          {loading ? '...' : 'Login with X (Twitter)'}
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '400px',
    margin: '50px auto',
    padding: '2rem',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    textAlign: 'center',
    background: 'var(--bg-secondary)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  label: {
    fontWeight: 500,
    textAlign: 'left',
    fontSize: '0.9rem',
  },
  input: {
    padding: '0.75rem',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    fontSize: '1rem',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  button: {
    padding: '0.75rem 1rem',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1rem',
    transition: 'background-color 0.2s ease',
    background: 'var(--accent)',
  },
  socialButton: {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  divider: {
    margin: '1.5rem 0',
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    textAlign: 'center',
  },
  socialContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  title: {
    marginBottom: '2rem',
    fontWeight: 600
  },
  confirmationMessage: {
    marginTop: '-0.5rem',
    marginBottom: '1.5rem',
    color: 'var(--accent)',
    fontSize: '0.9rem'
  }
};

export default LoginPage;