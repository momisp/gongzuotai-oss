import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./context/AppStateContext";
import CoverHome from "./pages/CoverHome";
import EntryDetail from "./pages/EntryDetail";
import EntryEdit from "./pages/EntryEdit";
import EntryList from "./pages/EntryList";
import GameList from "./pages/GameList";
import "./styles/page.css";

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CoverHome />} />
          <Route path="/games" element={<GameList />} />
          <Route path="/games/:gameId/entries" element={<EntryList />} />
          <Route path="/games/:gameId/entries/new" element={<EntryEdit />} />
          <Route path="/games/:gameId/entries/:entryId/edit" element={<EntryEdit />} />
          <Route path="/games/:gameId/entries/:entryId" element={<EntryDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}
