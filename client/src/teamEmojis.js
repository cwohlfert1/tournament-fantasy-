const TEAM_EMOJI = {
  'Akron Zips': '🦘',
  'Alabama Crimson Tide': '🐘',
  'Arizona Wildcats': '🐱',
  'Arkansas Razorbacks': '🐗',
  'BYU Cougars': '🐆',
  'California Baptist Lancers': '⚔️',
  'Clemson Tigers': '🐯',
  'Duke Blue Devils': '😈',
  'Florida Gators': '🐊',
  'Furman Paladins': '🛡️',
  'Georgia Bulldogs': '🐶',
  'Gonzaga Bulldogs': '🐶',
  "Hawai'i Rainbow Warriors": '🌈',
  'High Point Panthers': '🐾',
  'Hofstra Pride': '🦁',
  'Houston Cougars': '🐆',
  'Idaho Vandals': '⚡',
  'Illinois Fighting Illini': '🪃',
  'Iowa Hawkeyes': '🦅',
  'Iowa State Cyclones': '🌪️',
  'Kansas Jayhawks': '🦅',
  'Kennesaw State Owls': '🦉',
  'Kentucky Wildcats': '🐱',
  'Lehigh Mountain Hawks': '🦅',
  'Long Island University Sharks': '🦈',
  'Louisville Cardinals': '🐦',
  'McNeese Cowboys': '🤠',
  'Miami (OH) RedHawks': '🦅',
  'Miami Hurricanes': '🌀',
  'Michigan State Spartans': '⚔️',
  'Michigan Wolverines': '🦡',
  'Missouri Tigers': '🐯',
  'NC State': '🐺',
  'Nebraska Cornhuskers': '🌽',
  'North Carolina Tar Heels': '👟',
  'North Dakota State Bison': '🦬',
  'Northern Iowa Panthers': '🐾',
  'Ohio State Buckeyes': '🌰',
  'Pennsylvania Quakers': '🎩',
  'Prairie View A&M Panthers': '🐾',
  'Purdue Boilermakers': '🔨',
  'Queens University Royals': '👑',
  'SMU Mustangs': '🐴',
  'Saint Louis Billikens': '🎭',
  "Saint Mary's Gaels": '☘️',
  'Santa Clara Broncos': '🐴',
  'Siena Saints': '✝️',
  'South Florida Bulls': '🐂',
  "St. John's Red Storm": '⛈️',
  'TCU Horned Frogs': '🐸',
  'Tennessee State Tigers': '🐯',
  'Tennessee Volunteers': '🍊',
  'Texas': '🤘',
  'Texas A&M Aggies': '🐕',
  'Texas Tech Red Raiders': '⚔️',
  'Troy Trojans': '🏛️',
  'UCF Knights': '⚔️',
  'UCLA Bruins': '🐻',
  'UConn Huskies': '🐕',
  'Utah State Aggies': '🐕',
  'VCU Rams': '🐏',
  'Vanderbilt Commodores': '⚓',
  'Villanova Wildcats': '🐱',
  'Virginia Cavaliers': '⚔️',
  'Wisconsin Badgers': '🦡',
  'Wright State Raiders': '✈️',
};

