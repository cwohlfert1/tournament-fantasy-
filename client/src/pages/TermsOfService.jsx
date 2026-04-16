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
    marginBottom: 8,
  },
  notice: {
    background: 'rgba(249,115,22,0.08)',
    border: '1px solid rgba(249,115,22,0.25)',
    borderRadius: 10,
    padding: '14px 18px',
    fontSize: 13,
    color: '#fdba74',
    lineHeight: 1.6,
    marginBottom: 40,
    marginTop: 20,
  },
  h2: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    margin: '36px 0 10px',
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

export default function TermsOfService() {
  useDocTitle('Terms of Service | TourneyRun');
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.title}><span style={S.accent}>TourneyRun</span> — Terms of Service</h1>
        <p style={S.meta}>Effective Date: March 17, 2026 &nbsp;·&nbsp; WohlBuilt Group LLC · Charlotte, NC</p>

        <div style={S.notice}>
          <strong>Note:</strong> This platform is not a gambling platform. TourneyRun charges a $5 platform fee per team for software access only. Prize pools are managed independently by league commissioners outside of TourneyRun.
        </div>

        <h2 style={S.h2}>1. About TourneyRun</h2>
        <p style={S.p}>TourneyRun is a skill-based fantasy sports software platform operated by WohlBuilt Group LLC. TourneyRun provides technology tools that allow users to organize and participate in fantasy college basketball leagues, including player drafting, live scoring, and league management features.</p>
        <p style={S.p}>TourneyRun charges a platform fee of $5 per team per league for access to its software. TourneyRun does not operate as a gambling platform, does not accept wagers, and does not hold, collect, manage, or distribute prize money of any kind. Any prize pools associated with a league are organized, collected, and distributed entirely by the league commissioner and participants outside of TourneyRun.</p>

        <h2 style={S.h2}>2. Eligibility</h2>
        <p style={S.p}>To use TourneyRun, you must:</p>
        <ul style={S.ul}>
          <li style={S.li}>Be at least 18 years of age</li>
          <li style={S.li}>Be a legal resident of a jurisdiction where skill-based fantasy sports contests are permitted</li>
          <li style={S.li}>Not be located in or a resident of Washington (WA), Idaho (ID), Montana (MT), Nevada (NV), or Louisiana (LA)</li>
          <li style={S.li}>Have the legal capacity to enter into a binding agreement</li>
        </ul>

        <h2 style={S.h2}>3. Platform Fee</h2>
        <p style={S.p}>TourneyRun charges a $5 platform fee per team per league. This fee is for access to TourneyRun's software platform and technology services only. This fee is:</p>
        <ul style={S.ul}>
          <li style={S.li}>Non-refundable once a league draft has been initiated</li>
          <li style={S.li}>Separate from any buy-in, prize pool, or side agreement between league participants</li>
          <li style={S.li}>Not a wager, entry fee into a contest of chance, or gambling payment of any kind</li>
        </ul>
        <p style={S.p}>TourneyRun is not responsible for any prize pool funds, buy-in agreements, or payouts between league participants.</p>

        <h2 style={S.h2}>4. Prize Pools and League Finances</h2>
        <p style={S.p}>TourneyRun does not collect, hold, escrow, manage, or distribute prize pool funds. Any financial arrangements between league participants are entirely independent of TourneyRun and are solely between the league commissioner and participants.</p>
        <p style={S.p}>TourneyRun expressly disclaims any responsibility or liability for:</p>
        <ul style={S.ul}>
          <li style={S.li}>The collection or non-collection of buy-in funds</li>
          <li style={S.li}>The payment or non-payment of prizes to winners</li>
          <li style={S.li}>Any disputes between participants regarding league finances</li>
          <li style={S.li}>Any tax obligations arising from prize winnings</li>
        </ul>

        <h2 style={S.h2}>5. Skill-Based Game</h2>
        <p style={S.p}>TourneyRun is a skill-based fantasy sports platform. League outcomes are determined by the real-world statistical performance of college basketball players selected by participants through a draft process. The results are not determined by chance.</p>

        <h2 style={S.h2}>6. Prohibited Uses</h2>
        <p style={S.p}>You agree not to use TourneyRun to:</p>
        <ul style={S.ul}>
          <li style={S.li}>Violate any applicable law or regulation</li>
          <li style={S.li}>Create leagues in jurisdictions where skill-based fantasy sports are prohibited</li>
          <li style={S.li}>Attempt to manipulate, hack, or exploit the platform</li>
          <li style={S.li}>Use automated scripts or bots to interact with the platform</li>
          <li style={S.li}>Impersonate another person or create false accounts</li>
        </ul>

        <h2 style={S.h2}>7. Accounts and Security</h2>
        <p style={S.p}>You are responsible for maintaining the confidentiality of your account credentials. Notify us immediately at <a href="mailto:support@tourneyrun.app" style={{ color: '#60a5fa' }}>support@tourneyrun.app</a> if you suspect unauthorized access.</p>

        <h2 style={S.h2}>8. Intellectual Property</h2>
        <p style={S.p}>All content, features, and functionality of TourneyRun are owned by WohlBuilt Group LLC and protected by applicable intellectual property laws.</p>

        <h2 style={S.h2}>9. Disclaimers</h2>
        <p style={S.p}>TourneyRun is provided on an "as is" and "as available" basis without warranties of any kind.</p>

        <h2 style={S.h2}>10. Limitation of Liability</h2>
        <p style={S.p}>WohlBuilt Group LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from use of TourneyRun or any league financial arrangements between participants. TourneyRun's total liability shall not exceed platform fees paid by you in the 12 months preceding the claim.</p>

        <h2 style={S.h2}>11. Governing Law</h2>
        <p style={S.p}>These Terms are governed by the laws of the State of North Carolina. Disputes shall be resolved in the courts of Mecklenburg County, North Carolina.</p>

        <h2 style={S.h2}>12. Changes to These Terms</h2>
        <p style={S.p}>TourneyRun reserves the right to modify these Terms at any time. Continued use after changes constitutes acceptance.</p>

        <h2 style={S.h2}>13. Contact</h2>
        <p style={S.p}>WohlBuilt Group LLC<br /><a href="mailto:support@tourneyrun.app" style={{ color: '#60a5fa' }}>support@tourneyrun.app</a><br />Charlotte, North Carolina</p>

        <div style={S.divider}>
          <p style={S.footerText}>
            <Link to="/privacy" style={{ color: '#475569', textDecoration: 'underline' }}>Privacy Policy</Link>
            &nbsp;·&nbsp; © 2026 WohlBuilt Group LLC
          </p>
        </div>
      </div>
    </div>
  );
}
