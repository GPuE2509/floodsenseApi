/**
 * pdfReportService.js — SFTR Analytics PDF Generator v4
 *
 * DEFINITIVE BLANK PAGES FIX:
 * Inside the footer loop (`for (let i = 0; i < range.count; i++)`), we call:
 * `doc.switchToPage(range.start + i); doc.page.margins.bottom = 0; doc.y = doc.page.margins.top;`
 * Because each `Page` instance inside `pdfkit` maintains its own `margins` object, setting
 * `doc.page.margins.bottom = 0` right after `switchToPage()` guarantees that `doc.text()`
 * inside `drawFooter` will NEVER trigger `continueOnNewPage()`. Zero extra blank pages produced.
 *
 * DETAILED MACRO-STATISTICAL CONTENT:
 * - Section 1: Verified vs Unverified accounts, Role & Status share %, Top 10 Districts, Top 5 System Contributors (Gamification leaderboard with points breakdown).
 * - Section 2: Incident Reports by Type with specific Type Approval Rate %, AI Moderation & Confidence Score averages, Community Verification Votes (Confirmed/Denied/False), Lifecycle Status breakdown, IoT Status & Water Level history.
 * - Section 3: Rescue Sessions Status share %, Emergency Type Completion Rate %, Dispatch Breakdown (Volunteers vs Workshop Staff vs Unassigned), Execution Quality & Financial Metrics (Safety Check-ins, Paid rate, Estimated Service Revenue), Top 5 Workshops with individual completion rates.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');

/* ════════════════════════════════════════════════
   FONT RESOLUTION (Unicode — Vietnamese support)
   ════════════════════════════════════════════════ */
