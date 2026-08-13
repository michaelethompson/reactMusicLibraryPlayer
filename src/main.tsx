import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PlayerProvider } from './features/player/PlayerProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerProvider>
      <App />
    </PlayerProvider>
  </StrictMode>,
);
