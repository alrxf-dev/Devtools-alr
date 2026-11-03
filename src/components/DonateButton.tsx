import { SAWERIA_URL } from '../app/links';

const LABEL = 'Donation for request features';
const WAVE = 'M 0 306 Q 228 450 600 302 Q 1011 450 1200 343 Q 1379 450 1800 320 Q 2154 450 2400 314 L 2400 800 L 0 800 L 0 340 Z';
const FRONT = 'M0,288L55,133C92,192,111,224,166,256C222,256,277,213,332,171C388,229,443,123,498,75C554,101,609,171,665,256C720,245,775,267,831,235C886,219,942,171,997,53C1052,48,1108,197,1163,197C1218,224,1274,107,1329,171C1385,128,1431,149,1440,160L1440,320L0,320Z';

/** Wave button (link). The label slides up on hover and keyboard focus. Text is duplicated visually, so the link carries one aria-label. */
export function DonateButton() {
  return (
    <a className="donate-btn" href={SAWERIA_URL} target="_blank" rel="noopener noreferrer" aria-label={`${LABEL} (opens Saweria in a new tab)`}>
      <span className="donate-size" aria-hidden="true">{LABEL}</span>
      <span className="donate-t1" aria-hidden="true">{LABEL}</span>
      <span className="donate-t2" aria-hidden="true">{LABEL}</span>
      <svg className="donate-wave" viewBox="0 0 2400 800" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <g fill="#e0601c" transform="translate(0,-91)">
          {[35, 70, 105, 140, 175, 210, 245].map((y, i) => <path key={y} opacity={[0.05, 0.21, 0.37, 0.53, 0.68, 0.84, 1][i]} transform={`translate(0,${y})`} d={WAVE} />)}
        </g>
      </svg>
      <svg className="donate-front" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={FRONT} /></svg>
    </a>
  );
}
