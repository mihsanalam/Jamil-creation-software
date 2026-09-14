"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Lang = "en" | "bn";

/**
 * Bangla translations, keyed by the EXACT English string used in the UI.
 * If a string is missing here (or a new screen is added before it gets
 * translated), t() falls back to the English text automatically — so a
 * forgotten key degrades gracefully instead of showing a raw key name.
 */
const BN: Record<string, string> = {
  // ── Sidebar / navigation ─────────────────────────────────────────────
  "Owner Console": "মালিক কনসোল",
  "Production Collector": "প্রোডাকশন কালেক্টর",
  "Operator Console": "অপারেটর কনসোল",
  Dashboard: "ড্যাশবোর্ড",
  "Phase Templates": "ফেজ টেমপ্লেট",
  Reports: "রিপোর্ট",
  "Sales & Dues": "বিক্রয় ও বাকি",
  Users: "ইউজার",
  "Fabric Intake": "কাপড় গ্রহণ",
  "Batch List": "ব্যাচ তালিকা",
  "Finished Goods Intake": "সমাপ্ত পণ্য গ্রহণ",
  "Stock Search": "স্টক খোঁজ",
  "Work Order": "ওয়ার্ক অর্ডার",
  "Phase Board": "ফেজ বোর্ড",
  "New Sale": "নতুন বিক্রয়",
  Return: "রিটার্ন",
  Clients: "কাস্টমার",
  "Due Collection": "বাকি আদায়",
  "Sign out": "সাইন আউট",
  Menu: "মেনু",
  "Close menu": "মেনু বন্ধ করুন",

  // ── Camera barcode scanner ───────────────────────────────────────────
  "Scan barcode": "বারকোড স্ক্যান",
  "Scan with the camera": "ক্যামেরা দিয়ে স্ক্যান",
  "Point the camera at a product barcode (e.g. JC-0001).":
    "পণ্যের বারকোডে (যেমন JC-0001) ক্যামেরা ধরুন।",
  "Starting camera…": "ক্যামেরা চালু হচ্ছে…",
  "Camera permission was denied. Allow camera access and try again.":
    "ক্যামেরার অনুমতি দেওয়া হয়নি। ক্যামেরার অনুমতি দিয়ে আবার চেষ্টা করুন।",
  "No camera was found on this device.": "এই ডিভাইসে কোনো ক্যামেরা পাওয়া যায়নি।",
  "Camera scanning needs a secure (HTTPS) connection.":
    "ক্যামেরা স্ক্যানের জন্য নিরাপদ (HTTPS) সংযোগ প্রয়োজন।",
  "This browser does not support camera scanning.":
    "এই ব্রাউজার ক্যামেরা স্ক্যান সমর্থন করে না।",
  "Could not start the camera.": "ক্যামেরা চালু করা যায়নি।",
  "Each scan is added straight to the cart — keep scanning, then close this window when you are done.":
    "প্রতিটি স্ক্যান সরাসরি কার্টে যোগ হবে — স্ক্যান চালিয়ে যান, কাজ শেষ হলে এই উইন্ডোটি বন্ধ করুন।",

  // ── Statuses (StatusBadge) ───────────────────────────────────────────
  PENDING: "অপেক্ষমাণ",
  IN_PRODUCTION: "উৎপাদনে",
  READY: "প্রস্তুত",
  SOLD: "বিক্রীত",
  IN_STOCK: "স্টকে",
  IN_PROGRESS: "চলমান",
  COMPLETED: "সম্পন্ন",
  DUE: "বাকি",
  PAID: "পরিশোধিত",
  PARTIAL: "আংশিক",

  // ── Shared words ─────────────────────────────────────────────────────
  All: "সব",
  Status: "স্ট্যাটাস",
  Search: "খুঁজুন",
  "Loading…": "লোড হচ্ছে…",
  "Saving…": "সেভ হচ্ছে…",
  "Creating…": "তৈরি হচ্ছে…",
  "Generating…": "তৈরি হচ্ছে…",
  "Adding…": "যোগ হচ্ছে…",
  Remove: "সরান",
  Quantity: "পরিমাণ",
  pcs: "পিস",
  Description: "বিবরণ",
  Notes: "নোট",
  Unassigned: "নির্ধারিত নয়",
  day: "দিন",
  days: "দিন",

  // ── Shared data table & settings (Tier 1) ────────────────────────────
  "Load more": "আরও লোড করুন",
  "Sort by": "সাজান",
  "sorted ascending": "উর্ধ্বক্রমে সাজানো",
  "sorted descending": "অধঃক্রমে সাজানো",
  Settings: "সেটিংস",
  "Alert threshold": "সতর্কতা সীমা",
  "Flag a phase as a bottleneck when more than this many batches wait in it (1–100).":
    "একটি ফেজে এর চেয়ে বেশি ব্যাচ অপেক্ষায় থাকলে সেটিকে বাধা (bottleneck) হিসেবে চিহ্নিত করুন (১–১০০)।",
  "Save threshold": "সীমা সংরক্ষণ করুন",
  "Threshold saved": "সীমা সংরক্ষিত হয়েছে",
  "Could not save the threshold. Please try again.": "সীমা সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",

  // ── Fabric intake (Collector) ────────────────────────────────────────
  "Record fabric in.": "কাপড় আসা রেকর্ড করুন।",
  "Batch number": "ব্যাচ নম্বর",
  "Will be generated on save": "সেভ করলে তৈরি হবে",
  "Auto-generated": "স্বয়ংক্রিয়ভাবে তৈরি",
  "Fabric type": "কাপড়ের ধরন",
  "Cotton, Georgette, Silk...": "সুতি, জর্জেট, সিল্ক...",
  meters: "মিটার",
  kg: "কেজি",
  Unit: "একক",
  "Date received": "গ্রহণের তারিখ",
  "Supplier name": "সরবরাহকারীর নাম",
  "Enter supplier name": "সরবরাহকারীর নাম লিখুন",
  "Fabric photo (optional)": "কাপড়ের ছবি (ঐচ্ছিক)",
  "Process notes": "প্রসেস নোট",
  "Save and continue": "সেভ করে এগিয়ে যান",
  "Saved batches are registered with status":
    "সেভ করা ব্যাচ এই স্ট্যাটাসে নিবন্ধিত হয়",
  "Describe this fabric batch — color, texture, any notable details":
    "এই কাপড়ের ব্যাচ সম্পর্কে লিখুন — রং, গঠন, অন্যান্য বৈশিষ্ট্য",
  "Notes on how this fabric should be processed":
    "এই কাপড় কীভাবে প্রসেস করা হবে তার নোট",
  "Image is too large — the limit is 5 MB.":
    "ছবিটি খুব বড় — সর্বোচ্চ ৫ এমবি।",
  "Could not upload the fabric photo. Please try again.":
    "কাপড়ের ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।",
  "Something went wrong while saving. Please try again.":
    "সেভ করার সময় সমস্যা হয়েছে। আবার চেষ্টা করুন।",
  Batch: "ব্যাচ",
  saved: "সেভ হয়েছে",

  "Saved": "সেভ হয়েছে",
  Pending: "অপেক্ষমাণ",
  "In production": "উৎপাদনে",
  Ready: "প্রস্তুত",
  Sold: "বিক্রীত",

  "Fabric photo": "কাপড়ের ছবি",
  "Photo saved": "ছবি সেভ হয়েছে",
  "Photo removed": "ছবি সরানো হয়েছে",

  // ── Batch list (Collector) ───────────────────────────────────────────
  "Record fabric": "কাপড় গ্রহণ",
  "Batch number or supplier": "ব্যাচ নম্বর বা সরবরাহকারী",
  "No batches recorded yet": "এখনও কোনো ব্যাচ নিবন্ধিত হয়নি",
  Supplier: "সরবরাহকারী",
  "Recorded by": "নিবন্ধনকারী",
  Actions: "কার্যক্রম",
  "View details": "বিস্তারিত দেখুন",
  "In:": "চলছে:",
  "Failed to load batches": "ব্যাচ লোড করা যায়নি",
  batches: "ব্যাচ",

  // ── Batch detail dialog (Collector) ──────────────────────────────────
  "Fabric batch details": "কাপড়ের ব্যাচের বিস্তারিত",
  "Current phase:": "বর্তমান ফেজ:",
  "Change photo": "ছবি পরিবর্তন করুন",
  "Add photo": "ছবি যোগ করুন",
  "Recorded at": "নিবন্ধনের সময়",
  "No description provided.": "কোনো বিবরণ দেওয়া হয়নি।",
  "No process notes provided.": "কোনো প্রসেস নোট দেওয়া হয়নি।",
  "Could not upload the photo. Please try again.":
    "ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।",
  "Could not save the photo. Please try again.":
    "ছবি সেভ করা যায়নি। আবার চেষ্টা করুন।",
  "Could not remove the photo. Please try again.":
    "ছবি সরানো যায়নি। আবার চেষ্টা করুন।",

  // ── Warehouse / stock search (Collector) ─────────────────────────────
  "Warehouse search": "স্টক খোঁজ",
  "Look up any finished product in stock by barcode, batch number, or product type.":
    "বারকোড, ব্যাচ নম্বর বা পণ্যের ধরন দিয়ে স্টকের যেকোনো সমাপ্ত পণ্য খুঁজুন।",
  "Search by barcode, batch number, or product type…":
    "বারকোড, ব্যাচ নম্বর বা পণ্যের ধরন দিয়ে খুঁজুন…",
  "Search finished products": "সমাপ্ত পণ্য খুঁজুন",
  "No products found. Finished goods you add to stock will appear here.":
    "কোনো পণ্য পাওয়া যায়নি। স্টকে যোগ করা সমাপ্ত পণ্য এখানে দেখা যাবে।",
  "No products found for": "এর জন্য কোনো পণ্য পাওয়া যায়নি",
  products: "পণ্য",
  "Product / batch number": "পণ্য / ব্যাচ নম্বর",
  "Storage location": "স্টোরেজ অবস্থান",
  "Date added": "যোগ করার তারিখ",
  "Failed to load products": "পণ্য লোড করা যায়নি",

  // ── Finished goods intake (Collector) ────────────────────────────────
  "Finished goods intake": "সমাপ্ত পণ্য গ্রহণ",
  "Turn a completed batch into a barcoded product and add it to stock.":
    "সম্পন্ন ব্যাচ থেকে বারকোডযুক্ত পণ্য তৈরি করে স্টকে যোগ করুন।",
  "Find batch marked ready": "প্রস্তুত চিহ্নিত ব্যাচ খুঁজুন",
  "Only completed work orders that haven't been stocked yet appear here.":
    "শুধু সম্পন্ন ওয়ার্ক অর্ডার যা এখনো স্টকে যায়নি এখানে দেখা যাবে।",
  "Could not load ready batches. Please try again.":
    "প্রস্তুত ব্যাচ লোড করা যায়নি। আবার চেষ্টা করুন।",
  "No completed batches waiting to become stock yet.":
    "এখনো স্টকে যাওয়ার অপেক্ষায় কোনো সম্পন্ন ব্যাচ নেই।",
  "Search batches…": "ব্যাচ খুঁজুন…",
  "Search batch number or product type…":
    "ব্যাচ নম্বর বা পণ্যের ধরন দিয়ে খুঁজুন…",
  "No ready batches match.": "মিলে যাওয়া কোনো প্রস্তুত ব্যাচ নেই।",
  "Batch summary": "ব্যাচ সারসংক্ষেপ",
  "All phases are complete — this batch is ready to become stock.":
    "সব ফেজ সম্পন্ন — এই ব্যাচ স্টকে যাওয়ার জন্য প্রস্তুত।",
  "Product type": "পণ্যের ধরন",
  "Could not re-open the phase.": "ধাপটি পুনরায় খোলা যায়নি।",
  "Phase re-opened. It is back on the board.":
    "ধাপটি পুনরায় খোলা হয়েছে। এটি বোর্ডে ফিরে এসেছে।",
  "Mistaken completion? Re-open the phase and it returns to the board.":
    "ভুলবশত সম্পন্ন হয়েছে? ধাপটি পুনরায় খুলুন এবং এটি বোর্ডে ফিরে আসবে।",
  "No completed orders yet.": "এখনো কোনো সম্পন্ন অর্ডার নেই।",
  "Undoing…": "পূর্বাবস্থায় আনা হচ্ছে…",
  "Board": "বোর্ড",
  
  Barcode: "বারকোড",
  "Generate a unique barcode for this finished product.":
    "এই সমাপ্ত পণ্যের জন্য একটি ইউনিক বারকোড তৈরি করুন।",
  Generate: "তৈরি করুন",
  "Creates the product and shows its scannable barcode.":
    "পণ্য তৈরি করে তার স্ক্যানযোগ্য বারকোড দেখায়।",
  "Pick a batch above and fill in the storage location to enable this.":
    "এটি চালু করতে উপরে একটি ব্যাচ নির্বাচন করে স্টোরেজ অবস্থান লিখুন।",
  "Print label": "লেবেল প্রিন্ট করুন",
  "Shelf or rack code where this product will be stored.":
    "যে শেলফ বা র‍্যাকে এই পণ্য রাখা হবে তার কোড।",
  "e.g. Shelf A-3": "যেমন শেলফ A-3",
  "Select a ready batch first.": "প্রথমে একটি প্রস্তুত ব্যাচ নির্বাচন করুন।",
  "Confirm and add to stock": "নিশ্চিত করে স্টকে যোগ করুন",
  "Select a batch and enter a storage location first.":
    "প্রথমে একটি ব্যাচ নির্বাচন করে স্টোরেজ অবস্থান লিখুন।",
  "Could not add the product to stock.": "পণ্যটি স্টকে যোগ করা যায়নি।",
  "Added to stock · Barcode": "স্টকে যোগ হয়েছে · বারকোড",
  "stored at": "স্টোরেজে রাখা হয়েছে",

  // ── Work order form (Operator) ───────────────────────────────────────
  "Turn a PENDING fabric batch into a work order and assign a worker to each phase.":
    "অপেক্ষমাণ ব্যাচ থেকে ওয়ার্ক অর্ডার তৈরি করুন এবং প্রতিটি ফেজে কর্মী নির্ধারণ করুন।",
  "Select a fabric batch": "কাপড়ের ব্যাচ নির্বাচন করুন",
  "Only batches with a PENDING status are eligible.":
    "শুধু অপেক্ষমাণ স্ট্যাটাসের ব্যাচ নির্বাচন করা যাবে।",
  "Choose a batch…": "ব্যাচ নির্বাচন করুন…",
  "Search by batch number, fabric or supplier…":
    "ব্যাচ নম্বর, কাপড় বা সরবরাহকারী দিয়ে খুঁজুন…",
  "No batches found.": "কোনো ব্যাচ পাওয়া যায়নি।",
  "Select a phase template": "ফেজ টেমপ্লেট নির্বাচন করুন",
  "Pick the production plan for this batch.":
    "এই ব্যাচের উৎপাদন পরিকল্পনা নির্বাচন করুন।",
  "No phase templates yet — an Owner needs to create one first.":
    "এখনও কোনো ফেজ টেমপ্লেট নেই — আগে মালিককে একটি তৈরি করতে হবে।",
  phase: "ফেজ",
  phases: "ফেজ",
  Phases: "ফেজসমূহ",
  "The production steps for the selected template, in order.":
    "নির্বাচিত টেমপ্লেটের উৎপাদন ধাপগুলো, ক্রমানুসারে।",
  "Select a template to preview its phases.":
    "ফেজ দেখতে একটি টেমপ্লেট নির্বাচন করুন।",
  "Assign workers": "কর্মী নির্ধারণ করুন",
  "Enter the worker name for each phase.":
    "প্রতিটি ফেজের জন্য কর্মীর নাম লিখুন।",
  "Select a template first.": "প্রথমে একটি টেমপ্লেট নির্বাচন করুন।",
  "Worker name": "কর্মীর নাম",
  "Create work order": "ওয়ার্ক অর্ডার তৈরি করুন",
  "Could not create the work order.": "ওয়ার্ক অর্ডার তৈরি করা যায়নি।",
  "Ready — this will move the batch into production.":
    "প্রস্তুত — এতে ব্যাচটি উৎপাদনে চলে যাবে।",
  "The button unlocks once a batch, a template, and every worker are set.":
    "ব্যাচ, টেমপ্লেট ও সব কর্মী নির্ধারণ হলে বোতামটি চালু হবে।",
  "Work order created from batch": "ব্যাচ থেকে ওয়ার্ক অর্ডার তৈরি হয়েছে",
  "Something went wrong": "কিছু একটা সমস্যা হয়েছে",

  // ── Phase board (Operator) ───────────────────────────────────────────
  "Phase board": "ফেজ বোর্ড",
  "Every in-progress work order, one active phase on the board. Click a card to open it.":
    "প্রতিটি চলমান ওয়ার্ক অর্ডার বোর্ডে একটি সক্রিয় ফেজে দেখা যায়। খুলতে কার্ডে ক্লিক করুন।",
  "No work orders in progress right now.":
    "এই মুহূর্তে কোনো চলমান ওয়ার্ক অর্ডার নেই।",
  "Show completed only": "শুধু সম্পন্ন দেখান",
  "Show in-progress only": "শুধু চলমান দেখান",
  "Completed orders": "সম্পন্ন অর্ডার",
  "Undo completion": "সম্পন্ন পূর্বাবস্থায় আনুন",
  "Are you sure you want to re-open this phase?":
    "আপনি কি নিশ্চিত যে আপনি এই ধাপটি পুনরায় খুলতে চান?",
  "This will move the phase back to IN_PROGRESS.":
    "এটি ধাপটিকে আবার IN_PROGRESS-এ নিয়ে যাবে।",
  "Undo": "পূর্বাবস্থায় আনুন",
  "Days in phase": "ধাপে দিন",
  "Filter by product type": "পণ্যের ধরন দিয়ে ফিল্টার",
  "All product types": "সব পণ্যের ধরন",

  // ── Worker workload (Operator) ─────────────────────────────────────────
  "Worker workload": "শ্রমিকের কাজের ভার",
  "Current load": "বর্তমান বোঝা",
  "No workers with active phases.": "চলমান ধাপে কোনো শ্রমিক নেই।",
  "Bottleneck": "বাধা",
  "Worker": "শ্রমিক",

  // ── Batch label printing (Collector) ───────────────────────────────────
  "Print batch labels": "ব্যাচ লেবেল প্রিন্ট করুন",
  "Select batches to print labels for.": "লেবেল প্রিন্ট করার জন্য ব্যাচ নির্বাচন করুন।",
  "No batches selected.": "কোনো ব্যাচ নির্বাচন করা হয়নি।",
  "Label preview": "লেবেল প্রিভিউ",
  "Fabric:": "কাপড়:",
  "Qty:": "পরিমাণ:",
  "Batch labels queued for printing.": "ব্যাচ লেবেল প্রিন্টের জন্য সারিবদ্ধ।",
  "Could not queue labels.": "লেবেল সারিবদ্ধ করা যায়নি।",
  "Print selected": "নির্বাচিত প্রিন্ট করুন",
  "Clear selection": "নির্বাচন মুছুন",
  "Select All": "সব নির্বাচন করুন",
  "Deselect All": "নির্বাচন মুছুন",
  "Batch QR Label": "ব্যাচ QR লেবেল",

  // ── Offline queue (Operator) ────────────────────────────────────────────
  "Offline changes": "অফলাইন পরিবর্তন",
  "Offline mode": "অফলাইন মোড",
  "Your changes are saved locally and will be sent when the connection returns.":
    "আপনার পরিবর্তনগুলো স্থানীয়ভাবে সংরক্ষিত হয়েছে এবং সংযোগ ফিরে এলে পাঠানো হবে।",
  "Retry sending": "পুনরায় পাঠান",
  "Pending changes": "মুগ্ধ পরিবর্তন",
  "No pending changes.": "কোনো মুগ্ধ পরিবর্তন নেই।",
  "Could not send offline changes.": "অফলাইন পরিবর্তন পাঠানো যায়নি।",
  "All changes sent.": "সব পরিবর্তন পাঠানো হয়েছে।",
  "Send pending changes": "মুগ্ধ পরিবর্তন পাঠান",

  // ── Batch detail (Operator) ──────────────────────────────────────────
  "Back to phase board": "ফেজ বোর্ডে ফিরুন",
  "In progress": "চলমান",
  Waiting: "অপেক্ষায়",
  Done: "সম্পন্ন",
  "All phases complete": "সব ফেজ সম্পন্ন",
  "This work order is finished and the batch is ready.":
    "এই ওয়ার্ক অর্ডার শেষ এবং ব্যাচটি প্রস্তুত।",
  "All phases complete — work order finished.":
    "সব ফেজ সম্পন্ন — ওয়ার্ক অর্ডার শেষ।",
  complete: "সম্পন্ন হয়েছে",
  started: "শুরু হয়েছে",
  "Current phase": "বর্তমান ফেজ",
  Started: "শুরু",
  "Quantity in": "ভেতরে আসা পরিমাণ",
  "Quantity out": "বাইরে যাওয়া পরিমাণ",
  "Mark phase complete": "ফেজ সম্পন্ন করুন",
  "No active phase to update.": "আপডেট করার মতো কোনো সক্রিয় ফেজ নেই।",
  "Activity log": "কার্যক্রমের তালিকা",
  "Could not mark the phase complete.": "ফেজ সম্পন্ন করা যায়নি।",
  "Any notes on this phase…": "এই ফেজ সম্পর্কে কোনো নোট…",

  // ── POS shared ───────────────────────────────────────────────────────
  "Point of sale": "পয়েন্ট অব সেল",
  "New sale": "নতুন বিক্রয়",
  "Due collection": "বাকি আদায়",
  Invoice: "ইনভয়েস",
  Print: "প্রিন্ট",
  Cancel: "বাতিল",
  Find: "খুঁজুন",
  Add: "যোগ করুন",
  Change: "পরিবর্তন",
  Client: "কাস্টমার",
  Name: "নাম",
  Phone: "ফোন",
  Address: "ঠিকানা",
  "(optional)": "(ঐচ্ছিক)",
  Date: "তারিখ",
  Reason: "কারণ",
  Product: "পণ্য",
  Returned: "ফেরত",
  "Return qty": "ফেরত পরিমাণ",
  Qty: "পরিমাণ",
  Subtotal: "সাব-টোটাল",
  Discount: "ছাড়",
  Total: "মোট",
  "Amount paid": "পরিশোধিত",
  Due: "বাকি",
  due: "বাকি",
  Payment: "পেমেন্ট",
  "Payment method": "পেমেন্ট মাধ্যম",
  Cash: "ক্যাশ",
  bKash: "বিকাশ",
  Nagad: "নগদ",
  "Bank transfer": "ব্যাংক ট্রান্সফার",
  Wholesale: "পাইকারি",
  Retail: "খুচরা",
  "Paid in full": "সম্পূর্ণ পরিশোধিত",
  "Wholesale credit": "পাইকারি বাকি",
  "Partially paid": "আংশিক পরিশোধিত",
  "Unit price (৳)": "একক মূল্য (৳)",
  "Unit price": "একক মূল্য",
  "Line total": "লাইন মোট",
  "left in stock": "স্টকে আছে",
  "Could not reach the server. Please check your connection.":
    "সার্ভারে সংযোগ করা যাচ্ছে না। ইন্টারনেট সংযোগ দেখুন।",

  // ── New sale ─────────────────────────────────────────────────────────
  "Select a client…": "কাস্টমার নির্বাচন করুন…",
  "Search clients by name…": "নাম দিয়ে কাস্টমার খুঁজুন…",
  "No client found.": "কোনো কাস্টমার পাওয়া যায়নি।",
  "Scan barcode or type JC-0001 then press Enter":
    "বারকোড স্ক্যান করুন বা JC-0001 লিখে Enter চাপুন",
  "No scanner at this PC?": "এই পিসিতে স্ক্যানার নেই?",
  "Or enter barcode manually": "বা বারকোড হাতে লিখুন",
  "— type it (e.g. JC-0001) and press Enter, exactly like a scan.":
    "— (যেমন JC-0001) লিখে Enter চাপুন, ঠিক স্ক্যানের মতো।",
  "No items yet — scan a barcode above to start the sale.":
    "এখনো কোনো পণ্য নেই — বিক্রয় শুরু করতে উপরে বারকোড স্ক্যান করুন।",
  "Scan by product type…": "পণ্যের ধরন দিয়ে স্ক্যান করুন…",
  "No products match that type.": "ওই ধরনের কোনো পণ্য নেই।",
  "Select a product to add to cart.": "কার্টে যোগ করতে একটি পণ্য নির্বাচন করুন।",
  "Press Enter to scan, or type a product type.": "স্ক্যানের জন্য Enter চাপুন, বা পণ্যের ধরন লিখুন।",
  "Payment summary": "পেমেন্ট সারসংক্ষেপ",
  "Amount paid now (৳)": "এখন পরিশোধিত (৳)",
  "Due after this payment:": "এই পেমেন্টের পরে বাকি:",
  "Complete sale": "বিক্রয় সম্পন্ন করুন",
  "Product not found or out of stock.": "পণ্য পাওয়া যায়নি বা স্টকে নেই।",
  "is already in the cart.": "কার্টে আছে।",
  "Every item needs a unit price before completing the sale.":
    "বিক্রয় সম্পন্ন করার আগে প্রতিটি পণ্যের একক মূল্য দিতে হবে।",
  "Could not record the sale.": "বিক্রয় রেকর্ড করা যায়নি।",
  "Sale recorded — opening the invoice…":
    "বিক্রয় রেকর্ড হয়েছে — ইনভয়েস খোলা হচ্ছে…",

  // ── Clients ──────────────────────────────────────────────────────────
  "Wholesale and retail customers, their purchases and outstanding dues.":
    "পাইকারি ও খুচরা কাস্টমার, তাদের কেনাকাটা ও বাকির হিসাব।",
  "Add client": "কাস্টমার যোগ করুন",
  "Client name": "কাস্টমারের নাম",
  "Total purchased": "মোট কেনাকাটা",
  "Outstanding due": "বাকি",
  clients: "জন কাস্টমার",
  "No clients match the current filters.":
    "বর্তমান ফিল্টারে কোনো কাস্টমার মেলেনি।",
  "No clients yet. Add your first client to start selling.":
    "এখনো কোনো কাস্টমার নেই। বিক্রয় শুরু করতে প্রথম কাস্টমার যোগ করুন।",
  "View dues": "বাকি দেখুন",
  "Create a new wholesale or retail customer.":
    "নতুন পাইকারি বা খুচরা কাস্টমার তৈরি করুন।",
  "e.g. Rahman Textiles": "যেমন রহমান টেক্সটাইলস",
  "e.g. 01712345678": "যেমন 01712345678",
  "e.g. Keraniganj, Dhaka": "যেমন কেরানীগঞ্জ, ঢাকা",
  "Name and phone are required.": "নাম ও ফোন নম্বর দিতে হবে।",
  "Could not create the client.": "কাস্টমার তৈরি করা যায়নি।",
  "added.": "যোগ হয়েছে।",

  // ── Return & exchange ────────────────────────────────────────────────
  "Return & Exchange": "রিটার্ন ও এক্সচেঞ্জ",
  "Take products back, swap them for others, and hand back the difference.":
    "পণ্য ফেরত নিন, অন্য পণ্যের সাথে বদল করুন এবং পার্থক্য ফেরত দিন।",
  "1 · Client": "১ · কাস্টমার",
  "2 · Invoice number": "২ · ইনভয়েস নম্বর",
  "3 · What is coming back": "৩ · যা ফেরত আসছে",
  "4 · Exchange (optional)": "৪ · এক্সচেঞ্জ (ঐচ্ছিক)",
  "5 · Settle up & confirm": "৫ · হিসাব মিলিয়ে নিশ্চিত করুন",
  "Select the client making the return…":
    "যে কাস্টমার পণ্য ফেরত দিচ্ছে তাকে নির্বাচন করুন…",
  "Search name or phone…": "নাম বা ফোন দিয়ে খুঁজুন…",
  "Invoice not found.": "ইনভয়েস পাওয়া যায়নি।",
  "belongs to": "এর",
  not: "নয়",
  "e.g. 0005": "যেমন 0005",
  "Client:": "কাস্টমার:",
  "— confirm this is the customer at the counter before recording the return.":
    "— রিটার্ন রেকর্ড করার আগে নিশ্চিত হয়ে নিন এটিই কাউন্টারের কাস্টমার।",
  "Enter the quantity being returned per line (already returned amounts are excluded from the cap).":
    "প্রতি লাইনে ফেরত পরিমাণ লিখুন (আগে যা ফেরত হয়েছে তা সীমার বাইরে)।",
  "e.g. defect": "যেমন ত্রুটি",
  "Scan or type the barcode of anything the client takes in exchange — same price, lower, or higher.":
    "যা কাস্টমার এক্সচেঞ্জে নিচ্ছে তার বারকোড স্ক্যান বা লিখুন — একই দাম, কম বা বেশি।",
  "Scan exchange barcode…": "এক্সচেঞ্জের বারকোড স্ক্যান করুন…",
  "is already in the exchange list.": "এক্সচেঞ্জ তালিকায় আছে।",
  "Returned value": "ফেরত মূল্য",
  "Exchange value": "এক্সচেঞ্জ মূল্য",
  "Suggested cashback": "প্রস্তাবিত ক্যাশব্যাক",
  "Cashback to hand over (৳)": "হাতে দেওয়ার ক্যাশব্যাক (৳)",
  "Exchange is worth more — the client pays the difference.":
    "এক্সচেঞ্জ বেশি মূল্যের — পার্থক্য কাস্টমার দেবে।",
  "Credited against the invoice's due first; only the rest is paid in cash.":
    "আগে ইনভয়েসের বাকি থেকে কাটা হবে; বাকিটা নগদে দিতে হবে।",
  "Auto-filled from the difference — adjust if you agreed otherwise.":
    "পার্থক্য থেকে স্বয়ংক্রিয়ভাবে পূরণ — অন্যরকম সমঝোতা হলে পরিবর্তন করুন।",
  "e.g. client exchanged for a bigger size, defect confirmed":
    "যেমন কাস্টমার বড় সাইজে বদলেছে, ত্রুটি নিশ্চিত",
  "A return quantity is above what can still be returned on its line.":
    "একটি ফেরত পরিমাণ সেই লাইনের সর্বোচ্চ সীমার চেয়ে বেশি।",
  "Confirm return": "রিটার্ন নিশ্চিত করুন",
  "Could not record the return.": "রিটার্ন রেকর্ড করা যায়নি।",
  "Return recorded — stock updated.":
    "রিটার্ন রেকর্ড হয়েছে — স্টক আপডেট হয়েছে।",
  "Return recorded": "রিটার্ন রেকর্ড হয়েছে",
  "Returned goods are back in stock": "ফেরত পণ্য আবার স্টকে",
  " and the exchange items have been taken out of stock":
    " এবং এক্সচেঞ্জের পণ্য স্টক থেকে বাদ হয়েছে",
  "was credited against the invoice's due": "ইনভয়েসের বাকি থেকে কাটা হয়েছে",
  and: "এবং",
  "handed over in cash": "নগদে দেওয়া হয়েছে",
  " — no cash needed": " — নগদ লাগবে না",
  "Cashback handed over:": "ক্যাশব্যাক দেওয়া হয়েছে:",
  "Record another return": "আরেকটি রিটার্ন রেকর্ড করুন",
  "View invoice": "ইনভয়েস দেখুন",
  "This invoice has": "এই ইনভয়েসে",
  "due. The cashback reduces that due first —":
    "বাকি আছে। ক্যাশব্যাক আগে সেই বাকি থেকে কমবে —",
  "goes to the due": "বাকি থেকে কাটা হবে",
  " and only": " এবং শুধু",
  "is handed over in cash": "নগদে দেওয়া হবে",
  " — no cash changes hands": " — কোনো নগদ লেনদেন হবে না",
  "but the due is already covered — confirm how much cash to hand over below.":
    "কিন্তু বাকি আগেই পরিশোধিত — নিচে কত নগদ দিতে হবে তা নিশ্চিত করুন।",

  // ── Due collection ───────────────────────────────────────────────────
  "Search client with outstanding due": "বাকি আছে এমন কাস্টমার খুঁজুন",
  "Search client with outstanding due…": "বাকি আছে এমন কাস্টমার খুঁজুন…",
  "No client with outstanding due found.":
    "বাকি আছে এমন কোনো কাস্টমার পাওয়া যায়নি।",
  "Total outstanding due": "মোট বাকি",
  "Could not load this client's invoices. Please refresh.":
    "এই কাস্টমারের ইনভয়েস লোড করা যায়নি। রিফ্রেশ করুন।",
  "No unpaid invoices.": "কোনো অপরিশোধিত ইনভয়েস নেই।",
  Original: "মূল",
  "Record payment": "পেমেন্ট রেকর্ড করুন",
  "Amount (৳)": "পরিমাণ (৳)",
  "Payment history": "পেমেন্টের ইতিহাস",
  "Could not load the payment history.": "পেমেন্টের ইতিহাস লোড করা যায়নি।",
  "No payments recorded yet.": "এখনো কোনো পেমেন্ট রেকর্ড হয়নি।",
  "Select a client above to see their outstanding invoices, record a payment, and review their payment history.":
    "উপরে একজন কাস্টমার নির্বাচন করুন — তার অপরিশোধিত ইনভয়েস দেখুন, পেমেন্ট রেকর্ড করুন এবং পেমেন্টের ইতিহাস দেখুন।",
  "Enter an amount greater than 0.": "০ এর বেশি পরিমাণ লিখুন।",
  "Amount cannot exceed the outstanding balance.":
    "পরিমাণ বাকির চেয়ে বেশি হতে পারে না।",
  "Could not record the payment.": "পেমেন্ট রেকর্ড করা যায়নি।",
  "Payment of": "পেমেন্ট",
  "recorded for": "রেকর্ড হয়েছে —",

  // ── Invoice ──────────────────────────────────────────────────────────
  "Garments manufacturer & wholesaler":
    "গার্মেন্টস প্রস্তুতকারক ও পাইকারি বিক্রেতা",
  "Billed to": "বিল প্রাপক",
  client: "কাস্টমার",
  returned: "ফেরত হয়েছে",
  "Fully returned": "সম্পূর্ণ ফেরত",
  "Return up to": "সর্বোচ্চ এত ফেরত করা যাবে:",
  "Record return": "রিটার্ন রেকর্ড করুন",
  "Thank you for your business — Jamil Creations":
    "আপনার ব্যবসার জন্য ধন্যবাদ — জামিল ক্রিয়েশনস",
  "— the returned quantity goes back into stock. The invoice total is not changed; any refund is handled by the Owner.":
    "— ফেরত পরিমাণ আবার স্টকে যাবে। ইনভয়েসের মোট পরিবর্তন হবে না; ফেরত টাকা মালিক সামলাবেন।",
  "— up to": "— সর্বোচ্চ",
  "e.g. stitching defect on 2 pieces": "যেমন ২টি পিসে সেলাই ত্রুটি",
  "Quantity must be a number greater than 0.":
    "পরিমাণ ০ এর বেশি সংখ্যা হতে হবে।",
  Only: "মাত্র",
  "of the": "এর মধ্যে",
  "sold can still be returned.": "ফেরত করা যাবে।",
  "Return recorded for": "রিটার্ন রেকর্ড হয়েছে",
  "stock has been restored.": "স্টকে ফেরত যাওয়া হয়েছে।",

  // ── Owner: Dashboard ────────────────────────────────────────────────
  "Batches in production": "উৎপাদনে থাকা ব্যাচ",
  "Total stock": "মোট স্টক",
  "Sales today": "আজকের বিক্রয়",
  "Outstanding dues": "মোট বাকি",
  "Returned today": "আজকের রিটার্ন",
  "Cashback given": "দেওয়া ক্যাশব্যাক",
  "Could not load the dashboard": "ড্যাশবোর্ড লোড করা যায়নি",
  "Showing the last known values.": "সর্বশেষ জানা মান দেখানো হচ্ছে।",
  "is backed up": "আটকে গেছে",
  "has batches waiting": "ব্যাচ অপেক্ষায় আছে",
  "— check staffing.": "— স্টাফিং পরীক্ষা করুন।",
  "Production pipeline": "উৎপাদন পাইপলাইন",
  "No phases in progress right now.": "এই মুহূর্তে কোনো চলমান ফেজ নেই।",
  batch: "ব্যাচ",
  "batches in this phase": "এই ফেজে ব্যাচ",
  "Recent sales": "সাম্প্রতিক বিক্রয়",
  "No sales recorded yet.": "এখনো কোনো বিক্রয় রেকর্ড হয়নি।",
  "Clients with dues": "বাকিওয়ালা কাস্টমার",
  "Amount owed": "বাকি পরিমাণ",
  "No outstanding dues — everyone is settled. 🎉":
    "কোনো বাকি নেই — সবাই পরিশোধ করেছে। 🎉",
  "Recent returns & exchanges": "সাম্প্রতিক রিটার্ন ও এক্সচেঞ্জ",
  "No returns or exchanges recorded yet.":
    "এখনো কোনো রিটার্ন বা এক্সচেঞ্জ রেকর্ড হয়নি।",
  Exchange: "এক্সচেঞ্জ",
  Cashback: "ক্যাশব্যাক",
  "pcs have been handed out in exchanges in total.":
    "পিস এক্সচেঞ্জে দেওয়া হয়েছে মোট।",
  "of cashback was credited against client dues (no cash moved).":
    "ক্যাশব্যাক কাস্টমারের বাকিতে জমা হয়েছে (নগদ লেনদেন হয়নি)।",
  "client paid": "কাস্টমার দিয়েছে",
  "to due": "বাকিতে",

  // ── Owner: Phase templates ───────────────────────────────────────────
  "Phase templates": "ফেজ টেমপ্লেট",
  "New template": "নতুন টেমপ্লেট",
  Template: "টেমপ্লেট",
  created: "তৈরি হয়েছে",
  "Could not save the template.": "টেমপ্লেট সেভ করা যায়নি।",
  "Could not create the template.": "টেমপ্লেট তৈরি করা যায়নি।",
  "Steps (in order)": "ধাপসমূহ (ক্রমানুসারে)",
  "Drag the grip handle to reorder. Your changes apply when you save the template.":
    "পুনঃক্রম করতে গ্রিপ হ্যান্ডেল টেনে আনুন। টেমপ্লেট সেভ করলে পরিবর্তন প্রযোজ্য হবে।",
  "Drag to reorder": "পুনঃক্রম করতে টানুন",
  Step: "ধাপ",
  "Remove step": "ধাপ সরান",
  "No steps yet — add the first one below.":
    "এখনো কোনো ধাপ নেই — নিচে প্রথমটি যোগ করুন।",
  "Add step": "ধাপ যোগ করুন",
  "Saving replaces all steps with the list above.":
    "সেভ করলে উপরের তালিকা দিয়ে সব ধাপ প্রতিস্থাপিত হবে।",
  "Fill in the name and every step first":
    "প্রথমে নাম ও প্রতিটি ধাপ পূরণ করুন",
  "Save template": "টেমপ্লেট সেভ করুন",
  "No templates yet": "এখনো কোনো টেমপ্লেট নেই",
  step: "ধাপ",
  steps: "ধাপ",
  "Select a template to view its phases": "ফেজ দেখতে একটি টেমপ্লেট নির্বাচন করুন",
  "New phase template": "নতুন ফেজ টেমপ্লেট",
  "Name it and add its first step — you can edit the rest after.":
    "নাম দিন এবং প্রথম ধাপ যোগ করুন — বাকিগুলো পরে সম্পাদনা করতে পারবেন।",
  "Template name": "টেমপ্লেটের নাম",
  "e.g. Chikankari suit": "যেমন চিকনকারি জামা",
  "First step": "প্রথম ধাপ",
  "e.g. Cutting": "যেমন কাটিং",
  "Create template": "টেমপ্লেট তৈরি করুন",

  // ── Owner: Users ─────────────────────────────────────────────────────
  "Create and manage the team members who use the system.":
    "যে টিম সদস্যরা সিস্টেম ব্যবহার করেন তাদের তৈরি ও পরিচালনা করুন।",
  "Add user": "ইউজার যোগ করুন",
  Role: "ভূমিকা",
  Collectors: "কালেক্টর",
  Operators: "অপারেটর",
  "Name, email and password are required.":
    "নাম, ইমেইল এবং পাসওয়ার্ড দিতে হবে।",
  "Could not create the user.": "ইউজার তৈরি করা যায়নি।",
  "User": "ইউজার",
  "Could not reset the password.": "পাসওয়ার্ড রিসেট করা যায়নি।",
  "Password reset for": "পাসওয়ার্ড রিসেট হয়েছে",
  "share the new password with them directly.":
    "নতুন পাসওয়ার্ড তাদের সরাসরি দিন।",
  "Name can't be empty.": "নাম খালি রাখা যাবে না।",
  "Could not save the name.": "নাম সেভ করা যায়নি।",
  "Name updated.": "নাম আপডেট হয়েছে।",
  "Could not update the user.": "ইউজার আপডেট করা যায়নি।",
  "deactivated — they can no longer sign in.":
    "নিষ্ক্রিয় করা হয়েছে — তারা আর সাইন ইন করতে পারবে না।",
  "is active again.": "আবার সক্রিয় করেছেন।",
  users: "জন ইউজার",
  "No users match the current filter.":
    "বর্তমান ফিল্টারে কোনো ইউজার মেলেনি।",
  "No users yet. Add your first collector or operator.":
    "এখনো কোনো ইউজার নেই। প্রথম কালেক্টর বা অপারেটর যোগ করুন।",
  Email: "ইমেইল",
  Active: "সক্রিয়",
  Inactive: "নিষ্ক্রিয়",
  Deactivate: "নিষ্ক্রিয় করুন",
  Activate: "সক্রিয় করুন",
  Operator: "অপারেটর",
  Collector: "কালেক্টর",
  "Create user": "ইউজার তৈরি করুন",
  "created.": "তৈরি হয়েছে।",
  "Temporary password": "অস্থায়ী পাসওয়ার্ড",
  Password: "পাসওয়ার্ড",
  "e.g. Karim Hossain": "যেমন করিম হোসেন",
  "e.g. karim@jamilcreations.com": "যেমন karim@jamilcreations.com",
  "Edit user": "ইউজার সম্পাদনা করুন",
  "Update the display name. Email and role are fixed for the MVP.":
    "প্রদর্শনের নাম আপডেট করুন। এমভিপির জন্য ইমেইল ও ভূমিকা স্থির।",
  "Save name": "নাম সেভ করুন",
  "Reset password": "পাসওয়ার্ড রিসেট করুন",
  "Set a new password for": "এর জন্য নতুন পাসওয়ার্ড দিন:",
  "There is no email flow — give them the new password directly.":
    "কোনো ইমেইল প্রক্রিয়া নেই — নতুন পাসওয়ার্ড সরাসরি দিন।",
  "New password": "নতুন পাসওয়ার্ড",

  // ── Owner: Sales & Dues ──────────────────────────────────────────────
  "Sales and dues": "বিক্রয় ও বাকি",
  "Revenue and outstanding client balances across all sales.":
    "সব বিক্রয় জুড়ে রাজস্ব ও কাস্টমারের বাকি।",
  "This month": "এই মাস",
  "Last month": "গত মাস",
  "All time": "সব সময়",
  "Failed to load the sales report": "বিক্রয় রিপোর্ট লোড করা যায়নি",
  "Select range": "ব্যাপ্তি নির্বাচন করুন",
  "Total sales": "মোট বিক্রয়",
  "Retail sales": "খুচরা বিক্রয়",
  "Wholesale sales": "পাইকারি বিক্রয়",
  "Sales trend": "বিক্রয় ধারা",
  "Daily sales (gold) and the unpaid part of each day's invoices":
    "দৈনিক বিক্রয় (সোনালি) এবং প্রতিদিনের ইনভয়েসের অপরিশোধিত অংশ",
  "No sales in this period.": "এই সময়ে কোনো বিক্রয় নেই।",
  "All sales": "সব বিক্রয়",
  "Could not load sales.": "বিক্রয় লোড করা যায়নি।",
  "Could not load client balances.": "কাস্টমারের বাকি লোড করা যায়নি।",
  "No outstanding dues at the moment.": "এই মুহূর্তে কোনো বাকি নেই।",
  Type: "ধরন",
  "Total owed": "মোট পাওনা",
  "Last payment": "সর্বশেষ পেমেন্ট",
  Contact: "যোগাযোগ",
  Paid: "পরিশোধিত",
  Partial: "আংশিক",

  // ── Owner: Reports / Traceability ────────────────────────────────────
  "Product / batch": "পণ্য / ব্যাচ",
  "No batches match": "মিলে যাওয়া কোনো ব্যাচ নেই",
  "No finished batches yet. Finished goods that have come into stock will appear here.":
    "এখনো কোনো সমাপ্ত ব্যাচ নেই। স্টকে আসা সমাপ্ত পণ্য এখানে দেখা যাবে।",
  "View trace of": "ট্রেস দেখুন",
  "Back to all batches": "সব ব্যাচে ফিরুন",
  "In stock": "স্টকে",
  "Partially sold": "আংশিক বিক্রীত",
  "Awaiting sale": "বিক্রয়ের অপেক্ষায়",
  Fabric: "কাপড়",
  "Quantity remaining": "অবশিষ্ট পরিমাণ",
  "Fabric in": "কাপড় আসা",
  Warehouse: "গুদাম",
  Storage: "স্টোরেজ",
  "Sale details": "বিক্রয়ের বিস্তারিত",
  "Quantity sold": "বিক্রীত পরিমাণ",
  Amount: "পরিমাণ",
  "Not yet sold — still in stock.": "এখনো বিক্রি হয়নি — স্টকে আছে।",
  "In this phase,": "এই ফেজে,",
  "Product summary": "পণ্যের সারসংক্ষেপ",
  "Batch traceability": "ব্যাচ ট্রেসেবিলিটি",
  "Pick a finished batch below (or search for it) to trace it back to its original fabric, every production phase, and the sale that sent it out.":
    "নিচে একটি সমাপ্ত ব্যাচ নির্বাচন করুন (বা খুঁজুন) — এর মূল কাপড়, প্রতিটি উৎপাদন ধাপ এবং যে বিক্রয়ে বেরিয়ে গেছে তা দেখুন।",
};

