import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthScreen } from '@/components/AuthScreen';
import { LobbyScreen } from '@/components/LobbyScreen';
import { GameScreen } from '@/components/GameScreen';
import { GameReviewScreen } from '@/components/GameReviewScreen';

function AppRouter() {
  const { screen } = useAuth();

  switch (screen) {
    case 'auth':
      return <AuthScreen />;
    case 'lobby':
      return <LobbyScreen />;
    case 'game':
      return <GameScreen />;
    case 'review':
      return <GameReviewScreen />;
    default:
      return <AuthScreen />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}