import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

/**
 * Direct Invoice PDF Generator & Downloader
 *
 * Captures the invoice document element into a crisp, high-resolution A4 vector/raster
 * PDF and immediately triggers browser file download (no print dialog required).
 */
export async function downloadInvoiceAsPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  // Ensure the target element is visible and styled for capture
  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  
  // Standard A4 dimensions in mm
  const a4WidthMm = 210;
  const a4HeightMm = 297;

  try {
    const canvas = await html2canvas(element, {
      scale: 2, // 2x sharpness
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1024,
      onclone: (clonedDoc) => {
        const clonedElement = clonedDoc.getElementById(element.id);
        if (clonedElement) {
          clonedElement.style.width = '800px';
          clonedElement.style.maxWidth = '800px';
          clonedElement.style.margin = '0 auto';
          clonedElement.style.background = '#ffffff';
        }
      },
    });

    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const canvasWidthPx = canvas.width;
    const canvasHeightPx = canvas.height;
    
    // Scale image to fit A4 width
    const imgHeightMm = (canvasHeightPx * a4WidthMm) / canvasWidthPx;

    let heightLeft = imgHeightMm;
    let position = 0;

    // Page 1
    pdf.addImage(imgData, 'PNG', 0, position, a4WidthMm, imgHeightMm, undefined, 'FAST');
    heightLeft -= a4HeightMm;

    // Multi-page loop if content exceeds 1 page
    while (heightLeft > 0) {
      position = heightLeft - imgHeightMm;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, a4WidthMm, imgHeightMm, undefined, 'FAST');
      heightLeft -= a4HeightMm;
    }

    const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(cleanFilename);
  } finally {
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
  }
}
