import type { Locale } from '@fieldwork/strings';

const english = {
  title: (name: string) => `Password recovery: ${name}`,
  region: 'Worker password recovery',
  close: 'Close recovery',
  intro:
    'Create a one-hour link for this worker to choose a new password. Share it directly after confirming who should receive it. No email is sent automatically.',
  effect:
    'A new link replaces previous reset links. The password changes and existing sessions end only when the link is used. Saved inspections and device drafts stay with this account.',
  offline:
    'Loaded recovery details stay visible offline. Reconnect to refresh, create, or revoke a link.',
  loading: 'Loading password recovery…',
  refresh: 'Refresh password recovery',
  refreshed: 'Password recovery refreshed.',
  disabled:
    'This worker is disabled. Reactivate the account separately before creating a reset link.',
  latest: 'Latest reset link',
  statuses: {
    pending: 'pending',
    used: 'used',
    revoked: 'revoked',
    expired: 'expired',
    unavailable: 'unavailable',
  },
  createdBy: (name: string) => `Created by ${name}`,
  expires: 'Expires',
  empty: 'No reset link has been issued for this worker.',
  link: 'Reset link',
  oneTime: 'This link is shown once. Copy it before closing or replacing it.',
  copy: 'Copy reset link',
  copying: 'Copying…',
  copied: 'Reset link copied. Share it directly with the intended worker.',
  copyFailed: 'Could not copy. Select the reset link and copy it manually.',
  create: 'Create reset link',
  replace: 'Replace reset link',
  creating: 'Creating reset link…',
  created: 'Reset link created. Copy it before closing.',
  revoke: 'Revoke reset link',
  revoking: 'Revoking reset link…',
  revoked: 'Reset link revoked.',
  otherCurrent:
    'Selected link revoked. Another reset link is now current. Check its state separately.',
  loadFailed: 'Could not load password recovery. Try again.',
  changeFailed: 'Could not update the reset link.',
  refreshBeforeRetry: 'Refresh password recovery to check the saved state before trying again.',
};

export const workerPasswordRecoveryCopy: Record<Locale, typeof english> = {
  en: english,
  id: {
    title: (name) => `Pemulihan kata sandi ${name}`,
    region: 'Pemulihan kata sandi petugas',
    close: 'Tutup pemulihan',
    intro:
      'Buat tautan yang berlaku satu jam agar petugas dapat memilih kata sandi baru. Pastikan identitas penerima sebelum membagikannya langsung.',
    effect:
      'Tautan baru menggantikan tautan lama. Sesi berakhir saat petugas menggunakan tautan untuk mengganti kata sandi. Laporan dan draf tetap tersimpan.',
    offline:
      'Rincian yang sudah dimuat tetap terlihat. Sambungkan untuk memuat ulang, membuat, atau mencabut tautan.',
    loading: 'Memuat pemulihan kata sandi…',
    refresh: 'Muat ulang pemulihan',
    refreshed: 'Pemulihan kata sandi dimuat ulang.',
    disabled: 'Aktifkan kembali akun petugas sebelum membuat tautan pemulihan.',
    latest: 'Tautan pemulihan terbaru',
    statuses: {
      pending: 'Menunggu',
      used: 'Digunakan',
      revoked: 'Dicabut',
      expired: 'Kedaluwarsa',
      unavailable: 'Tidak tersedia',
    },
    createdBy: (name) => `Dibuat oleh ${name}`,
    expires: 'Berlaku hingga',
    empty: 'Belum ada tautan pemulihan untuk petugas ini.',
    link: 'Tautan pemulihan',
    oneTime: 'Tautan ini hanya muncul sekali. Salin sebelum menutup atau menggantinya.',
    copy: 'Salin tautan',
    copying: 'Menyalin…',
    copied: 'Tautan disalin. Bagikan langsung kepada petugas yang dituju.',
    copyFailed: 'Tautan gagal disalin. Pilih dan salin tautan secara manual.',
    create: 'Buat tautan pemulihan',
    replace: 'Ganti tautan pemulihan',
    creating: 'Membuat tautan…',
    created: 'Tautan pemulihan dibuat. Salin sebelum menutup.',
    revoke: 'Cabut tautan pemulihan',
    revoking: 'Mencabut tautan…',
    revoked: 'Tautan pemulihan dicabut.',
    otherCurrent: 'Tautan terpilih dicabut. Periksa status tautan lain yang sekarang berlaku.',
    loadFailed: 'Pemulihan kata sandi gagal dimuat. Coba lagi.',
    changeFailed: 'Tautan pemulihan gagal diperbarui.',
    refreshBeforeRetry: 'Muat ulang pemulihan untuk memeriksa status tautan sebelum mencoba lagi.',
  },
};
