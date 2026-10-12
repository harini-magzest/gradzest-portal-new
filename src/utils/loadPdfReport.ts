// jsPDF is about 380 kB (122 kB gzipped) and pulls html2canvas and a sanitiser behind it. Eight list and detail pages can
// export a PDF; importing it statically made every visit to those pages download it, whether or not anyone clicked
// "Download". It is fetched here, on the first download, and cached by the browser after that.
export async function loadPdfReport(): Promise<typeof import('./pdfReport')['createPdfReport'] | null> {
  try {
    return (await import('./pdfReport')).createPdfReport;
  } catch {
    // Offline, or the page is older than the deployed files (hashed chunk names change on every build)
    window.alert('Could not load the PDF tools. Check your connection, reload the page and try again.');
    return null;
  }
}
