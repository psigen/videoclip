import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Privacy } from './Privacy';
import './styles.css';

// Minimal hash-based routing: '#/privacy' -> Privacy page, anything else -> App.
// Hash routing avoids server-side rewrites, so deep links survive a GitHub Pages refresh.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.startsWith('#/privacy') ? <Privacy /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
