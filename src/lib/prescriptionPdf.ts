import { jsPDF } from 'jspdf';
import { NOTO_SANS_BENGALI_BASE64 } from '../assets/notoSansBengaliBase64';
import type { PrescriptionMedicineInput, PrescriptionPayload } from '../services/prescriptions';

export interface PrescriptionPdfHeader {
  doctorName: string;
  degree?: string | null;
  designation?: string | null;
  bmdcRegistrationNo?: string | null;
  chamberName?: string | null;
  chamberAddress?: string | null;
  chamberPhone?: string | null;
}

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';
type Align = 'left' | 'right' | 'center';

const BENGALI_FONT_FAMILY = 'DoctorNearMeNotoBengali';
const hasBangla = (value: unknown) => /[\u0980-\u09FF\u0964\u0965]/.test(String(value ?? ''));
const isBanglaChar = (ch: string) => /[\u0980-\u09FF\u0964\u0965]/.test(ch);
const isJoiner = (ch: string) => ch === '\u200C' || ch === '\u200D';

async function ensureBengaliFont() {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    throw new Error('এই browser-এ বাংলা PDF font rendering support নেই।');
  }
  if (!document.fonts.check(`16px "${BENGALI_FONT_FAMILY}"`)) {
    const face = new FontFace(
      BENGALI_FONT_FAMILY,
      `url(data:font/ttf;base64,${NOTO_SANS_BENGALI_BASE64}) format('truetype')`,
      { style: 'normal', weight: '400' },
    );
    const loaded = await face.load();
    document.fonts.add(loaded);
  }
  await document.fonts.load(`16px "${BENGALI_FONT_FAMILY}"`);
}

function splitScriptRuns(value: string) {
  const chars = Array.from(value);
  const runs: Array<{ text: string; bangla: boolean }> = [];
  let currentText = '';
  let currentBangla = false;

  chars.forEach((ch, index) => {
    const prevBangla = index > 0 && isBanglaChar(chars[index - 1]);
    const nextBangla = index + 1 < chars.length && isBanglaChar(chars[index + 1]);
    const bangla = isBanglaChar(ch) || (isJoiner(ch) && (prevBangla || nextBangla));
    if (!currentText) {
      currentText = ch;
      currentBangla = bangla;
    } else if (currentBangla === bangla) {
      currentText += ch;
    } else {
      runs.push({ text: currentText, bangla: currentBangla });
      currentText = ch;
      currentBangla = bangla;
    }
  });
  if (currentText) runs.push({ text: currentText, bangla: currentBangla });
  return runs;
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering unavailable.');
  return context;
}

function measureBangla(text: string, fontSizePt: number) {
  const scale = 4;
  const canvas = document.createElement('canvas');
  const context = getCanvasContext(canvas);
  context.font = `${fontSizePt * (96 / 72) * scale}px "${BENGALI_FONT_FAMILY}"`;
  return context.measureText(text.normalize('NFC')).width / scale / (96 / 25.4);
}

function measureMixed(doc: jsPDF, text: string, style: FontStyle, fontSizePt: number) {
  const oldFont = doc.getFont();
  const oldSize = doc.getFontSize();
  let width = 0;
  splitScriptRuns(text).forEach((run) => {
    if (run.bangla) width += measureBangla(run.text, fontSizePt);
    else {
      doc.setFont('helvetica', style);
      doc.setFontSize(fontSizePt);
      width += doc.getTextWidth(run.text);
    }
  });
  doc.setFont(oldFont.fontName, oldFont.fontStyle);
  doc.setFontSize(oldSize);
  return width;
}

