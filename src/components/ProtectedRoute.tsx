import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { status } = useAuthContext();
  const { ready } = useAccount();
  // Tant que le bootstrap /auth/refresh n'a pas répondu, on n'affiche rien pour
  // éviter de flasher /login alors que la session est peut-être valide (cookie).
  if (status === 'loading') return null;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  // Authentifié mais compte actif pas encore réconcilié : on attend, sinon les
  // pages fetcheraient avec le token par défaut avant la ré-application du compte.
  if (!ready) return null;
  return <>{children}</>;
}
