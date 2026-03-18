import { Outlet } from 'react-router-dom';
import GolfNavbar from './GolfNavbar';

export default function GolfLayout() {
  return (
    <>
      <GolfNavbar />
      <Outlet />
    </>
  );
}
