import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

type InventoryItem = {
  id: string;
  barcode: string;
  name: string;
  quantity: number;
  location?: string;
  notes?: string;
  updatedAt: number;
};

type Screen = "scanner" | "inventory" | "add" | "detail";

const STORAGE_KEY = "inventory_items";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("scanner");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scanEnabled, setScanEnabled] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const scanCooldown = useRef(false);

  // ── Persistence ─────────────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setItems(JSON.parse(raw));
    });
  }, []);

  const saveItems = useCallback(async (next: InventoryItem[]) => {
    setItems(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // ── Scan handler ─────────────────────────────────────────────────────────────

  const handleBarcodeScan = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (scanCooldown.current || !scanEnabled) return;
      scanCooldown.current = true;
      setScanEnabled(false);

      const existing = items.find((i) => i.barcode === data);
      if (existing) {
        setSelectedItem(existing);
        setScreen("detail");
      } else {
        setScannedBarcode(data);
        setScreen("add");
      }

      setTimeout(() => {
        scanCooldown.current = false;
      }, 2000);
    },
    [items, scanEnabled]
  );

  // ── Resume scanning when returning to scanner screen ─────────────────────────

  useEffect(() => {
    if (screen === "scanner") {
      setScannedBarcode(null);
      setSelectedItem(null);
      setScanEnabled(true);
    }
  }, [screen]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const addItem = useCallback(
    async (item: Omit<InventoryItem, "id" | "updatedAt">) => {
      const next: InventoryItem = { ...item, id: generateId(), updatedAt: Date.now() };
      await saveItems([next, ...items]);
      setSelectedItem(next);
      setScreen("detail");
    },
    [items, saveItems]
  );

  const updateItem = useCallback(
    async (updated: InventoryItem) => {
      const next = items.map((i) => (i.id === updated.id ? { ...updated, updatedAt: Date.now() } : i));
      await saveItems(next);
      setSelectedItem({ ...updated, updatedAt: Date.now() });
    },
    [items, saveItems]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const next = items.filter((i) => i.id !== id);
      await saveItems(next);
      setScreen("scanner");
    },
    [items, saveItems]
  );

  // ── Filtered inventory ───────────────────────────────────────────────────────

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.barcode.includes(searchQuery) ||
      (i.location ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        {screen !== "scanner" && screen !== "inventory" ? (
          <Pressable onPress={() => setScreen(screen === "detail" ? "inventory" : "scanner")} hitSlop={10}>
            <Text style={styles.headerBack}>← Back</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
        <Text style={styles.headerTitle}>📦 Inventory</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tab bar (scanner + inventory) */}
      {(screen === "scanner" || screen === "inventory") && (
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, screen === "scanner" && styles.tabActive]}
            onPress={() => setScreen("scanner")}
          >
            <Text style={[styles.tabText, screen === "scanner" && styles.tabTextActive]}>📷 Scan</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, screen === "inventory" && styles.tabActive]}
            onPress={() => setScreen("inventory")}
          >
            <Text style={[styles.tabText, screen === "inventory" && styles.tabTextActive]}>
              📋 Inventory ({items.length})
            </Text>
          </Pressable>
        </View>
      )}

      {/* Screens */}
      {screen === "scanner" && (
        <ScannerScreen
          permission={permission}
          requestPermission={requestPermission}
          onScan={handleBarcodeScan}
          scanEnabled={scanEnabled}
        />
      )}
      {screen === "inventory" && (
        <InventoryScreen
          items={filteredItems}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectItem={(item) => {
            setSelectedItem(item);
            setScreen("detail");
          }}
        />
      )}
      {screen === "add" && (
        <AddItemScreen
          barcode={scannedBarcode ?? ""}
          onSave={addItem}
          onCancel={() => setScreen("scanner")}
        />
      )}
      {screen === "detail" && selectedItem && (
        <DetailScreen
          item={selectedItem}
          onUpdate={updateItem}
          onDelete={(id) => {
            Alert.alert("Delete Item", "Remove this item from inventory?", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => deleteItem(id) },
            ]);
          }}
          onAddScan={() => setScreen("scanner")}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Scanner Screen ───────────────────────────────────────────────────────────

