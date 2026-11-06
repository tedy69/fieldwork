import type { Locale } from '@fieldwork/strings';

const english = {
  schedule: 'Assignment schedule',
  change: 'Change due date',
  changeVisit: (reference: string) => `Change due date for ${reference}`,
  connect: 'Connect to change the due date.',
  currentDue: (date: string) => `Current due date: ${date}. Saved reports stay unchanged.`,
  newDue: 'New due date',
  calendar: 'Choose new due date',
  useDate: (date: string) => `Use ${date}`,
  saving: 'Saving…',
  save: 'Save due date',
  cancel: 'Cancel',
  reloading: 'Reloading…',
  reload: 'Reload order',
  saved: (reference: string, date: string) => `${reference} is now due ${date}.`,
  reloaded: (reference: string, date: string) =>
    `${reference} reloaded. Current due date: ${date}.`,
  reloadHint: 'Reload this order before trying again.',
  saveFailed: 'Could not save the due date.',
  reloadFailed: 'Could not reload the order. Try again.',
};

export const rescheduleCopy: Record<Locale, typeof english> = {
  en: english,
  id: {
    schedule: 'Jadwal tugas',
    change: 'Ubah tenggat',
    changeVisit: (reference) => `Ubah tenggat ${reference}`,
    connect: 'Sambungkan ke internet untuk mengubah tenggat.',
    currentDue: (date) => `Tenggat saat ini ${date}. Laporan tersimpan tetap sama.`,
    newDue: 'Tenggat baru',
    calendar: 'Pilih tenggat baru',
    useDate: (date) => `Gunakan ${date}`,
    saving: 'Menyimpan…',
    save: 'Simpan tenggat',
    cancel: 'Batal',
    reloading: 'Memuat ulang…',
    reload: 'Muat ulang tugas',
    saved: (reference, date) => `Tenggat ${reference} sekarang ${date}.`,
    reloaded: (reference, date) => `${reference} dimuat ulang. Tenggat saat ini ${date}.`,
    reloadHint: 'Muat ulang tugas ini sebelum mencoba lagi.',
    saveFailed: 'Tenggat gagal disimpan.',
    reloadFailed: 'Tugas gagal dimuat ulang. Coba lagi.',
  },
};
