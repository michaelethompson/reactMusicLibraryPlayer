import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { PlayerProvider } from './features/player/PlayerProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerProvider>
      <Root />
    </PlayerProvider>
  </StrictMode>,
);
