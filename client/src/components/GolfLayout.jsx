import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import GolfNavbar from './GolfNavbar';
import GolfProfileOnboarding from './golf/GolfProfileOnboarding';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

const GOLF_META = {
  title:       'Fantasy Golf Done Right | TourneyRun',
  description: 'Season-long PGA Tour fantasy and tournament office pools. Draft once, play all season. Majors count 1.5×.',
  image:       'https://www.tourneyrun.app/golf-og-image.png',
  url:         'https://www.tourneyrun.app/golf',
};

function setMeta(name, content, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

function injectGolfMeta() {
  document.title = GOLF_META.title;
  setMeta('description', GOLF_META.description);
  setMeta('og:type',         'website',           true);
  setMeta('og:url',          GOLF_META.url,       true);
  setMeta('og:title',        GOLF_META.title,     true);
  setMeta('og:description',  GOLF_META.description, true);
  setMeta('og:image',        GOLF_META.image,     true);
  setMeta('og:image:width',  '1200',              true);
  setMeta('og:image:height', '630',               true);
  setMeta('og:site_name',    'TourneyRun Fantasy Golf', true);
  setMeta('twitter:card',        'summary_large_image');
  setMeta('twitter:title',       GOLF_META.title);
  setMeta('twitter:description', GOLF_META.description);
  setMeta('twitter:image',       GOLF_META.image);
}

// Public paths where we never show the onboarding prompt
const PUBLIC_PATHS = ['/golf', '/golf/faq', '/golf/strategy', '/golf/payment/success'];

export default function GolfLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [showOnboarding, setShowOnboarding]   = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  // Track which user we've already checked so the API call fires once per
  // login session, not on every pathname change within the golf section.
  const checkedForUser = useRef(null);

  const isPublicPath = PUBLIC_PATHS.includes(location.pathname) ||
                       location.pathname.startsWith('/golf/admin');

  useEffect(() => {
    injectGolfMeta();
  }, []);

  useEffect(() => {
    if (!user) {
      checkedForUser.current = null;
      setOnboardingChecked(true);
      return;
    }
    if (isPublicPath) {
      setOnboardingChecked(true);
      return;
    }
    if (checkedForUser.current === user.id) {
      setOnboardingChecked(true);
      return;
    }
    checkedForUser.current = user.id;
    api.get('/golf/profile/status')
      .then(r => {
        if (!r.data.profileComplete) setShowOnboarding(true);
        setOnboardingChecked(true);
      })
      .catch(() => setOnboardingChecked(true));
  }, [user?.id, location.pathname]);

  return (
    <>
      <GolfNavbar />
      <Outlet />
      {showOnboarding && onboardingChecked && (
        <GolfProfileOnboarding
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
        />
      )}
    </>
  );
}
