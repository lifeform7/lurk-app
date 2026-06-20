import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Battery from 'expo-battery';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

type DetectionMode = 'all' | 'person' | 'animal';
type StreamQuality = 'data' | 'balanced' | 'high';
type EventKind = 'motion' | 'person' | 'animal' | 'manual';

interface LurkEvent {
  id: string;
  deviceId: string;
  startedAt: string;
  kind: EventKind;
  labels: { label: string; score: number }[];
  thumbnailUri: string;
  mediaUri: string;
  source: 'local';
  model: {
    id: string;
    version: string;
  };
}

interface DeviceStats {
  batteryLevel: number | null;
  batteryState: Battery.BatteryState | null;
  eventBytes: number;
}

const BG = '#080b0e';
const PANEL = '#11171d';
const PANEL_2 = '#172029';
const BORDER = '#22303a';
const ACCENT = '#55d6be';
const WARN = '#ffbe55';
const DEVICE_ID = String(Constants.expoConfig?.extra?.deviceId ?? 'phone01');
const MEDIA_BASE_URL = String(Constants.expoConfig?.extra?.mediaBaseUrl ?? '');
const EVENT_DIR = `${FileSystem.documentDirectory ?? ''}events/`;
const INDEX_PATH = `${EVENT_DIR}index.json`;

const qualityLabels: Record<StreamQuality, string> = {
  data: 'Data Saver',
  balanced: 'Balanced',
  high: 'High',
};

const detectionLabels: Record<DetectionMode, string> = {
  all: 'All Motion',
  person: 'Person Only',
  animal: 'Animal / Pet',
};

