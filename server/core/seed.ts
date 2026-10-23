// Dati iniziali. I prodotti sono gli stessi del prototipo (dimostrativi, da sostituire con dati verificati).
import type { Store } from './store';
import { hashPassword } from './auth';

const img = (q: string) => `https://images.unsplash.com/${q}?auto=format&fit=crop&w=1200&q=85`;
export const seedProducts = [
  { id: 'bambole', brand: 'B&B Italia', name: 'Le Bambole', category: 'Sedute', location: 'Lugano', zone: 'Living', status: 'Esposto', price: 2350, currency: 'CHF', dims: '119 × 91 × 75 cm', images: [img('photo-1555041469-a586c61ea9bc'), img('photo-1540574163026-643ea20ade25'), img('photo-1494438639946-1ebd1d20bf85')], materials: ['Tessuto', 'Pelle'], colors: ['Avorio', 'Sabbia', 'Grigio'], configs: [{ name: 'Esemplare showroom', dims: '119 × 91 × 75 cm', price: 2350 }, { name: 'Altra composizione (da verificare)', dims: 'Da verificare' }] },
  { id: 'em', brand: 'Vitra', name: 'EM Table', category: 'Tavoli', location: 'Como', zone: 'Dining', status: 'Esposto', price: 3800, currency: 'EUR', dims: '220 × 90 × 74 cm', images: [img('photo-1499933374294-4584851497cc'), img('photo-1449247709967-d4461a6a6103')], materials: ['Legno', 'Metallo'], colors: ['Naturale', 'Nero'], configs: [{ name: 'Esemplare showroom', dims: '220 × 90 × 74 cm', price: 3800 }] },
  { id: 'artemone', brand: 'Maxalto', name: 'Artemone', category: 'Contenitori', location: 'Magazzino', zone: 'Deposito A', status: 'Disponibile', price: 12400, currency: 'CHF', dims: '124 × 48 × 152 cm', images: [img('photo-1497366754035-f200968a6e72'), img('photo-1600210492486-724fe5c67fb0')], materials: ['Legno', 'Metallo'], colors: ['Naturale', 'Nero'], configs: [{ name: 'Esemplare in stock', dims: '124 × 48 × 152 cm', price: 12400 }] },
  { id: 'lithos', brand: 'Maxalto', name: 'Lithos', category: 'Tavolini', location: 'Magazzino', zone: 'Deposito B', status: 'Riservato', price: 1010, currency: 'CHF', dims: 'Da verificare', images: [img('photo-1533090481720-856c6e3c1fdc'), img('photo-1600607687939-ce8a6c25118c')], materials: ['Da verificare'], colors: ['Da verificare'], configs: [{ name: 'Esemplare in stock', dims: 'Da verificare', price: 1010 }] },
];

export type SeedOptions = {
  admin: { email: string; password: string; name: string };
  demoData: boolean;
  extraUsers?: { email: string; password: string; name: string; role: 'admin' | 'manager' | 'consultant'; site: string }[];
};

export async function ensureSeed(store: Store, opts: SeedOptions) {
  const now = new Date().toISOString();
  if ((await store.count('users')) === 0) {
    const adminId = crypto.randomUUID();
    await store.insert('users', { id: adminId, email: opts.admin.email.toLowerCase(), name: opts.admin.name, role: 'admin', site: 'Como', active: true, passwordHash: await hashPassword(opts.admin.password), createdAt: now });
    for (const u of opts.extraUsers || [])
      await store.insert('users', { id: crypto.randomUUID(), email: u.email.toLowerCase(), name: u.name, role: u.role, site: u.site, active: true, passwordHash: await hashPassword(u.password), createdAt: now });
    if (opts.demoData) {
      await store.insert('clients', { id: crypto.randomUUID(), name: 'Cliente esempio', email: '', phone: '', notes: 'Visita showroom', ownerId: adminId, createdAt: now, updatedAt: now });
      for (const name of ['Verificare disponibilità prodotti', 'Preparare selezione per visita showroom'])
        await store.insert('tasks', { id: crypto.randomUUID(), name, done: false, assigneeId: null, dueDate: null, createdBy: adminId, createdAt: now });
    }
  }
  if (opts.demoData && (await store.count('products')) === 0)
    for (const p of seedProducts) await store.insert('products', { ...p, description: '', createdAt: now, updatedAt: now });
}