function drawBangla(doc: jsPDF, text: string, x: number, baselineY: number, fontSizePt: number) {
  const normalized = text.normalize('NFC');
  if (!normalized) return 0;
  const scale = 4;
  const pxPerPt = 96 / 72;
  const pxPerMm = 96 / 25.4;
  const fontPx = fontSizePt * pxPerPt * scale;
  const padding = 4 * scale;

  const measureCanvas = document.createElement('canvas');
  const measureContext = getCanvasContext(measureCanvas);
  measureContext.font = `${fontPx}px "${BENGALI_FONT_FAMILY}"`;
  measureContext.textBaseline = 'alphabetic';
  measureContext.direction = 'ltr';
  const metrics = measureContext.measureText(normalized);
  const advance = metrics.width;
  const inkLeft = Math.floor(Math.min(0, -(metrics.actualBoundingBoxLeft || 0)));
  const inkRight = Math.ceil(Math.max(advance, metrics.actualBoundingBoxRight || advance));
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontPx * 0.9);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontPx * 0.3);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, inkRight - inkLeft + padding * 2);
  canvas.height = Math.max(1, ascent + descent + padding * 2);
  const context = getCanvasContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `${fontPx}px "${BENGALI_FONT_FAMILY}"`;
  context.textBaseline = 'alphabetic';
  context.direction = 'ltr';
  context.fillStyle = '#161c1a';
  context.imageSmoothingEnabled = true;
  const drawX = padding - inkLeft;
  const drawBaseline = padding + ascent;
  context.fillText(normalized, drawX, drawBaseline);

  const visibleWidthMm = advance / scale / pxPerMm;
  const imageWidthMm = canvas.width / scale / pxPerMm;
  const imageHeightMm = canvas.height / scale / pxPerMm;
  const leftOffsetMm = (padding - inkLeft) / scale / pxPerMm;
  const baselineFromTopMm = drawBaseline / scale / pxPerMm;
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', x - leftOffsetMm, baselineY - baselineFromTopMm, imageWidthMm, imageHeightMm);
  return visibleWidthMm;
}

