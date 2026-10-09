import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { underlay } from './components/overlay';
import { ScrollToTop } from './components/ScrollToTop';
import { ToastProvider } from './components/Toast';
import { CollectionPage } from './pages/CollectionPage';
import { InStorePage } from './pages/InStorePage';
import { ProfilePage } from './pages/ProfilePage';
import { WineDetailPage } from './pages/WineDetailPage';
import { WantPage } from './pages/WantPage';
import { WineFormPage } from './pages/WineFormPage';

// Opened now and then: loaded when first needed.
const TonightPage = lazy(() => import('./pages/TonightPage').then((m) => ({ default: m.TonightPage })));
const WatchPage = lazy(() => import('./pages/WatchPage').then((m) => ({ default: m.WatchPage })));
const PassportPage = lazy(() => import('./pages/PassportPage').then((m) => ({ default: m.PassportPage })));

export function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <ScrollToTop />
        <AppRoutes />
      </HashRouter>
    </ToastProvider>
  );
}

function AppRoutes() {
  const location = useLocation();
  const page = underlay(location);
  return (
    <>
      <Routes location={page}>
        <Route element={<Layout />}>
          <Route index element={<CollectionPage />} />
          <Route path="store" element={<InStorePage />} />
          <Route path="add" element={<WineFormPage key="add" />} />
          <Route path="wine/:id" element={<WineDetailPage />} />
          <Route path="wine/:id/edit" element={<WineFormPage key="edit" />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="want" element={<WantPage />} />
          <Route
            path="watch"
            element={
              <Suspense fallback={null}>
                <WatchPage />
              </Suspense>
            }
          />
          <Route
            path="passport"
            element={
              <Suspense fallback={null}>
                <PassportPage />
              </Suspense>
            }
          />
          <Route path="*" element={<CollectionPage />} />
        </Route>
      </Routes>
      {location.pathname === '/tonight' && (
        <Suspense fallback={null}>
          <TonightPage />
        </Suspense>
      )}
    </>
  );
}
