import { useEffect } from 'react';

const DEFAULT_TITLE = 'TourneyRun';
const DEFAULT_DESC  = 'Run golf office pools for the Masters and every PGA tournament. Pick players, track live scores, keep 100% of your prize pool. From $9.99/tournament.';
const DEFAULT_IMAGE = 'https://www.tourneyrun.app/golf-og-image.png';
const BASE_URL      = 'https://www.tourneyrun.app';

export function useDocTitle(title, { description, image } = {}) {
  useEffect(() => {
    document.title = title;

    // Canonical / og:url
    let canonical = document.querySelector("link[rel='canonical']");
    if (canonical) canonical.href = BASE_URL + window.location.pathname;
    const ogUrl = document.querySelector("meta[property='og:url']");
    if (ogUrl) ogUrl.setAttribute('content', BASE_URL + window.location.pathname);

    // Title tags
    const ogTitle = document.querySelector("meta[property='og:title']");
    if (ogTitle) ogTitle.setAttribute('content', title);
    const twTitle = document.querySelector("meta[name='twitter:title']");
    if (twTitle) twTitle.setAttribute('content', title);

    // Description tags
    const descEl = document.querySelector("meta[name='description']");
    const ogDesc = document.querySelector("meta[property='og:description']");
    const twDesc = document.querySelector("meta[name='twitter:description']");
    if (description) {
      if (descEl)  descEl.setAttribute('content', description);
      if (ogDesc) ogDesc.setAttribute('content', description);
      if (twDesc) twDesc.setAttribute('content', description);
    }

    // Image tags
    const ogImg = document.querySelector("meta[property='og:image']");
    const twImg = document.querySelector("meta[name='twitter:image']");
    if (image) {
      if (ogImg) ogImg.setAttribute('content', image);
      if (twImg) twImg.setAttribute('content', image);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      if (canonical) canonical.href = BASE_URL + '/';
      if (ogUrl)  ogUrl.setAttribute('content',  BASE_URL + '/');
      if (ogTitle) ogTitle.setAttribute('content', DEFAULT_TITLE);
      if (twTitle) twTitle.setAttribute('content', DEFAULT_TITLE);
      if (descEl)  descEl.setAttribute('content',  DEFAULT_DESC);
      if (ogDesc) ogDesc.setAttribute('content',  DEFAULT_DESC);
      if (twDesc) twDesc.setAttribute('content',  DEFAULT_DESC);
      if (ogImg)  ogImg.setAttribute('content',   DEFAULT_IMAGE);
      if (twImg)  twImg.setAttribute('content',   DEFAULT_IMAGE);
    };
  }, [title, description, image]);
}
