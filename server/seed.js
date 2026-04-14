const { v4: uuidv4 } = require('uuid');
const db = require('./db/index');

const TOURNAMENT_TEAMS = [
  // 1 seeds
  { team: 'Auburn Tigers', seed: 1, region: 'East', players: [
    { name: 'Johni Broome', position: 'C', jersey: '4', ppg: 19.5, rpg: 10.5, apg: 2.1, spg: 1.5, bpg: 2.5 },
    { name: 'Dylan Cardwell', position: 'F', jersey: '14', ppg: 7.2, rpg: 6.8, apg: 0.8, spg: 1.2, bpg: 1.5 },
    { name: 'Chad Baker-Mazara', position: 'G', jersey: '2', ppg: 14.2, rpg: 4.5, apg: 1.8, spg: 1.1, bpg: 0.3 },
    { name: 'Miles Kelly', position: 'G', jersey: '5', ppg: 12.8, rpg: 3.2, apg: 2.5, spg: 1.3, bpg: 0.2 },
    { name: 'Denver Jones', position: 'G', jersey: '1', ppg: 9.5, rpg: 2.8, apg: 4.2, spg: 1.0, bpg: 0.1 },
  ]},
  { team: 'Duke Blue Devils', seed: 1, region: 'South', players: [
    { name: 'Cooper Flagg', position: 'F', jersey: '2', ppg: 19.2, rpg: 7.5, apg: 4.2, spg: 1.5, bpg: 1.4 },
    { name: 'Kon Knueppel', position: 'G', jersey: '5', ppg: 15.5, rpg: 4.2, apg: 2.8, spg: 1.0, bpg: 0.4 },
    { name: 'Khaman Maluach', position: 'C', jersey: '21', ppg: 11.1, rpg: 8.5, apg: 0.8, spg: 0.8, bpg: 2.8 },
    { name: 'Tyrese Proctor', position: 'G', jersey: '3', ppg: 13.2, rpg: 3.5, apg: 4.5, spg: 1.2, bpg: 0.3 },
    { name: 'Isaiah Evans', position: 'G', jersey: '1', ppg: 11.8, rpg: 3.8, apg: 1.5, spg: 0.9, bpg: 0.5 },
  ]},
  { team: 'Houston Cougars', seed: 1, region: 'Midwest', players: [
    { name: 'LJ Cryer', position: 'G', jersey: '4', ppg: 16.5, rpg: 2.8, apg: 3.5, spg: 1.0, bpg: 0.2 },
    { name: 'Emanuel Sharp', position: 'G', jersey: '21', ppg: 13.2, rpg: 3.5, apg: 2.2, spg: 1.5, bpg: 0.5 },
    { name: "J'Wan Roberts", position: 'F', jersey: '13', ppg: 11.5, rpg: 8.2, apg: 1.8, spg: 1.2, bpg: 0.8 },
    { name: 'Milos Uzan', position: 'G', jersey: '11', ppg: 14.2, rpg: 3.2, apg: 5.8, spg: 1.3, bpg: 0.3 },
    { name: 'Mylik Wilson', position: 'G', jersey: '3', ppg: 8.5, rpg: 4.2, apg: 3.5, spg: 1.8, bpg: 0.4 },
  ]},
  { team: 'Florida Gators', seed: 1, region: 'West', players: [
    { name: 'Walter Clayton Jr.', position: 'G', jersey: '1', ppg: 19.2, rpg: 3.5, apg: 4.5, spg: 1.5, bpg: 0.5 },
    { name: 'Will Richard', position: 'G', jersey: '5', ppg: 14.5, rpg: 5.2, apg: 2.5, spg: 1.2, bpg: 0.8 },
    { name: 'Alex Condon', position: 'C', jersey: '21', ppg: 10.8, rpg: 8.1, apg: 1.5, spg: 0.8, bpg: 2.2 },
    { name: 'Alijah Martin', position: 'G', jersey: '15', ppg: 13.5, rpg: 4.8, apg: 2.2, spg: 1.4, bpg: 0.3 },
    { name: 'Thomas Haugh', position: 'F', jersey: '12', ppg: 9.2, rpg: 4.5, apg: 1.8, spg: 0.7, bpg: 0.6 },
  ]},
  // 2 seeds
  { team: 'Alabama Crimson Tide', seed: 2, region: 'East', players: [
    { name: 'Mark Sears', position: 'G', jersey: '1', ppg: 21.3, rpg: 3.8, apg: 5.2, spg: 1.2, bpg: 0.3 },
    { name: 'Labaron Philon', position: 'G', jersey: '11', ppg: 14.5, rpg: 3.2, apg: 4.5, spg: 1.5, bpg: 0.2 },
    { name: 'Clifford Omoruyi', position: 'C', jersey: '11', ppg: 13.2, rpg: 9.1, apg: 1.2, spg: 0.8, bpg: 2.0 },
    { name: 'Grant Nelson', position: 'F', jersey: '2', ppg: 11.3, rpg: 6.8, apg: 2.5, spg: 1.1, bpg: 1.5 },
    { name: 'Latrell Wrightsell Jr.', position: 'G', jersey: '25', ppg: 9.8, rpg: 2.5, apg: 2.8, spg: 1.0, bpg: 0.2 },
  ]},
  { team: 'Michigan State Spartans', seed: 2, region: 'West', players: [
    { name: 'Tre Holloman', position: 'G', jersey: '5', ppg: 13.8, rpg: 3.2, apg: 5.5, spg: 1.5, bpg: 0.3 },
    { name: 'Jaxon Kohler', position: 'F', jersey: '0', ppg: 12.8, rpg: 7.5, apg: 2.2, spg: 0.8, bpg: 1.2 },
    { name: 'Coen Carr', position: 'G', jersey: '2', ppg: 11.5, rpg: 4.5, apg: 2.5, spg: 1.2, bpg: 0.8 },
    { name: 'Jeremy Fears Jr.', position: 'G', jersey: '3', ppg: 10.5, rpg: 3.5, apg: 6.5, spg: 1.8, bpg: 0.2 },
    { name: 'Mady Sissoko', position: 'C', jersey: '22', ppg: 9.2, rpg: 7.8, apg: 1.0, spg: 0.5, bpg: 2.5 },
  ]},
  { team: "St. John's Red Storm", seed: 2, region: 'Midwest', players: [
    { name: 'RJ Luis Jr.', position: 'F', jersey: '1', ppg: 19.8, rpg: 7.5, apg: 2.8, spg: 1.5, bpg: 1.2 },
    { name: 'Deivon Smith', position: 'G', jersey: '5', ppg: 14.5, rpg: 3.8, apg: 7.2, spg: 1.8, bpg: 0.3 },
    { name: 'Simeon Wilcher', position: 'G', jersey: '3', ppg: 13.5, rpg: 4.2, apg: 3.5, spg: 1.2, bpg: 0.5 },
    { name: 'Zuby Ejiofor', position: 'F', jersey: '21', ppg: 12.2, rpg: 7.8, apg: 1.5, spg: 0.8, bpg: 1.8 },
    { name: 'Aaron Scott', position: 'G', jersey: '4', ppg: 9.5, rpg: 3.2, apg: 2.2, spg: 1.0, bpg: 0.3 },
  ]},
  { team: 'Tennessee Volunteers', seed: 2, region: 'South', players: [
    { name: 'Chaz Lanier', position: 'G', jersey: '10', ppg: 19.5, rpg: 4.2, apg: 2.8, spg: 1.2, bpg: 0.5 },
    { name: 'Zakai Zeigler', position: 'G', jersey: '5', ppg: 15.2, rpg: 4.5, apg: 6.5, spg: 2.5, bpg: 0.3 },
    { name: 'Felix Okpara', position: 'C', jersey: '21', ppg: 10.8, rpg: 8.2, apg: 1.2, spg: 0.8, bpg: 3.2 },
    { name: 'Igor Milicic Jr.', position: 'F', jersey: '14', ppg: 9.5, rpg: 5.8, apg: 1.5, spg: 0.5, bpg: 1.5 },
    { name: 'Jordan Gainey', position: 'G', jersey: '2', ppg: 13.2, rpg: 2.8, apg: 3.5, spg: 1.5, bpg: 0.3 },
  ]},
  // 3 seeds
  { team: 'Iowa State Cyclones', seed: 3, region: 'East', players: [
    { name: 'Tamin Lipsey', position: 'G', jersey: '3', ppg: 14.5, rpg: 4.2, apg: 6.8, spg: 2.8, bpg: 0.5 },
    { name: 'Milan Momcilovic', position: 'G', jersey: '22', ppg: 15.8, rpg: 5.2, apg: 2.5, spg: 1.0, bpg: 0.8 },
    { name: 'Dishon Jackson', position: 'C', jersey: '5', ppg: 12.5, rpg: 8.5, apg: 1.2, spg: 0.8, bpg: 2.2 },
    { name: 'Joshua Jefferson', position: 'F', jersey: '15', ppg: 11.2, rpg: 6.5, apg: 2.0, spg: 0.8, bpg: 1.2 },
    { name: 'Curtis Jones', position: 'G', jersey: '1', ppg: 10.8, rpg: 3.2, apg: 3.5, spg: 1.2, bpg: 0.3 },
  ]},
  { team: 'Wisconsin Badgers', seed: 3, region: 'West', players: [
    { name: 'John Tonje', position: 'G', jersey: '1', ppg: 21.0, rpg: 4.5, apg: 2.2, spg: 1.0, bpg: 0.5 },
    { name: 'Nolan Winter', position: 'C', jersey: '24', ppg: 14.2, rpg: 7.8, apg: 2.8, spg: 0.8, bpg: 2.5 },
    { name: 'Kamari McGee', position: 'G', jersey: '0', ppg: 12.3, rpg: 3.5, apg: 4.2, spg: 1.5, bpg: 0.3 },
    { name: 'Max Klesmit', position: 'G', jersey: '11', ppg: 11.5, rpg: 3.2, apg: 3.0, spg: 1.0, bpg: 0.3 },
    { name: 'Steven Crowl', position: 'F', jersey: '22', ppg: 10.8, rpg: 6.2, apg: 2.5, spg: 0.5, bpg: 1.5 },
  ]},
  { team: 'Kentucky Wildcats', seed: 3, region: 'Midwest', players: [
    { name: 'Lamont Butler', position: 'G', jersey: '1', ppg: 16.5, rpg: 3.8, apg: 6.5, spg: 1.5, bpg: 0.3 },
    { name: 'Otega Oweh', position: 'G', jersey: '0', ppg: 17.2, rpg: 4.5, apg: 3.2, spg: 1.2, bpg: 0.5 },
    { name: 'Andrew Carr', position: 'F', jersey: '11', ppg: 12.5, rpg: 6.8, apg: 2.5, spg: 0.8, bpg: 1.2 },
    { name: 'Amari Williams', position: 'C', jersey: '21', ppg: 10.8, rpg: 9.2, apg: 1.5, spg: 0.5, bpg: 3.5 },
    { name: 'Kerr Kriisa', position: 'G', jersey: '3', ppg: 9.5, rpg: 3.2, apg: 5.2, spg: 1.0, bpg: 0.2 },
  ]},
  { team: 'Marquette Golden Eagles', seed: 3, region: 'South', players: [
    { name: 'Kam Jones', position: 'G', jersey: '1', ppg: 17.5, rpg: 4.2, apg: 4.8, spg: 1.5, bpg: 0.5 },
    { name: 'Chase Ross', position: 'G', jersey: '0', ppg: 14.2, rpg: 3.8, apg: 3.5, spg: 1.2, bpg: 0.5 },
    { name: 'Oso Ighodaro', position: 'C', jersey: '21', ppg: 12.5, rpg: 7.5, apg: 2.8, spg: 0.8, bpg: 2.2 },
    { name: 'David Joplin', position: 'F', jersey: '11', ppg: 11.8, rpg: 5.5, apg: 2.2, spg: 0.8, bpg: 1.0 },
    { name: 'Ben Gold', position: 'G', jersey: '22', ppg: 10.5, rpg: 3.2, apg: 2.8, spg: 0.8, bpg: 0.3 },
  ]},
  // 4 seeds
  { team: 'Arizona Wildcats', seed: 4, region: 'East', players: [
    { name: 'KJ Lewis', position: 'G', jersey: '0', ppg: 16.8, rpg: 5.2, apg: 4.5, spg: 1.8, bpg: 0.5 },
    { name: 'Trey Townsend', position: 'F', jersey: '3', ppg: 14.2, rpg: 7.5, apg: 3.2, spg: 1.5, bpg: 1.2 },
    { name: 'Anthony Dell Anna', position: 'G', jersey: '5', ppg: 12.5, rpg: 3.5, apg: 3.0, spg: 1.0, bpg: 0.3 },
    { name: 'Carter Bryant', position: 'F', jersey: '15', ppg: 11.2, rpg: 5.8, apg: 2.2, spg: 0.8, bpg: 1.5 },
    { name: 'Jaden Bradley', position: 'G', jersey: '1', ppg: 13.8, rpg: 3.8, apg: 5.5, spg: 1.5, bpg: 0.3 },
  ]},
  { team: 'Texas A&M Aggies', seed: 4, region: 'West', players: [
    { name: 'Wade Taylor IV', position: 'G', jersey: '4', ppg: 19.5, rpg: 3.5, apg: 5.8, spg: 1.8, bpg: 0.3 },
    { name: 'Zhuric Phelps', position: 'G', jersey: '0', ppg: 13.5, rpg: 3.2, apg: 4.5, spg: 1.5, bpg: 0.3 },
    { name: 'Henry Coleman III', position: 'F', jersey: '15', ppg: 11.8, rpg: 7.2, apg: 2.2, spg: 0.8, bpg: 1.2 },
    { name: 'Andersson Garcia', position: 'F', jersey: '5', ppg: 10.5, rpg: 7.8, apg: 1.5, spg: 1.2, bpg: 0.8 },
    { name: 'Pharrel Payne', position: 'C', jersey: '21', ppg: 9.8, rpg: 8.5, apg: 1.2, spg: 0.5, bpg: 2.2 },
  ]},
  { team: 'Purdue Boilermakers', seed: 4, region: 'Midwest', players: [
    { name: 'Braden Smith', position: 'G', jersey: '3', ppg: 15.2, rpg: 5.8, apg: 8.5, spg: 2.0, bpg: 0.5 },
    { name: 'Fletcher Loyer', position: 'G', jersey: '2', ppg: 14.8, rpg: 3.2, apg: 3.5, spg: 1.0, bpg: 0.3 },
    { name: 'Caleb Furst', position: 'F', jersey: '10', ppg: 11.5, rpg: 7.5, apg: 2.2, spg: 0.8, bpg: 1.8 },
    { name: 'Camden Heide', position: 'F', jersey: '21', ppg: 10.2, rpg: 6.5, apg: 2.5, spg: 0.5, bpg: 1.5 },
    { name: 'Myles Colvin', position: 'G', jersey: '1', ppg: 13.5, rpg: 4.2, apg: 3.5, spg: 1.2, bpg: 0.3 },
  ]},
  { team: 'Maryland Terrapins', seed: 4, region: 'South', players: [
    { name: 'Jahmir Young', position: 'G', jersey: '1', ppg: 16.5, rpg: 3.5, apg: 4.5, spg: 1.5, bpg: 0.3 },
    { name: 'Derik Queen', position: 'C', jersey: '12', ppg: 15.2, rpg: 8.8, apg: 2.5, spg: 1.0, bpg: 1.8 },
    { name: 'Jamie Kaiser Jr.', position: 'G', jersey: '0', ppg: 13.2, rpg: 4.5, apg: 3.2, spg: 1.2, bpg: 0.5 },
    { name: 'Julian Reese', position: 'C', jersey: '10', ppg: 12.5, rpg: 9.5, apg: 1.8, spg: 0.8, bpg: 2.5 },
    { name: 'Rodney Rice', position: 'G', jersey: '4', ppg: 14.8, rpg: 3.8, apg: 4.2, spg: 1.2, bpg: 0.3 },
  ]},
  // 5 seeds
  { team: 'Michigan Wolverines', seed: 5, region: 'East', players: [
    { name: 'Tre Donaldson', position: 'G', jersey: '2', ppg: 15.8, rpg: 3.5, apg: 5.5, spg: 1.5, bpg: 0.3 },
    { name: 'Danny Wolf', position: 'F', jersey: '21', ppg: 14.2, rpg: 7.5, apg: 4.2, spg: 1.0, bpg: 1.2 },
    { name: 'Roddy Gayle Jr.', position: 'G', jersey: '1', ppg: 13.5, rpg: 4.2, apg: 3.5, spg: 1.2, bpg: 0.5 },
    { name: 'Vlad Goldin', position: 'C', jersey: '33', ppg: 12.2, rpg: 8.5, apg: 1.8, spg: 0.5, bpg: 2.8 },
    { name: 'Sam Walters', position: 'G', jersey: '5', ppg: 11.5, rpg: 4.8, apg: 2.5, spg: 0.8, bpg: 0.5 },
  ]},
  { team: 'Memphis Tigers', seed: 5, region: 'West', players: [
    { name: 'PJ Haggerty', position: 'G', jersey: '10', ppg: 22.5, rpg: 4.5, apg: 4.8, spg: 1.5, bpg: 0.5 },
    { name: 'Dain Dainja', position: 'C', jersey: '42', ppg: 14.5, rpg: 9.2, apg: 1.8, spg: 0.8, bpg: 2.5 },
    { name: 'Tyrese Hunter', position: 'G', jersey: '5', ppg: 13.8, rpg: 3.8, apg: 5.2, spg: 1.8, bpg: 0.3 },
    { name: 'Moussa Cisse', position: 'C', jersey: '33', ppg: 10.5, rpg: 8.8, apg: 1.2, spg: 0.8, bpg: 3.2 },
    { name: 'Brandon Huntley-Hatfield', position: 'F', jersey: '21', ppg: 11.8, rpg: 6.5, apg: 2.2, spg: 0.8, bpg: 1.5 },
  ]},
  { team: 'Oregon Ducks', seed: 5, region: 'Midwest', players: [
    { name: 'Jackson Shelstad', position: 'G', jersey: '3', ppg: 17.2, rpg: 4.2, apg: 4.5, spg: 1.5, bpg: 0.5 },
    { name: 'Nate Bittle', position: 'C', jersey: '32', ppg: 13.5, rpg: 8.8, apg: 2.2, spg: 0.8, bpg: 2.8 },
    { name: 'Brennan Rigsby', position: 'G', jersey: '1', ppg: 12.8, rpg: 3.5, apg: 4.8, spg: 1.2, bpg: 0.3 },
    { name: 'TJ Bamba', position: 'F', jersey: '5', ppg: 11.5, rpg: 6.8, apg: 2.2, spg: 0.8, bpg: 1.5 },
    { name: 'Kwame Evans Jr.', position: 'F', jersey: '23', ppg: 10.8, rpg: 7.2, apg: 1.8, spg: 0.8, bpg: 1.2 },
  ]},
  { team: 'Clemson Tigers', seed: 5, region: 'South', players: [
    { name: 'Chase Hunter', position: 'G', jersey: '1', ppg: 16.8, rpg: 4.5, apg: 5.5, spg: 1.8, bpg: 0.5 },
    { name: 'PJ Hall', position: 'F', jersey: '0', ppg: 15.5, rpg: 7.2, apg: 2.5, spg: 0.8, bpg: 1.5 },
    { name: 'Ian Schieffelin', position: 'F', jersey: '4', ppg: 12.5, rpg: 8.5, apg: 2.2, spg: 0.8, bpg: 0.8 },
    { name: 'Jake Heidbreder', position: 'G', jersey: '14', ppg: 11.8, rpg: 3.2, apg: 3.0, spg: 1.0, bpg: 0.3 },
    { name: 'Victor Enoh', position: 'G', jersey: '3', ppg: 10.5, rpg: 3.5, apg: 3.8, spg: 1.2, bpg: 0.3 },
  ]},
  // 6 seeds
  { team: 'Ole Miss Rebels', seed: 6, region: 'East', players: [
    { name: 'Jamarion Sharp', position: 'C', jersey: '2', ppg: 14.2, rpg: 8.5, apg: 1.5, spg: 1.0, bpg: 3.8 },
    { name: 'Matthew Murrell', position: 'G', jersey: '3', ppg: 18.5, rpg: 3.8, apg: 3.5, spg: 1.5, bpg: 0.5 },
    { name: 'Sean Pedulla', position: 'G', jersey: '4', ppg: 15.2, rpg: 3.2, apg: 5.8, spg: 1.8, bpg: 0.3 },
    { name: 'Malik Dia', position: 'F', jersey: '0', ppg: 12.5, rpg: 6.2, apg: 2.2, spg: 0.8, bpg: 1.2 },
    { name: 'Davian Yarbrough', position: 'G', jersey: '1', ppg: 11.2, rpg: 3.5, apg: 3.2, spg: 1.0, bpg: 0.3 },
  ]},
  { team: 'BYU Cougars', seed: 6, region: 'West', players: [
    { name: 'Egor Demin', position: 'G', jersey: '2', ppg: 14.8, rpg: 5.5, apg: 5.8, spg: 1.5, bpg: 0.8 },
    { name: 'Trevin Knell', position: 'G', jersey: '21', ppg: 15.5, rpg: 4.2, apg: 3.5, spg: 1.0, bpg: 0.5 },
    { name: 'Fousseyni Traore', position: 'F', jersey: '45', ppg: 14.2, rpg: 8.5, apg: 2.2, spg: 0.8, bpg: 1.5 },
    { name: 'Dallin Hall', position: 'G', jersey: '5', ppg: 12.5, rpg: 3.8, apg: 6.5, spg: 1.8, bpg: 0.3 },
    { name: 'Richie Saunders', position: 'G', jersey: '4', ppg: 11.8, rpg: 4.5, apg: 2.5, spg: 1.0, bpg: 0.5 },
  ]},
  { team: 'Missouri Tigers', seed: 6, region: 'Midwest', players: [
    { name: 'Mark Mitchell', position: 'F', jersey: '7', ppg: 16.2, rpg: 6.8, apg: 2.5, spg: 1.2, bpg: 0.8 },
    { name: 'Tamar Bates', position: 'G', jersey: '10', ppg: 14.8, rpg: 3.5, apg: 4.2, spg: 1.5, bpg: 0.5 },
    { name: 'Trent Pierce', position: 'G', jersey: '3', ppg: 13.5, rpg: 3.2, apg: 4.0, spg: 1.0, bpg: 0.3 },
    { name: 'Aidan Shaw', position: 'F', jersey: '2', ppg: 12.2, rpg: 7.5, apg: 2.2, spg: 0.8, bpg: 1.2 },
    { name: 'Nick Honor', position: 'G', jersey: '4', ppg: 11.5, rpg: 3.2, apg: 5.5, spg: 1.5, bpg: 0.2 },
  ]},
  { team: 'Illinois Fighting Illini', seed: 6, region: 'South', players: [
    { name: 'Kasparas Jakucionis', position: 'G', jersey: '2', ppg: 16.5, rpg: 5.2, apg: 5.8, spg: 1.5, bpg: 0.5 },
    { name: 'Will Riley', position: 'G', jersey: '3', ppg: 15.2, rpg: 4.8, apg: 3.5, spg: 1.2, bpg: 0.8 },
    { name: 'Tomislav Ivisic', position: 'C', jersey: '15', ppg: 12.5, rpg: 8.2, apg: 2.0, spg: 0.8, bpg: 2.5 },
    { name: 'Dra Gibbs-Lawhorn', position: 'G', jersey: '1', ppg: 11.8, rpg: 3.5, apg: 4.5, spg: 1.5, bpg: 0.3 },
    { name: 'Tre White', position: 'F', jersey: '5', ppg: 10.5, rpg: 5.8, apg: 2.2, spg: 0.8, bpg: 1.2 },
  ]},
  // 7 seeds
  { team: 'Creighton Bluejays', seed: 7, region: 'East', players: [
    { name: 'Ryan Kalkbrenner', position: 'C', jersey: '11', ppg: 15.5, rpg: 8.5, apg: 1.8, spg: 0.8, bpg: 3.2 },
    { name: 'Steven Ashworth', position: 'G', jersey: '3', ppg: 14.8, rpg: 3.5, apg: 7.2, spg: 1.5, bpg: 0.3 },
    { name: 'Pop Isaacs', position: 'G', jersey: '2', ppg: 16.2, rpg: 4.2, apg: 4.5, spg: 1.8, bpg: 0.5 },
    { name: 'Baylor Scheierman', position: 'G', jersey: '5', ppg: 14.5, rpg: 6.8, apg: 4.2, spg: 1.2, bpg: 0.5 },
    { name: 'Fredrick King', position: 'F', jersey: '15', ppg: 11.2, rpg: 6.5, apg: 1.8, spg: 0.5, bpg: 1.2 },
  ]},
  { team: 'UCLA Bruins', seed: 7, region: 'West', players: [
    { name: 'Eric Dailey Jr.', position: 'F', jersey: '4', ppg: 16.5, rpg: 6.8, apg: 2.5, spg: 1.2, bpg: 1.0 },
    { name: 'Dylan Andrews', position: 'G', jersey: '2', ppg: 15.2, rpg: 3.8, apg: 5.5, spg: 1.8, bpg: 0.3 },
    { name: 'Sebastian Mack', position: 'G', jersey: '1', ppg: 14.5, rpg: 4.2, apg: 3.8, spg: 1.5, bpg: 0.5 },
    { name: 'Lazar Stefanovic', position: 'G', jersey: '15', ppg: 12.8, rpg: 3.5, apg: 3.0, spg: 1.0, bpg: 0.3 },
    { name: 'Aday Mara', position: 'C', jersey: '33', ppg: 11.5, rpg: 8.2, apg: 1.5, spg: 0.5, bpg: 2.8 },
  ]},
  { team: 'Kansas Jayhawks', seed: 7, region: 'Midwest', players: [
    { name: 'Hunter Dickinson', position: 'C', jersey: '1', ppg: 17.5, rpg: 10.5, apg: 2.8, spg: 0.8, bpg: 2.2 },
    { name: 'Dajuan Harris Jr.', position: 'G', jersey: '3', ppg: 12.5, rpg: 3.8, apg: 6.5, spg: 1.8, bpg: 0.3 },
    { name: 'AJ Storr', position: 'G', jersey: '12', ppg: 16.8, rpg: 4.5, apg: 2.8, spg: 1.2, bpg: 0.5 },
    { name: 'Zeke Mayo', position: 'G', jersey: '5', ppg: 15.2, rpg: 3.5, apg: 3.2, spg: 1.5, bpg: 0.3 },
    { name: 'KJ Adams Jr.', position: 'F', jersey: '24', ppg: 13.5, rpg: 7.5, apg: 2.2, spg: 0.8, bpg: 1.2 },
  ]},
  { team: 'Gonzaga Bulldogs', seed: 7, region: 'South', players: [
    { name: 'Graham Ike', position: 'C', jersey: '13', ppg: 19.5, rpg: 8.5, apg: 2.2, spg: 0.8, bpg: 1.5 },
    { name: 'Ryan Nembhard', position: 'G', jersey: '0', ppg: 15.8, rpg: 4.2, apg: 8.5, spg: 1.8, bpg: 0.3 },
    { name: 'Michael Ajayi', position: 'G', jersey: '3', ppg: 14.5, rpg: 5.2, apg: 3.5, spg: 1.2, bpg: 0.8 },
    { name: 'Braden Huff', position: 'F', jersey: '2', ppg: 13.2, rpg: 7.2, apg: 2.0, spg: 0.8, bpg: 1.5 },
    { name: 'Khalif Battle', position: 'G', jersey: '21', ppg: 12.5, rpg: 3.8, apg: 3.5, spg: 1.0, bpg: 0.5 },
  ]},
  // 8-10 seeds
  { team: 'Louisville Cardinals', seed: 8, region: 'East', players: [
    { name: 'Chucky Hepburn', position: 'G', jersey: '1', ppg: 14.8, rpg: 3.8, apg: 5.5, spg: 1.5, bpg: 0.3 },
    { name: 'Reyne Smith', position: 'G', jersey: '15', ppg: 13.5, rpg: 3.2, apg: 3.0, spg: 1.0, bpg: 0.3 },
    { name: 'Terrence Edwards Jr.', position: 'F', jersey: '5', ppg: 12.8, rpg: 6.5, apg: 2.5, spg: 1.0, bpg: 1.0 },
    { name: 'Kasean Pryor', position: 'G', jersey: '0', ppg: 11.5, rpg: 4.2, apg: 3.8, spg: 1.2, bpg: 0.5 },
  ]},
  { team: 'UConn Huskies', seed: 8, region: 'West', players: [
    { name: 'Lior Berman', position: 'G', jersey: '4', ppg: 14.5, rpg: 3.5, apg: 5.5, spg: 1.2, bpg: 0.3 },
    { name: 'Hassan Diarra', position: 'G', jersey: '10', ppg: 12.8, rpg: 4.2, apg: 6.2, spg: 1.8, bpg: 0.5 },
    { name: 'Jaylin Stewart', position: 'G', jersey: '0', ppg: 15.5, rpg: 4.8, apg: 3.5, spg: 1.5, bpg: 0.5 },
    { name: 'Aidan Mahaney', position: 'G', jersey: '5', ppg: 14.2, rpg: 3.2, apg: 3.8, spg: 1.0, bpg: 0.3 },
  ]},
  { team: 'Baylor Bears', seed: 9, region: 'East', players: [
    { name: 'VJ Edgecombe', position: 'G', jersey: '3', ppg: 17.8, rpg: 4.5, apg: 4.2, spg: 1.8, bpg: 0.8 },
    { name: 'Robert Wright III', position: 'G', jersey: '5', ppg: 14.2, rpg: 3.5, apg: 6.0, spg: 1.5, bpg: 0.3 },
    { name: 'Norchad Omier', position: 'F', jersey: '15', ppg: 12.5, rpg: 9.5, apg: 1.8, spg: 1.0, bpg: 1.0 },
    { name: 'Ja Mion Sharpe', position: 'G', jersey: '1', ppg: 11.8, rpg: 4.2, apg: 3.5, spg: 1.2, bpg: 0.5 },
  ]},
  { team: 'North Carolina Tar Heels', seed: 10, region: 'West', players: [
    { name: 'RJ Davis', position: 'G', jersey: '4', ppg: 20.5, rpg: 3.8, apg: 4.5, spg: 1.2, bpg: 0.3 },
    { name: 'Elliot Cadeau', position: 'G', jersey: '3', ppg: 13.5, rpg: 4.2, apg: 6.5, spg: 1.8, bpg: 0.5 },
    { name: 'Ian Jackson', position: 'G', jersey: '5', ppg: 14.8, rpg: 4.8, apg: 3.5, spg: 1.5, bpg: 0.5 },
    { name: 'James Okonkwo', position: 'C', jersey: '21', ppg: 10.5, rpg: 8.5, apg: 1.5, spg: 0.8, bpg: 2.2 },
  ]},
];

async function seedPlayers() {
  const count = await db.get('SELECT COUNT(*) as cnt FROM players');
  if (count.cnt > 0) {
    console.log('Players already seeded, skipping...');
    return;
  }

  await db.transaction((tx) => {
    for (const teamData of TOURNAMENT_TEAMS) {
      for (const player of teamData.players) {
        tx.run(`
          INSERT INTO players (id, name, team, position, jersey_number, seed, region, season_ppg)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          uuidv4(),
          player.name,
          teamData.team,
          player.position,
          player.jersey,
          teamData.seed,
          teamData.region,
          player.ppg
        );
      }
    }
  });

  const total = await db.get('SELECT COUNT(*) as cnt FROM players');
  console.log(`Seeded ${total.cnt} players from ${TOURNAMENT_TEAMS.length} teams`);
}

module.exports = { seedPlayers };
