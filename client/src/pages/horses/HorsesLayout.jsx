import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import HorsesNavbar from '../../components/HorsesNavbar';

const HORSES_META = {
  title:       'Horse Racing Pools | TourneyRun',
  description: 'Kentucky Derby pools made easy. Random draw, pick win/place/show, or squares.',
};

function setMeta(name, content, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

export default function HorsesLayout() {
  useEffect(() => {
    document.title = HORSES_META.title;
    setMeta('description', HORSES_META.description);
    setMeta('og:title', HORSES_META.title, true);
    setMeta('og:description', HORSES_META.description, true);
  }, []);

  return (
    <>
      <HorsesNavbar />
      <Outlet />
    </>
  );
}
