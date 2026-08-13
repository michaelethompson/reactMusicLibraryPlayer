import { useEffect, useState } from 'react';
import { App } from './App';
import { PerformView } from './features/perform/PerformView';

type Route = { name: 'planner' } | { name: 'perform'; serviceId: number | null };

function parse(hash: string): Route {
  const match = hash.match(/^#\/perform(?:\/(\d+))?$/);
  if (!match) return { name: 'planner' };
  return { name: 'perform', serviceId: match[1] ? Number(match[1]) : null };
}

/** Hash routing so the service view can be opened in its own window on a second screen. */
export function Root() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route.name === 'perform' ? <PerformView serviceId={route.serviceId} /> : <App />;
}
