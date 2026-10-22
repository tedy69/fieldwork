import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { hashPassword, openStore } from './store';
import type { WorkOrder } from '@fieldwork/contracts';

export function seed(store: ReturnType<typeof openStore>) {
  if (store.db.prepare('SELECT id FROM users LIMIT 1').get())
    throw new Error('Database has users. Seed only into a fresh demo database.');
  store.transaction(() => {
    for (const [id, name, email, role] of [
      ['manager', 'Alex Morgan', 'manager@fieldwork.local', 'manager'],
      ['worker', 'Sam Rivera', 'worker@fieldwork.local', 'worker'],
      ['worker-2', 'Jordan Lee', 'jordan@fieldwork.local', 'worker'],
    ])
      store.db
        .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
        .run(id, email, name, role, hashPassword('fieldwork-demo'));
    store.db.prepare('INSERT INTO catalog VALUES(1,?)').run(
      JSON.stringify({
        sites: [
          { id: 'north', name: 'North pump station', address: '12 North Service Road · Demo site' },
          { id: 'depot', name: 'West maintenance depot', address: '48 Depot Lane · Demo site' },
          { id: 'reservoir', name: 'Hilltop reservoir', address: '7 Access Road · Demo site' },
        ],
        templates: [
          {
            id: 'routine',
            name: 'Site safety inspection',
            items: [
              { id: 'access', label: 'Access route is clear and secure' },
              { id: 'equipment', label: 'Equipment has no visible damage or leaks' },
              { id: 'signage', label: 'Safety signage is present and readable' },
              { id: 'area', label: 'Work area is clean and free of hazards' },
            ],
          },
        ],
      }),
    );
    const catalog = store.catalog();
    const dueDate = new Date().toISOString().slice(0, 10);
    for (const [index, title] of [
      'Morning safety walkthrough',
      'Check emergency access',
      'Weekly equipment inspection',
    ].entries()) {
      const order: WorkOrder = {
        id: `demo-${index + 1}`,
        reference: `FW-00${index + 1}`,
        title,
        instructions:
          'Complete the site checklist. Note any defects and attach a photo when follow-up is needed.',
        site: catalog.sites[index],
        template: catalog.templates[0],
        assignee: catalog.users.find((user) => user.id === 'worker')!,
        dueDate,
        priority: index === 1 ? 'urgent' : 'routine',
        status: 'ASSIGNED',
        version: 1,
        createdAt: new Date().toISOString(),
        report: null,
        review: null,
      };
      store.writeOrder(order);
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const store = openStore(process.env.DATABASE_PATH ?? './data/fieldwork.sqlite');
  try {
    seed(store);
    console.log(
      'Demo ready. manager@fieldwork.local / worker@fieldwork.local — password: fieldwork-demo. Use demo data only.',
    );
  } finally {
    store.db.close();
  }
}
