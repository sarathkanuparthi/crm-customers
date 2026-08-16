import { db, migrate } from './db.js';

const FIRST_NAMES = [
  'Jane', 'Floyd', 'Ronald', 'Marvin', 'Jerome', 'Kathryn', 'Jacob', 'Kristin', 'Cameron',
  'Esther', 'Devon', 'Wade', 'Darlene', 'Guy', 'Dianne', 'Bessie', 'Cody', 'Arlene',
  'Theresa', 'Jenny', 'Albert', 'Courtney', 'Leslie', 'Savannah', 'Eleanor', 'Darrell',
];

const LAST_NAMES = [
  'Cooper', 'Miles', 'Richards', 'McKinney', 'Bell', 'Murphy', 'Jones', 'Watson', 'Williamson',
  'Howard', 'Lane', 'Warren', 'Robertson', 'Hawkins', 'Russell', 'Black', 'Fisher', 'Nguyen',
  'Webb', 'Wilson', 'Flores', 'Henry', 'Alexander', 'Simmons', 'Pena', 'Steward',
];

const COMPANIES = [
  'Microsoft', 'Yahoo', 'Adobe', 'Tesla', 'Google', 'Facebook', 'Amazon', 'Netflix', 'Spotify',
  'Airbnb', 'Uber', 'Stripe', 'Shopify', 'Oracle', 'Salesforce', 'Dropbox', 'Slack', 'Zoom',
];

const COUNTRIES = [
  'United States', 'Kiribati', 'Israel', 'Iran', 'Réunion', 'Curaçao', 'Brazil', 'Åland Islands',
  'Germany', 'Japan', 'India', 'Canada', 'France', 'Norway', 'Mexico', 'Australia', 'Kenya',
  'Portugal', 'Chile', 'Vietnam',
];

export const DEMO_USERS = [
  { id: 'u-evano', name: 'Evano', title: 'Project Manager', role: 'admin', avatar: 'EV' },
  { id: 'u-mira', name: 'Mira Patel', title: 'Sales Manager', role: 'manager', avatar: 'MP' },
  { id: 'u-dan', name: 'Dan Okafor', title: 'Account Agent', role: 'agent', avatar: 'DO' },
  { id: 'u-lena', name: 'Lena Ortiz', title: 'Analyst', role: 'viewer', avatar: 'LO' },
] as const;

const TOTAL_CUSTOMERS = Number(process.env.SEED_COUNT ?? 24_000);

/** Deterministic PRNG so repeated seeds produce an identical dataset. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function seed(): void {
  migrate();

  const existing = db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number };
  if (existing.n >= TOTAL_CUSTOMERS) {
    console.log(`Database already seeded with ${existing.n} customers, skipping.`);
    return;
  }

  db.exec('DELETE FROM customers; DELETE FROM users;');

  const insertUser = db.prepare(
    'INSERT INTO users (id, name, title, role, avatar) VALUES (?, ?, ?, ?, ?)',
  );
  for (const user of DEMO_USERS) {
    insertUser.run(user.id, user.name, user.title, user.role, user.avatar);
  }

  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, name, company, phone, email, country, status, owner_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const rand = mulberry32(42);
  const ownerIds = DEMO_USERS.map((u) => u.id);
  const start = Date.UTC(2023, 0, 1);
  const end = Date.UTC(2026, 0, 1);

  const insertAll = db.transaction(() => {
    for (let id = 1; id <= TOTAL_CUSTOMERS; id += 1) {
      const first = pick(rand, FIRST_NAMES);
      const last = pick(rand, LAST_NAMES);
      const company = pick(rand, COMPANIES);
      const area = 200 + Math.floor(rand() * 700);
      const line = String(Math.floor(rand() * 10000)).padStart(4, '0');
      const domain = `${company.toLowerCase()}.com`;

      insertCustomer.run(
        id,
        `${first} ${last}`,
        company,
        `(${area}) 555-${line}`,
        `${first.toLowerCase()}.${last.toLowerCase()}${id}@${domain}`,
        pick(rand, COUNTRIES),
        rand() < 0.68 ? 'active' : 'inactive',
        pick(rand, ownerIds),
        new Date(start + rand() * (end - start)).toISOString(),
      );
    }
  });

  insertAll();
  console.log(`Seeded ${TOTAL_CUSTOMERS} customers and ${DEMO_USERS.length} users.`);
}

seed();
