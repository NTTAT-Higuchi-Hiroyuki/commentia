import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { HomePage } from './pages/HomePage';
import { JoinRoomPage } from './pages/JoinRoomPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create-room" element={<CreateRoomPage />} />
          <Route path="/join-room" element={<JoinRoomPage />} />
          {/* 将来追加されるルート
          <Route path="/rooms/:roomId" element={<RoomPage />} />
          <Route path="*" element={<NotFoundPage />} />
          */}
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
