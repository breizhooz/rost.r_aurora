// Export de la liste de courses CÔTÉ CLIENT (E2E zero-knowledge) : le serveur ne
// voit plus le menu, donc CSV et PDF sont générés localement à partir de la liste
// déchiffrée. Remplace les anciens endpoints serveur d'export.

import { jsPDF } from 'jspdf';
import type { ShoppingItem } from '@nutri/e2e-core';

export interface ShoppingExportData {
  startDate: string;
  nbPersons: number;
  items: ShoppingItem[];
}

/** Résout le libellé lisible d'un rayon (fourni par la page). */
export type CategoryLabel = (category: string | null) => string;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Télécharge la liste en CSV (séparateur `;`, BOM pour Excel FR). */
export function exportShoppingCsv(data: ShoppingExportData, label: CategoryLabel): void {
  const header = ['Rayon', 'Ingrédient', 'Quantité', 'Unité'];
  const rows = data.items.map((it) => [
    label(it.category),
    it.ingredient_name,
    it.total_quantity,
    it.unit,
  ]);
  const body = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `courses-${data.startDate}.csv`);
}

/** Télécharge la liste en PDF, regroupée par rayon. */
export function exportShoppingPdf(data: ShoppingExportData, label: CategoryLabel): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  const ensureSpace = (needed: number): void => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFontSize(18);
  doc.text('Liste de courses', margin, y);
  y += 22;
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(
    `Semaine du ${data.startDate} — ${data.nbPersons} personne${data.nbPersons > 1 ? 's' : ''} — ${data.items.length} ingrédient${data.items.length > 1 ? 's' : ''}`,
    margin,
    y,
  );
  doc.setTextColor(0);
  y += 24;

  // Regroupement par rayon (les items arrivent déjà triés par catégorie puis nom).
  const groups = new Map<string | null, ShoppingItem[]>();
  for (const it of data.items) {
    const arr = groups.get(it.category) ?? [];
    arr.push(it);
    groups.set(it.category, arr);
  }

  for (const [cat, items] of groups) {
    ensureSpace(40);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(label(cat), margin, y);
    doc.setFont('helvetica', 'normal');
    y += 18;
    doc.setFontSize(11);
    for (const it of items) {
      ensureSpace(16);
      const qty = `${it.total_quantity}${it.unit ? ` ${it.unit}` : ''}`.trim();
      doc.text(`• ${it.ingredient_name}`, margin + 8, y);
      doc.text(qty, doc.internal.pageSize.getWidth() - margin, y, { align: 'right' });
      y += 16;
    }
    y += 10;
  }

  doc.save(`courses-${data.startDate}.pdf`);
}
