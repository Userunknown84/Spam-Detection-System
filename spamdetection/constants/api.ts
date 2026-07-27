import { Platform } from "react-native";

// Resolves the spam-detection API's base URL from platform-specific Expo
// public env vars (issue #824). The fallbacks aren't wrong values to remove -
// 10.0.2.2 is how the Android emulator reaches the host machine's localhost,
// and localhost works directly from the iOS simulator - they're just silent,
// so real-device testing (which needs your machine's actual LAN IP) fails
// with no explanation. Warn once so that's visible instead of silent.
function resolveApiBaseUrl(): string {
  const envVarName = Platform.OS === "android" ? "EXPO_PUBLIC_ANDROIDAPI" : "EXPO_PUBLIC_IOSAPI";
  const envValue = Platform.OS === "android" ? process.env.EXPO_PUBLIC_ANDROIDAPI : process.env.EXPO_PUBLIC_IOSAPI;
  const fallback = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

  if (envValue) return envValue;

  console.warn(
    `[config] ${envVarName} is not set - falling back to ${fallback}. ` +
      `This reaches a backend running on your development machine from the ` +
      `${Platform.OS === "android" ? "Android emulator" : "iOS simulator"}, ` +
      `but will NOT work on a real physical device - set ${envVarName} to ` +
      `your machine's LAN IP (e.g. http://192.168.1.5:3000) in a .env file. ` +
      `See .env.example.`
  );
  return fallback;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const PREDICT_URL = `${API_BASE_URL}/predict`;
