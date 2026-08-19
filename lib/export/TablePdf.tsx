import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ExportColumn } from "./types";

/**
 * A generic table PDF, so every list in the system prints the same way. The
 * invoice keeps its own bespoke layout (lib/pdf/invoice.tsx) — that is a
 * document a customer receives, not a listing.
 */
const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 42, paddingHorizontal: 28, fontSize: 8, color: "#0f172a" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 },
  brand: { fontSize: 14, fontWeight: 700, letterSpacing: 1.4, color: "#0f172a" },
  sub: { fontSize: 8, color: "#64748b", marginTop: 2 },
  title: { fontSize: 11, fontWeight: 700, marginBottom: 8, color: "#0f172a" },
  rule: { height: 2, backgroundColor: "#f97316", marginBottom: 10 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 4 },
  th: {
    flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5,
    borderBottomWidth: 1, borderBottomColor: "#cbd5e1",
  },
  thText: { fontSize: 7, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  cell: { paddingHorizontal: 4 },
  foot: {
    position: "absolute", bottom: 20, left: 28, right: 28,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 7, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6,
  },
});

export function TablePdf<Row>({
  title,
  subtitle,
  columns,
  rows,
  orientation = "landscape",
  generatedAt,
  note,
}: {
  title: string;
  subtitle?: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
  orientation?: "portrait" | "landscape";
  generatedAt: string;
  /** Shown under the title — used when the PDF has been capped. */
  note?: string;
}) {
  // Share the width in proportion to each column's declared size.
  const total = columns.reduce((a, c) => a + (c.width ?? 14), 0);
  const flex = columns.map((c) => (c.width ?? 14) / total);

  return (
    <Document title={title}>
      <Page size="A4" orientation={orientation} style={s.page} wrap>
        <View style={s.head} fixed>
          <View>
            <Text style={s.brand}>PRUMAC CONNECT</Text>
            <Text style={s.sub}>Ensign Holdings · fleet management</Text>
          </View>
          <Text style={s.sub}>{generatedAt}</Text>
        </View>
        <View style={s.rule} fixed />

        <Text style={s.title}>
          {title}
          {subtitle ? ` — ${subtitle}` : ""} ({rows.length})
        </Text>

        {note && <Text style={{ fontSize: 8, color: "#b45309", marginBottom: 8 }}>{note}</Text>}

        <View style={s.th} fixed>
          {columns.map((c, i) => (
            <View key={c.header} style={[s.cell, { flexBasis: `${flex[i] * 100}%` }]}>
              <Text style={[s.thText, c.numeric ? { textAlign: "right" } : {}]}>{c.header}</Text>
            </View>
          ))}
        </View>

        {rows.map((row, r) => (
          <View key={r} style={s.tr} wrap={false}>
            {columns.map((c, i) => {
              const v = c.value(row);
              return (
                <View key={c.header} style={[s.cell, { flexBasis: `${flex[i] * 100}%` }]}>
                  <Text style={c.numeric ? { textAlign: "right" } : {}}>
                    {v === null || v === undefined ? "" : String(v)}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}

        {rows.length === 0 && (
          <Text style={{ marginTop: 16, color: "#64748b" }}>Nothing matched these filters.</Text>
        )}

        <View style={s.foot} fixed>
          <Text>PRUMAC Connect</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