function wrapMixed(doc: jsPDF, value: string, maxWidth: number, style: FontStyle, fontSizePt: number) {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    const tokens = paragraph.split(/(\s+)/).filter(Boolean);
    let line = '';
    for (const token of tokens) {
      const candidate = line + token;
      if (!line || measureMixed(doc, candidate, style, fontSizePt) <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line.trimEnd());
      line = token.trimStart();
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines.length ? lines : [''];
}

function writeText(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  options: { style?: FontStyle; align?: Align; maxWidth?: number } = {},
) {
  const text = String(value ?? '');
  const style = options.style ?? 'normal';
  const align = options.align ?? 'left';
  const fontSizePt = doc.getFontSize();
  if (!hasBangla(text)) {
    doc.setFont('helvetica', style);
    const output = options.maxWidth ? doc.splitTextToSize(text, options.maxWidth) as string[] : [text];
    doc.text(output, x, y, { align });
    return output.length;
  }

  const lines = options.maxWidth ? wrapMixed(doc, text, options.maxWidth, style, fontSizePt) : text.split(/\r?\n/);
  const lineHeightMm = (fontSizePt * 1.15) / doc.internal.scaleFactor;
  lines.forEach((line, index) => {
    const width = measureMixed(doc, line, style, fontSizePt);
    let cursor = x;
    if (align === 'right') cursor -= width;
    if (align === 'center') cursor -= width / 2;
    splitScriptRuns(line).forEach((run) => {
      if (run.bangla) cursor += drawBangla(doc, run.text, cursor, y + index * lineHeightMm, fontSizePt);
      else if (run.text) {
        doc.setFont('helvetica', style);
        doc.setFontSize(fontSizePt);
        doc.text(run.text, cursor, y + index * lineHeightMm);
        cursor += doc.getTextWidth(run.text);
      }
    });
  });
  return lines.length;
}

function medicineSecondLine(medicine: PrescriptionMedicineInput) {
  const parts = [medicine.dose, medicine.meal_instruction, medicine.duration_days ? `${medicine.duration_days} দিন` : ''].filter(Boolean);
  return parts.join('   —   ');
}

export async function downloadPrescriptionPdf(
  payload: PrescriptionPayload,
  header: PrescriptionPdfHeader,
) {
  await ensureBengaliFont();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 13;
  const headerHeight = 35;
  const patientHeight = 18;
  const footerHeight = 12;
  const mainTop = headerHeight + patientHeight;
  const footerTop = pageHeight - footerHeight;
  const dividerX = margin + (pageWidth - margin * 2) * 0.36;
  const leftX = margin;
  const rightX = dividerX + 8;

  doc.setFillColor(239, 244, 242);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setTextColor(20, 30, 27);
  doc.setFontSize(15);
  writeText(doc, `DR. ${header.doctorName.toUpperCase()}`, margin, 10, { style: 'bold' });
  doc.setFontSize(9.5);
  let doctorY = 16;
  for (const line of [header.designation, header.degree, header.bmdcRegistrationNo ? `BMDC Reg No: ${header.bmdcRegistrationNo}` : null].filter(Boolean) as string[]) {
    writeText(doc, line, margin, doctorY, { style: doctorY === 16 ? 'bold' : 'normal' });
    doctorY += 4.5;
  }

  let chamberY = 9;
  doc.setFontSize(10.5);
  writeText(doc, 'Chamber', pageWidth - margin, chamberY, { style: 'bold', align: 'right' });
  doc.setFontSize(9.2);
  chamberY += 5;
  for (const line of [header.chamberName, header.chamberAddress, header.chamberPhone ? `Mobile: ${header.chamberPhone}` : null].filter(Boolean) as string[]) {
    writeText(doc, line, pageWidth - margin, chamberY, { align: 'right' });
    chamberY += 4.4;
  }

  const patientTop = headerHeight;
  doc.setFontSize(10.5);
  writeText(doc, `Name: ${payload.patient_name || '—'}`, margin, patientTop + 7, { style: 'bold' });
  writeText(doc, `Date: ${new Date().toLocaleDateString('en-GB')}`, pageWidth - margin, patientTop + 7, { style: 'bold', align: 'right' });
  doc.setFontSize(9.2);
  const patientMeta = [payload.patient_age ? `Age: ${payload.patient_age}` : '', payload.patient_gender ? `Sex: ${payload.patient_gender}` : '', payload.patient_address ? `Address: ${payload.patient_address}` : ''].filter(Boolean).join('     ');
  if (patientMeta) writeText(doc, patientMeta, margin, patientTop + 13, { maxWidth: pageWidth - margin * 2 - 45 });
  if (payload.patient_mobile) writeText(doc, `Mobile: ${payload.patient_mobile}`, pageWidth - margin, patientTop + 13, { align: 'right' });

  doc.setDrawColor(80, 90, 86);
  doc.setLineWidth(0.4);
  doc.line(margin, mainTop, pageWidth - margin, mainTop);
  doc.setDrawColor(205, 215, 211);
  doc.line(dividerX, mainTop, dividerX, footerTop - 4);

  const leftWidth = dividerX - leftX - 6;
  let leftY = mainTop + 8;
  const writeClinical = (label: string, values: string[]) => {
    const items = values.map((value) => value.trim()).filter(Boolean);
    if (!items.length) return;
    doc.setTextColor(7, 73, 57);
    doc.setFontSize(10.2);
    writeText(doc, label, leftX, leftY, { style: 'bold' });
    leftY += 5;
    doc.setTextColor(20, 30, 27);
    doc.setFontSize(9.3);
    items.forEach((item) => {
      const count = writeText(doc, item, leftX + 3, leftY, { maxWidth: leftWidth - 3 });
      leftY += Math.max(4.6, count * 4.6);
    });
    leftY += 3.2;
  };

  writeClinical('C/C', payload.chief_complaint);
  writeClinical('H/O', payload.history);
  writeClinical('O/E', payload.on_examination);
  writeClinical('INVESTIGATION', payload.investigation);
  writeClinical('TREATMENT PLAN', payload.treatment_plan);

  let rightY = mainTop + 10;
  doc.setTextColor(7, 73, 57);
  doc.setFontSize(20);
  writeText(doc, 'Rx.', rightX, rightY, { style: 'bolditalic' });
  doc.setTextColor(20, 30, 27);
  rightY += 10;

  const rightWidth = pageWidth - margin - rightX;
  payload.medicines.filter((m) => m.name.trim()).forEach((medicine, index) => {
    doc.setFontSize(10.8);
    const nameLines = writeText(doc, `${index + 1}. ${medicine.name}`, rightX, rightY, { style: 'bold', maxWidth: rightWidth });
    rightY += nameLines * 5.2;
    const details = medicineSecondLine(medicine);
    if (details) {
      doc.setFontSize(9.4);
      const detailLines = writeText(doc, details, rightX + 4, rightY, { maxWidth: rightWidth - 4 });
      rightY += detailLines * 4.7;
    }
    rightY += 3.5;
  });

  const advice = payload.advice.map((item) => item.trim()).filter(Boolean);
  if (advice.length) {
    rightY += 3;
    doc.setTextColor(7, 73, 57);
    doc.setFontSize(13);
    writeText(doc, 'Advice', rightX, rightY, { style: 'bolditalic' });
    doc.setTextColor(20, 30, 27);
    rightY += 6;
    doc.setFontSize(9.5);
    advice.forEach((item, index) => {
      const count = writeText(doc, `${index + 1}. ${item}`, rightX + 3, rightY, { maxWidth: rightWidth - 3 });
      rightY += count * 4.8;
    });
  }

  doc.setDrawColor(90, 100, 96);
  doc.line(margin, footerTop, pageWidth - margin, footerTop);
  doc.setTextColor(100, 110, 106);
  doc.setFontSize(8.5);
  writeText(doc, 'Generated from docbd.info • Please follow the doctor’s instructions.', pageWidth / 2, footerTop + 7, { style: 'italic', align: 'center' });

  const safeName = payload.patient_name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'patient';
  doc.save(`Prescription_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
