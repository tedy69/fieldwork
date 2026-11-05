export type Locale = 'en' | 'id';
export { accountLinkCopy } from './account-links';
export const languageNames: Record<Locale, string> = { en: 'English', id: 'Bahasa Indonesia' };

export function savedLocale(value: string | null): Locale {
  return value === 'id' ? 'id' : 'en';
}

const english = {
  signIn: 'Sign in',
  email: 'Email',
  emailExample: 'you@example.com',
  password: 'Password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  doneEditing: 'Done editing',
  invalidCredentials: 'Email or password is incorrect.',
  accountDisabled:
    'Your worker account is disabled. Contact a manager. Your offline work is still saved.',
  invalidFields: 'Check your email and password, then try again.',
  tryAgain: 'Could not sign in. Check your connection and try again.',
  tooManyAttempts: 'Too many sign-in attempts. Wait a few minutes and try again.',
  web: {
    welcome: 'Welcome back',
    heading: 'Open your notebook',
    intro: 'Sign in to see the work that needs you.',
    connecting: 'Connecting…',
    help: 'New to the team or need a new password? Ask your manager for an invitation or a password-reset link.',
    demo: 'Running the local demo?',
    demoAccounts: 'Use manager@fieldwork.local or worker@fieldwork.local with password',
    demoNote: 'These accounts exist only after seeding the demo.',
    about: 'About the project',
    caption: 'The field operations journal',
    statementStart: 'Work happens on site.',
    statementEnd: 'Keep the whole story.',
    fieldNote: 'A notebook that goes with the work.',
    retention:
      'Open assignments while connected. Your checklist, notes and photos stay on this device until the server confirms them.',
    footer: 'Fieldwork · Open-source field operations',
    validationHeading: 'Check these fields',
    required: 'enter a value.',
    invalidEmail: 'enter a valid email address.',
  },
  native: {
    heading: 'Sign in to Fieldwork',
    opening: 'Opening notebook…',
    errorTitle: 'Could not open the notebook',
    server: 'Server',
    serverAddress: 'Server address',
    serverHint: "On a physical device, use your server's LAN address or HTTPS URL.",
    changeServer: 'Change server',
    hideServer: 'Hide server settings',
    help: "Open your manager's invitation or reset link in a browser, then sign in here.",
    invalidServer: 'Use an HTTP or HTTPS server address.',
    workerOnly: 'Use a field worker account here. Managers use the web dispatch desk.',
    unlockFailed: 'Could not unlock the saved session. Sign in again.',
  },
};

export const signInCopy: Record<Locale, typeof english> = {
  en: english,
  id: {
    signIn: 'Masuk',
    email: 'Email',
    emailExample: 'nama@example.com',
    password: 'Kata sandi',
    showPassword: 'Tampilkan kata sandi',
    hidePassword: 'Sembunyikan kata sandi',
    doneEditing: 'Selesai mengedit',
    invalidCredentials: 'Email atau kata sandi salah.',
    accountDisabled:
      'Akun petugas Anda dinonaktifkan. Hubungi manajer. Pekerjaan offline Anda masih tersimpan.',
    invalidFields: 'Periksa email dan kata sandi, lalu coba lagi.',
    tryAgain: 'Tidak bisa masuk. Periksa koneksi Anda, lalu coba lagi.',
    tooManyAttempts: 'Terlalu banyak percobaan masuk. Tunggu beberapa menit, lalu coba lagi.',
    web: {
      welcome: 'Selamat datang kembali',
      heading: 'Buka catatan kerja Anda',
      intro: 'Masuk untuk melihat tugas Anda.',
      connecting: 'Menghubungkan…',
      help: 'Baru bergabung atau perlu kata sandi baru? Minta tautan undangan atau pengaturan ulang kata sandi kepada manajer.',
      demo: 'Menjalankan demo lokal?',
      demoAccounts: 'Gunakan manager@fieldwork.local atau worker@fieldwork.local dengan kata sandi',
      demoNote: 'Akun ini tersedia setelah data demo dimuat.',
      about: 'Tentang proyek',
      caption: 'Jurnal kerja lapangan',
      statementStart: 'Pekerjaan berlangsung di lapangan.',
      statementEnd: 'Simpan catatannya di sini.',
      fieldNote: 'Catatan kerja yang bisa dibawa ke lapangan.',
      retention:
        'Buka tugas saat terhubung. Daftar periksa, catatan, dan foto tersimpan di perangkat ini sampai server mengonfirmasinya.',
      footer: 'Fieldwork · Perangkat lunak sumber terbuka untuk kerja lapangan',
      validationHeading: 'Periksa kolom berikut',
      required: 'wajib diisi.',
      invalidEmail: 'masukkan alamat email yang valid.',
    },
    native: {
      heading: 'Masuk ke Fieldwork',
      opening: 'Membuka catatan kerja…',
      errorTitle: 'Catatan kerja tidak bisa dibuka',
      server: 'Server',
      serverAddress: 'Alamat server',
      serverHint: 'Di ponsel, gunakan alamat jaringan lokal atau URL HTTPS server Anda.',
      changeServer: 'Ubah server',
      hideServer: 'Sembunyikan pengaturan server',
      help: 'Buka tautan undangan atau pengaturan ulang kata sandi dari manajer di browser, lalu masuk di sini.',
      invalidServer: 'Gunakan alamat server HTTP atau HTTPS.',
      workerOnly: 'Gunakan akun petugas lapangan. Manajer masuk melalui aplikasi web.',
      unlockFailed: 'Sesi tersimpan tidak bisa dibuka. Silakan masuk kembali.',
    },
  },
};

export function signInError(
  locale: Locale,
  error: { code: string; status: number } | undefined,
  fallback: string,
) {
  if (locale === 'en') return fallback;
  const copy = signInCopy[locale];
  if (error?.code === 'INVALID_CREDENTIALS') return copy.invalidCredentials;
  if (error?.code === 'ACCOUNT_DISABLED') return copy.accountDisabled;
  if (error?.status === 429) return copy.tooManyAttempts;
  if (error?.status === 422) return copy.invalidFields;
  return copy.tryAgain;
}