function ScannerScreen({
  permission,
  requestPermission,
  onScan,
  scanEnabled,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => Promise<any>;
  onScan: (r: BarcodeScanningResult) => void;
  scanEnabled: boolean;
}) {
  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>Checking camera permissions…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>📷</Text>
        <Text style={styles.emptyTitle}>Camera Access Required</Text>
        <Text style={styles.mutedText}>Grant camera permission to scan barcodes.</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [
            "ean13", "ean8", "upc_a", "upc_e",
            "code128", "code39", "code93",
            "itf14", "qr", "datamatrix", "pdf417",
          ],
        }}
        onBarcodeScanned={scanEnabled ? onScan : undefined}
      />
      {/* Viewfinder overlay */}
      <View style={styles.overlay}>
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.scanHint}>
          {scanEnabled ? "Point at a barcode to scan" : "Barcode detected…"}
        </Text>
      </View>
    </View>
  );
}

// ─── Inventory Screen ─────────────────────────────────────────────────────────

function InventoryScreen({
  items,
  searchQuery,
  onSearchChange,
  onSelectItem,
}: {
  items: InventoryItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectItem: (item: InventoryItem) => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, barcode, location…"
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={onSearchChange}
          clearButtonMode="while-editing"
        />
      </View>

      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🗂️</Text>
          <Text style={styles.emptyTitle}>No items yet</Text>
          <Text style={styles.mutedText}>Scan a barcode to add your first item.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Pressable style={styles.itemCard} onPress={() => onSelectItem(item)}>
              <View style={styles.itemCardLeft}>
                <Text style={styles.itemCardName}>{item.name}</Text>
                <Text style={styles.itemCardBarcode}>{item.barcode}</Text>
                {item.location ? <Text style={styles.itemCardLocation}>📍 {item.location}</Text> : null}
              </View>
              <View style={styles.itemCardRight}>
                <Text style={styles.itemCardQty}>{item.quantity}</Text>
                <Text style={styles.itemCardQtyLabel}>qty</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

// ─── Add Item Screen ──────────────────────────────────────────────────────────

function AddItemScreen({
  barcode,
  onSave,
  onCancel,
}: {
  barcode: string;
  onSave: (item: Omit<InventoryItem, "id" | "updatedAt">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a name for this item.");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert("Invalid quantity", "Enter a valid number.");
      return;
    }
    onSave({ barcode, name: name.trim(), quantity: qty, location: location.trim(), notes: notes.trim() });
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.barcodeTag}>
        <Text style={styles.barcodeTagLabel}>Scanned barcode</Text>
        <Text style={styles.barcodeTagValue}>{barcode}</Text>
      </View>

      <FormField label="Item Name *" value={name} onChangeText={setName} placeholder="e.g. Blue Widget" />
      <FormField
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="1"
        keyboardType="number-pad"
      />
      <FormField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Shelf A3" />
      <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline />

      <Pressable style={styles.primaryBtn} onPress={handleSave}>
        <Text style={styles.primaryBtnText}>Add to Inventory</Text>
      </Pressable>
      <Pressable style={styles.ghostBtn} onPress={onCancel}>
        <Text style={styles.ghostBtnText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Detail Screen ────────────────────────────────────────────────────────────

function DetailScreen({
  item,
  onUpdate,
  onDelete,
  onAddScan,
}: {
  item: InventoryItem;
  onUpdate: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onAddScan: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [location, setLocation] = useState(item.location ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  // Sync if item prop changes (e.g. after inline qty bump)
  useEffect(() => {
    setName(item.name);
    setQuantity(String(item.quantity));
    setLocation(item.location ?? "");
    setNotes(item.notes ?? "");
  }, [item]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Name required");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert("Invalid quantity");
      return;
    }
    onUpdate({ ...item, name: name.trim(), quantity: qty, location: location.trim(), notes: notes.trim() });
    setEditing(false);
  };

  const adjustQty = (delta: number) => {
    const next = Math.max(0, item.quantity + delta);
    onUpdate({ ...item, quantity: next });
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
      {!editing ? (
        <>
          <View style={styles.detailHeader}>
            <Text style={styles.detailName}>{item.name}</Text>
            <Text style={styles.detailBarcode}>{item.barcode}</Text>
            {item.location ? <Text style={styles.detailLocation}>📍 {item.location}</Text> : null}
            <Text style={styles.detailDate}>Updated {formatDate(item.updatedAt)}</Text>
          </View>

          {/* Quick qty control */}
          <View style={styles.qtyRow}>
            <Pressable style={styles.qtyBtn} onPress={() => adjustQty(-1)}>
              <Text style={styles.qtyBtnText}>−</Text>
            </Pressable>
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyValue}>{item.quantity}</Text>
              <Text style={styles.qtyLabel}>in stock</Text>
            </View>
            <Pressable style={styles.qtyBtn} onPress={() => adjustQty(1)}>
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>

          {item.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          ) : null}

          <Pressable style={styles.primaryBtn} onPress={() => setEditing(true)}>
            <Text style={styles.primaryBtnText}>Edit Item</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={onAddScan}>
            <Text style={styles.ghostBtnText}>Scan Another</Text>
          </Pressable>
          <Pressable style={styles.dangerBtn} onPress={() => onDelete(item.id)}>
            <Text style={styles.dangerBtnText}>Delete Item</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.barcodeTag}>
            <Text style={styles.barcodeTagLabel}>Barcode</Text>
            <Text style={styles.barcodeTagValue}>{item.barcode}</Text>
          </View>

          <FormField label="Item Name *" value={name} onChangeText={setName} placeholder="Item name" />
          <FormField
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="0"
            keyboardType="number-pad"
          />
          <FormField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Shelf A3" />
          <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

          <Pressable style={styles.primaryBtn} onPress={handleSave}>
            <Text style={styles.primaryBtnText}>Save Changes</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => setEditing(false)}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

// ─── Shared FormField ─────────────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ACCENT = "#4F8EF7";
const DANGER = "#E53935";
const BG = "#0F1117";
const CARD = "#1C1F2E";
const BORDER = "#2A2D3E";
const TEXT = "#EAEAEA";
const MUTED = "#888";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { color: TEXT, fontSize: 18, fontWeight: "700" },
  headerBack: { color: ACCENT, fontSize: 16 },

  // Tabs
  tabs: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
  },
  tabText: { color: MUTED, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: ACCENT },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: "#000" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  viewfinder: {
    width: 260,
    height: 180,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#fff",
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: {
    color: "rgba(255,255,255,0.85)",
    marginTop: 24,
    fontSize: 14,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: "hidden",
  },

  // Centered empty states
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: TEXT, fontSize: 20, fontWeight: "700", marginBottom: 6 },
  mutedText: { color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 20 },

  // Search
  searchRow: { padding: 12, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  searchInput: {
    backgroundColor: BG,
    color: TEXT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },

  // Item card
  itemCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  itemCardLeft: { flex: 1 },
  itemCardName: { color: TEXT, fontSize: 16, fontWeight: "600" },
  itemCardBarcode: { color: MUTED, fontSize: 12, marginTop: 2 },
  itemCardLocation: { color: MUTED, fontSize: 12, marginTop: 2 },
  itemCardRight: { alignItems: "center", marginLeft: 12 },
  itemCardQty: { color: ACCENT, fontSize: 24, fontWeight: "800" },
  itemCardQtyLabel: { color: MUTED, fontSize: 11 },

  // Form
  formContainer: { padding: 16, gap: 14 },
  barcodeTag: {
    backgroundColor: CARD,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  barcodeTagLabel: { color: MUTED, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  barcodeTagValue: { color: ACCENT, fontSize: 16, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  field: { gap: 6 },
  fieldLabel: { color: MUTED, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  fieldInput: {
    backgroundColor: CARD,
    color: TEXT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: BORDER,
  },
  fieldInputMulti: { height: 80, textAlignVertical: "top" },

  // Buttons
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  ghostBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  ghostBtnText: { color: MUTED, fontWeight: "600", fontSize: 16 },
  dangerBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: DANGER,
  },
  dangerBtnText: { color: DANGER, fontWeight: "600", fontSize: 16 },

  // Detail
  detailHeader: { backgroundColor: CARD, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 4 },
  detailName: { color: TEXT, fontSize: 22, fontWeight: "700" },
  detailBarcode: { color: MUTED, fontSize: 13, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  detailLocation: { color: MUTED, fontSize: 14 },
  detailDate: { color: MUTED, fontSize: 12, marginTop: 4 },

  // Qty control
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  qtyBtn: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BORDER,
    width: 64,
  },
  qtyBtnText: { color: TEXT, fontSize: 28, fontWeight: "300" },
  qtyDisplay: { flex: 1, alignItems: "center" },
  qtyValue: { color: TEXT, fontSize: 36, fontWeight: "800" },
  qtyLabel: { color: MUTED, fontSize: 12 },

  // Notes
  notesBox: { backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 4 },
  notesLabel: { color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  notesText: { color: TEXT, fontSize: 14, lineHeight: 20 },
});