const batteryStateLabels: Record<number, string> = {
  [Battery.BatteryState.UNKNOWN]: 'Unknown',
  [Battery.BatteryState.UNPLUGGED]: 'Battery',
  [Battery.BatteryState.CHARGING]: 'Charging',
  [Battery.BatteryState.FULL]: 'Full',
};

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [events, setEvents] = useState<LurkEvent[]>([]);
  const [monitoring, setMonitoring] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [muted, setMuted] = useState(true);
  const [quality, setQuality] = useState<StreamQuality>('balanced');
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('all');
  const [detectionZone, setDetectionZone] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [deviceStats, setDeviceStats] = useState<DeviceStats>({
    batteryLevel: null,
    batteryState: null,
    eventBytes: 0,
  });

  useEffect(() => {
    ensureEventStore()
      .then(loadEvents)
      .then((loadedEvents) => {
        setEvents(loadedEvents);
        return refreshDeviceStats(loadedEvents);
      })
      .then(setDeviceStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshDeviceStats(events).then(setDeviceStats).catch(() => {});
    }, monitoring ? 30000 : 90000);
    return () => clearInterval(interval);
  }, [events, monitoring]);

  useEffect(() => {
    if (monitoring) {
      activateKeepAwakeAsync('lurk-monitor').catch(() => {});
      return () => {
        deactivateKeepAwake('lurk-monitor');
      };
    }
    deactivateKeepAwake('lurk-monitor');
    return undefined;
  }, [monitoring]);

  const statusText = useMemo(() => {
    if (!permission?.granted) return 'Camera permission needed';
    if (monitoring) return `${detectionLabels[detectionMode]} monitoring`;
    return 'Ready to monitor';
  }, [detectionMode, monitoring, permission?.granted]);

  const captureEvent = useCallback(async (kind: EventKind = 'manual') => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      await ensureEventStore();
      const photo = await cameraRef.current.takePictureAsync({
        quality: quality === 'high' ? 0.9 : quality === 'balanced' ? 0.7 : 0.45,
      });
      const eventId = createEventId();
      const destination = `${EVENT_DIR}${eventId}.jpg`;
      await FileSystem.copyAsync({ from: photo.uri, to: destination });
      const event: LurkEvent = {
        id: eventId,
        deviceId: DEVICE_ID,
        startedAt: new Date().toISOString(),
        kind,
        labels: [{ label: detectionMode === 'all' ? kind : detectionMode, score: 1 }],
        thumbnailUri: destination,
        mediaUri: destination,
        source: 'local',
        model: { id: 'manual-capture', version: '0.1.0' },
      };
      const next = [event, ...events].slice(0, 100);
      setEvents(next);
      await saveEvents(next);
      setDeviceStats(await refreshDeviceStats(next));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      Alert.alert('Capture failed', error instanceof Error ? error.message : String(error));
    } finally {
      setCapturing(false);
    }
  }, [capturing, detectionMode, events, quality]);

  if (!permission) {
    return (
      <Shell>
        <Text style={styles.loading}>Loading camera permissions...</Text>
      </Shell>
    );
  }

  if (!permission.granted) {
    return (
      <Shell>
        <View style={styles.permissionPanel}>
          <Ionicons name="camera" size={42} color={ACCENT} />
          <Text style={styles.permissionTitle}>Camera access is needed</Text>
          <Text style={styles.permissionBody}>Lurk needs the camera to monitor a space and capture events on this device.</Text>
          <Pressable style={styles.primaryButton} onPress={requestPermission}>
            <Ionicons name="lock-open" size={18} color="#06100d" />
            <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.cameraCard}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            enableTorch={torch}
            zoom={zoom}
            mode="picture"
          />
          <View style={styles.liveBadge}>
            <View style={[styles.dot, monitoring && styles.dotLive]} />
            <Text style={styles.liveBadgeText}>{monitoring ? 'MONITORING' : 'STANDBY'}</Text>
          </View>
          <View style={styles.cameraOverlayBottom}>
            <Text style={styles.deviceName}>{DEVICE_ID}</Text>
            <Text style={styles.connectionText}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.primaryRow}>
          <Pressable
            style={[styles.monitorButton, monitoring && styles.monitorButtonActive]}
            onPress={() => setMonitoring((value) => !value)}
          >
            <Ionicons name={monitoring ? 'pause' : 'play'} size={20} color={monitoring ? '#05110d' : ACCENT} />
            <Text style={[styles.monitorButtonText, monitoring && styles.monitorButtonTextActive]}>
              {monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
            </Text>
          </Pressable>
          <Pressable style={styles.captureButton} onPress={() => captureEvent('manual')} disabled={capturing}>
            <Ionicons name="radio-button-on" size={20} color="#fff" />
            <Text style={styles.captureButtonText}>{capturing ? 'Saving' : 'Capture Event'}</Text>
          </Pressable>
        </View>

        <Panel title="Device Health" icon="battery-charging">
          <View style={styles.healthGrid}>
            <HealthStat
              icon="battery-half"
              label="Battery"
              value={formatBattery(deviceStats)}
              tone={batteryTone(deviceStats)}
            />
            <HealthStat
              icon="archive"
              label="Events"
              value={`${events.length} saved`}
            />
            <HealthStat
              icon="server"
              label="Local Size"
              value={formatBytes(deviceStats.eventBytes)}
            />
          </View>
          <Text style={styles.footnote}>Keep this panel visible during the old-phone smoke test to catch battery drain and storage growth early.</Text>
        </Panel>

        <Panel title="Live Controls" icon="videocam">
          <Segmented
            options={(['data', 'balanced', 'high'] as StreamQuality[]).map((value) => ({ value, label: qualityLabels[value] }))}
            value={quality}
            onChange={setQuality}
          />
          <View style={styles.controlGrid}>
            <IconToggle icon="volume-mute" label="Muted" active={muted} onPress={() => setMuted((value) => !value)} />
            <IconToggle icon="flashlight" label="Torch" active={torch} onPress={() => setTorch((value) => !value)} />
            <IconToggle icon="camera-reverse" label={facing === 'back' ? 'Back Lens' : 'Front Lens'} active={facing === 'front'} onPress={() => setFacing((value) => (value === 'back' ? 'front' : 'back'))} />
            <IconToggle icon="sync" label="Rotate" active={false} onPress={() => Haptics.selectionAsync().catch(() => {})} />
          </View>
          <View style={styles.zoomRow}>
            <Text style={styles.miniLabel}>Zoom</Text>
            {[0, 0.25, 0.5, 0.75].map((value) => (
              <Pressable key={value} style={[styles.zoomPill, zoom === value && styles.zoomPillActive]} onPress={() => setZoom(value)}>
                <Text style={[styles.zoomPillText, zoom === value && styles.zoomPillTextActive]}>{value === 0 ? '1x' : `${Math.round(1 + value * 3)}x`}</Text>
              </Pressable>
            ))}
          </View>
        </Panel>

        <Panel title="Detection" icon="scan">
          <Segmented
            options={(['all', 'person', 'animal'] as DetectionMode[]).map((value) => ({ value, label: detectionLabels[value] }))}
            value={detectionMode}
            onChange={setDetectionMode}
          />
          <SettingRow title="Detection Zone" subtitle="Ignore irrelevant motion outside the focus area." value={detectionZone} onValueChange={setDetectionZone} />
          <SettingRow title="Schedule" subtitle="Only monitor during selected hours. Schedule editor comes next." value={scheduleEnabled} onValueChange={setScheduleEnabled} />
        </Panel>

        <Panel title="Owner Actions" icon="shield-checkmark">
          <View style={styles.controlGrid}>
            <ActionButton icon="mic" label="Push Talk" disabled />
            <ActionButton icon="warning" label="Siren" tone="warn" disabled />
            <ActionButton icon="lock-closed" label="App Lock" disabled />
            <ActionButton icon="people" label="Share" disabled />
          </View>
          <Text style={styles.footnote}>These controls are stubbed for the first native build so the UI shape is ready before live audio/permissions are wired.</Text>
        </Panel>

        <Panel title="Event Timeline" icon="list">
          {events.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <Ionicons name="image" size={28} color="#5d6b75" />
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyBody}>Start monitoring or capture a manual event to create the first local timeline item.</Text>
            </View>
          ) : (
            events.map((event) => <EventRow key={event.id} event={event} />)
          )}
        </Panel>

        <View style={styles.storagePanel}>
          <Text style={styles.storageTitle}>Server media target</Text>
          <Text style={styles.storageValue}>{MEDIA_BASE_URL || 'Not configured'}</Text>
        </View>
      </ScrollView>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appName}>Lurk</Text>
          <Text style={styles.appSub}>Old phone camera monitor</Text>
        </View>
        <View style={styles.topStatus}>
          <Ionicons name="phone-portrait" color={ACCENT} size={18} />
          <Text style={styles.topStatusText}>{DEVICE_ID}</Text>
        </View>
      </View>
      {children}
    </SafeAreaView>
  );
}

