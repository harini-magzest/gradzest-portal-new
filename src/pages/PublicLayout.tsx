import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SkipLink from '../components/SkipLink';

export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-white">
      <SkipLink />
      <Navbar />
      <div id="main-content" tabIndex={-1} className="outline-none">
        <Outlet />
      </div>
    </div>
  );
}
