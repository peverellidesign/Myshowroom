// Invito calendario (.ics) allegato alla conferma appuntamento.
import type { Appointment } from '../../shared/types';

export const SITE_TZ: Record<string, string> = { Como: 'Europe/Rome', 'Como Città': 'Europe/Rome', Bulgarograsso: 'Europe/Rome', Milano: 'Europe/Rome', Lugano: 'Europe/Zurich', Dubai: 'Asia/Dubai' };
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ');

export function appointmentIcs(a: Appointment, organizerEmail: string, address: string): string {
  const tz = SITE_TZ[a.site] || 'Europe/Rome';
  const [h, m] = a.time.split(':').map(Number);
  const start = new Date(Date.UTC(2000, 0, 1, h, m));
  const end = new Date(start.getTime() + Number(a.duration) * 60_000);
  const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00`;
  const day = a.date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Peverelli Design//myshowroom//IT', 'METHOD:REQUEST', 'BEGIN:VEVENT',
    `UID:${a.id}@myshowroom`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${tz}:${day}T${hhmm(start)}`, `DTEND;TZID=${tz}:${day}T${hhmm(end)}`,
    `SUMMARY:${esc(`${a.type} — Peverelli Design ${a.site}`)}`,
    `LOCATION:${esc(address)}`,
    `DESCRIPTION:${esc(a.notes || 'Appuntamento presso lo showroom Peverelli Design.')}`,
    `ORGANIZER;CN=Peverelli Design:mailto:${organizerEmail}`,
    a.email ? `ATTENDEE;CN=${esc(a.client)};RSVP=TRUE:mailto:${a.email}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).map(fold).join('\r\n') + '\r\n';
}
