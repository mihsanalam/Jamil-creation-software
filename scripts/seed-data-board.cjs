/* eslint-disable @typescript-eslint/no-require-imports */
// Traditional Bangladeshi in-production orders for the phase board.

// phase-array format:
// [name, status, workerName, startedAt, completedAt, qtyIn, qtyOut]
const BOARD = [
  {
    fb: { name: "Cotton", qty: 70, supplier: "Dhaka Textile Mills" },
    template: "pt_printed",
    wo: { product: "Printed Kurti", qty: 30 },
    phases: [
      ["Cutting", "COMPLETED", "Nusrat Jahan", "2026-08-20 09:00:00", "2026-08-21 17:00:00", 30, 29],
      ["Stitching", "IN_PROGRESS", "Farhana Akter", "2026-08-22 09:00:00", null, 29, null],
      ["Printing", "PENDING", null, null, null, null, null],
      ["Finishing and QC", "PENDING", null, null, null, null, null],
    ],
  },
  {
    fb: { name: "Cotton", qty: 60, supplier: "Mirpur Textiles" },
    template: "pt_embroidered",
    wo: { product: "Embroidered Kurti", qty: 26 },
    phases: [
      ["Cutting", "COMPLETED", "Nusrat Jahan", "2026-08-15 09:00:00", "2026-08-16 17:00:00", 26, 26],
      ["Stitching", "COMPLETED", "Farhana Akter", "2026-08-17 09:00:00", "2026-08-19 17:00:00", 26, 26],
      ["Embroidery", "IN_PROGRESS", "Rukhsana Begum", "2026-08-20 09:00:00", null, 26, null],
      ["Finishing and QC", "PENDING", null, null, null, null, null],
    ],
  },
  {
    fb: { name: "Silk", qty: 40, supplier: "Dinajpur Silk Mills" },
    template: "pt_embroidered",
    wo: { product: "Embroidered Silk Panjabi", qty: 18 },
    phases: [
      ["Cutting", "COMPLETED", "Karim Hossain", "2026-08-12 09:00:00", "2026-08-13 17:00:00", 18, 18],
      ["Stitching", "COMPLETED", "Farhana Akter", "2026-08-14 09:00:00", "2026-08-15 17:00:00", 18, 18],
      ["Embroidery", "COMPLETED", "Rukhsana Begum", "2026-08-16 09:00:00", "2026-08-18 17:00:00", 18, 17],
      ["Finishing and QC", "IN_PROGRESS", "Rashida Begum", "2026-08-19 09:00:00", null, 17, null],
    ],
  },
  {
    fb: { name: "Cotton", qty: 45, supplier: "Dhanmondi Fabrics" },
    template: "pt_plain",
    wo: { product: "Cotton Fatua", qty: 22 },
    phases: [
      ["Cutting", "COMPLETED", "Nusrat Jahan", "2026-08-24 09:00:00", "2026-08-25 17:00:00", 22, 22],
      ["Stitching", "IN_PROGRESS", "Farhana Akter", "2026-08-26 09:00:00", null, 22, null],
      ["Finishing and QC", "PENDING", null, null, null, null, null],
    ],
  },
];

module.exports = { BOARD };