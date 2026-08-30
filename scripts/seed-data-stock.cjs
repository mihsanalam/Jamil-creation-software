/* eslint-disable @typescript-eslint/no-require-imports */
// Seed data for the live database (see seed-live-db.cjs).

// Traditional Bangladeshi stock: 4 completed orders become finished
// products JC-0004..JC-0007 (warehouse).
const STOCK = [
  {
    fb: { name: "Rajshahi Silk", qty: 45, supplier: "Rajshahi Silk House" },
    wo: { product: "Silk Sharee", qty: 15 },
    steps: [
      ["Cutting", "Nusrat Jahan", 15, 15],
      ["Stitching", "Farhana Akter", 15, 15],
      ["Finishing and QC", "Karim Hossain", 15, 15],
    ],
    fp: { qty: 15, shelf: "Shelf C-1" },
  },
  {
    fb: { name: "Jamdani", qty: 30, supplier: "Tangail Handloom Weavers" },
    wo: { product: "Jamdani Sharee", qty: 12 },
    steps: [
      ["Cutting", "Nusrat Jahan", 12, 12],
      ["Stitching", "Farhana Akter", 12, 12],
      ["Finishing and QC", "Rashida Begum", 12, 12],
    ],
    fp: { qty: 12, shelf: "Shelf C-2" },
  },
  {
    fb: { name: "Polycotton", qty: 50, supplier: "Boro Bazar Wholesale" },
    wo: { product: "Cotton Panjabi", qty: 20 },
    steps: [
      ["Cutting", "Karim Hossain", 20, 20],
      ["Stitching", "Farhana Akter", 20, 20],
      ["Finishing and QC", "Karim Hossain", 20, 20],
    ],
    fp: { qty: 20, shelf: "Shelf B-4" },
  },
  {
    fb: { name: "Georgette", qty: 60, supplier: "Narayanganj Fabrics" },
    wo: { product: "Three-piece (Salwar Kameez)", qty: 25 },
    steps: [
      ["Cutting", "Nusrat Jahan", 25, 25],
      ["Stitching", "Farhana Akter", 25, 25],
      ["Printing", "Sajal Das", 25, 25],
      ["Finishing and QC", "Rashida Begum", 25, 25],
    ],
    fp: { qty: 25, shelf: "Shelf C-3" },
  },
];

module.exports = { STOCK };