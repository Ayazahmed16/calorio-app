import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Meals from './pages/Meals';
import MealBuilder from './pages/MealBuilder';
import MealEdit from './pages/MealEdit';
import Activity from './pages/Activity';
import ActivityForm from './pages/ActivityForm';
import Weight from './pages/Weight';
import Goals from './pages/Goals';
import Foods from './pages/Foods';
import FoodForm from './pages/FoodForm';

function Protected({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <div className="p-10"><Loading label="Signing you in..." /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicOnly({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <div className="p-10"><Loading /></div>;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/meals" element={<Meals />} />
        <Route path="/meals/new" element={<MealBuilder />} />
        <Route path="/meals/:id/edit" element={<MealEdit />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/activity/new" element={<ActivityForm />} />
        <Route path="/activity/:id/edit" element={<ActivityForm />} />
        <Route path="/weight" element={<Weight />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/foods" element={<Foods />} />
        <Route path="/foods/new" element={<FoodForm />} />
        <Route path="/foods/:id/edit" element={<FoodForm />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
