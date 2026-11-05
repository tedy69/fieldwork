import type { Locale } from '@fieldwork/strings';

const english = {
  location: 'Site location',
  latitude: 'Latitude',
  longitude: 'Longitude',
  outside: 'These coordinates are outside the latitude range supported by this map.',
  offline: 'Reconnect to load map tiles. Coordinates remain available in saved assignments.',
  loadingSettings: 'Loading map settings…',
  retrySettings: 'Retry map settings',
  disabled: 'Map tiles are disabled for this workspace.',
  privacy: (provider: string) =>
    `Tiles come from ${provider}. Loading shares your IP address, this website's address, and the viewed area with that provider.`,
  load: 'Load site map',
  hide: 'Hide site map',
  instructions:
    'The amber point marks the saved site. Focus the map to pan with arrow keys or zoom with + and −.',
  map: (site: string) => `Map of ${site}`,
  controls: 'Map controls',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  recenter: 'Recenter map',
  zoom: 'Zoom',
  loading: 'Loading map tiles…',
  tilesFailed: 'Some map tiles could not load. Retry the visible area or hide the map.',
  toolsFailed: 'Map tools could not load. Reload this page to try again. Your saved work is kept.',
  checkWork: 'Checking saved work…',
  reload: 'Reload page',
  retryTiles: 'Retry map tiles',
  saveBeforeReload: 'Save your work before reloading.',
  waitBeforeReload: 'Wait for the current report action to finish before reloading.',
  draftChanged: 'Your draft changed while saving. Wait for it to finish before reloading.',
};

export const workerMapCopy: Record<Locale, typeof english> = {
  en: english,
  id: {
    location: 'Lokasi tugas',
    latitude: 'Lintang',
    longitude: 'Bujur',
    outside: 'Koordinat ini berada di luar rentang lintang yang didukung peta.',
    offline: 'Sambungkan kembali untuk memuat peta. Koordinat tetap tersedia di tugas tersimpan.',
    loadingSettings: 'Memuat pengaturan peta…',
    retrySettings: 'Coba muat pengaturan peta lagi',
    disabled: 'Peta dinonaktifkan di ruang kerja ini.',
    privacy: (provider) =>
      `Peta disediakan oleh ${provider}. Memuat peta membagikan alamat IP, alamat situs ini, dan area yang dilihat kepada penyedia tersebut.`,
    load: 'Muat peta lokasi',
    hide: 'Sembunyikan peta lokasi',
    instructions:
      'Titik kuning menandai lokasi tersimpan. Fokuskan peta untuk menggeser dengan tombol panah atau memperbesar dan memperkecil dengan + dan −.',
    map: (site) => `Peta ${site}`,
    controls: 'Kontrol peta',
    zoomIn: 'Perbesar peta',
    zoomOut: 'Perkecil peta',
    recenter: 'Pusatkan peta',
    zoom: 'Tingkat pembesaran',
    loading: 'Memuat peta…',
    tilesFailed:
      'Sebagian peta tidak bisa dimuat. Coba muat ulang area yang terlihat atau sembunyikan peta.',
    toolsFailed:
      'Alat peta tidak bisa dimuat. Muat ulang halaman untuk mencoba lagi. Pekerjaan tersimpan tetap tersedia.',
    checkWork: 'Memeriksa pekerjaan tersimpan…',
    reload: 'Muat ulang halaman',
    retryTiles: 'Coba muat peta lagi',
    saveBeforeReload: 'Simpan pekerjaan sebelum memuat ulang.',
    waitBeforeReload: 'Tunggu sampai tindakan laporan selesai sebelum memuat ulang.',
    draftChanged:
      'Draf berubah saat sedang disimpan. Tunggu sampai penyimpanan selesai sebelum memuat ulang.',
  },
};
