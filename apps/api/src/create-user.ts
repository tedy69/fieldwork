import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { hashPassword, openStore } from './store';
const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } },
});
const input = z
  .object({
    email: z.email(),
    name: z.string().min(1),
    role: z.enum(['manager', 'worker']),
    password: z.string().min(12).max(256),
  })
  .parse({ ...values, password: process.env.FIELDWORK_NEW_PASSWORD });
const store = openStore(process.env.DATABASE_PATH ?? './data/fieldwork.sqlite');
try {
  store.db
    .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
    .run(
      randomUUID(),
      input.email.toLowerCase(),
      input.name,
      input.role,
      hashPassword(input.password),
    );
  console.log('User created.');
} finally {
  store.db.close();
}
