import { useDocTitle } from '../hooks/useDocTitle';
import { Link } from 'react-router-dom';

const S = {
  page: {
    background: '#080e1a',
    minHeight: '100vh',
    padding: '60px 16px',
  },
  wrap: {
    maxWidth: 800,
    margin: '0 auto',
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: '#fff',
    marginBottom: 4,
    lineHeight: 1.2,
  },
  accent: { color: '#f97316' },
  meta: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 32,
  },
  h2: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    margin: '36px 0 10px',
  },
  h3: {
    fontSize: 14,
    fontWeight: 700,
    color: '#cbd5e1',
    margin: '18px 0 6px',
  },
  p: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.75,
    marginBottom: 12,
  },
  ul: {
    paddingLeft: 20,
    margin: '8px 0 12px',
  },
  li: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.75,
    marginBottom: 4,
  },
  divider: {
    borderTop: '1px solid #1f2937',
    margin: '40px 0 0',
    paddingTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.6,
  },
};

export default function PrivacyPolicy() {
  useDocTitle('Privacy Policy | TourneyRun');
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.title}><span style={S.accent}>TourneyRun</span> — Privacy Policy</h1>
        <p style={S.meta}>Effective Date: March 17, 2026 &nbsp;·&nbsp; WohlBuilt Group LLC · Charlotte, NC</p>

        <h2 style={S.h2}>1. Overview</h2>
        <p style={S.p}>WohlBuilt Group LLC ("TourneyRun") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use TourneyRun.</p>

        <h2 style={S.h2}>2. Information We Collect</h2>
        <h3 style={S.h3}>Information You Provide:</h3>
        <ul style={S.ul}>
          <li style={S.li}>Account information: username, email address, password</li>
          <li style={S.li}>Payment information: platform fee payments processed through our payment processor (we do not store full card numbers)</li>
          <li style={S.li}>League activity: draft picks, league memberships, scoring data</li>
          <li style={S.li}>Communications: messages sent through the trash talk chat feature</li>
        </ul>
        <h3 style={S.h3}>Information Collected Automatically:</h3>
        <ul style={S.ul}>
          <li style={S.li}>Device and browser type</li>
          <li style={S.li}>IP address and approximate location</li>
          <li style={S.li}>Pages visited and features used</li>
          <li style={S.li}>Timestamps of actions taken</li>
        </ul>

        <h2 style={S.h2}>3. How We Use Your Information</h2>
        <p style={S.p}>We use your information to:</p>
        <ul style={S.ul}>
          <li style={S.li}>Create and manage your account</li>
          <li style={S.li}>Operate league drafts, scoring, and standings</li>
          <li style={S.li}>Process platform fee payments</li>
          <li style={S.li}>Send transactional emails (account verification, password resets, league notifications)</li>
          <li style={S.li}>Improve and maintain the platform</li>
          <li style={S.li}>Investigate and prevent fraud or abuse</li>
          <li style={S.li}>Comply with legal obligations</li>
        </ul>
        <p style={S.p}>We do not sell your personal information. We do not use your data for advertising purposes.</p>

        <h2 style={S.h2}>4. Information Sharing</h2>
        <p style={S.p}>We may share your information with:</p>
        <ul style={S.ul}>
          <li style={S.li}>Payment processors to process platform fee payments</li>
          <li style={S.li}>Email service providers to send transactional emails</li>
          <li style={S.li}>Other league members: your username and draft picks are visible to other members of leagues you join</li>
          <li style={S.li}>Law enforcement if required by law</li>
        </ul>
        <p style={S.p}>We do not share your email address with other league members.</p>

        <h2 style={S.h2}>5. Data Retention</h2>
        <p style={S.p}>We retain your account information and league data for as long as your account is active. You may request deletion at any time by contacting <a href="mailto:support@tourneyrun.app" style={{ color: '#60a5fa' }}>support@tourneyrun.app</a>. We will delete your data within 30 days of a valid request.</p>

        <h2 style={S.h2}>6. Cookies</h2>
        <p style={S.p}>TourneyRun uses cookies to maintain your login session and improve your experience. We do not use third-party advertising cookies.</p>

        <h2 style={S.h2}>7. Security</h2>
        <p style={S.p}>We use industry-standard security measures including encrypted password storage and HTTPS for all data transmission.</p>

        <h2 style={S.h2}>8. Children's Privacy</h2>
        <p style={S.p}>TourneyRun is not intended for users under 18. We do not knowingly collect information from minors.</p>

        <h2 style={S.h2}>9. Your Rights</h2>
        <p style={S.p}>You have the right to:</p>
        <ul style={S.ul}>
          <li style={S.li}>Access the personal information we hold about you</li>
          <li style={S.li}>Request correction of inaccurate information</li>
          <li style={S.li}>Request deletion of your account and data</li>
          <li style={S.li}>Opt out of non-transactional communications</li>
        </ul>
        <p style={S.p}>Contact: <a href="mailto:support@tourneyrun.app" style={{ color: '#60a5fa' }}>support@tourneyrun.app</a></p>

        <h2 style={S.h2}>10. Changes to This Policy</h2>
        <p style={S.p}>We may update this Privacy Policy at any time. Continued use after changes constitutes acceptance.</p>

        <h2 style={S.h2}>11. Contact Us</h2>
        <p style={S.p}>WohlBuilt Group LLC<br /><a href="mailto:support@tourneyrun.app" style={{ color: '#60a5fa' }}>support@tourneyrun.app</a><br />Charlotte, North Carolina</p>

        <div style={S.divider}>
          <p style={S.footerText}>
            <Link to="/terms" style={{ color: '#475569', textDecoration: 'underline' }}>Terms of Service</Link>
            &nbsp;·&nbsp; © 2026 WohlBuilt Group LLC
          </p>
        </div>
      </div>
    </div>
  );
}
