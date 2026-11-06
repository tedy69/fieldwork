import type { Locale } from '@fieldwork/strings';

const english = {
  heading: 'Manager review',
  note: 'Review note',
  noteHint: 'Add feedback or explain what needs to change.',
  requestChanges: 'Request changes',
  saving: 'Saving review…',
  approve: 'Approve inspection',
  approved: 'Inspection approved.',
  changesRequested: 'Changes requested. The worker can update the inspection.',
  offline: 'Reconnect to send your review.',
  failed: 'Could not save your review. Try again.',
  waiting: 'Waiting for the field report',
  waitingHint:
    'The assigned worker can complete this checklist offline. Their report will appear here after it syncs.',
  unsaved: 'Your review has unsaved text. Send or clear it before reloading.',
  handover: {
    region: 'Assignment worker',
    change: 'Change worker',
    connect: 'Connect to change the worker.',
    noReplacement: 'Sync the workspace to load workers. Another field worker is required.',
    intro: (worker: string) =>
      `Current worker: ${worker}. Saved reports and review notes stay with this order. Unsent drafts stay on the original worker's device. Coordinate the handover before saving.`,
    newWorker: 'New field worker',
    current: 'current',
    saving: 'Saving…',
    save: 'Save worker',
    cancel: 'Cancel',
    reloading: 'Reloading…',
    reload: 'Reload order',
    saved: (reference: string, worker: string) => `${reference} is now assigned to ${worker}.`,
    reloaded: (reference: string, worker: string) =>
      `${reference} reloaded. Current worker: ${worker}.`,
    failed: 'Could not change the worker.',
    reloadHint: 'Reload this order before trying again.',
    reloadFailed: 'Could not reload the order. Try again.',
  },
};

export const managerReviewCopy: Record<Locale, typeof english> = {
  en: english,
  id: {
    heading: 'Tinjauan manajer',
    note: 'Catatan tinjauan',
    noteHint: 'Tambahkan masukan atau jelaskan bagian yang perlu diperbaiki.',
    requestChanges: 'Minta perbaikan',
    saving: 'Menyimpan tinjauan…',
    approve: 'Setujui inspeksi',
    approved: 'Inspeksi disetujui.',
    changesRequested: 'Perbaikan diminta. Petugas dapat memperbarui inspeksi.',
    offline: 'Sambungkan ke internet untuk mengirim tinjauan.',
    failed: 'Tinjauan gagal disimpan. Coba lagi.',
    waiting: 'Menunggu laporan lapangan',
    waitingHint:
      'Petugas dapat mengisi daftar periksa secara offline. Laporan akan muncul setelah sinkronisasi.',
    unsaved: 'Catatan tinjauan belum dikirim. Kirim atau kosongkan sebelum memuat ulang.',
    handover: {
      region: 'Petugas yang ditugaskan',
      change: 'Ganti petugas',
      connect: 'Sambungkan ke internet untuk mengganti petugas.',
      noReplacement: 'Sinkronkan ruang kerja untuk memuat daftar petugas. Pilih petugas lain.',
      intro: (worker) =>
        `Petugas saat ini ${worker}. Laporan dan catatan tinjauan tetap tersimpan di tugas ini. Draf yang belum dikirim tetap di perangkat petugas sebelumnya. Koordinasikan serah terima sebelum menyimpan.`,
      newWorker: 'Petugas baru',
      current: 'saat ini',
      saving: 'Menyimpan…',
      save: 'Simpan petugas',
      cancel: 'Batal',
      reloading: 'Memuat ulang…',
      reload: 'Muat ulang tugas',
      saved: (reference, worker) => `${reference} kini ditugaskan kepada ${worker}.`,
      reloaded: (reference, worker) => `${reference} dimuat ulang. Petugas saat ini ${worker}.`,
      failed: 'Petugas gagal diganti.',
      reloadHint: 'Muat ulang tugas ini sebelum mencoba lagi.',
      reloadFailed: 'Tugas gagal dimuat ulang. Coba lagi.',
    },
  },
};