// Raw brand colors (exact school colors)
const TEAM_COLOR_RAW = {
  'Akron Zips': '#041E42',
  'Alabama Crimson Tide': '#9E1B32',
  'Arizona Wildcats': '#CC0033',
  'Arkansas Razorbacks': '#9D2235',
  'BYU Cougars': '#002E5D',
  'California Baptist Lancers': '#003087',
  'Clemson Tigers': '#F66733',
  'Duke Blue Devils': '#003087',
  'Florida Gators': '#0021A5',
  'Furman Paladins': '#582C83',
  'Georgia Bulldogs': '#BA0C2F',
  'Gonzaga Bulldogs': '#002966',
  "Hawai'i Rainbow Warriors": '#024731',
  'High Point Panthers': '#4F2D7F',
  'Hofstra Pride': '#00AEEF',
  'Houston Cougars': '#C8102E',
  'Idaho Vandals': '#B3A369',
  'Illinois Fighting Illini': '#E84A27',
  'Iowa Hawkeyes': '#FFCD00',
  'Iowa State Cyclones': '#C8102E',
  'Kansas Jayhawks': '#0051A5',
  'Kennesaw State Owls': '#FDBB30',
  'Kentucky Wildcats': '#0033A0',
  'Lehigh Mountain Hawks': '#653600',
  'Long Island University Sharks': '#00205B',
  'Louisville Cardinals': '#AD0000',
  'McNeese Cowboys': '#10539B',
  'Miami (OH) RedHawks': '#B61E2E',
  'Miami Hurricanes': '#F47321',
  'Michigan State Spartans': '#18453B',
  'Michigan Wolverines': '#FFCB05',
  'Missouri Tigers': '#F1B82D',
  'NC State': '#CC0000',
  'Nebraska Cornhuskers': '#E41C38',
  'North Carolina Tar Heels': '#4B9CD3',
  'North Dakota State Bison': '#006633',
  'Northern Iowa Panthers': '#4B116F',
  'Ohio State Buckeyes': '#BB0000',
  'Pennsylvania Quakers': '#011F5B',
  'Prairie View A&M Panthers': '#461D7C',
  'Purdue Boilermakers': '#CEB888',
  'Queens University Royals': '#6A0DAD',
  'SMU Mustangs': '#CC0035',
  'Saint Louis Billikens': '#003DA5',
  "Saint Mary's Gaels": '#D80024',
  'Santa Clara Broncos': '#862633',
  'Siena Saints': '#006A4D',
  'South Florida Bulls': '#006747',
  "St. John's Red Storm": '#C60C30',
  'TCU Horned Frogs': '#4D1979',
  'Tennessee State Tigers': '#4F2D7F',
  'Tennessee Volunteers': '#FF8200',
  'Texas': '#BF5700',
  'Texas A&M Aggies': '#500000',
  'Texas Tech Red Raiders': '#CC0000',
  'Troy Trojans': '#8B0000',
  'UCF Knights': '#BA9B37',
  'UCLA Bruins': '#2D68C4',
  'UConn Huskies': '#000E2F',
  'Utah State Aggies': '#0F2439',
  'VCU Rams': '#F7B027',
  'Vanderbilt Commodores': '#866D4B',
  'Villanova Wildcats': '#003398',
  'Virginia Cavaliers': '#232D4B',
  'Wisconsin Badgers': '#C5050C',
  'Wright State Raiders': '#009A44',
};

// Perceived brightness (0–255). Formula: ITU-R BT.601
function perceivedBrightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Blend hex color with white by `amount` (0 = original, 1 = white)
function blendWithWhite(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr},${lg},${lb})`;
}

function playerInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function teamEmoji(teamName) {
  if (!teamName) return '';
  return TEAM_EMOJI[teamName] || '';
}

// Returns the team color, lightened for dark-mode readability if needed.
// Threshold 85 = colors darker than this get blended with white.
export function teamColor(teamName) {
  if (!teamName) return null;
  const raw = TEAM_COLOR_RAW[teamName];
  if (!raw) return null;
  const brightness = perceivedBrightness(raw);
  if (brightness < 85) return blendWithWhite(raw, 0.55);
  return raw;
}

// Returns avatar style for a player: initials, background (13% opacity),
// and text color (brightened for dark-mode readability).
// Dark colors (luminance < 30%) get text blended 70% toward white.
export function playerAvatarStyle(playerName, teamName) {
  const initials = playerInitials(playerName);
  const raw = TEAM_COLOR_RAW[teamName];
  if (!raw) {
    return { initials, bg: 'rgba(75,85,99,0.2)', textColor: '#9ca3af' };
  }
  const r = parseInt(raw.slice(1, 3), 16);
  const g = parseInt(raw.slice(3, 5), 16);
  const b = parseInt(raw.slice(5, 7), 16);
  const brightness = perceivedBrightness(raw);
  const textColor = brightness < 77 ? blendWithWhite(raw, 0.70) : raw;
  return {
    initials,
    bg: `rgba(${r},${g},${b},0.13)`,
    textColor,
  };
}
