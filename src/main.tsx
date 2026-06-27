import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Privacy } from './Privacy';
import { Terms } from './Terms';
import './styles.css';

// Minimal hash-based routing: '#/privacy' -> Privacy, '#/terms' -> Terms, anything else -> App.
// Hash routing avoids server-side rewrites, so deep links survive a GitHub Pages refresh.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (hash.startsWith('#/privacy')) return <Privacy />;
  if (hash.startsWith('#/terms')) return <Terms />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
