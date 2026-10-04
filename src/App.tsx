import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ScrollToTop } from './components/ScrollToTop';
import { ToastProvider } from './components/Toast';
import { CollectionPage } from './pages/CollectionPage';
import { InStorePage } from './pages/InStorePage';
import { ProfilePage } from './pages/ProfilePage';
import { WineDetailPage } from './pages/WineDetailPage';
import { WantPage } from './pages/WantPage';
import { WineFormPage } from './pages/WineFormPage';

export function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<CollectionPage />} />
            <Route path="store" element={<InStorePage />} />
            <Route path="add" element={<WineFormPage key="add" />} />
            <Route path="wine/:id" element={<WineDetailPage />} />
            <Route path="wine/:id/edit" element={<WineFormPage key="edit" />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="want" element={<WantPage />} />
            <Route path="*" element={<CollectionPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
