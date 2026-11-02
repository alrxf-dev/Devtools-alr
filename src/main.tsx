import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { applyTheme, initialTheme } from './app/theme';

applyTheme(initialTheme());

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
