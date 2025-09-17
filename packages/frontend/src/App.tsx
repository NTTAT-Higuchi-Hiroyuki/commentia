import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { HomePage } from './pages/HomePage';
import { JoinRoomPage } from './pages/JoinRoomPage';
import { RoomPage } from './pages/RoomPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create-room" element={<CreateRoomPage />} />
          <Route path="/join-room" element={<JoinRoomPage />} />
          <Route path="/join-room/:roomId" element={<JoinRoomPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