function Panel({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Ionicons name={icon} size={18} color={ACCENT} />
        <Text style={styles.panelTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable key={option.value} style={[styles.segment, value === option.value && styles.segmentActive]} onPress={() => onChange(option.value)}>
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]} numberOfLines={1}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function IconToggle({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.iconToggle, active && styles.iconToggleActive]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={active ? '#06100d' : ACCENT} />
      <Text style={[styles.iconToggleText, active && styles.iconToggleTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ icon, label, tone, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; tone?: 'warn'; disabled?: boolean }) {
  return (
    <Pressable style={[styles.actionButton, tone === 'warn' && styles.actionWarn, disabled && styles.disabled]}>
      <Ionicons name={icon} size={20} color={tone === 'warn' ? WARN : ACCENT} />
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function HealthStat({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone?: 'warn' }) {
  return (
    <View style={[styles.healthStat, tone === 'warn' && styles.healthStatWarn]}>
      <Ionicons name={icon} size={18} color={tone === 'warn' ? WARN : ACCENT} />
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={styles.healthValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SettingRow({ title, subtitle, value, onValueChange }: { title: string; subtitle: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSub}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: ACCENT, false: '#31404a' }} thumbColor="#fff" />
    </View>
  );
}

function EventRow({ event }: { event: LurkEvent }) {
  const label = event.labels[0];
  return (
    <View style={styles.eventRow}>
      <Image source={{ uri: event.thumbnailUri }} style={styles.eventThumb} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle}>{event.kind.toUpperCase()}</Text>
        <Text style={styles.eventSub}>{new Date(event.startedAt).toLocaleString()}</Text>
        <Text style={styles.eventMeta}>{label.label} · {Math.round(label.score * 100)}% · {event.source}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#62717b" />
    </View>
  );
}

async function ensureEventStore() {
  if (!FileSystem.documentDirectory) throw new Error('Document directory is unavailable');
  await FileSystem.makeDirectoryAsync(EVENT_DIR, { intermediates: true }).catch(() => {});
}

async function loadEvents(): Promise<LurkEvent[]> {
  const info = await FileSystem.getInfoAsync(INDEX_PATH);
  if (!info.exists) return [];
  return JSON.parse(await FileSystem.readAsStringAsync(INDEX_PATH)) as LurkEvent[];
}

async function saveEvents(events: LurkEvent[]) {
  await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(events, null, 2));
}

async function refreshDeviceStats(events: LurkEvent[]): Promise<DeviceStats> {
  const [batteryLevel, batteryState, eventBytes] = await Promise.all([
    Battery.getBatteryLevelAsync().catch(() => null),
    Battery.getBatteryStateAsync().catch(() => null),
    calculateEventBytes(events),
  ]);
  return { batteryLevel, batteryState, eventBytes };
}

async function calculateEventBytes(events: LurkEvent[]) {
  let total = 0;
  const indexInfo = await FileSystem.getInfoAsync(INDEX_PATH).catch(() => null);
  if (indexInfo?.exists && 'size' in indexInfo && typeof indexInfo.size === 'number') total += indexInfo.size;
  for (const event of events) {
    const info = await FileSystem.getInfoAsync(event.mediaUri).catch(() => null);
    if (info?.exists && 'size' in info && typeof info.size === 'number') total += info.size;
  }
  return total;
}

function formatBattery(stats: DeviceStats) {
  const pct = stats.batteryLevel === null ? '--' : `${Math.round(stats.batteryLevel * 100)}%`;
  const state = stats.batteryState === null ? 'Unknown' : batteryStateLabels[stats.batteryState] ?? 'Unknown';
  return `${pct} · ${state}`;
}

function batteryTone(stats: DeviceStats): 'warn' | undefined {
  if (stats.batteryLevel !== null && stats.batteryLevel < 0.2 && stats.batteryState !== Battery.BatteryState.CHARGING) return 'warn';
  return undefined;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createEventId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${DEVICE_ID}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  topBar: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appName: { color: '#fff', fontSize: 30, fontWeight: '900' },
  appSub: { color: '#81909b', fontSize: 13, fontWeight: '700', marginTop: 2 },
  topStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: PANEL },
  topStatusText: { color: '#c8d6dd', fontSize: 12, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40 },
  loading: { color: '#fff', padding: 20 },
  permissionPanel: { margin: 18, padding: 22, backgroundColor: PANEL, borderRadius: 16, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  permissionTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 14 },
  permissionBody: { color: '#b8c6ce', textAlign: 'center', lineHeight: 21, marginTop: 8 },
  primaryButton: { marginTop: 18, backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', gap: 8, alignItems: 'center' },
  primaryButtonText: { color: '#06100d', fontWeight: '900' },
  cameraCard: { height: 390, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: BORDER },
  camera: { flex: 1 },
  liveBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(5, 9, 12, 0.76)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#73818a' },
  dotLive: { backgroundColor: '#ff4f64' },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  cameraOverlayBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  deviceName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  connectionText: { color: '#d4e1e7', fontSize: 13, marginTop: 2, fontWeight: '700' },
  primaryRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  monitorButton: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: ACCENT, backgroundColor: '#0d1717' },
  monitorButtonActive: { backgroundColor: ACCENT },
  monitorButtonText: { color: ACCENT, fontWeight: '900' },
  monitorButtonTextActive: { color: '#05110d' },
  captureButton: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: '#28323b', borderWidth: 1, borderColor: '#3a4650' },
  captureButtonText: { color: '#fff', fontWeight: '900' },
  panel: { backgroundColor: PANEL, borderColor: BORDER, borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  panelTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  segmented: { flexDirection: 'row', gap: 6, backgroundColor: '#0b1014', borderRadius: 12, padding: 4 },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 6 },
  segmentActive: { backgroundColor: ACCENT },
  segmentText: { color: '#8fa0aa', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#06100d' },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  iconToggle: { width: '48.5%', minHeight: 72, borderRadius: 14, backgroundColor: PANEL_2, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', gap: 7 },
  iconToggleActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  iconToggleText: { color: '#d6e3e9', fontSize: 12, fontWeight: '900' },
  iconToggleTextActive: { color: '#06100d' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  miniLabel: { color: '#9cacb5', fontSize: 12, fontWeight: '900', width: 44 },
  zoomPill: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: BORDER, paddingVertical: 9, alignItems: 'center' },
  zoomPillActive: { borderColor: ACCENT, backgroundColor: '#12312d' },
  zoomPillText: { color: '#9cacb5', fontWeight: '900', fontSize: 12 },
  zoomPillTextActive: { color: '#fff' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  settingTitle: { color: '#e8f1f5', fontSize: 14, fontWeight: '900' },
  settingSub: { color: '#8798a3', fontSize: 12, lineHeight: 17, marginTop: 2 },
  actionButton: { width: '48.5%', minHeight: 66, borderRadius: 14, backgroundColor: PANEL_2, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionWarn: { borderColor: '#544427', backgroundColor: '#211b12' },
  disabled: { opacity: 0.6 },
  actionButtonText: { color: '#d6e3e9', fontSize: 12, fontWeight: '900' },
  healthGrid: { flexDirection: 'row', gap: 8 },
  healthStat: { flex: 1, minHeight: 82, borderRadius: 14, backgroundColor: PANEL_2, borderWidth: 1, borderColor: BORDER, padding: 10, justifyContent: 'space-between' },
  healthStatWarn: { borderColor: '#6d5128', backgroundColor: '#241b11' },
  healthLabel: { color: '#8fa0aa', fontSize: 11, fontWeight: '900', marginTop: 6 },
  healthValue: { color: '#fff', fontSize: 13, fontWeight: '900' },
  footnote: { color: '#7e8d96', fontSize: 12, lineHeight: 17, marginTop: 10 },
  emptyTimeline: { alignItems: 'center', paddingVertical: 22 },
  emptyTitle: { color: '#dbe7ed', fontSize: 15, fontWeight: '900', marginTop: 8 },
  emptyBody: { color: '#84939d', textAlign: 'center', lineHeight: 18, marginTop: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: PANEL_2, borderRadius: 14, padding: 10, marginTop: 8 },
  eventThumb: { width: 72, height: 54, borderRadius: 8, backgroundColor: '#050708' },
  eventTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  eventSub: { color: '#9aacb5', fontSize: 12, marginTop: 2 },
  eventMeta: { color: ACCENT, fontSize: 12, fontWeight: '800', marginTop: 2 },
  storagePanel: { padding: 14, marginTop: 12, borderRadius: 14, backgroundColor: '#0d1216', borderWidth: 1, borderColor: '#1b2730' },
  storageTitle: { color: '#82929c', fontSize: 12, fontWeight: '900' },
  storageValue: { color: '#d8e5eb', fontSize: 13, marginTop: 4 },
});
