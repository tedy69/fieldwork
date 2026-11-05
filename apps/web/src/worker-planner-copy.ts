import type { Locale } from '@fieldwork/strings';

const english = {
  hint: 'Counts follow your search and status filter. Choose a day to narrow the list.',
  keyboard:
    'Use arrow keys to move between days, Home for the first day, and End for the last. Press Enter or Space to select a day.',
  today: 'Today',
  workload: (count: number): string => (count === 1 ? 'work order' : 'work orders'),
  chooseDay: (date: string, count: number, today: boolean) =>
    `Choose ${date}: ${count} ${count === 1 ? 'work order' : 'work orders'}${today ? ', today' : ''}`,
  showing: (date: string) => `Showing ${date}.`,
  week: {
    title: (date: string) => `Week of ${date}`,
    choose: 'Choose week',
    previous: 'Previous week',
    current: 'This week',
    next: 'Next week',
    days: 'Days in this week',
    showingAll: 'Showing the whole week.',
    all: 'Whole week',
  },
  month: {
    choose: 'Choose month',
    previous: 'Previous month',
    current: 'This month',
    next: 'Next month',
    days: 'Days in this month',
    showingAll: 'Showing the whole month.',
    all: 'Whole month',
  },
};

export const workerPlannerCopy: Record<Locale, typeof english> = {
  en: english,
  id: {
    hint: 'Jumlah tugas mengikuti pencarian dan filter status. Pilih hari untuk mempersempit daftar.',
    keyboard:
      'Gunakan tombol panah untuk berpindah hari, Home untuk hari pertama, dan End untuk hari terakhir. Tekan Enter atau Spasi untuk memilih hari.',
    today: 'Hari ini',
    workload: () => 'tugas',
    chooseDay: (date, count, today) => `Pilih ${date}: ${count} tugas${today ? ', hari ini' : ''}`,
    showing: (date) => `Menampilkan tugas pada ${date}.`,
    week: {
      title: (date) => `Minggu mulai ${date}`,
      choose: 'Pilih minggu',
      previous: 'Minggu sebelumnya',
      current: 'Minggu ini',
      next: 'Minggu berikutnya',
      days: 'Hari dalam minggu ini',
      showingAll: 'Menampilkan tugas sepanjang minggu.',
      all: 'Sepanjang minggu',
    },
    month: {
      choose: 'Pilih bulan',
      previous: 'Bulan sebelumnya',
      current: 'Bulan ini',
      next: 'Bulan berikutnya',
      days: 'Hari dalam bulan ini',
      showingAll: 'Menampilkan tugas sepanjang bulan.',
      all: 'Sepanjang bulan',
    },
  },
};
