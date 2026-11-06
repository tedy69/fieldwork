export function downloadText(filename: string, text: string, type: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