function resolveFont(variant) {
  const candidates = {
    Regular: [
      path.join(__dirname, '../../assets/fonts/Roboto-Regular.ttf'),
      'C:/Windows/Fonts/arial.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ],
    Bold: [
      path.join(__dirname, '../../assets/fonts/Roboto-Bold.ttf'),
      'C:/Windows/Fonts/arialbd.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ],
  };
  for (const p of (candidates[variant] || [])) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return null;
}

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

/* ════════════════════════════════════════════════
   COLOR PALETTE
   ════════════════════════════════════════════════ */
const C = {
  navy:      '#1B3A5C',
  navyLight: '#2E5A8E',
  accent:    '#0EA5D9',   // matches mobile accentCyan #06B6D4
  teal:      '#10B981',   // matches mobile accentGreen
  orange:    '#F59E0B',   // matches mobile accentAmber
  red:       '#EF4444',   // matches mobile alertRed
  blue:      '#3B82F6',   // matches mobile accentBlue
  purple:    '#8B5CF6',
  white:     '#FFFFFF',
  offWhite:  '#F1F5F9',
  lightGray: '#F8FAFC',
  border:    '#CBD5E1',
  borderDark:'#94A3B8',
  text:      '#0F172A',   // Deep Slate 900
  textSec:   '#334155',
  muted:     '#64748B',
};

/* ════════════════════════════════════════════════
   LABELS (Vietnamese & English)
   ════════════════════════════════════════════════ */
const LABELS = {
  vi: {
    reportTitle: 'BÁO CÁO PHÂN TÍCH HỆ THỐNG',
    systemName:  'Smart Flood Traffic Rescue',
    subtitle:    'Hệ thống Cảnh báo & Phối hợp Cứu hộ Thông minh',
    period:  'Kỳ báo cáo', by: 'Người xuất', at: 'Thời điểm', role: 'Vai trò',
    confidential: 'TÀI LIỆU NỘI BỘ — KHÔNG PHÂN PHỐI BÊN NGOÀI',
    sections: 'Nội dung báo cáo',
    s1: 'PHẦN 1: TỔNG QUAN NGƯỜI DÙNG HỆ THỐNG',
    totalUsers: 'Tổng người dùng', newUsers: 'Người dùng mới', activeUsers: 'Đang hoạt động', verifiedUsers: 'Đã xác thực KYC',
    s1_detail: 'Chi tiết phân tích',
    roleLabel: 'Vai trò', statusLabel: 'Trạng thái', districtLabel: 'Khu vực', countLabel: 'Số lượng', pctLabel: 'Tỉ lệ (%)', dateLabel: 'Ngày',
    newCountLabel: 'Người dùng mới',
    roleTable: 'Phân bổ theo vai trò hệ thống',
    statusTable: 'Phân bổ theo trạng thái tài khoản',
    districtTable: 'Top 10 khu vực tập trung nhiều người dùng nhất',
    contribTable: 'Top 5 thành viên đóng góp tích cực nhất (Gamification Leaderboard)',
    nameCol: 'Họ và tên', pointsCol: 'Tổng điểm', monthlyCol: 'Điểm tháng',
    growthTable: 'Tăng trưởng người dùng mới (10 ngày gần nhất)',
    s2: 'PHẦN 2: LỊCH SỬ LŨ LỤT & BÁO CÁO SỰ CỐ',
    totalReports: 'Tổng báo cáo', approvalRate: 'Tỉ lệ duyệt chung', aiApproved: 'AI duyệt tự động', avgConfidence: 'Độ tin cậy AI TB',
    pendingLabel: 'Chờ xét duyệt', approvedLabel: 'Đã duyệt', rejectedLabel: 'Từ chối',
    typeTable: 'Phân loại báo cáo sự cố & Hiệu suất kiểm duyệt theo loại',
    sevTable: 'Phân bổ mức độ nghiêm trọng (Severity)',
    lifecycleTable: 'Trạng thái vòng đời sự cố (Lifecycle Overview)',
    votesTable: 'Xác minh cộng đồng (Community Verification Votes)',
    iotTable: 'Trạng thái trạm đo mực nước tự động (IoT Stations)',
    waterTable: 'Lịch sử đỉnh mực nước (10 ngày gần nhất)',
    typeCol: 'Loại sự cố', sevCol: 'Mức độ', maxMm: 'Đỉnh cao nhất (mm)', avgMm: 'Trung bình (mm)', statusCol: 'Trạng thái',
    apprRateCol: 'Duyệt (%)', voteTypeCol: 'Loại xác minh cộng đồng', voteCountCol: 'Số lượt bình chọn',
    s3: 'PHẦN 3: PHÂN PHỐI HOÀN THÀNH CỨU HỘ & TÀI CHÍNH',
    totalSess: 'Tổng phiên cứu hộ', completed: 'Hoàn thành', compRate: 'Tỉ lệ thành công', estRevenue: 'Tổng doanh thu dịch vụ',
    sessionStatus: 'Phân bổ theo trạng thái phiên cứu hộ',
    sessionType: 'Phân bổ theo loại khẩn cấp & Hiệu suất giải cứu',
    dispatchTable: 'Phân bổ lực lượng điều phối cứu hộ (Dispatch Breakdown)',
    execTable: 'Chỉ số chất lượng & Tài chính cứu hộ (Execution & Financial Metrics)',
    topWS: 'Top 5 Workshop xử lý cứu hộ xuất sắc nhất',
    dailySess: 'Số phiên cứu hộ theo ngày (10 ngày gần nhất)',
    wsCol: 'Workshop xử lý', sessCol: 'Số phiên', rankCol: '#', compCountCol: 'Hoàn thành',
    metricCol: 'Chỉ số đánh giá', valueCol: 'Giá trị / Tỉ lệ',
    noData: '(Không có dữ liệu trong kỳ báo cáo này)',
    page: 'Trang', of: '/',
  },
  en: {
    reportTitle: 'SYSTEM ANALYTICS REPORT',
    systemName:  'Smart Flood Traffic Rescue',
    subtitle:    'Intelligent Flood Warning & Rescue Coordination Platform',
    period: 'Report Period', by: 'Exported By', at: 'Generated At', role: 'Role',
    confidential: 'INTERNAL DOCUMENT — DO NOT DISTRIBUTE EXTERNALLY',
    sections: 'Report Sections',
    s1: 'SECTION 1: SYSTEM USER OVERVIEW',
    totalUsers: 'Total Users', newUsers: 'New Users', activeUsers: 'Active Accounts', verifiedUsers: 'Verified (KYC)',
    s1_detail: 'Detailed Analysis',
    roleLabel: 'System Role', statusLabel: 'Account Status', districtLabel: 'District / Area', countLabel: 'Count', pctLabel: 'Share (%)', dateLabel: 'Date',
    newCountLabel: 'New Users',
    roleTable: 'User Distribution by System Role',
    statusTable: 'Account Status Breakdown',
    districtTable: 'Top 10 Districts by User Concentration',
    contribTable: 'Top 5 Most Active Contributors (Gamification Leaderboard)',
    nameCol: 'Full Name', pointsCol: 'Total Points', monthlyCol: 'Monthly Points',
    growthTable: 'Daily New User Growth (Last 10 Days)',
    s2: 'SECTION 2: FLOOD HISTORY & INCIDENT REPORTS',
    totalReports: 'Total Incidents', approvalRate: 'Overall Approval', aiApproved: 'AI Auto-Approved', avgConfidence: 'Avg AI Confidence',
    pendingLabel: 'Pending Review', approvedLabel: 'Approved', rejectedLabel: 'Rejected',
    typeTable: 'Incident Reports by Type & Specific Approval Performance',
    sevTable: 'Severity Distribution Breakdown',
    lifecycleTable: 'Incident Lifecycle Overview',
    votesTable: 'Community Verification Votes Statistics',
    iotTable: 'IoT Water Level Stations Status',
    waterTable: 'Peak Water Level History (Last 10 Days)',
    typeCol: 'Incident Type', sevCol: 'Severity Level', maxMm: 'Peak Max (mm)', avgMm: 'Average (mm)', statusCol: 'Status',
    apprRateCol: 'Approval %', voteTypeCol: 'Community Vote Category', voteCountCol: 'Votes Count',
    s3: 'SECTION 3: RESCUE FULFILLMENT & FINANCIAL DISTRIBUTION',
    totalSess: 'Total Sessions', completed: 'Completed', compRate: 'Success Rate', estRevenue: 'Est. Service Revenue',
    sessionStatus: 'Rescue Sessions Status Breakdown',
    sessionType: 'Emergency Type Distribution & Success Rates',
    dispatchTable: 'Rescue Force Dispatch & Assignment Breakdown',
    execTable: 'Execution Quality & Financial Metrics Overview',
    topWS: 'Top 5 Performing Workshops by Rescue Volume',
    dailySess: 'Daily Rescue Sessions (Last 10 Days)',
    wsCol: 'Workshop Name', sessCol: 'Sessions', rankCol: '#', compCountCol: 'Completed',
    metricCol: 'Evaluation Metric', valueCol: 'Measured Value / Rate',
    noData: '(No data available for the selected period)',
    page: 'Page', of: '/',
  },
};

/* ════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════ */
function fmtDate(d, lang) {
  const dt = new Date(d);
  if (lang === 'vi') return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d, lang) {
  const dt = new Date(d);
  if (lang === 'vi') return dt.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function pct(value, total) {
  if (!total || total === 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/* Smart page break — adds page ONLY when content gets too close to bottom margin */
function ensureNewPage(doc) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 45) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

/* ════════════════════════════════════════════════
   MAIN EXPORT
   ════════════════════════════════════════════════ */
exports.generatePdfBuffer = ({ reportData, exporterInfo, lang = 'vi' }) => {
  return new Promise((resolve, reject) => {
    try {
      const L     = LABELS[lang] || LABELS.en;
      const fontR = resolveFont('Regular');
      const fontB = resolveFont('Bold');
      const FONT  = fontR ? 'Body' : 'Helvetica';
      const BOLD  = fontB ? 'Bold' : 'Helvetica-Bold';

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 48, bottom: 50, left: 48, right: 48 },
        bufferPages: true,
        autoFirstPage: false,
        info: { Title: L.reportTitle, Author: exporterInfo.name, Subject: L.systemName, Creator: 'SFTR Admin Analytics v4' },
      });

      if (fontR) doc.registerFont('Body', fontR);
      if (fontB) doc.registerFont('Bold', fontB);

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { overview, floodHistory, rescueFulfillment, metadata } = reportData;

      /* ── Cover ── */
      doc.addPage();
      drawCover(doc, L, metadata, exporterInfo, lang, FONT, BOLD);

      /* ── Sections ── */
      if (overview)          { doc.addPage(); doc.y = doc.page.margins.top; drawSection1(doc, L, overview,          lang, FONT, BOLD); }
      if (floodHistory)      { doc.addPage(); doc.y = doc.page.margins.top; drawSection2(doc, L, floodHistory,      lang, FONT, BOLD); }
      if (rescueFulfillment) { doc.addPage(); doc.y = doc.page.margins.top; drawSection3(doc, L, rescueFulfillment, lang, FONT, BOLD); }

      /* ── Page footers (THE DEFINITIVE FIX: doc.page.margins.bottom = 0 before drawing) ── */
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.page.margins.bottom = 0;    // ← Prevents pdfkit continueOnNewPage check inside drawFooter
        doc.y = doc.page.margins.top;   // ← Reset cursor to top safe zone
        drawFooter(doc, L, i + 1, range.count, FONT, BOLD);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/* ════════════════════════════════════════════════
   COMPONENT: Logo
   ════════════════════════════════════════════════ */
function drawLogo(doc, x, y, size) {
  const logoExists = fs.existsSync(LOGO_PATH);
  if (logoExists) {
    try {
      doc.image(LOGO_PATH, x, y, { width: size, height: size });
      return;
    } catch (_) {}
  }
  doc.circle(x + size / 2, y + size / 2, size / 2).fillAndStroke(C.navy, C.accent);
  doc.font('Helvetica-Bold').fontSize(size * 0.28).fillColor('#FFFFFF')
    .text('SFTR', x, y + size / 2 - size * 0.15, { width: size, align: 'center', lineBreak: false });
}

/* ════════════════════════════════════════════════
   COMPONENT: Section banner
   ════════════════════════════════════════════════ */
function drawBanner(doc, text, FONT, BOLD) {
  const W  = doc.page.width;
  const ml = doc.page.margins.left;
  const mr = doc.page.margins.right;
  const bW = W - ml - mr;
  const y  = doc.page.margins.top;

  doc.rect(ml, y, bW, 32).fill(C.navy);
  doc.rect(ml, y, 4,  32).fill(C.accent);
  doc.font(BOLD).fontSize(10.5).fillColor(C.white)
    .text(text, ml + 14, y + 10, { width: bW - 70, lineBreak: false });
  drawLogo(doc, W - mr - 38, y - 4, 40);

  doc.y = y + 44;
}

/* ════════════════════════════════════════════════
   COMPONENT: Page footer
   ════════════════════════════════════════════════ */
function drawFooter(doc, L, pageNum, total, FONT, BOLD) {
  const W  = doc.page.width;
  const H  = doc.page.height;
  const ml = 48;
  const mr = 48;

  doc.rect(0, H - 5, W, 5).fill(C.accent);
  doc.moveTo(ml, H - 28).lineTo(W - mr, H - 28).strokeColor(C.border).lineWidth(0.5).stroke();

  doc.font(FONT).fontSize(7).fillColor(C.muted)
    .text('SFTR · Smart Flood Traffic Rescue System · Confidential & Internal Document', ml, H - 20, { lineBreak: false });
  doc.font(BOLD).fontSize(7.5).fillColor(C.textSec)
    .text(`${L.page} ${pageNum} ${L.of} ${total}`, 0, H - 20,
      { align: 'right', width: W - mr, lineBreak: false });
}

/* ════════════════════════════════════════════════
   COMPONENT: Cover page
   ════════════════════════════════════════════════ */
function drawCover(doc, L, metadata, exporterInfo, lang, FONT, BOLD) {
  const W  = doc.page.width;
  const H  = doc.page.height;
  const ml = doc.page.margins.left;
  const mr = doc.page.margins.right;

  doc.rect(0, 0, W, 170).fill(C.navy);
  doc.rect(0, 0, W, 5).fill(C.accent);

  drawLogo(doc, W - mr - 64, 18, 60);

  doc.font(FONT).fontSize(9.5).fillColor(C.accent)
    .text(L.systemName.toUpperCase(), ml, 28, { characterSpacing: 1.2, lineBreak: false });
  doc.font(FONT).fontSize(8).fillColor('#94A3B8')
    .text(L.subtitle, ml, 42, { width: W - mr - 80, lineBreak: false });
  doc.font(BOLD).fontSize(26).fillColor(C.white)
    .text(L.reportTitle, ml, 72, { width: W - mr - 80, lineGap: 6 });
  doc.rect(ml, 140, 80, 4).fill(C.accent);
  doc.rect(ml + 84, 140, 40, 4).fill(C.teal);
  doc.rect(ml + 128, 140, 20, 4).fill(C.orange);

  doc.rect(0, 170, W, H - 170).fill(C.white);

  let metaY = 192;
  const items = [
    { label: L.period, value: `${fmtDate(metadata.dateFrom, lang)}  →  ${fmtDate(metadata.dateTo, lang)}` },
    { label: L.by,     value: exporterInfo.name },
    { label: L.role,   value: exporterInfo.role },
    { label: L.at,     value: fmtDateTime(metadata.generatedAt, lang) },
  ];
  items.forEach(item => {
    doc.rect(ml, metaY, 130, 15).fill(C.offWhite);
    doc.font(BOLD).fontSize(7).fillColor(C.muted)
      .text(item.label.toUpperCase(), ml + 6, metaY + 4, { lineBreak: false });
    doc.font(FONT).fontSize(11).fillColor(C.text)
      .text(item.value, ml, metaY + 18, { lineBreak: false });
    doc.moveTo(ml, metaY + 33).lineTo(W - mr, metaY + 33)
      .strokeColor(C.border).lineWidth(0.4).stroke();
    metaY += 40;
  });

  metaY += 12;
  doc.font(BOLD).fontSize(8).fillColor(C.navy)
    .text(L.sections.toUpperCase(), ml, metaY, { characterSpacing: 0.5, lineBreak: false });
  metaY += 18;

  const sectionDefs = [
    { key: 'overview',            color: C.accent,  vi: 'Phần 1 — Tổng quan người dùng & Chỉ số phân bổ KYC',     en: 'Section 1 — System User Overview & KYC Statistics' },
    { key: 'flood_history',       color: C.orange,  vi: 'Phần 2 — Lịch sử lũ lụt, AI Moderation & Xác minh sự cố', en: 'Section 2 — Flood History, AI Moderation & Verification' },
    { key: 'rescue_distribution', color: C.teal,    vi: 'Phần 3 — Phân phối cứu hộ, Điều phối & Tài chính dịch vụ', en: 'Section 3 — Rescue Fulfillment, Dispatch & Financials' },
  ];
  metadata.sections.forEach(sec => {
    const def = sectionDefs.find(d => d.key === sec);
    if (!def) return;
    doc.rect(ml, metaY, 4, 18).fill(def.color);
    doc.font(FONT).fontSize(10.5).fillColor(C.text)
      .text(lang === 'vi' ? def.vi : def.en, ml + 12, metaY + 3, { lineBreak: false });
    metaY += 26;
  });

  metaY += 18;
  doc.rect(ml, metaY, W - ml - mr, 24).fill(C.offWhite);
  doc.rect(ml, metaY, 3, 24).fill(C.red);
  doc.font(BOLD).fontSize(7.5).fillColor(C.red)
    .text(L.confidential, ml + 10, metaY + 8, { lineBreak: false });
}

/* ════════════════════════════════════════════════
   COMPONENT: Sub-section title bar
   ════════════════════════════════════════════════ */
function subTitle(doc, text, BOLD) {
  ensureNewPage(doc);
  const ml  = doc.page.margins.left;
  const usW = doc.page.width - ml - doc.page.margins.right;
  doc.y += 6;
  doc.rect(ml, doc.y, usW, 20).fill(C.offWhite);
  doc.rect(ml, doc.y, 3,   20).fill(C.accent);
  doc.font(BOLD).fontSize(8.2).fillColor(C.navy)
    .text(text, ml + 10, doc.y + 6, { width: usW - 14, lineBreak: false });
  doc.y += 26;
}

/* ════════════════════════════════════════════════
   COMPONENT: KPI card row
   ════════════════════════════════════════════════ */
function kpiRow(doc, cards, FONT, BOLD) {
  ensureNewPage(doc);
  const ml  = doc.page.margins.left;
  const usW = doc.page.width - ml - doc.page.margins.right;
  const n   = cards.length;
  const gap = 10;
  const cW  = Math.floor((usW - gap * (n - 1)) / n);
  const y   = doc.y;

  cards.forEach((card, i) => {
    const x = ml + i * (cW + gap);
    doc.rect(x, y, cW, 56).fill(C.white).stroke(C.border);
    doc.rect(x, y, cW, 4).fill(card.color || C.accent);
    doc.font(BOLD).fontSize(7).fillColor(C.muted)
      .text(card.label, x + 8, y + 10, { width: cW - 14, lineBreak: false, ellipsis: true });
    doc.font(BOLD).fontSize(card.valueFontSize || 19).fillColor(C.navy)
      .text(String(card.value), x + 8, y + 22, { width: cW - 14, lineBreak: false });
    if (card.sub) {
      doc.font(FONT).fontSize(7.2).fillColor(C.muted)
        .text(card.sub, x + 8, y + 44, { width: cW - 14, lineBreak: false, ellipsis: true });
    }
  });

  doc.y = y + 66;
}

/* ════════════════════════════════════════════════
   COMPONENT: Data table (with auto page-break)
   ════════════════════════════════════════════════ */
function table(doc, headers, rows, colWidths, FONT, BOLD) {
  const ml     = doc.page.margins.left;
  const rowH   = 19;
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 25;

  if (doc.y + rowH * 3 > bottomLimit) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }

  const drawHeaderRow = (yPos) => {
    doc.rect(ml, yPos, totalW, rowH).fill(C.navy);
    let cx = ml;
    headers.forEach((h, i) => {
      doc.font(BOLD).fontSize(7.5).fillColor(C.white)
        .text(h, cx + 5, yPos + 6, { width: colWidths[i] - 8, lineBreak: false, ellipsis: true });
      cx += colWidths[i];
    });
    return yPos + rowH;
  };

  let y = drawHeaderRow(doc.y);

  rows.forEach((row, ri) => {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeaderRow(y);
    }
    doc.rect(ml, y, totalW, rowH).fill(ri % 2 === 0 ? C.white : C.lightGray);
    doc.rect(ml, y, totalW, rowH).stroke(C.border).lineWidth(0.3);
    let cx = ml;
    row.forEach((cell, ci) => {
      doc.font(ci === 0 ? BOLD : FONT).fontSize(8.2)
        .fillColor(ci === 0 ? C.text : C.textSec)
        .text(String(cell ?? '—'), cx + 5, y + 6,
          { width: colWidths[ci] - 8, lineBreak: false, ellipsis: true });
      cx += colWidths[ci];
    });
    y += rowH;
  });

  doc.y = y + 10;
}

function noData(doc, L, FONT) {
  doc.font(FONT).fontSize(8.5).fillColor(C.muted)
    .text(L.noData, { align: 'center', lineBreak: false });
  doc.y += 14;
}

/* ════════════════════════════════════════════════
   COMPONENT: Vector Horizontal Bar Chart
   ════════════════════════════════════════════════ */
function drawBarChart(doc, title, items, FONT, BOLD, lang) {
  ensureNewPage(doc);
  const ml  = doc.page.margins.left;
  const usW = doc.page.width - ml - doc.page.margins.right;
  const totalItems = items.length || 1;
  const chartHeight = 28 + totalItems * 22 + 10;

  if (doc.y + chartHeight > doc.page.height - doc.page.margins.bottom - 25) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }

  const y = doc.y;

  // Outer container box
  doc.rect(ml, y, usW, chartHeight).fill(C.white).stroke(C.border);
  
  // Title bar
  doc.rect(ml, y, usW, 24).fill(C.navy);
  doc.font(BOLD).fontSize(8.2).fillColor(C.white)
    .text(`📊  ${title}`, ml + 10, y + 7, { width: usW - 20, lineBreak: false });

  let cy = y + 32;
  const maxVal = Math.max(...items.map(i => i.value || 0), 1);
  const labelWidth = 140;
  const valWidth = 85;
  const barMaxWidth = usW - labelWidth - valWidth - 28;

  const colors = [C.accent, C.teal, C.orange, C.blue, C.purple, '#F43F5E', '#10B981', '#F59E0B'];

  items.forEach((item, idx) => {
    const barW = Math.max(Math.round(((item.value || 0) / maxVal) * barMaxWidth), 4);
    const barColor = item.color || colors[idx % colors.length];

    // Label on left
    doc.font(BOLD).fontSize(7.5).fillColor(C.text)
      .text(item.label, ml + 10, cy + 2, { width: labelWidth - 6, lineBreak: false, ellipsis: true });

    // Track background
    doc.rect(ml + labelWidth + 4, cy, barMaxWidth, 12).fill(C.lightGray);
    // Bar fill
    doc.rect(ml + labelWidth + 4, cy, barW, 12).fill(barColor);

    // Value text on right
    doc.font(BOLD).fontSize(7.5).fillColor(C.navy)
      .text(`${item.value.toLocaleString()} (${item.pct || '0%'})`, ml + labelWidth + barMaxWidth + 10, cy + 2, { width: valWidth, lineBreak: false });

    cy += 22;
  });

  doc.y = y + chartHeight + 14;
}

/* ════════════════════════════════════════════════
   SECTION 1 — USER OVERVIEW & KYC STATISTICS
   ════════════════════════════════════════════════ */
function drawSection1(doc, L, d, lang, FONT, BOLD) {
  drawBanner(doc, L.s1, FONT, BOLD);
  const ml  = doc.page.margins.left;
  const usW = doc.page.width - ml - doc.page.margins.right;
  const total = d.totalUsers || 1;

  const activeCount   = (d.statusDistribution.find(s => s.status === 'Active')   || {}).count || 0;
  const verifiedCount = d.verifiedUsersCount || 0;

  kpiRow(doc, [
    { label: L.totalUsers,    value: d.totalUsers.toLocaleString(),      color: C.accent, sub: lang === 'vi' ? 'Toàn bộ hệ thống' : 'Total registered' },
    { label: L.newUsers,      value: d.newUsersInRange.toLocaleString(), color: C.teal,   sub: `${pct(d.newUsersInRange, total)} ${lang === 'vi' ? 'tổng số' : 'of total'}` },
    { label: L.activeUsers,   value: activeCount.toLocaleString(),       color: C.blue,   sub: `${pct(activeCount, total)} ${lang === 'vi' ? 'hoạt động' : 'active rate'}` },
    { label: L.verifiedUsers, value: verifiedCount.toLocaleString(),     color: C.purple, sub: `${pct(verifiedCount, total)} ${lang === 'vi' ? 'đã xác thực' : 'KYC verified'}` },
  ], FONT, BOLD);

  // Role distribution visual chart
  if (d.roleDistribution && d.roleDistribution.length > 0) {
    const roleItems = d.roleDistribution.map(r => ({
      label: r.role,
      value: r.count,
      pct: pct(r.count, total)
    }));
    drawBarChart(doc, lang === 'vi' ? 'Biểu đồ Phân bổ Vai trò Người dùng (User Role Breakdown)' : 'User Role Distribution Chart', roleItems, FONT, BOLD, lang);
  }

  // Role distribution
  subTitle(doc, L.roleTable, BOLD);
  const roleRows = d.roleDistribution.map(r => [r.role, r.count.toLocaleString(), pct(r.count, total)]);
  if (roleRows.length) table(doc, [L.roleLabel, L.countLabel, L.pctLabel], roleRows, [usW - 170, 85, 85], FONT, BOLD);
  else noData(doc, L, FONT);

  // Status distribution
  subTitle(doc, L.statusTable, BOLD);
  const statusRows = d.statusDistribution.map(s => [s.status, s.count.toLocaleString(), pct(s.count, total)]);
  if (statusRows.length) table(doc, [L.statusLabel, L.countLabel, L.pctLabel], statusRows, [usW - 170, 85, 85], FONT, BOLD);
  else noData(doc, L, FONT);

  // Top contributors leaderboard (Gamification)
  if (d.topContributors && d.topContributors.length > 0) {
    subTitle(doc, L.contribTable, BOLD);
    const contribRows = d.topContributors.map((u, i) => [
      `${i + 1}.`, u.name, u.role, `${u.points.toLocaleString()} pts`, `${u.monthly.toLocaleString()} pts`
    ]);
    table(doc, [L.rankCol || '#', L.nameCol, L.roleLabel, L.pointsCol, L.monthlyCol], contribRows, [28, usW - 278, 90, 80, 80], FONT, BOLD);
  }

  // Top districts
  subTitle(doc, L.districtTable, BOLD);
  const distRows = d.districtDistribution.slice(0, 10).map((d, i) => [
    `${i + 1}.`, d.district, d.count.toLocaleString(), pct(d.count, total)
  ]);
  if (distRows.length) table(doc, [L.rankCol || '#', L.districtLabel, L.countLabel, L.pctLabel], distRows, [28, usW - 198, 85, 85], FONT, BOLD);
  else noData(doc, L, FONT);

  // Daily growth
  if (d.growthByDay && d.growthByDay.length > 0) {
    subTitle(doc, L.growthTable, BOLD);
    const last10 = d.growthByDay.slice(-10).map(g => [g.date, g.count.toLocaleString()]);
    table(doc, [L.dateLabel, L.newCountLabel], last10, [usW - 100, 100], FONT, BOLD);
  }
}

/* ════════════════════════════════════════════════
   SECTION 2 — FLOOD HISTORY & INCIDENT PERFORMANCE
   ════════════════════════════════════════════════ */
function drawSection2(doc, L, d, lang, FONT, BOLD) {
  drawBanner(doc, L.s2, FONT, BOLD);
  const ml   = doc.page.margins.left;
  const usW  = doc.page.width - ml - doc.page.margins.right;
  const rTotal  = d.totalReports || 1;
  const aiAppr  = d.aiStats?.aiApprovedCount || 0;
  const aiConf  = d.aiStats?.avgConfidencePct || 0;

  kpiRow(doc, [
    { label: L.totalReports,  value: d.totalReports.toLocaleString(), color: C.orange, sub: lang === 'vi' ? 'Tổng sự cố ghi nhận' : 'Total recorded' },
    { label: L.approvalRate,  value: `${d.approvalRate}%`,            color: C.teal,   sub: lang === 'vi' ? 'Tỉ lệ được duyệt' : 'Approved overall' },
    { label: L.aiApproved,    value: aiAppr.toLocaleString(),         color: C.blue,   sub: `${pct(aiAppr, rTotal)} ${lang === 'vi' ? 'tự động' : 'auto-approved'}` },
    { label: L.avgConfidence, value: `${aiConf}%`,                    color: C.purple, sub: lang === 'vi' ? 'Độ chính xác AI' : 'AI precision score' },
  ], FONT, BOLD);

  // Reports by type visual chart
  if (d.reportsByType && d.reportsByType.length > 0) {
    const typeItems = d.reportsByType.map(r => ({
      label: r.type.toUpperCase(),
      value: r.count,
      pct: pct(r.count, rTotal)
    }));
    drawBarChart(doc, lang === 'vi' ? 'Biểu đồ Phân bổ Sự cố theo Chủ đề (Incident Reports by Type)' : 'Incident Reports by Category Chart', typeItems, FONT, BOLD, lang);
  }

  // Reports by type with approval performance column
  subTitle(doc, L.typeTable, BOLD);
  const typeRows = d.reportsByType.map(r => [
    r.type.toUpperCase(), r.count.toLocaleString(), pct(r.count, rTotal), `${r.typeApprovalRate || 0}%`
  ]);
  if (typeRows.length) table(doc, [L.typeCol, L.countLabel, L.pctLabel, L.apprRateCol], typeRows, [usW - 250, 85, 85, 80], FONT, BOLD);
  else noData(doc, L, FONT);

  // Severity distribution
  subTitle(doc, L.sevTable, BOLD);
  const sevRows = d.reportsBySeverity.map(s => [s.severity, s.count.toLocaleString(), pct(s.count, rTotal)]);
  if (sevRows.length) table(doc, [L.sevCol, L.countLabel, L.pctLabel], sevRows, [usW - 170, 85, 85], FONT, BOLD);
  else noData(doc, L, FONT);

  // Lifecycle status
  subTitle(doc, L.lifecycleTable, BOLD);
  const lifeRows = d.reportsByLifecycle.map(l => [l.status, l.count.toLocaleString(), pct(l.count, rTotal)]);
  if (lifeRows.length) table(doc, [L.statusCol, L.countLabel, L.pctLabel], lifeRows, [usW - 170, 85, 85], FONT, BOLD);
  else noData(doc, L, FONT);

  // Community verification votes
  if (d.communityVotes && d.communityVotes.totalVotes > 0) {
    subTitle(doc, L.votesTable, BOLD);
    const voteRows = [
      [lang === 'vi' ? 'Xác nhận sự cố vẫn còn (Confirm Active)' : 'Confirmed Still Active', d.communityVotes.confirmCount.toLocaleString(), pct(d.communityVotes.confirmCount, d.communityVotes.totalVotes)],
      [lang === 'vi' ? 'Báo cáo đã hết sự cố (Deny / No More)' : 'Reported Resolved / Clear', d.communityVotes.denyCount.toLocaleString(), pct(d.communityVotes.denyCount, d.communityVotes.totalVotes)],
      [lang === 'vi' ? 'Báo cáo sai / Giả mạo (False Report)' : 'Reported as False / Fake', d.communityVotes.falseCount.toLocaleString(), pct(d.communityVotes.falseCount, d.communityVotes.totalVotes)],
    ];
    table(doc, [L.voteTypeCol, L.voteCountCol, L.pctLabel], voteRows, [usW - 170, 85, 85], FONT, BOLD);
  }

  // IoT status overview
  subTitle(doc, L.iotTable, BOLD);
  const iotRows = d.iotStatus.map(i => [i.status, i.count.toLocaleString()]);
  if (iotRows.length) table(doc, [L.statusCol, L.countLabel], iotRows, [usW - 100, 100], FONT, BOLD);
  else noData(doc, L, FONT);

  // Water level history
  if (d.waterLevelPeak.length > 0) {
    subTitle(doc, L.waterTable, BOLD);
    const wRows = d.waterLevelPeak.slice(-10).map(w => [w.date, `${w.maxMm} mm`, `${w.avgMm} mm`]);
    table(doc, [L.dateLabel, L.maxMm, L.avgMm], wRows, [usW - 180, 90, 90], FONT, BOLD);
  }
}

/* ════════════════════════════════════════════════
   SECTION 3 — RESCUE FULFILLMENT & FINANCIALS
   ════════════════════════════════════════════════ */
function drawSection3(doc, L, d, lang, FONT, BOLD) {
  drawBanner(doc, L.s3, FONT, BOLD);
  const ml   = doc.page.margins.left;
  const usW  = doc.page.width - ml - doc.page.margins.right;
  const sTotal = d.totalSessions || 1;
  const revStr = d.executionStats?.totalEstimatedRevenue ? `${(d.executionStats.totalEstimatedRevenue / 1000).toFixed(0)}k VND` : '0 VND';

  kpiRow(doc, [
    { label: L.totalSess,  value: d.totalSessions.toLocaleString(),  color: C.accent, sub: lang === 'vi' ? 'Tổng yêu cầu cứu hộ' : 'Total rescue requests' },
    { label: L.completed,  value: d.completedCount.toLocaleString(), color: C.teal,   sub: `${pct(d.completedCount, sTotal)} ${lang === 'vi' ? 'hoàn thành' : 'share'}` },
    { label: L.compRate,   value: `${d.completionRate}%`,            color: C.blue,   sub: lang === 'vi' ? 'Tỉ lệ thành công' : 'Success rate' },
    { label: L.estRevenue, value: revStr,                            color: C.purple, sub: lang === 'vi' ? 'Định giá dịch vụ' : 'Est. service base price', valueFontSize: 16 },
  ], FONT, BOLD);

  // Sessions by emergency type visual chart
  if (d.sessionsByEmergencyType && d.sessionsByEmergencyType.length > 0) {
    const emItems = d.sessionsByEmergencyType.map(e => ({
      label: e.type,
      value: e.count,
      pct: pct(e.count, sTotal)
    }));
    drawBarChart(doc, lang === 'vi' ? 'Biểu đồ Phân bổ Phiên Cứu hộ theo Tình huống (Emergency Type Breakdown)' : 'Rescue Sessions by Emergency Type Chart', emItems, FONT, BOLD, lang);
  }

  // Session status breakdown
  subTitle(doc, L.sessionStatus, BOLD);
  const statRows = d.sessionsByStatus.map(s => [s.status, s.count.toLocaleString(), pct(s.count, sTotal)]);
  if (statRows.length) table(doc, [L.statusCol, L.sessCol, L.pctLabel], statRows, [usW - 170, 85, 85], FONT, BOLD);
  else noData(doc, L, FONT);

  // Emergency type & completion rate
  subTitle(doc, L.sessionType, BOLD);
  const typeRows = d.sessionsByEmergencyType.map(e => [
    e.type, e.count.toLocaleString(), pct(e.count, sTotal), `${e.typeCompletionRate || 0}%`
  ]);
  if (typeRows.length) table(doc, [L.typeCol, L.sessCol, L.pctLabel, L.compRate], typeRows, [usW - 250, 85, 85, 80], FONT, BOLD);
  else noData(doc, L, FONT);

  // Dispatch breakdown
  if (d.dispatchBreakdown) {
    subTitle(doc, L.dispatchTable, BOLD);
    const dispRows = [
      [lang === 'vi' ? 'Điều phối cho tình nguyện viên (Volunteers Assigned)' : 'Assigned to Community Volunteers', d.dispatchBreakdown.volunteerCount.toLocaleString(), pct(d.dispatchBreakdown.volunteerCount, sTotal)],
      [lang === 'vi' ? 'Điều phối cho nhân viên Workshop (Staff Assigned)' : 'Assigned to Professional Workshop Staff', d.dispatchBreakdown.staffCount.toLocaleString(), pct(d.dispatchBreakdown.staffCount, sTotal)],
      [lang === 'vi' ? 'Chưa chỉ định / Xử lý trực tiếp (Unassigned / Direct)' : 'Unassigned / Direct Emergency Response', d.dispatchBreakdown.unassignedCount.toLocaleString(), pct(d.dispatchBreakdown.unassignedCount, sTotal)],
    ];
    table(doc, [L.metricCol, L.sessCol, L.pctLabel], dispRows, [usW - 170, 85, 85], FONT, BOLD);
  }

  // Execution & Financial metrics
  if (d.executionStats) {
    subTitle(doc, L.execTable, BOLD);
    const execRows = [
      [lang === 'vi' ? 'Số phiên đã kiểm tra an toàn nạn nhân (Safety Check-in Verified)' : 'Victim Safety Check-in Verified Sessions', `${d.executionStats.safeCheckedInCount.toLocaleString()} (${d.executionStats.safeCheckInRate}%)`],
      [lang === 'vi' ? 'Số phiên đã thanh toán phí dịch vụ (Paid Rescue Sessions)' : 'Paid Rescue Sessions (Base Price Executed)', `${d.executionStats.paidCount.toLocaleString()} (${d.executionStats.paidRate}%)`],
      [lang === 'vi' ? 'Tổng định giá dịch vụ ước tính (Estimated Base Price Volume)' : 'Total Estimated Base Service Price Volume', `${d.executionStats.totalEstimatedRevenue.toLocaleString()} VND`],
    ];
    table(doc, [L.metricCol, L.valueCol], execRows, [usW - 160, 160], FONT, BOLD);
  }

  // Top workshops
  subTitle(doc, L.topWS, BOLD);
  if (d.topWorkshops.length) {
    const wsRows = d.topWorkshops.map((w, i) => [
      `${i + 1}.`, w.name, w.count.toLocaleString(), w.completedCount.toLocaleString(), `${w.completionRate}%`
    ]);
    table(doc, [L.rankCol, L.wsCol, L.sessCol, L.compCountCol, L.compRate], wsRows, [28, usW - 278, 85, 85, 80], FONT, BOLD);
  } else noData(doc, L, FONT);

  // Daily sessions
  if (d.sessionsByDate && d.sessionsByDate.length > 0) {
    subTitle(doc, L.dailySess, BOLD);
    const dayRows = d.sessionsByDate.slice(-10).map(d => [d.date, d.count.toLocaleString()]);
    table(doc, [L.dateLabel, L.sessCol], dayRows, [usW - 100, 100], FONT, BOLD);
  }
}
