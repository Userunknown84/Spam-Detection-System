import React, { useState } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useTheme } from "../context/ThemeContext";
import { MOBILE_THEMES } from "../constants/themes";
import { PREDICT_URL } from "../constants/api";

const LABEL_MAP: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  ham: { label: "Safe Message", emoji: "✅", color: "#16a34a" },
  spam: { label: "Spam Detected", emoji: "🚫", color: "#dc2626" },
  smishing: { label: "Fraud Alert", emoji: "⚠️", color: "#ea580c" },
  safe: { label: "Safe URL", emoji: "✅", color: "#16a34a" },
  malicious: { label: "Malicious URL", emoji: "🚨", color: "#dc2626" },
};

export default function Index() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<number | string>("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("message");
  const [showSettings, setShowSettings] = useState(false);

  const {
    themeMode,
    setThemeMode,
    colorTheme,
    setColorTheme,
    isDark,
    activeColors,
  } = useTheme();

  const resultInfo =
    typeof result === "string" ? (LABEL_MAP[result] ?? null) : null;

  const confidencePct =
    confidence !== null ? Math.min(confidence * 50 + 50, 100).toFixed(1) : "0.0";

  const handlePredict = async () => {
    if (!text) {
      setResult("Enter some text");
      setConfidence(null);
      return;
    }

    try {
      setLoading(true);
      setResult("");
      setConfidence(null);

      // Node backend /predict takes { text, type }
      const res = await axios.post(PREDICT_URL, {
        text: text,
        type: type,
      });

      setResult(res.data.prediction);
      setConfidence(
        res.data.confidence !== undefined ? res.data.confidence : null
      );
    } catch (error: any) {
      console.log("ERROR:", error);
      setResult("Error");
      setConfidence(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={activeColors.background}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header Controls */}
        <View style={styles.header}>
          <Text style={[styles.brandText, { color: activeColors.text }]}>
            📩 Spam Shield
          </Text>
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            style={[
              styles.settingsButton,
              { backgroundColor: activeColors.cardBg },
            ]}
          >
            <Ionicons name="color-palette-outline" size={22} color={activeColors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Main Card */}
          <View
            style={[
              styles.mainCard,
              {
                backgroundColor: activeColors.cardBg,
                borderColor: activeColors.cardBorder,
              },
            ]}
          >
            <Text style={[styles.title, { color: activeColors.text }]}>
              Spam Detection
            </Text>
            <Text style={[styles.subtitle, { color: activeColors.subtext }]}>
              Classify SMS, emails & web links instantly
            </Text>

            {/* Type Selector */}
            <View style={styles.selectorContainer}>
              {["message", "email", "url"].map((item) => {
                const isActive = type === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.selectorButton,
                      isActive
                        ? { backgroundColor: activeColors.activeSelectorBg }
                        : { backgroundColor: activeColors.selectorBg },
                    ]}
                    onPress={() => setType(item)}
                  >
                    <Text
                      style={[
                        styles.selectorText,
                        isActive
                          ? { color: activeColors.activeSelectorText }
                          : { color: activeColors.selectorText },
                      ]}
                    >
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Input area */}
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: activeColors.inputBg,
                  borderColor: activeColors.inputBorder,
                  color: activeColors.text,
                },
              ]}
              placeholder={`Enter your ${type}...`}
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              value={text}
              onChangeText={setText}
              multiline
            />

            {/* Analyze Button */}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: activeColors.accent }]}
              onPress={handlePredict}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: activeColors.buttonText },
                ]}
              >
                {loading ? "Analyzing..." : `Analyze ${type === "url" ? "URL" : type}`}
              </Text>
            </TouchableOpacity>

            {loading && (
              <ActivityIndicator
                size="large"
                color={activeColors.accent}
                style={styles.loader}
              />
            )}

            {/* Prediction Output */}
            {resultInfo ? (
              <View style={styles.resultContainer}>
                <View
                  style={[
                    styles.resultBox,
                    {
                      borderColor: resultInfo.color,
                      backgroundColor: resultInfo.color + "18",
                    },
                  ]}
                >
                  <Text style={styles.resultEmoji}>{resultInfo.emoji}</Text>
                  <Text
                    style={[styles.resultLabel, { color: resultInfo.color }]}
                  >
                    {resultInfo.label}
                  </Text>
                </View>

                {confidence !== null && (
                  <View
                    style={[
                      styles.confidenceContainer,
                      {
                        backgroundColor: activeColors.inputBg,
                        borderColor: activeColors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confidenceText,
                        { color: activeColors.text },
                      ]}
                    >
                      Model Confidence: {confidencePct}%
                    </Text>
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            backgroundColor: resultInfo.color,
                            width: `${confidencePct}%` as any,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )}
              </View>
            ) : result === "Enter some text" ? (
              <Text style={[styles.resultError, { color: activeColors.subtext }]}>
                Please enter content to analyze.
              </Text>
            ) : result === "Error" ? (
              <Text style={[styles.resultError, { color: "#ef4444" }]}>
                ⚠️ Service error. Check API configuration.
              </Text>
            ) : null}

            {/* Reset Button */}
            <TouchableOpacity
              style={[
                styles.resetButton,
                {
                  backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                },
              ]}
              onPress={() => {
                setText("");
                setResult("");
                setConfidence(null);
                setType("message");
              }}
            >
              <Text style={[styles.resetText, { color: activeColors.text }]}>
                Reset
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Custom Theme Settings Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showSettings}
          onRequestClose={() => setShowSettings(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: isDark ? "#0f172a" : "#ffffff",
                  borderColor: activeColors.cardBorder,
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: activeColors.text }]}>
                  🎨 Customize Settings
                </Text>
                <TouchableOpacity
                  onPress={() => setShowSettings(false)}
                  style={[
                    styles.closeButton,
                    {
                      backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                    },
                  ]}
                >
                  <Text style={{ color: activeColors.text, fontWeight: "bold" }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Theme Mode */}
              <View style={styles.settingSection}>
                <Text style={[styles.settingLabel, { color: activeColors.text }]}>
                  Theme Mode
                </Text>
                <View style={styles.themeModeGrid}>
                  {[
                    { mode: "light", label: "☀️ Light" },
                    { mode: "dark", label: "🌙 Dark" },
                    { mode: "system", label: "⚙️ System" },
                  ].map((item) => {
                    const isSelected = themeMode === item.mode;
                    return (
                      <TouchableOpacity
                        key={item.mode}
                        style={[
                          styles.themeModeButton,
                          isSelected
                            ? { backgroundColor: activeColors.accent }
                            : {
                                backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                              },
                        ]}
                        onPress={() =>
                          setThemeMode(item.mode as "light" | "dark" | "system")
                        }
                      >
                        <Text
                          style={[
                            styles.themeModeText,
                            isSelected
                              ? { color: activeColors.buttonText }
                              : { color: activeColors.text },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Color Accents */}
              <View style={styles.settingSection}>
                <Text style={[styles.settingLabel, { color: activeColors.text }]}>
                  Color Palette
                </Text>
                <ScrollView style={styles.colorPaletteList}>
                  {Object.entries(MOBILE_THEMES).map(([key, value]) => {
                    const isSelected = colorTheme === key;
                    const previewColors = isDark ? value.dark.background : value.light.background;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.colorOption,
                          isSelected
                            ? {
                                borderColor: activeColors.accent,
                                backgroundColor: isDark
                                  ? "#1e293b"
                                  : "#f8fafc",
                              }
                            : {
                                borderColor: isDark ? "#334155" : "#e2e8f0",
                              },
                        ]}
                        onPress={() => setColorTheme(key)}
                      >
                        <Text
                          style={[
                            styles.colorOptionText,
                            { color: activeColors.text },
                          ]}
                        >
                          {value.name}
                        </Text>
                        <View style={styles.previewCircles}>
                          {previewColors.slice(0, 3).map((col, i) => (
                            <View
                              key={i}
                              style={[
                                styles.previewCircle,
                                { backgroundColor: col },
                              ]}
                            />
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: activeColors.accent },
                ]}
                onPress={() => setShowSettings(false)}
              >
                <Text
                  style={[
                    styles.saveButtonText,
                    { color: activeColors.buttonText },
                  ]}
                >
                  Save & Done
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 40 : 10,
    paddingBottom: 10,
  },
  brandText: {
    fontSize: 20,
    fontWeight: "bold",
  },
  settingsButton: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  mainCard: {
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    opacity: 0.8,
  },
  selectorContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  input: {
    borderWidth: 1.5,
    padding: 15,
    borderRadius: 16,
    height: 110,
    marginBottom: 16,
    textAlignVertical: "top",
    fontSize: 15,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  buttonText: {
    fontWeight: "bold",
    fontSize: 16,
  },
  loader: {
    marginTop: 15,
  },
  resultContainer: {
    marginTop: 18,
  },
  resultBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  resultEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  resultLabel: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  resultError: {
    marginTop: 18,
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
  },
  confidenceContainer: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 8,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  resetButton: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  resetText: {
    fontWeight: "bold",
    fontSize: 15,
  },

  // Modal Settings styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    padding: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  settingSection: {
    marginBottom: 20,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 10,
  },
  themeModeGrid: {
    flexDirection: "row",
    gap: 8,
  },
  themeModeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  themeModeText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  colorPaletteList: {
    maxHeight: 220,
  },
  colorOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  colorOptionText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  previewCircles: {
    flexDirection: "row",
    gap: 4,
  },
  previewCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
  },
  saveButtonText: {
    fontWeight: "bold",
    fontSize: 16,
  },
});