interface LanguageContextValue {
  /** Currently active language. */
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /**
   * Translate an English UI string into the active language. Unknown
   * strings come back unchanged, so new screens never break.
   */
  t: (english: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// localStorage key for the persisted choice.
const STORAGE_KEY = "jamil.lang";

// Tiny external store around localStorage. React reads the language through
// useSyncExternalStore instead of a setState-in-effect restore (which the
// react-hooks/set-state-in-effect lint rule forbids). This is hydration-safe
// — the server and the first client render both use the English snapshot —
// and it keeps multiple browser tabs in sync for free via the storage event.
const langListeners = new Set<() => void>();

function subscribeToLang(listener: () => void): () => void {
  langListeners.add(listener);
  // Another tab changing the language should update this tab too.
  window.addEventListener("storage", listener);
  return () => {
    langListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getLangSnapshot(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en";
  } catch {
    // localStorage unavailable (private mode etc.) — English stays.
    return "en";
  }
}

function getLangServerSnapshot(): Lang {
  return "en";
}

function persistLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore persistence failures; the choice still applies for this visit.
  }
  document.documentElement.lang = lang === "bn" ? "bn" : "en";
  // Notify React (and any other listeners) that the external store changed.
  langListeners.forEach((listener) => listener());
}

/**
 * App-wide language provider. Defaults to English on both server and the
 * first client render (so hydration always matches); the saved choice is
 * restored from localStorage through useSyncExternalStore.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(
    subscribeToLang,
    getLangSnapshot,
    getLangServerSnapshot
  );

  // Keep <html lang> in step with the active language (pure DOM sync).
  useEffect(() => {
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
  }, [lang]);

  function setLang(next: Lang) {
    persistLang(next);
  }

  function toggleLang() {
    persistLang(lang === "en" ? "bn" : "en");
  }

  function t(english: string): string {
    if (lang !== "bn") return english;
    return BN[english] ?? english;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Access the active language and the t() translator. Client components only. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}