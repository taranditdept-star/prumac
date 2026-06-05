/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

interface InvoiceData {
  invoice_number: string;
  status: string;
  period_start: string;
  period_end: string;
  issued_at: string | null;
  due_at: string | null;
  currency: string;
  subtotal: number;
  maintenance_credit: number;
  previous_balance: number;
  total_due: number;
  amount_paid: number;
  balance_outstanding: number;
  notes: string | null;
  subsidiary: { name: string; code: string; country: string } | null;
  lines: {
    line_type: string;
    description: string;
    quantity: number;
    unit_amount: number;
    line_amount: number;
  }[];
}

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#0f172a",
  },
  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
    borderBottom: 2,
    borderBottomColor: "#ff5a1f",
    paddingBottom: 18,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  brandTile: {
    width: 28,
    height: 28,
    backgroundColor: "#ff5a1f",
    borderRadius: 6,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTileText: { color: "white", fontSize: 16, fontFamily: "Helvetica-Bold" },
  brandName: { fontFamily: "Helvetica-Bold", fontSize: 14, color: "#0f172a" },
  brandSub: { fontSize: 8, color: "#64748b", marginTop: 2, letterSpacing: 1.5 },
  invoiceHead: { alignItems: "flex-end" },
  invoiceTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    color: "#0f172a",
    letterSpacing: 4,
  },
  invoiceNumber: {
    fontSize: 10,
    color: "#ff5a1f",
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
  },
  // Bill-to / period
  twoCol: { flexDirection: "row", marginBottom: 28, gap: 24 },
  col: { flex: 1 },
  colLabel: {
    fontSize: 7,
    color: "#94a3b8",
    letterSpacing: 1.4,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  colValue: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#0f172a" },
  colSubvalue: { fontSize: 9, color: "#64748b", marginTop: 2 },
  // Section header
  sectionHeader: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginTop: 10,
    marginBottom: 8,
    fontSize: 8,
    color: "#475569",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  // Table
  tableHeader: {
    flexDirection: "row",
    borderBottom: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 6,
    marginBottom: 4,
  },
  th: { fontSize: 8, color: "#64748b", fontFamily: "Helvetica-Bold", letterSpacing: 1, textTransform: "uppercase" },
  thDesc: { flex: 4 },
  thQty: { flex: 1.2, textAlign: "right" },
  thRate: { flex: 1.4, textAlign: "right" },
  thAmount: { flex: 1.6, textAlign: "right" },
  row: { flexDirection: "row", paddingVertical: 6, borderBottom: 0.5, borderBottomColor: "#e2e8f0" },
  cell: { fontSize: 9, color: "#1e293b" },
  cellDesc: { flex: 4 },
  cellQty: { flex: 1.2, textAlign: "right" },
  cellRate: { flex: 1.4, textAlign: "right" },
  cellAmount: { flex: 1.6, textAlign: "right", fontFamily: "Helvetica-Bold" },
  credit: { color: "#10b981" },
  // Totals
  totals: { marginTop: 18, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 9, color: "#475569" },
  totalValue: { fontSize: 9, color: "#0f172a", fontFamily: "Helvetica-Bold" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTop: 1,
    borderTopColor: "#0f172a",
  },
  grandLabel: { fontSize: 11, color: "#0f172a", fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 13, color: "#0f172a", fontFamily: "Helvetica-Bold" },
  // Footer
  footer: {
    position: "absolute",
    bottom: 40,
    left: 48,
    right: 48,
    borderTop: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 8,
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
    letterSpacing: 1.2,
  },
});

function money(n: number, currency: string): string {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function InvoicePdf({ data }: { data: InvoiceData }) {
  const charges = data.lines.filter(
    (l) => l.line_type === "trip" || l.line_type === "fixed_fee",
  );
  const credits = data.lines.filter((l) => l.line_type === "maintenance_credit");
  const balances = data.lines.filter(
    (l) => l.line_type === "previous_balance" || l.line_type === "adjustment",
  );

  return (
    <Document
      title={data.invoice_number}
      author="PRUMAC Fleet"
      subject={`Invoice for ${data.subsidiary?.name ?? "subsidiary"}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.brand}>
            <View style={styles.brandTile}>
              <Text style={styles.brandTileText}>P</Text>
            </View>
            <View>
              <Text style={styles.brandName}>PRUMAC</Text>
              <Text style={styles.brandSub}>FLEET PLATFORM</Text>
            </View>
          </View>
          <View style={styles.invoiceHead}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoice_number}</Text>
          </View>
        </View>

        {/* Bill to / period */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Billed to</Text>
            <Text style={styles.colValue}>{data.subsidiary?.name ?? "—"}</Text>
            {data.subsidiary?.code && (
              <Text style={styles.colSubvalue}>{data.subsidiary.code}</Text>
            )}
            {data.subsidiary?.country && (
              <Text style={styles.colSubvalue}>{data.subsidiary.country}</Text>
            )}
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Billing period</Text>
            <Text style={styles.colValue}>{fmtMonth(data.period_start)}</Text>
            <Text style={styles.colSubvalue}>
              {fmtDate(data.period_start)} → {fmtDate(data.period_end)}
            </Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Issued / Due</Text>
            <Text style={styles.colValue}>{fmtDate(data.issued_at)}</Text>
            <Text style={styles.colSubvalue}>Due {fmtDate(data.due_at)}</Text>
          </View>
        </View>

        {/* Trip charges */}
        {charges.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Trip charges & monthly fees</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.thDesc]}>Description</Text>
              <Text style={[styles.th, styles.thQty]}>Qty</Text>
              <Text style={[styles.th, styles.thRate]}>Rate</Text>
              <Text style={[styles.th, styles.thAmount]}>Amount</Text>
            </View>
            {charges.map((l, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.cell, styles.cellDesc]}>{l.description}</Text>
                <Text style={[styles.cell, styles.cellQty]}>
                  {Number(l.quantity).toLocaleString()}
                </Text>
                <Text style={[styles.cell, styles.cellRate]}>
                  {Number(l.unit_amount).toFixed(4)}
                </Text>
                <Text style={[styles.cell, styles.cellAmount]}>
                  {money(Number(l.line_amount), data.currency)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Maintenance credits */}
        {credits.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Maintenance credits</Text>
            {credits.map((l, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.cell, styles.cellDesc]}>{l.description}</Text>
                <Text style={[styles.cell, styles.cellQty]}>1</Text>
                <Text style={[styles.cell, styles.cellRate]}>
                  {money(Math.abs(Number(l.unit_amount)), data.currency)}
                </Text>
                <Text style={[styles.cell, styles.cellAmount, styles.credit]}>
                  − {money(Math.abs(Number(l.line_amount)), data.currency)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Previous balance */}
        {balances.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Previous balance</Text>
            {balances.map((l, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.cell, styles.cellDesc]}>{l.description}</Text>
                <Text style={[styles.cell, styles.cellQty]}>1</Text>
                <Text style={[styles.cell, styles.cellRate]}>
                  {money(Number(l.unit_amount), data.currency)}
                </Text>
                <Text style={[styles.cell, styles.cellAmount]}>
                  {money(Number(l.line_amount), data.currency)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal (charges)</Text>
            <Text style={styles.totalValue}>{money(Number(data.subtotal), data.currency)}</Text>
          </View>
          {Number(data.maintenance_credit) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Less maintenance credit</Text>
              <Text style={[styles.totalValue, styles.credit]}>
                − {money(Number(data.maintenance_credit), data.currency)}
              </Text>
            </View>
          )}
          {Number(data.previous_balance) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Brought forward</Text>
              <Text style={styles.totalValue}>
                {money(Number(data.previous_balance), data.currency)}
              </Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandLabel}>Total due</Text>
            <Text style={styles.grandValue}>{money(Number(data.total_due), data.currency)}</Text>
          </View>
          {Number(data.amount_paid) > 0 && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Amount paid</Text>
                <Text style={[styles.totalValue, styles.credit]}>
                  {money(Number(data.amount_paid), data.currency)}
                </Text>
              </View>
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandLabel}>Outstanding</Text>
                <Text style={styles.grandValue}>
                  {money(Number(data.balance_outstanding), data.currency)}
                </Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.footer}>
          PRUMAC FLEET PLATFORM · {data.invoice_number} ·
          Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </Text>
      </Page>
    </Document>
  );
}
